/**
 * Layered social refresh via Apify + artist gig detection.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  isApifyConfigured,
  runSocialProfileFetch,
} from "@/lib/integrations/apify/client";
import {
  insertMetricSnapshot,
  upsertArtistProfile,
} from "@/lib/radar/artists";
import { followArtistSocialGigs } from "@/lib/radar/sources/artist-social-gigs";
import { radarArtistProfiles, radarArtists } from "@/lib/radar/schema";

export type SocialSyncResult = {
  attempted: number;
  synced: number;
  skipped: number;
  gigsDetected: number;
  errors: string[];
  note?: string;
};

export async function syncSocialForTopArtists(options?: {
  limit?: number;
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

  const limit = options?.limit ?? 40;
  const db = getDb();
  const artists = await db
    .select({ id: radarArtists.id, name: radarArtists.name })
    .from(radarArtists)
    .where(
      sql`${radarArtists.status} not in ('passed', 'not_relevant', 'booked')`,
    )
    .orderBy(desc(radarArtists.growthScore))
    .limit(limit);

  for (const artist of artists) {
    const profiles = await db
      .select()
      .from(radarArtistProfiles)
      .where(eq(radarArtistProfiles.artistId, artist.id));

    for (const platform of ["instagram", "tiktok"] as const) {
      const profile = profiles.find((p) => p.platform === platform);
      const handle = profile?.handle?.replace(/^@/, "");
      if (!handle) {
        result.skipped += 1;
        continue;
      }
      result.attempted += 1;
      const fetch = await runSocialProfileFetch({
        platform,
        handle,
        resultsLimit: 5,
      });
      if (!fetch.ok) {
        result.errors.push(`${artist.name}/${platform}: ${fetch.error}`);
        continue;
      }
      if (fetch.followers != null) {
        await insertMetricSnapshot({
          artistId: artist.id,
          platform,
          metrics: { followers: fetch.followers },
        });
        await upsertArtistProfile({
          artistId: artist.id,
          platform,
          handle,
          url: profile?.url ?? null,
          matchConfidence: profile?.matchConfidence ?? "medium",
          raw: { lastFollowers: fetch.followers },
        });
      }
      result.synced += 1;
    }
  }

  if (options?.followGigs !== false) {
    const gigs = await followArtistSocialGigs({
      limit: Math.min(15, Math.ceil(limit / 2)),
    });
    result.gigsDetected = gigs.gigsDetected;
    result.errors.push(...gigs.errors.slice(0, 10));
    if (gigs.note) {
      result.note = [result.note, gigs.note].filter(Boolean).join(" · ");
    }
  }

  if (result.attempted > 0 && result.synced === 0 && !result.note) {
    result.note =
      "Apify token staat, maar actors leverden geen bruikbare data.";
  }
  return result;
}
