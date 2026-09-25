import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, marketingAds, raListings } from "@/lib/db/schema";
import {
  normalizeArtistKey,
  parseEditionLineup,
} from "@/lib/editions/lineup";
import { scorePostAgainstEditions } from "@/lib/marketing/edition-link";

type AdPlatform = "meta" | "tiktok" | "youtube" | "google";

export type AdEditionLink = {
  adId: string;
  platform: string;
  title: string | null;
  editionId: string | null;
  editionName: string | null;
  confidence: number;
  reasons: string[];
};

/**
 * Link unlinked paid ads → editions using campaign/ad names and created time.
 * Same ≥0.55 threshold as organic posts / Brevo.
 */
export async function linkAdsToEditions(options?: {
  persist?: boolean;
  minConfidence?: number;
  limit?: number;
  platform?: AdPlatform;
  onlyUnlinked?: boolean;
}): Promise<{
  ok: boolean;
  linked: number;
  reviewed: number;
  links: AdEditionLink[];
  error?: string;
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      linked: 0,
      reviewed: 0,
      links: [],
      error: "DATABASE_URL ontbreekt",
    };
  }

  const persist = options?.persist ?? true;
  const minConfidence = options?.minConfidence ?? 0.55;
  const limit = Math.min(Math.max(options?.limit ?? 250, 1), 500);
  const onlyUnlinked = options?.onlyUnlinked !== false;
  const db = getDb();

  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
    })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));

  const raRows = await db
    .select({
      editionId: raListings.editionId,
      artists: raListings.artists,
    })
    .from(raListings)
    .where(isNotNull(raListings.editionId));

  const raArtistsByEdition = new Map<string, string[]>();
  for (const row of raRows) {
    if (!row.editionId) continue;
    const existing = raArtistsByEdition.get(row.editionId) ?? [];
    for (const a of row.artists ?? []) {
      if (a?.trim() && !existing.includes(a)) existing.push(a);
    }
    raArtistsByEdition.set(row.editionId, existing);
  }

  const editionIndex = eds
    .filter((e) => !/TEMPLATE/i.test(e.name))
    .map((e) => {
      const parsed = parseEditionLineup(e.name);
      const raArtists = raArtistsByEdition.get(e.id) ?? [];
      const artists =
        raArtists.length > 0
          ? [
              ...raArtists,
              ...parsed.artists.filter(
                (a) =>
                  !raArtists.some(
                    (r) => normalizeArtistKey(r) === normalizeArtistKey(a),
                  ),
              ),
            ]
          : parsed.artists;
      const lineup = {
        ...parsed,
        artists,
        headliner: raArtists[0] ?? parsed.headliner,
      };
      return {
        ...e,
        lineup,
        artistKeys: new Set(
          artists.map((a) => normalizeArtistKey(a)).filter(Boolean),
        ),
        nameNorm: normalizeArtistKey(e.name),
      };
    });

  const filters = [];
  if (onlyUnlinked) filters.push(isNull(marketingAds.editionId));
  if (options?.platform) filters.push(eq(marketingAds.platform, options.platform));

  const ads = await db
    .select()
    .from(marketingAds)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(marketingAds.spendCents))
    .limit(limit);

  const links: AdEditionLink[] = [];
  let linked = 0;

  for (const ad of ads) {
    const text = [ad.campaignName ?? "", ad.adsetName ?? "", ad.adName ?? ""]
      .filter(Boolean)
      .join("\n");
    const scored = scorePostAgainstEditions({
      text,
      publishedAt: ad.publishedAt,
      artists: [],
      editionGuess: ad.campaignName,
      offer: undefined,
      editionIndex,
    });

    const edition =
      scored.editionId && scored.confidence >= minConfidence
        ? editionIndex.find((e) => e.id === scored.editionId)
        : null;

    const link: AdEditionLink = {
      adId: ad.id,
      platform: ad.platform,
      title: ad.adName ?? ad.campaignName,
      editionId: edition?.id ?? null,
      editionName: edition?.name ?? null,
      confidence: scored.confidence,
      reasons: edition
        ? scored.reasons
        : scored.reasons.length
          ? [`Zwakke match (${scored.confidence})`, ...scored.reasons.slice(0, 2)]
          : ["Geen match"],
    };
    links.push(link);

    if (persist && link.editionId) {
      await db
        .update(marketingAds)
        .set({ editionId: link.editionId })
        .where(eq(marketingAds.id, ad.id));
      linked += 1;
    } else if (!persist && link.editionId) {
      linked += 1;
    }
  }

  return {
    ok: true,
    linked,
    reviewed: ads.length,
    links: links
      .filter((l) => l.editionId || l.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 80),
  };
}
