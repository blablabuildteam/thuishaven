/**
 * Detect “lanceert”: follower knik on watchlist artists (RA / IG / SC).
 * Runs after social/soundcloud/RA snapshots so we have a fresh point.
 */
import { and, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { createRadarAlert } from "@/lib/radar/alerts";
import {
  radarAlerts,
  radarArtists,
  radarMetricSnapshots,
} from "@/lib/radar/schema";

export type LaunchDetectResult = {
  checked: number;
  alerts: number;
  errors: string[];
};

const PLATFORMS = ["resident_advisor", "instagram", "soundcloud"] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_NL: Record<Platform, string> = {
  resident_advisor: "RA",
  instagram: "Instagram",
  soundcloud: "SoundCloud",
};

/** Absolute + relative thresholds — absolute avoids tiny-base noise. */
const MIN_DELTA = 400;
const MIN_PCT = 12;
const COOLDOWN_DAYS = 14;
const LOOKBACK_MS = 5 * 24 * 60 * 60 * 1000;

function followersOf(metrics: Record<string, unknown> | null): number | null {
  if (!metrics) return null;
  const v = metrics.followers ?? metrics.followerCount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

export async function detectLaunchAlerts(options?: {
  limit?: number;
}): Promise<LaunchDetectResult> {
  const result: LaunchDetectResult = { checked: 0, alerts: 0, errors: [] };
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }
  const db = getDb();
  const limit = Math.min(options?.limit ?? 200, 400);

  const artists = await db
    .select({ id: radarArtists.id, name: radarArtists.name })
    .from(radarArtists)
    .where(inArray(radarArtists.status, ["watching", "shortlist", "contacted"]))
    .orderBy(desc(radarArtists.growthScore))
    .limit(limit);

  if (artists.length === 0) return result;
  result.checked = artists.length;

  const ids = artists.map((a) => a.id);
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const snaps = await db
    .select({
      artistId: radarMetricSnapshots.artistId,
      platform: radarMetricSnapshots.platform,
      capturedAt: radarMetricSnapshots.capturedAt,
      metrics: radarMetricSnapshots.metrics,
    })
    .from(radarMetricSnapshots)
    .where(
      and(
        inArray(radarMetricSnapshots.artistId, ids),
        inArray(radarMetricSnapshots.platform, [...PLATFORMS]),
        sql`${radarMetricSnapshots.capturedAt} >= ${since}`,
      ),
    )
    .orderBy(desc(radarMetricSnapshots.capturedAt));

  const byKey = new Map<string, Array<{ at: Date; followers: number }>>();
  for (const s of snaps) {
    const f = followersOf(s.metrics as Record<string, unknown>);
    if (f == null) continue;
    const key = `${s.artistId}:${s.platform}`;
    const list = byKey.get(key) ?? [];
    list.push({ at: s.capturedAt, followers: f });
    byKey.set(key, list);
  }

  const cooldownSince = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recentLaunches = await db
    .select({ artistId: radarAlerts.artistId })
    .from(radarAlerts)
    .where(
      and(
        sql`${radarAlerts.kind} = 'launch'`,
        sql`${radarAlerts.triggeredAt} >= ${cooldownSince}`,
        inArray(radarAlerts.artistId, ids),
        isNotNull(radarAlerts.artistId),
      ),
    );
  const cooled = new Set(
    recentLaunches.map((r) => r.artistId).filter((id): id is string => Boolean(id)),
  );

  for (const artist of artists) {
    if (cooled.has(artist.id)) continue;

    let best: {
      platform: Platform;
      delta: number;
      pct: number;
      latest: number;
    } | null = null;

    for (const platform of PLATFORMS) {
      const series = byKey.get(`${artist.id}:${platform}`);
      if (!series || series.length < 2) continue;
      const latest = series[0]!;
      const older = series.find(
        (p) => latest.at.getTime() - p.at.getTime() >= LOOKBACK_MS,
      );
      if (!older || older.followers <= 0) continue;
      const delta = latest.followers - older.followers;
      const pct = (delta / older.followers) * 100;
      if (delta < MIN_DELTA || pct < MIN_PCT) continue;
      if (!best || pct > best.pct) {
        best = { platform, delta, pct, latest: latest.followers };
      }
    }

    if (!best) continue;
    const label = PLATFORM_NL[best.platform];
    const sign = best.delta > 0 ? "+" : "";
    try {
      await createRadarAlert({
        kind: "launch",
        artistId: artist.id,
        title: `${artist.name} lanceert op ${label}`,
        body: `${label}-volgers ${sign}${best.delta.toLocaleString("nl-NL")} (${sign}${best.pct.toFixed(0)}%) · nu ${best.latest.toLocaleString("nl-NL")}.`,
        payload: {
          platform: best.platform,
          delta: best.delta,
          deltaPct: best.pct,
          latest: best.latest,
        },
      });
      result.alerts += 1;
      cooled.add(artist.id);
    } catch (e) {
      result.errors.push(
        `${artist.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
