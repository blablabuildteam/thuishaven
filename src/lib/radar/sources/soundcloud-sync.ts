/**
 * Best-effort SoundCloud plays for artists with a SC handle (from RA enrich).
 * Uses public user track JSON when available; falls back to HTML scrape.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  insertMetricSnapshot,
  upsertArtistProfile,
} from "@/lib/radar/artists";
import { radarArtistProfiles, radarArtists } from "@/lib/radar/schema";

export type SoundCloudSyncResult = {
  attempted: number;
  synced: number;
  errors: string[];
  note?: string;
};

export async function syncSoundCloudForShortlist(options?: {
  limit?: number;
}): Promise<SoundCloudSyncResult> {
  const result: SoundCloudSyncResult = {
    attempted: 0,
    synced: 0,
    errors: [],
  };
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }

  const limit = Math.min(options?.limit ?? 30, 60);
  const db = getDb();
  const rows = await db
    .select({
      id: radarArtists.id,
      name: radarArtists.name,
      handle: radarArtistProfiles.handle,
      url: radarArtistProfiles.url,
    })
    .from(radarArtists)
    .innerJoin(
      radarArtistProfiles,
      and(
        eq(radarArtistProfiles.artistId, radarArtists.id),
        eq(radarArtistProfiles.platform, "soundcloud"),
      ),
    )
    .where(
      and(
        sql`${radarArtists.status} in ('shortlist', 'watching', 'contacted', 'new')`,
        sql`${radarArtistProfiles.handle} is not null`,
      ),
    )
    .orderBy(
      sql`case when ${radarArtists.status} = 'shortlist' then 0
               when ${radarArtists.status} = 'watching' then 1
               else 2 end`,
      desc(radarArtists.growthScore),
    )
    .limit(limit);

  for (const row of rows) {
    const handle = row.handle?.replace(/^@/, "").trim();
    if (!handle) continue;
    result.attempted += 1;
    try {
      const metrics = await fetchSoundCloudUserMetrics(handle);
      if (!metrics) {
        result.errors.push(`${row.name}: geen SC metrics`);
        continue;
      }
      await insertMetricSnapshot({
        artistId: row.id,
        platform: "soundcloud",
        metrics: {
          followers: metrics.followers,
          trackCount: metrics.trackCount,
          plays: metrics.totalPlays,
        },
      });
      await upsertArtistProfile({
        artistId: row.id,
        platform: "soundcloud",
        handle,
        url: row.url ?? `https://soundcloud.com/${handle}`,
        matchConfidence: "high",
        raw: { ...metrics, source: "radar_sc_sync" },
      });
      result.synced += 1;
    } catch (e) {
      result.errors.push(
        `${row.name}: ${e instanceof Error ? e.message : "SC fetch failed"}`,
      );
    }
    await sleep(250);
  }

  return result;
}

async function fetchSoundCloudUserMetrics(handle: string): Promise<{
  followers: number | null;
  trackCount: number | null;
  totalPlays: number | null;
} | null> {
  const url = `https://soundcloud.com/${encodeURIComponent(handle)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "ThuishavenRadar/1.0 (+https://tools.blablabuild.com; scouting)",
      Accept: "text/html",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  // Hydration blob often contains followers_count / track_count
  const followers =
    numFrom(html, /"followers_count"\s*:\s*(\d+)/) ??
    numFrom(html, /followers_count&quot;:(\d+)/);
  const trackCount =
    numFrom(html, /"track_count"\s*:\s*(\d+)/) ??
    numFrom(html, /track_count&quot;:(\d+)/);

  // Sum a few playback_count occurrences on the page (rough)
  const plays = [...html.matchAll(/"playback_count"\s*:\s*(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  const totalPlays =
    plays.length > 0 ? plays.reduce((a, b) => a + b, 0) : null;

  if (followers == null && trackCount == null && totalPlays == null) {
    return null;
  }
  return { followers, trackCount, totalPlays };
}

function numFrom(html: string, re: RegExp): number | null {
  const m = html.match(re);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
