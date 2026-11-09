import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarArtists, radarMetricSnapshots } from "@/lib/radar/schema";
import {
  DEFAULT_RADAR_SETTINGS,
  loadRadarSettings,
  type RadarSettingsValue,
} from "@/lib/radar/settings";

type Platform =
  | "spotify"
  | "instagram"
  | "tiktok"
  | "soundcloud"
  | "resident_advisor";

type PlatformSignals = {
  absolute: number | null;
  velocity: number | null;
  unknown: boolean;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function platformAbsolute(
  platform: Platform,
  metrics: Record<string, number | string | null>,
  settings: RadarSettingsValue,
): PlatformSignals {
  if (platform === "spotify") {
    const followers = num(metrics.followers);
    const popularity = num(metrics.popularity);
    const absolute =
      followers != null
        ? clamp01(Math.log10(followers + 1) / 6)
        : popularity != null
          ? clamp01(popularity / 100)
          : null;
    const unknown =
      (followers != null &&
        followers <= settings.unknownCeilings.spotifyFollowers) ||
      (popularity != null &&
        popularity <= settings.unknownCeilings.spotifyPopularity);
    return { absolute, velocity: null, unknown };
  }
  if (platform === "instagram" || platform === "tiktok") {
    const followers = num(metrics.followers);
    const engagement = num(metrics.engagementRate);
    const absolute =
      followers != null ? clamp01(Math.log10(followers + 1) / 6) : null;
    const unknown =
      followers != null &&
      followers <=
        (platform === "instagram"
          ? settings.unknownCeilings.instagramFollowers
          : settings.unknownCeilings.tiktokFollowers);
    return {
      absolute:
        absolute == null
          ? null
          : clamp01(absolute * 0.85 + clamp01((engagement ?? 0) / 10) * 0.15),
      velocity: null,
      unknown,
    };
  }
  if (platform === "soundcloud") {
    const followers = num(metrics.followers);
    const plays = num(metrics.plays);
    const absolute =
      followers != null
        ? clamp01(Math.log10(followers + 1) / 5.5)
        : plays != null
          ? clamp01(Math.log10(plays + 1) / 7)
          : null;
    return {
      absolute,
      velocity: null,
      unknown:
        followers != null &&
        followers <= settings.unknownCeilings.soundcloudFollowers,
    };
  }
  // RA
  const favorites = num(metrics.favorites);
  const gigs = num(metrics.gigCount);
  const absolute =
    favorites != null
      ? clamp01(Math.log10(favorites + 1) / 5)
      : gigs != null
        ? clamp01(gigs / 40)
        : null;
  return {
    absolute,
    velocity: null,
    unknown:
      favorites != null && favorites <= settings.unknownCeilings.raFavorites,
  };
}

function velocityFromSeries(
  series: Array<{ capturedAt: Date; metrics: Record<string, number | string | null> }>,
  key: string,
): number | null {
  if (series.length < 2) return null;
  const newest = num(series[0]?.metrics[key]);
  const oldest = num(series[series.length - 1]?.metrics[key]);
  if (newest == null || oldest == null || oldest <= 0) return null;
  const days = Math.max(
    1,
    (series[0]!.capturedAt.getTime() - series[series.length - 1]!.capturedAt.getTime()) /
      (24 * 60 * 60 * 1000),
  );
  const pct = ((newest - oldest) / oldest) * 100;
  // ~10%/week ≈ strong for emerging acts
  return clamp01(pct / Math.max(days / 7, 0.5) / 25);
}

/**
 * Objectieve Groeiscore 0–100.
 * Velocity weegt zwaarder dan absolute omvang; “onbekend” krijgt een kleine boost
 * zodat gevestigde namen niet automatisch bovenaan staan.
 */
export function computeGrowthScore(input: {
  platforms: Partial<
    Record<
      Platform,
      {
        latest: Record<string, number | string | null>;
        history: Array<{
          capturedAt: Date;
          metrics: Record<string, number | string | null>;
        }>;
      }
    >
  >;
  settings?: RadarSettingsValue;
}): {
  score: number;
  velocity: number;
  breakdown: Record<string, unknown>;
} {
  const settings = input.settings ?? DEFAULT_RADAR_SETTINGS;
  const vs = clamp01(settings.velocityShare);
  const absShare = 1 - vs;

  let weighted = 0;
  let weightSum = 0;
  let velocityAcc = 0;
  let velocityN = 0;
  let unknownBoost = 0;
  const perPlatform: Record<string, unknown> = {};

  for (const platform of Object.keys(settings.weights) as Platform[]) {
    const w = settings.weights[platform];
    if (w <= 0) continue;
    const data = input.platforms[platform];
    if (!data) continue;

    const signals = platformAbsolute(platform, data.latest, settings);
    const velKey =
      platform === "spotify"
        ? "followers"
        : platform === "resident_advisor"
          ? "favorites"
          : "followers";
    const velocity = velocityFromSeries(data.history, velKey);
    const combined =
      signals.absolute == null && velocity == null
        ? null
        : (signals.absolute ?? 0) * absShare + (velocity ?? 0) * vs;

    if (combined == null) continue;
    weighted += combined * w;
    weightSum += w;
    if (velocity != null) {
      velocityAcc += velocity;
      velocityN += 1;
    }
    if (signals.unknown) unknownBoost += 0.04 * w;
    perPlatform[platform] = {
      absolute: signals.absolute,
      velocity,
      combined,
      weight: w,
      unknown: signals.unknown,
      latest: data.latest,
    };
  }

  if (weightSum <= 0) {
    return { score: 0, velocity: 0, breakdown: { platforms: perPlatform } };
  }

  const base = weighted / weightSum;
  const score = Math.round(clamp01(base + unknownBoost) * 1000) / 10;
  const velocity =
    velocityN > 0
      ? Math.round((velocityAcc / velocityN) * 1000) / 10
      : 0;

  return {
    score,
    velocity,
    breakdown: {
      platforms: perPlatform,
      velocityShare: vs,
      unknownBoost,
    },
  };
}

export async function recomputeArtistGrowthScore(
  artistId: string,
): Promise<{ score: number; velocity: number } | null> {
  if (!hasDatabase()) return null;
  const settings = await loadRadarSettings();
  const db = getDb();
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const snaps = await db
    .select()
    .from(radarMetricSnapshots)
    .where(
      and(
        eq(radarMetricSnapshots.artistId, artistId),
        gte(radarMetricSnapshots.capturedAt, since),
      ),
    )
    .orderBy(desc(radarMetricSnapshots.capturedAt));

  const byPlatform = new Map<
    Platform,
    Array<{ capturedAt: Date; metrics: Record<string, number | string | null> }>
  >();
  for (const snap of snaps) {
    const list = byPlatform.get(snap.platform as Platform) ?? [];
    list.push({ capturedAt: snap.capturedAt, metrics: snap.metrics });
    byPlatform.set(snap.platform as Platform, list);
  }

  const platforms: Parameters<typeof computeGrowthScore>[0]["platforms"] = {};
  for (const [platform, history] of byPlatform) {
    const latest = history[0];
    if (!latest) continue;
    platforms[platform] = { latest: latest.metrics, history };
  }

  const result = computeGrowthScore({ platforms, settings });
  await db
    .update(radarArtists)
    .set({
      growthScore: String(result.score),
      growthVelocity: String(result.velocity),
      growthScoreAt: new Date(),
      growthBreakdown: result.breakdown,
      updatedAt: new Date(),
    })
    .where(eq(radarArtists.id, artistId));
  return { score: result.score, velocity: result.velocity };
}
