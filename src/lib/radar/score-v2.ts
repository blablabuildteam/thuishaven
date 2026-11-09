/**
 * Score v2 — momentum / fit / bookability from RA gigs (+ optional Spotify).
 * Platform blend in score.ts blijft als fallback; pipeline gebruikt v2 als primaire score.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  radarArtists,
  radarMetricSnapshots,
  radarScoreSnapshots,
} from "@/lib/radar/schema";
import { gigStatsForWindow } from "@/lib/radar/gigs";
import { loadRadarSettings } from "@/lib/radar/settings";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

export type ScoreV2Result = {
  total: number;
  momentum: number;
  fit: number;
  bookability: number;
  velocity: number;
  reasons: string[];
  breakdown: Record<string, unknown>;
};

export function computeScoreV2(input: {
  recent: Awaited<ReturnType<typeof gigStatsForWindow>>;
  previous: Awaited<ReturnType<typeof gigStatsForWindow>>;
  discoveryHops: number;
  spotifyFollowers: number | null;
  spotifyPopularity: number | null;
  unknownCeilings: {
    spotifyFollowers: number;
    spotifyPopularity: number;
  };
}): ScoreV2Result {
  const { recent, previous } = input;
  const reasons: string[] = [];

  // Momentum: volume growth + billing climb + internationalisatie
  const volumeRatio =
    previous.count <= 0
      ? recent.count > 0
        ? 1.2
        : 0
      : recent.count / previous.count;
  const volumeScore = clamp01((volumeRatio - 0.5) / 1.5);
  if (recent.count > 0 && previous.count > 0 && volumeRatio >= 1.5) {
    reasons.push(
      `${recent.count} gigs in 90 dagen (was ${previous.count})`,
    );
  } else if (recent.count >= 3 && previous.count === 0) {
    reasons.push(`${recent.count} gigs in 90 dagen (nieuw tempo)`);
  }

  const billImprove =
    recent.avgBillingIndex != null && previous.avgBillingIndex != null
      ? clamp01((previous.avgBillingIndex - recent.avgBillingIndex + 2) / 6)
      : recent.avgBillingIndex != null
        ? clamp01(1 - recent.avgBillingIndex / 8)
        : 0.35;
  if (
    recent.avgBillingIndex != null &&
    previous.avgBillingIndex != null &&
    recent.avgBillingIndex + 0.8 < previous.avgBillingIndex
  ) {
    reasons.push("Hoger op de line-up dan vorig kwartaal");
  }

  const intlScore = clamp01(recent.distinctCountries / 3);
  if (recent.distinctCountries >= 2) {
    reasons.push(`Speelt in ${recent.distinctCountries} landen`);
  }

  const momentum = round1(
    clamp01(volumeScore * 0.55 + billImprove * 0.25 + intlScore * 0.2) * 100,
  );

  // Fit: early venues + home region
  const earlyShare =
    recent.count > 0 ? recent.earlyVenueCount / recent.count : 0;
  const fit = round1(
    clamp01(earlyShare * 0.7 + (recent.topVenueNames.length > 0 ? 0.2 : 0) + 0.1) *
      100,
  );
  if (recent.topVenueNames.length > 0 && earlyShare >= 0.4) {
    reasons.push(`Gedraaid bij ${recent.topVenueNames.slice(0, 2).join(" en ")}`);
  } else if (recent.topVenueNames.length > 0) {
    reasons.push(`Recent: ${recent.topVenueNames.slice(0, 2).join(", ")}`);
  }

  // Bookability: still small enough
  const followers = input.spotifyFollowers;
  const popularity = input.spotifyPopularity;
  const unknownFollowers =
    followers == null ||
    followers <= input.unknownCeilings.spotifyFollowers;
  const unknownPop =
    popularity == null ||
    popularity <= input.unknownCeilings.spotifyPopularity;
  const sizePenalty =
    followers != null
      ? clamp01(Math.log10(followers + 1) / 6)
      : popularity != null
        ? clamp01(popularity / 100)
        : 0.25;
  const hopPenalty = clamp01(input.discoveryHops / 4);
  const attendingPenalty =
    recent.avgAttending != null
      ? clamp01(Math.log10(recent.avgAttending + 1) / 3.5)
      : 0.3;
  const bookability = round1(
    clamp01(
      1 -
        sizePenalty * 0.45 -
        attendingPenalty * 0.25 -
        hopPenalty * 0.15 -
        (unknownFollowers && unknownPop ? 0 : 0.15),
    ) * 100,
  );
  if (followers != null && followers <= input.unknownCeilings.spotifyFollowers) {
    reasons.push(
      `Spotify ${followers.toLocaleString("nl-NL")} volgers — nog boekbaar`,
    );
  }
  if (recent.headlinerCount >= 2 && recent.avgAttending && recent.avgAttending > 400) {
    reasons.push("Venster sluit: meerdere headliner-slots");
  }

  // Combine — RA-first
  const total = round1(
    momentum * 0.45 + fit * 0.3 + bookability * 0.25,
  );
  const velocity = round1(
    previous.count > 0
      ? clamp01((volumeRatio - 1) / 2) * 100
      : recent.count > 0
        ? 40
        : 0,
  );

  return {
    total,
    momentum,
    fit,
    bookability,
    velocity,
    reasons: reasons.slice(0, 3),
    breakdown: {
      recent,
      previous,
      volumeRatio,
      volumeScore,
      billImprove,
      intlScore,
      earlyShare,
      sizePenalty,
      followers,
      popularity,
    },
  };
}

export async function recomputeArtistScoreV2(
  artistId: string,
  options?: { persistSnapshot?: boolean },
): Promise<ScoreV2Result | null> {
  if (!hasDatabase()) return null;
  const settings = await loadRadarSettings();
  const db = getDb();
  const [artist] = await db
    .select()
    .from(radarArtists)
    .where(eq(radarArtists.id, artistId))
    .limit(1);
  if (!artist) return null;

  const now = Date.now();
  const d90 = 90 * 24 * 60 * 60 * 1000;
  const recent = await gigStatsForWindow(
    artistId,
    new Date(now - d90),
    new Date(now + 14 * 24 * 60 * 60 * 1000), // include announced near-future
  );
  const previous = await gigStatsForWindow(
    artistId,
    new Date(now - 2 * d90),
    new Date(now - d90),
  );

  const [spotify] = await db
    .select()
    .from(radarMetricSnapshots)
    .where(
      and(
        eq(radarMetricSnapshots.artistId, artistId),
        eq(radarMetricSnapshots.platform, "spotify"),
      ),
    )
    .orderBy(desc(radarMetricSnapshots.capturedAt))
    .limit(1);

  const result = computeScoreV2({
    recent,
    previous,
    discoveryHops: artist.discoveryHops,
    spotifyFollowers: num(spotify?.metrics?.followers),
    spotifyPopularity: num(spotify?.metrics?.popularity),
    unknownCeilings: settings.unknownCeilings,
  });

  if (options?.persistSnapshot !== false) {
    await db.insert(radarScoreSnapshots).values({
      artistId,
      momentum: String(result.momentum),
      fit: String(result.fit),
      bookability: String(result.bookability),
      total: String(result.total),
      reasons: result.reasons,
      breakdown: {
        ...result.breakdown,
        raMetrics: {
          gigCount: recent.count,
          gigCountPrev: previous.count,
          avgAttending: recent.avgAttending,
          earlyVenueCount: recent.earlyVenueCount,
        },
      },
    });
  }

  await db
    .update(radarArtists)
    .set({
      growthScore: String(result.total),
      growthVelocity: String(result.velocity),
      growthScoreAt: new Date(),
      growthBreakdown: result.breakdown,
      momentumScore: String(result.momentum),
      fitScore: String(result.fit),
      bookabilityScore: String(result.bookability),
      scoreReasons: result.reasons,
      updatedAt: new Date(),
    })
    .where(eq(radarArtists.id, artistId));

  return result;
}
