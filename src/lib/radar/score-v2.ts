/**
 * Score v2 — momentum / fit / bookability from RA gigs (+ optional Spotify/RA followers).
 */
import { desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarArtists, radarScoreSnapshots } from "@/lib/radar/schema";
import { type GigWindowStats } from "@/lib/radar/gigs";
import { loadRadarSettings } from "@/lib/radar/settings";
import { withRetry } from "@/lib/radar/retry";

const HOME_RA_ID = "109027";

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

function emptyStats(): GigWindowStats {
  return {
    count: 0,
    avgAttending: null,
    avgBillingIndex: null,
    headlinerCount: 0,
    earlyVenueCount: 0,
    distinctCountries: 0,
    topVenueNames: [],
  };
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
  recent: GigWindowStats;
  previous: GigWindowStats;
  discoveryHops: number;
  spotifyFollowers: number | null;
  spotifyPopularity: number | null;
  unknownCeilings: {
    spotifyFollowers: number;
    spotifyPopularity: number;
  };
  raFollowers?: number | null;
  raFollowersPrev?: number | null;
  hasAgency?: boolean;
  residentCountry?: string | null;
  homeGigCount?: number;
  sharedHomeVenueHits?: number;
  nlAudienceScore?: number | null;
  nlGigShare?: number | null;
}): ScoreV2Result {
  const { recent, previous } = input;
  const reasons: string[] = [];

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

  let raGrowth = 0;
  if (
    input.raFollowers != null &&
    input.raFollowersPrev != null &&
    input.raFollowersPrev > 0
  ) {
    const growth =
      (input.raFollowers - input.raFollowersPrev) / input.raFollowersPrev;
    raGrowth = clamp01((growth + 0.05) / 0.35);
    if (growth >= 0.1) {
      reasons.push(
        `RA-volgers +${Math.round(growth * 100)}% in 30 dagen`,
      );
    }
  }

  const momentum = round1(
    clamp01(
      volumeScore * 0.45 +
        billImprove * 0.2 +
        intlScore * 0.15 +
        raGrowth * 0.2,
    ) * 100,
  );

  const earlyShare =
    recent.count > 0 ? recent.earlyVenueCount / recent.count : 0;
  const nlBoost =
    /netherlands|nederland|nl/i.test(input.residentCountry ?? "") ? 0.1 : 0;
  if (nlBoost > 0) reasons.push("Woont in NL");
  const nlAud =
    input.nlAudienceScore != null
      ? clamp01(input.nlAudienceScore / 100) * 0.18
      : (input.nlGigShare ?? 0) * 0.18;
  if ((input.nlGigShare ?? 0) >= 0.35) {
    reasons.push(
      `${Math.round((input.nlGigShare ?? 0) * 100)}% recente gigs in NL`,
    );
  } else if ((input.nlAudienceScore ?? 0) >= 55) {
    reasons.push(`NL-audience score ${input.nlAudienceScore}`);
  }
  const homeOverlap = clamp01((input.sharedHomeVenueHits ?? 0) / 4) * 0.12;
  if ((input.sharedHomeVenueHits ?? 0) >= 2) {
    reasons.push(
      `Deelt ${input.sharedHomeVenueHits} clubs met Thuishaven-artiesten`,
    );
  }

  const fit = round1(
    clamp01(
      earlyShare * 0.45 +
        (recent.topVenueNames.length > 0 ? 0.12 : 0) +
        nlBoost +
        nlAud +
        homeOverlap +
        0.08,
    ) * 100,
  );
  if (recent.topVenueNames.length > 0 && earlyShare >= 0.4) {
    reasons.push(`Gedraaid bij ${recent.topVenueNames.slice(0, 2).join(" en ")}`);
  } else if (recent.topVenueNames.length > 0 && reasons.length < 3) {
    reasons.push(`Recent: ${recent.topVenueNames.slice(0, 2).join(", ")}`);
  }

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
  const raSizePenalty =
    input.raFollowers != null && input.raFollowers > 15_000
      ? clamp01((input.raFollowers - 15_000) / 40_000)
      : 0;
  const agencyPenalty = input.hasAgency ? 0.15 : 0;
  if (input.hasAgency) {
    reasons.push("Heeft boekingsbureau — venster sluit");
  }
  if (input.raFollowers != null && input.raFollowers > 15_000) {
    reasons.push(
      `RA ${input.raFollowers.toLocaleString("nl-NL")} volgers — grotere naam`,
    );
  }

  const bookability = round1(
    clamp01(
      1 -
        sizePenalty * 0.35 -
        attendingPenalty * 0.2 -
        hopPenalty * 0.1 -
        raSizePenalty * 0.2 -
        agencyPenalty -
        (unknownFollowers && unknownPop ? 0 : 0.1),
    ) * 100,
  );
  if (
    followers != null &&
    followers <= input.unknownCeilings.spotifyFollowers &&
    reasons.length < 3
  ) {
    reasons.push(
      `Spotify ${followers.toLocaleString("nl-NL")} volgers — nog boekbaar`,
    );
  }
  if (
    recent.headlinerCount >= 2 &&
    recent.avgAttending &&
    recent.avgAttending > 400
  ) {
    reasons.push("Venster sluit: meerdere headliner-slots");
  }

  const total = round1(momentum * 0.45 + fit * 0.3 + bookability * 0.25);
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
      raGrowth,
      raSizePenalty,
      agencyPenalty,
      followers,
      popularity,
      raFollowers: input.raFollowers ?? null,
      homeGigCount: input.homeGigCount ?? 0,
    },
  };
}

type AggRow = {
  artistId: string;
  window: "recent" | "previous";
  count: number;
  avgAttending: number | null;
  avgBillingIndex: number | null;
  headlinerCount: number;
  earlyVenueCount: number;
  distinctCountries: number;
};

async function loadGigAggregates(
  artistIds: string[],
  recentFrom: Date,
  recentTo: Date,
  prevFrom: Date,
  prevTo: Date,
): Promise<Map<string, { recent: GigWindowStats; previous: GigWindowStats }>> {
  const db = getDb();
  const map = new Map<
    string,
    { recent: GigWindowStats; previous: GigWindowStats }
  >();
  for (const id of artistIds) {
    map.set(id, { recent: emptyStats(), previous: emptyStats() });
  }
  if (artistIds.length === 0) return map;

  const rf = recentFrom.toISOString();
  const rt = recentTo.toISOString();
  const pf = prevFrom.toISOString();
  const pt = prevTo.toISOString();
  const idList = sql.join(
    artistIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    select
      g.artist_id as "artistId",
      case
        when g.starts_at >= ${rf}::timestamptz and g.starts_at < ${rt}::timestamptz then 'recent'
        else 'previous'
      end as window,
      count(*)::int as count,
      avg(g.attending)::float as "avgAttending",
      avg(g.billing_index)::float as "avgBillingIndex",
      count(*) filter (where g.is_headliner)::int as "headlinerCount",
      count(*) filter (where v.tier = 'early')::int as "earlyVenueCount",
      count(distinct g.country)::int as "distinctCountries"
    from radar_gigs g
    left join radar_venues v on v.id = g.venue_id
    where g.artist_id in (${idList})
      and (
        (g.starts_at >= ${rf}::timestamptz and g.starts_at < ${rt}::timestamptz)
        or (g.starts_at >= ${pf}::timestamptz and g.starts_at < ${pt}::timestamptz)
      )
    group by g.artist_id, 2
  `);

  for (const raw of rows as unknown as AggRow[]) {
    const bucket = map.get(raw.artistId);
    if (!bucket) continue;
    const stats: GigWindowStats = {
      count: Number(raw.count) || 0,
      avgAttending: raw.avgAttending == null ? null : Number(raw.avgAttending),
      avgBillingIndex:
        raw.avgBillingIndex == null ? null : Number(raw.avgBillingIndex),
      headlinerCount: Number(raw.headlinerCount) || 0,
      earlyVenueCount: Number(raw.earlyVenueCount) || 0,
      distinctCountries: Number(raw.distinctCountries) || 0,
      topVenueNames: [],
    };
    if (raw.window === "recent") bucket.recent = stats;
    else bucket.previous = stats;
  }

  const topRows = await db.execute(sql`
    select artist_id as "artistId", venue_name as "venueName"
    from (
      select
        g.artist_id,
        v.name as venue_name,
        count(*) as n,
        row_number() over (partition by g.artist_id order by count(*) desc) as rn
      from radar_gigs g
      join radar_venues v on v.id = g.venue_id
      where g.artist_id in (${idList})
        and g.starts_at >= ${rf}::timestamptz
        and g.starts_at < ${rt}::timestamptz
        and v.name is not null
      group by g.artist_id, v.name
    ) t
    where rn <= 3
    order by artist_id, rn
  `);

  for (const raw of topRows as unknown as Array<{
    artistId: string;
    venueName: string;
  }>) {
    const bucket = map.get(raw.artistId);
    if (!bucket || !raw.venueName) continue;
    bucket.recent.topVenueNames.push(raw.venueName);
  }

  return map;
}

async function loadHomeGigCounts(
  artistIds: string[],
): Promise<Map<string, number>> {
  const db = getDb();
  const out = new Map<string, number>();
  if (artistIds.length === 0) return out;
  const rows = await db.execute(sql`
    select g.artist_id as "artistId", count(*)::int as n
    from radar_gigs g
    join radar_venues v on v.id = g.venue_id
    where v.ra_external_id = ${HOME_RA_ID}
      and g.artist_id in (${sql.join(
        artistIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    group by g.artist_id
  `);
  for (const r of rows as unknown as Array<{ artistId: string; n: number }>) {
    out.set(r.artistId, Number(r.n) || 0);
  }
  return out;
}

async function loadSharedHomeVenueHits(
  artistIds: string[],
): Promise<Map<string, number>> {
  const db = getDb();
  const out = new Map<string, number>();
  if (artistIds.length === 0) return out;
  // Venues (not Thuishaven) where ≥1 home artist also played, count per candidate.
  const rows = await db.execute(sql`
    with home_artists as (
      select distinct g.artist_id
      from radar_gigs g
      join radar_venues v on v.id = g.venue_id
      where v.ra_external_id = ${HOME_RA_ID}
    ),
    home_venues as (
      select distinct g.venue_id
      from radar_gigs g
      join home_artists h on h.artist_id = g.artist_id
      join radar_venues v on v.id = g.venue_id
      where g.venue_id is not null
        and v.ra_external_id is distinct from ${HOME_RA_ID}
    )
    select g.artist_id as "artistId", count(distinct g.venue_id)::int as n
    from radar_gigs g
    join home_venues hv on hv.venue_id = g.venue_id
    where g.artist_id in (${sql.join(
      artistIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      and g.artist_id not in (select artist_id from home_artists)
    group by g.artist_id
  `);
  for (const r of rows as unknown as Array<{ artistId: string; n: number }>) {
    out.set(r.artistId, Number(r.n) || 0);
  }
  return out;
}

async function loadLatestMetrics(
  artistIds: string[],
): Promise<
  Map<
    string,
    {
      spotifyFollowers: number | null;
      spotifyPopularity: number | null;
      raFollowers: number | null;
      raFollowersPrev: number | null;
    }
  >
> {
  const db = getDb();
  const out = new Map<
    string,
    {
      spotifyFollowers: number | null;
      spotifyPopularity: number | null;
      raFollowers: number | null;
      raFollowersPrev: number | null;
    }
  >();
  for (const id of artistIds) {
    out.set(id, {
      spotifyFollowers: null,
      spotifyPopularity: null,
      raFollowers: null,
      raFollowersPrev: null,
    });
  }
  if (artistIds.length === 0) return out;

  const rows = await db.execute(sql`
    select artist_id as "artistId", platform, metrics, captured_at as "capturedAt",
      row_number() over (
        partition by artist_id, platform order by captured_at desc
      ) as rn
    from radar_metric_snapshots
    where artist_id in (${sql.join(
      artistIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      and platform in ('spotify', 'resident_advisor')
  `);

  const raSecond = new Map<string, number>();
  for (const r of rows as unknown as Array<{
    artistId: string;
    platform: string;
    metrics: Record<string, unknown>;
    rn: number;
  }>) {
    const bucket = out.get(r.artistId);
    if (!bucket) continue;
    if (r.platform === "spotify" && Number(r.rn) === 1) {
      bucket.spotifyFollowers = num(r.metrics?.followers);
      bucket.spotifyPopularity = num(r.metrics?.popularity);
    }
    if (r.platform === "resident_advisor") {
      if (Number(r.rn) === 1) {
        bucket.raFollowers = num(r.metrics?.followers);
      } else if (Number(r.rn) === 2) {
        raSecond.set(r.artistId, num(r.metrics?.followers) ?? 0);
      }
    }
  }
  for (const [id, prev] of raSecond) {
    const bucket = out.get(id);
    if (bucket) bucket.raFollowersPrev = prev;
  }
  return out;
}

export async function recomputeScoresBulk(
  artistIds: string[],
  options?: { persistSnapshotMinDelta?: number },
): Promise<{ scored: number; errors: string[] }> {
  const errors: string[] = [];
  if (!hasDatabase() || artistIds.length === 0) {
    return { scored: 0, errors };
  }
  const settings = await loadRadarSettings();
  const db = getDb();
  const now = Date.now();
  const d90 = 90 * 24 * 60 * 60 * 1000;
  const recentFrom = new Date(now - d90);
  const recentTo = new Date(now + 14 * 24 * 60 * 60 * 1000);
  const prevFrom = new Date(now - 2 * d90);
  const prevTo = new Date(now - d90);
  const minDelta = options?.persistSnapshotMinDelta ?? 2;

  const artists = await db
    .select({
      id: radarArtists.id,
      discoveryHops: radarArtists.discoveryHops,
      hasAgency: radarArtists.hasAgency,
      residentCountry: radarArtists.residentCountry,
      growthScore: radarArtists.growthScore,
      raFollowerCount: radarArtists.raFollowerCount,
      nlAudienceScore: radarArtists.nlAudienceScore,
      nlGigShare: radarArtists.nlGigShare,
    })
    .from(radarArtists)
    .where(inArray(radarArtists.id, artistIds));

  const [gigMap, homeCounts, sharedHits, metrics] = await Promise.all([
    loadGigAggregates(artistIds, recentFrom, recentTo, prevFrom, prevTo),
    loadHomeGigCounts(artistIds),
    loadSharedHomeVenueHits(artistIds),
    loadLatestMetrics(artistIds),
  ]);

  let scored = 0;
  const snapshotRows: Array<typeof radarScoreSnapshots.$inferInsert> = [];

  for (let i = 0; i < artists.length; i += 100) {
    const chunk = artists.slice(i, i + 100);
    await withRetry(async () => {
      for (const artist of chunk) {
        const windows = gigMap.get(artist.id) ?? {
          recent: emptyStats(),
          previous: emptyStats(),
        };
        const m = metrics.get(artist.id);
        const homeGigCount = homeCounts.get(artist.id) ?? 0;
        const result = computeScoreV2({
          recent: windows.recent,
          previous: windows.previous,
          discoveryHops: artist.discoveryHops,
          spotifyFollowers: m?.spotifyFollowers ?? null,
          spotifyPopularity: m?.spotifyPopularity ?? null,
          unknownCeilings: settings.unknownCeilings,
          raFollowers: m?.raFollowers ?? artist.raFollowerCount,
          raFollowersPrev: m?.raFollowersPrev ?? null,
          hasAgency: artist.hasAgency,
          residentCountry: artist.residentCountry,
          homeGigCount,
          sharedHomeVenueHits: sharedHits.get(artist.id) ?? 0,
          nlAudienceScore: num(artist.nlAudienceScore),
          nlGigShare: num(artist.nlGigShare),
        });

        const prevScore = num(artist.growthScore);
        if (
          prevScore == null ||
          Math.abs(prevScore - result.total) > minDelta
        ) {
          snapshotRows.push({
            artistId: artist.id,
            momentum: String(result.momentum),
            fit: String(result.fit),
            bookability: String(result.bookability),
            total: String(result.total),
            reasons: result.reasons,
            breakdown: result.breakdown,
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
            homeGigCount,
            updatedAt: new Date(),
          })
          .where(eq(radarArtists.id, artist.id));
        scored += 1;
      }
    });
  }

  if (snapshotRows.length > 0) {
    for (let i = 0; i < snapshotRows.length; i += 100) {
      await db
        .insert(radarScoreSnapshots)
        .values(snapshotRows.slice(i, i + 100));
    }
  }

  return { scored, errors };
}

export async function recomputeArtistScoreV2(
  artistId: string,
  options?: { persistSnapshot?: boolean },
): Promise<ScoreV2Result | null> {
  const bulk = await recomputeScoresBulk([artistId], {
    persistSnapshotMinDelta: options?.persistSnapshot === false ? 999 : 0,
  });
  if (bulk.scored === 0) return null;
  if (!hasDatabase()) return null;
  const db = getDb();
  const [artist] = await db
    .select()
    .from(radarArtists)
    .where(eq(radarArtists.id, artistId))
    .limit(1);
  if (!artist) return null;
  return {
    total: num(artist.growthScore) ?? 0,
    momentum: num(artist.momentumScore) ?? 0,
    fit: num(artist.fitScore) ?? 0,
    bookability: num(artist.bookabilityScore) ?? 0,
    velocity: num(artist.growthVelocity) ?? 0,
    reasons: (artist.scoreReasons as string[] | null) ?? [],
    breakdown: (artist.growthBreakdown as Record<string, unknown>) ?? {},
  };
}

/** Pick artists that need a (re)score and run bulk. */
export async function rescoreStaleArtists(options?: {
  limit?: number;
  maxAgeHours?: number;
}): Promise<{ scored: number; candidateCount: number; errors: string[] }> {
  if (!hasDatabase()) {
    return { scored: 0, candidateCount: 0, errors: ["DATABASE_URL ontbreekt"] };
  }
  const db = getDb();
  const limit = Math.min(options?.limit ?? 1500, 5000);
  const maxAgeHours = options?.maxAgeHours ?? 24;
  const staleBefore = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const rows = await db
    .select({ id: radarArtists.id })
    .from(radarArtists)
    .where(
      or(
        isNull(radarArtists.growthScoreAt),
        lt(radarArtists.growthScoreAt, staleBefore),
      ),
    )
    .orderBy(
      sql`${radarArtists.growthScoreAt} asc nulls first`,
      desc(radarArtists.firstSeenAt),
    )
    .limit(limit);

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return { scored: 0, candidateCount: 0, errors: [] };
  }
  const result = await recomputeScoresBulk(ids);
  return {
    scored: result.scored,
    candidateCount: ids.length,
    errors: result.errors,
  };
}
