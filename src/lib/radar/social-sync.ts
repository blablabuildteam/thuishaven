/**
 * Efficient layered Instagram refresh via Apify (within ~$19 Starter budget).
 * - Only shortlist / watching / high-score new
 * - Skip if synced &lt; 7 days ago
 * - Batch many handles in ONE actor run
 * - Posts (gig-detectie) alleen voor shortlist
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  isApifyConfigured,
  runInstagramBatchByHandle,
} from "@/lib/integrations/apify/client";
import {
  insertMetricSnapshot,
  upsertArtistProfile,
} from "@/lib/radar/artists";
import { ingestPartyLineup } from "@/lib/radar/ingest-party";
import { parseLineupText } from "@/lib/radar/parse-lineup";
import { radarArtistProfiles, radarArtists } from "@/lib/radar/schema";

export type SocialSyncResult = {
  attempted: number;
  synced: number;
  skipped: number;
  gigsDetected: number;
  errors: string[];
  note?: string;
};

const GIG_HINT =
  /playing (at|@)|tonight|this (fri|sat|sunday)|tickets|on sale|support(ing)?|b2b|line[\s-]?up|see you (at|in)|live at/i;

const STALE_DAYS = 7;

export async function syncSocialForTopArtists(options?: {
  /** Max artists in the follower batch (default 25). */
  limit?: number;
  /** Also parse captions for gigs (shortlist only). */
  followGigs?: boolean;
}): Promise<SocialSyncResult> {
  const result: SocialSyncResult = {
    attempted: 0,
    synced: 0,
    skipped: 0,
    gigsDetected: 0,
    errors: [],
  };

  if (!isApifyConfigured()) {
    result.note = "Apify overgeslagen: APIFY_TOKEN ontbreekt.";
    return result;
  }
  if (!hasDatabase()) {
    result.note = "DATABASE_URL ontbreekt";
    return result;
  }

  const limit = Math.min(options?.limit ?? 25, 40);
  const db = getDb();
  const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: radarArtists.id,
      name: radarArtists.name,
      status: radarArtists.status,
      handle: radarArtistProfiles.handle,
      url: radarArtistProfiles.url,
      lastSyncedAt: radarArtistProfiles.lastSyncedAt,
    })
    .from(radarArtists)
    .innerJoin(
      radarArtistProfiles,
      and(
        eq(radarArtistProfiles.artistId, radarArtists.id),
        eq(radarArtistProfiles.platform, "instagram"),
      ),
    )
    .where(
      and(
        or(
          inArray(radarArtists.status, ["shortlist", "watching", "contacted"]),
          and(
            eq(radarArtists.status, "new"),
            sql`${radarArtists.growthScore}::numeric >= 55`,
          ),
        ),
        sql`${radarArtistProfiles.handle} is not null`,
        or(
          sql`${radarArtistProfiles.lastSyncedAt} is null`,
          sql`${radarArtistProfiles.lastSyncedAt} < ${staleBefore}`,
        ),
      ),
    )
    .orderBy(
      sql`case when ${radarArtists.status} = 'shortlist' then 0
               when ${radarArtists.status} = 'watching' then 1
               when ${radarArtists.status} = 'contacted' then 2
               else 3 end`,
      desc(radarArtists.growthScore),
    )
    .limit(limit);

  if (candidates.length === 0) {
    result.note = "Geen stale IG-handles in shortlist/watching/nieuw.";
    return result;
  }

  const handles = candidates
    .map((c) => c.handle?.replace(/^@/, "").trim().toLowerCase())
    .filter((h): h is string => Boolean(h));

  result.attempted = handles.length;
  const batch = await runInstagramBatchByHandle({
    handles,
    resultsLimit: 5,
  });
  if (!batch.ok) {
    result.errors.push(batch.error);
    result.note = batch.error;
    return result;
  }

  const byId = new Map(
    candidates.map((c) => [
      c.handle?.replace(/^@/, "").trim().toLowerCase() ?? "",
      c,
    ]),
  );

  for (const [handle, fetch] of Object.entries(batch.byHandle)) {
    const artist = byId.get(handle);
    if (!artist) {
      result.skipped += 1;
      continue;
    }
    if (fetch.followers != null) {
      await insertMetricSnapshot({
        artistId: artist.id,
        platform: "instagram",
        metrics: { followers: fetch.followers },
      });
    }
    await upsertArtistProfile({
      artistId: artist.id,
      platform: "instagram",
      handle,
      url: artist.url ?? `https://www.instagram.com/${handle}/`,
      matchConfidence: "high",
      raw: {
        lastFollowers: fetch.followers,
        postsSampled: fetch.posts.length,
      },
    });
    result.synced += 1;

    if (
      options?.followGigs !== false &&
      (artist.status === "shortlist" || artist.status === "watching")
    ) {
      for (const post of fetch.posts) {
        const caption = post.caption?.trim();
        if (!caption || !GIG_HINT.test(caption)) continue;
        const others = parseLineupText(
          caption.replace(/https?:\/\/\S+/g, " ").replace(/#[\w.]+/g, " "),
        ).filter((n) => n.toLowerCase() !== artist.name.toLowerCase());
        const names = [artist.name, ...others].slice(0, 10);
        const title =
          caption.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) ||
          `${artist.name} IG gig`;
        const ingested = await ingestPartyLineup({
          venueId: null,
          title,
          startsAt: post.timestamp ? new Date(post.timestamp) : null,
          source: "instagram",
          externalUrl: post.url,
          externalId: `ig-artist:${artist.id}:${post.id}`,
          lineupNames: names,
          needsReview: true,
          alertOnCreate: false,
          raw: {
            caption: caption.slice(0, 2000),
            artistId: artist.id,
            kind: "artist_social_gig",
          },
        });
        if ("ok" in ingested && ingested.ok) result.gigsDetected += 1;
      }
    }
  }

  result.note = `Batch ${handles.length} handles · ${result.synced} gesynct · ${result.gigsDetected} gig-hints (review).`;
  return result;
}
