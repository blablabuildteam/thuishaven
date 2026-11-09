/**
 * Layered social refresh via Apify.
 * Zonder APIFY_TOKEN: no-op met note. Met token: probeert top-N handles.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  isApifyConfigured,
  runSocialProfileFetch,
} from "@/lib/integrations/apify/client";
import { radarArtistProfiles, radarArtists } from "@/lib/radar/schema";

export type SocialSyncResult = {
  attempted: number;
  synced: number;
  skipped: number;
  errors: string[];
  note?: string;
};

export async function syncSocialForTopArtists(options?: {
  limit?: number;
}): Promise<SocialSyncResult> {
  const result: SocialSyncResult = {
    attempted: 0,
    synced: 0,
    skipped: 0,
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
      const fetch = await runSocialProfileFetch({ platform, handle });
      if (!fetch.ok) {
        result.errors.push(`${artist.name}/${platform}: ${fetch.error}`);
        continue;
      }
      result.synced += 1;
    }
  }

  if (result.attempted > 0 && result.synced === 0) {
    result.note =
      "Apify token staat, maar actors zijn nog niet gekoppeld of leverden geen data.";
  }
  return result;
}
