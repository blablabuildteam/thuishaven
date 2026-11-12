/**
 * Venue Instagram → party candidates (needs_review when parse is weak).
 */
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  isApifyConfigured,
  runSocialProfileFetch,
} from "@/lib/integrations/apify/client";
import { ingestPartyLineup } from "@/lib/radar/ingest-party";
import { parseLineupText } from "@/lib/radar/parse-lineup";
import { listEnabledSourceConfigs } from "@/lib/radar/parties";
import { radarVenueSourceConfigs } from "@/lib/radar/schema";

export type InstagramVenueSyncResult = {
  venuesTried: number;
  partiesIngested: number;
  needsReview: number;
  artistsCreated: number;
  errors: string[];
  note?: string;
};

const LINEUP_HINT =
  /line[\s-]?up|playing|presents|tonight|this friday|this saturday|tickets|doors\s*open|guest[\s-]?list|b2b/i;

export async function syncInstagramVenues(options?: {
  limit?: number;
}): Promise<InstagramVenueSyncResult> {
  const result: InstagramVenueSyncResult = {
    venuesTried: 0,
    partiesIngested: 0,
    needsReview: 0,
    artistsCreated: 0,
    errors: [],
  };

  if (!isApifyConfigured()) {
    result.note = "Apify overgeslagen: APIFY_TOKEN ontbreekt.";
    return result;
  }
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }

  const configs = (await listEnabledSourceConfigs(options?.limit ?? 6)).filter(
    (c) => c.instagramHandle,
  );
  const db = getDb();

  for (const cfg of configs) {
    const handle = cfg.instagramHandle!.replace(/^@/, "");
    result.venuesTried += 1;
    const fetch = await runSocialProfileFetch({
      platform: "instagram",
      handle,
      resultsLimit: 10,
    });
    if (!fetch.ok) {
      result.errors.push(`${cfg.venueName}: ${fetch.error}`);
      await db
        .update(radarVenueSourceConfigs)
        .set({
          lastInstagramFetchAt: new Date(),
          lastError: fetch.error.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(radarVenueSourceConfigs.id, cfg.id));
      continue;
    }

    for (const post of fetch.posts) {
      const caption = post.caption?.trim();
      if (!caption || caption.length < 20) continue;
      if (!LINEUP_HINT.test(caption) && !looksLikeLineup(caption)) continue;

      const names = extractNamesFromCaption(caption);
      if (names.length < 1) continue;

      const needsReview = names.length < 2 || !LINEUP_HINT.test(caption);
      const title =
        firstLine(caption).slice(0, 120) || `${cfg.venueName} IG post`;
      const ingested = await ingestPartyLineup({
        venueId: cfg.venueId,
        title,
        startsAt: post.timestamp ? new Date(post.timestamp) : null,
        source: "instagram",
        externalUrl: post.url,
        externalId: `ig:${cfg.venueId}:${post.id}`,
        lineupNames: names,
        needsReview,
        alertOnCreate: !needsReview,
        raw: { caption: caption.slice(0, 2000), handle },
      });
      if ("error" in ingested) {
        result.errors.push(`${cfg.venueName}/${post.id}: ${ingested.error}`);
        continue;
      }
      if (ingested.created) result.partiesIngested += 1;
      if (needsReview) result.needsReview += 1;
      result.artistsCreated += ingested.artistsCreated;
    }

    await db
      .update(radarVenueSourceConfigs)
      .set({
        lastInstagramFetchAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(radarVenueSourceConfigs.id, cfg.id));
  }

  return result;
}

function looksLikeLineup(caption: string): boolean {
  const names = parseLineupText(caption.replace(/\n/g, ", "));
  return names.length >= 3;
}

function extractNamesFromCaption(caption: string): string[] {
  // Prefer lines after "line-up" / "with:"
  const after = caption.split(/line[\s-]?up[:\s]*|with[:\s]+|feat\.?[:\s]+/i)[1];
  const chunk = after ?? caption;
  // Drop URLs and hashtag-only tokens for parsing
  const cleaned = chunk
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\w.]+/g, " ")
    .replace(/@([\w.]+)/g, "$1");
  let names = parseLineupText(cleaned);
  if (names.length < 2) {
    // @handles as artists
    const handles = [...caption.matchAll(/@([\w.]{2,30})/g)].map((m) => m[1]!);
    names = [...new Set([...names, ...handles])];
  }
  return names.slice(0, 20);
}

function firstLine(s: string): string {
  return s.split("\n").map((l) => l.trim()).find(Boolean) ?? s;
}
