import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { marketingAds } from "@/lib/db/schema";
import {
  editionsOnCampaignDate,
  findNameDate,
  isBrandCampaign,
  parseCampaignDate,
} from "@/lib/marketing/campaign-tag";
import {
  loadEditionIndex,
  scorePostAgainstEditions,
  type EditionIndex,
  type LinkChange,
} from "@/lib/marketing/edition-link";

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

type AdRow = typeof marketingAds.$inferSelect;

/**
 * The team tags every event campaign with its date (`23 OKT | CONVERSIONS |
 * ADE vrijdag | TRA`), so that date decides the edition. Names only pick
 * between editions on that date (Day vs Night). Campaigns without a date
 * fall back to the fuzzy scorer; always-on brand campaigns stay unlinked.
 */
function tagAd(
  ad: AdRow,
  editionIndex: EditionIndex[],
): { editionId: string | null; confidence: number; reasons: string[] } {
  const text = [ad.campaignName ?? "", ad.adsetName ?? "", ad.adName ?? ""]
    .filter(Boolean)
    .join("\n");
  const campaignDate = parseCampaignDate(ad.campaignName);

  // Meta and Google don't report a created time; the stats window starts near it.
  const anchor =
    ad.publishedAt ?? (ad.dateStart ? new Date(ad.dateStart) : null);

  if (campaignDate) {
    const candidates = editionsOnCampaignDate(editionIndex, campaignDate, anchor);
    if (candidates.length > 0) {
      const picked =
        candidates.length === 1
          ? candidates[0]!.id
          : scorePostAgainstEditions({
              text,
              publishedAt: ad.publishedAt,
              artists: [],
              editionGuess: ad.campaignName,
              offer: undefined,
              editionIndex: candidates,
            }).editionId ?? candidates[0]!.id;
      const reasons = [`Campagnedatum ${campaignDate.label}`];
      const pickedEdition = candidates.find((e) => e.id === picked)!;
      const creativeDate = findNameDate(ad.adName);
      if (
        creativeDate &&
        (creativeDate.m !== campaignDate.m || creativeDate.d !== campaignDate.d)
      ) {
        reasons.push(`Creative noemt ${creativeDate.label}`);
      }
      if (candidates.length > 1) {
        reasons.push(`Gekozen uit ${candidates.length} events op die dag`);
      }
      return { editionId: pickedEdition.id, confidence: 1, reasons };
    }
  }

  if (isBrandCampaign(ad.campaignName)) {
    return { editionId: null, confidence: 0, reasons: ["Doorlopende merkcampagne"] };
  }

  return scorePostAgainstEditions({
    text,
    publishedAt: anchor,
    artists: [],
    editionGuess: ad.campaignName,
    offer: undefined,
    editionIndex,
  });
}

/**
 * Link paid ads → editions. Re-checks existing links too: the campaign date
 * is deterministic, so a changed result means the old link was wrong.
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
  /** Existing links that moved to another edition or were dropped. */
  changes: LinkChange[];
  error?: string;
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      linked: 0,
      reviewed: 0,
      links: [],
      changes: [],
      error: "DATABASE_URL ontbreekt",
    };
  }

  const persist = options?.persist ?? true;
  const minConfidence = options?.minConfidence ?? 0.55;
  const limit = Math.min(Math.max(options?.limit ?? 2000, 1), 5000);
  const onlyUnlinked = options?.onlyUnlinked === true;
  const db = getDb();

  const editionIndex = await loadEditionIndex();
  const editionName = (id: string | null) =>
    id ? (editionIndex.find((e) => e.id === id)?.name ?? id) : null;

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
  const changes: LinkChange[] = [];
  let linked = 0;

  for (const ad of ads) {
    const scored = tagAd(ad, editionIndex);

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

    if (link.editionId === ad.editionId) continue;
    if (ad.editionId) {
      changes.push({
        id: ad.id,
        title: `${ad.campaignName ?? "—"} › ${link.title ?? "—"}`,
        from: editionName(ad.editionId),
        to: link.editionName,
        reasons: link.reasons,
      });
    } else {
      linked += 1;
    }
    if (persist) {
      await db
        .update(marketingAds)
        .set({ editionId: link.editionId })
        .where(eq(marketingAds.id, ad.id));
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
    changes,
  };
}
