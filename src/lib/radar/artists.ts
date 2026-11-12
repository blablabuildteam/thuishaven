import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  RADAR_BADGES,
  RADAR_PRESETS,
  badgePredicate,
  type RadarPresetId,
  type RadarBadgeFilter,
  type RadarBadgeId,
  type RadarThuishavenFilter,
} from "@/lib/radar/badges";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  radarArtistProfiles,
  radarArtists,
  radarGigs,
  radarMetricSnapshots,
  radarMixseriesAppearances,
} from "@/lib/radar/schema";
import { normalizeArtistName, type RadarArtistStatus } from "@/lib/radar/types";

export type RadarArtistRow = typeof radarArtists.$inferSelect;
export type RadarArtistProfile = typeof radarArtistProfiles.$inferSelect;

export type RadarArtistListItem = Pick<
  RadarArtistRow,
  | "id"
  | "name"
  | "status"
  | "primaryGenre"
  | "growthScore"
  | "growthVelocity"
  | "momentumScore"
  | "fitScore"
  | "bookabilityScore"
  | "scoreReasons"
  | "discoverySource"
  | "imageUrl"
  | "country"
  | "residentCountry"
  | "raFollowerCount"
  | "homeGigCount"
  | "hasAgency"
  | "nlAudienceScore"
  | "firstSeenAt"
> & {
  badges: RadarBadgeId[];
  lastHomeGigAt: string | null;
  nextHomeGigAt: string | null;
  topMixseriesViews: number | null;
};

export type RadarArtistListSort =
  | "score"
  | "momentum"
  | "fit"
  | "bookability"
  | "nl"
  | "ra_followers"
  | "newest"
  | "name";

const HOME_GIG_SQL = sql`
  select g.starts_at from radar_gigs g
  join radar_venues v on v.id = g.venue_id
  where g.artist_id = ${radarArtists.id} and v.ra_external_id = '109027'`;

export async function listRadarArtists(options?: {
  q?: string;
  status?: RadarArtistStatus | "all";
  genre?: string;
  country?: string;
  /** Default true: only artists never booked at Thuishaven. */
  nieuw?: boolean;
  /** Overrides `nieuw` when set. */
  th?: RadarThuishavenFilter;
  /** AND-filter on badges (include) and NOT-filter (exclude). */
  badges?: RadarBadgeFilter;
  sort?: RadarArtistListSort;
  limit?: number;
  offset?: number;
  /** Skip expensive count(*) when the UI already has an overview total. */
  includeTotal?: boolean;
  /** Count per badge within the base filter (q/status/th), for chips. */
  includeBadgeCounts?: boolean;
}): Promise<{
  rows: RadarArtistListItem[];
  total: number;
  badgeCounts?: Record<RadarBadgeId, number>;
  presetCounts?: Record<RadarPresetId, number>;
  thCounts?: Record<RadarThuishavenFilter, number>;
}> {
  if (!hasDatabase()) return { rows: [], total: 0 };
  const db = getDb();
  const limit = Math.min(options?.limit ?? 50, 120);
  const offset = options?.offset ?? 0;
  const th: RadarThuishavenFilter =
    options?.th ?? (options?.nieuw === false ? "alle" : "nieuw");
  const baseFilters: SQL[] = [];
  const filters: SQL[] = [];
  if (options?.q?.trim()) {
    const q = `%${options.q.trim().toLowerCase()}%`;
    baseFilters.push(
      or(
        sql`lower(${radarArtists.name}) like ${q}`,
        sql`${radarArtists.normalizedName} like ${q}`,
      )!,
    );
  }
  if (options?.status && options.status !== "all") {
    baseFilters.push(eq(radarArtists.status, options.status));
  }
  if (options?.genre?.trim()) {
    baseFilters.push(eq(radarArtists.primaryGenre, options.genre.trim()));
  }
  if (options?.country?.trim()) {
    const c = options.country.trim();
    baseFilters.push(
      or(
        eq(radarArtists.residentCountry, c),
        eq(radarArtists.country, c),
      )!,
    );
  }
  const thFilter =
    th === "nieuw"
      ? eq(radarArtists.homeGigCount, 0)
      : th === "gespeeld"
        ? sql`${radarArtists.homeGigCount} > 0`
        : null;
  if (thFilter) filters.push(thFilter);
  for (const b of options?.badges?.include ?? []) {
    filters.push(badgePredicate(b));
  }
  for (const b of options?.badges?.exclude ?? []) {
    filters.push(sql`not (${badgePredicate(b)})`);
  }

  const baseWhere = baseFilters.length ? and(...baseFilters) : undefined;
  const chipWhere = and(...baseFilters, ...(thFilter ? [thFilter] : []));
  const where = and(...baseFilters, ...filters);
  const needsCount = options?.includeTotal !== false;

  const desc2 = (col: AnyPgColumn) => [
    sql`${col} desc nulls last`,
    asc(radarArtists.name),
  ];
  const orderBy =
    options?.sort === "name"
      ? [asc(radarArtists.name)]
      : options?.sort === "newest"
        ? [desc(radarArtists.firstSeenAt), asc(radarArtists.name)]
        : options?.sort === "momentum"
          ? desc2(radarArtists.momentumScore)
          : options?.sort === "fit"
            ? desc2(radarArtists.fitScore)
            : options?.sort === "bookability"
              ? desc2(radarArtists.bookabilityScore)
              : options?.sort === "nl"
                ? desc2(radarArtists.nlAudienceScore)
                : options?.sort === "ra_followers"
                  ? desc2(radarArtists.raFollowerCount)
                  : desc2(radarArtists.growthScore);

  const badgeSelect = Object.fromEntries(
    RADAR_BADGES.map((b) => [
      `b_${b.id}`,
      sql<boolean>`(${badgePredicate(b.id)})`,
    ]),
  ) as Record<`b_${RadarBadgeId}`, SQL<boolean>>;

  const listQuery = db
    .select({
      id: radarArtists.id,
      name: radarArtists.name,
      status: radarArtists.status,
      primaryGenre: radarArtists.primaryGenre,
      growthScore: radarArtists.growthScore,
      growthVelocity: radarArtists.growthVelocity,
      momentumScore: radarArtists.momentumScore,
      fitScore: radarArtists.fitScore,
      bookabilityScore: radarArtists.bookabilityScore,
      scoreReasons: radarArtists.scoreReasons,
      discoverySource: radarArtists.discoverySource,
      imageUrl: radarArtists.imageUrl,
      country: radarArtists.country,
      residentCountry: radarArtists.residentCountry,
      raFollowerCount: radarArtists.raFollowerCount,
      homeGigCount: radarArtists.homeGigCount,
      hasAgency: radarArtists.hasAgency,
      nlAudienceScore: radarArtists.nlAudienceScore,
      firstSeenAt: radarArtists.firstSeenAt,
      lastHomeGigAt: sql<string | null>`(
        select max(x.starts_at)::text from (${HOME_GIG_SQL} and g.starts_at < now()) x
      )`,
      nextHomeGigAt: sql<string | null>`(
        select min(x.starts_at)::text from (${HOME_GIG_SQL} and g.starts_at >= now()) x
      )`,
      topMixseriesViews: sql<number | null>`(
        select max(m.view_count) from radar_mixseries_appearances m
        where m.artist_id = ${radarArtists.id}
      )`,
      ...badgeSelect,
    })
    .from(radarArtists)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const filterSql = (f: RadarBadgeFilter) =>
    sql.join(
      [
        ...f.include.map((b) => badgePredicate(b)),
        ...f.exclude.map((b) => sql`not (${badgePredicate(b)})`),
      ],
      sql` and `,
    );

  const badgeCountsQuery = options?.includeBadgeCounts
    ? db
        .select({
          ...(Object.fromEntries(
            RADAR_BADGES.map((b) => [
              b.id,
              sql<number>`count(*) filter (where ${badgePredicate(b.id)})::int`,
            ]),
          ) as Record<RadarBadgeId, SQL<number>>),
          ...(Object.fromEntries(
            RADAR_PRESETS.map((p) => [
              `p_${p.id}`,
              sql<number>`count(*) filter (where ${filterSql(p.filter)})::int`,
            ]),
          ) as Record<`p_${RadarPresetId}`, SQL<number>>),
        })
        .from(radarArtists)
        .where(chipWhere)
    : null;

  const thCountsQuery = options?.includeBadgeCounts
    ? db
        .select({
          alle: sql<number>`count(*)::int`,
          nieuw: sql<number>`count(*) filter (where ${radarArtists.homeGigCount} = 0)::int`,
          gespeeld: sql<number>`count(*) filter (where ${radarArtists.homeGigCount} > 0)::int`,
        })
        .from(radarArtists)
        .where(baseWhere)
    : null;

  const [raw, countRows, badgeRows, thRows] = await Promise.all([
    listQuery,
    needsCount
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(radarArtists)
          .where(where)
      : Promise.resolve(null),
    badgeCountsQuery ?? Promise.resolve(null),
    thCountsQuery ?? Promise.resolve(null),
  ]);

  const rows: RadarArtistListItem[] = raw.map((r) => {
    const badges = RADAR_BADGES.filter(
      (b) => (r as Record<string, unknown>)[`b_${b.id}`] === true,
    ).map((b) => b.id);
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      primaryGenre: r.primaryGenre,
      growthScore: r.growthScore,
      growthVelocity: r.growthVelocity,
      momentumScore: r.momentumScore,
      fitScore: r.fitScore,
      bookabilityScore: r.bookabilityScore,
      scoreReasons: r.scoreReasons,
      discoverySource: r.discoverySource,
      imageUrl: r.imageUrl,
      country: r.country,
      residentCountry: r.residentCountry,
      raFollowerCount: r.raFollowerCount,
      homeGigCount: r.homeGigCount,
      hasAgency: r.hasAgency,
      nlAudienceScore: r.nlAudienceScore,
      firstSeenAt: r.firstSeenAt,
      lastHomeGigAt: r.lastHomeGigAt,
      nextHomeGigAt: r.nextHomeGigAt,
      topMixseriesViews:
        r.topMixseriesViews != null ? Number(r.topMixseriesViews) : null,
      badges,
    };
  });

  const counts = badgeRows?.[0] as Record<string, number> | undefined;
  return {
    rows,
    total: countRows?.[0]?.n ?? rows.length,
    badgeCounts: counts
      ? (Object.fromEntries(
          RADAR_BADGES.map((b) => [b.id, counts[b.id] ?? 0]),
        ) as Record<RadarBadgeId, number>)
      : undefined,
    presetCounts: counts
      ? (Object.fromEntries(
          RADAR_PRESETS.map((p) => [p.id, counts[`p_${p.id}`] ?? 0]),
        ) as Record<RadarPresetId, number>)
      : undefined,
    thCounts: thRows?.[0] as Record<RadarThuishavenFilter, number> | undefined,
  };
}

export async function getRadarArtistBadges(id: string): Promise<RadarBadgeId[]> {
  if (!hasDatabase()) return [];
  const select = Object.fromEntries(
    RADAR_BADGES.map((b) => [b.id, sql<boolean>`(${badgePredicate(b.id)})`]),
  ) as Record<RadarBadgeId, SQL<boolean>>;
  const [row] = await getDb()
    .select(select)
    .from(radarArtists)
    .where(eq(radarArtists.id, id))
    .limit(1);
  if (!row) return [];
  return RADAR_BADGES.filter((b) => row[b.id] === true).map((b) => b.id);
}

export async function getRadarArtist(id: string): Promise<{
  artist: RadarArtistRow;
  profiles: RadarArtistProfile[];
  recentMetrics: Array<typeof radarMetricSnapshots.$inferSelect>;
  recentGigs: Array<typeof radarGigs.$inferSelect>;
  mixseries: Array<typeof radarMixseriesAppearances.$inferSelect>;
} | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const [artist] = await db
    .select()
    .from(radarArtists)
    .where(eq(radarArtists.id, id))
    .limit(1);
  if (!artist) return null;
  const [profiles, recentMetrics, recentGigs, mixseries] = await Promise.all([
    db
      .select()
      .from(radarArtistProfiles)
      .where(eq(radarArtistProfiles.artistId, id)),
    db
      .select()
      .from(radarMetricSnapshots)
      .where(eq(radarMetricSnapshots.artistId, id))
      .orderBy(desc(radarMetricSnapshots.capturedAt))
      .limit(40),
    db
      .select()
      .from(radarGigs)
      .where(eq(radarGigs.artistId, id))
      .orderBy(desc(radarGigs.startsAt))
      .limit(30),
    db
      .select()
      .from(radarMixseriesAppearances)
      .where(eq(radarMixseriesAppearances.artistId, id))
      .orderBy(desc(radarMixseriesAppearances.publishedAt))
      .limit(12),
  ]);
  return { artist, profiles, recentMetrics, recentGigs, mixseries };
}

export async function upsertRadarArtist(input: {
  name: string;
  discoverySource?:
    | "seed"
    | "lineup"
    | "snowball"
    | "label"
    | "manual"
    | "spotify"
    | "support";
  discoveryHops?: number;
  discoveredViaVenueId?: string | null;
  primaryGenre?: string | null;
  secondaryGenres?: string[];
  country?: string | null;
  city?: string | null;
  imageUrl?: string | null;
}): Promise<{ ok: true; artist: RadarArtistRow; created: boolean } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const name = input.name.trim();
  if (!name) return { error: "Naam is verplicht" };
  const normalizedName = normalizeArtistName(name);
  if (!normalizedName) return { error: "Ongeldige naam" };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(radarArtists)
    .where(eq(radarArtists.normalizedName, normalizedName))
    .limit(1);
  if (existing) {
    return { ok: true, artist: existing, created: false };
  }

  try {
    const [artist] = await db
      .insert(radarArtists)
      .values({
        name,
        normalizedName,
        discoverySource: input.discoverySource ?? "manual",
        discoveryHops: input.discoveryHops ?? 0,
        discoveredViaVenueId: input.discoveredViaVenueId ?? null,
        primaryGenre: input.primaryGenre ?? null,
        secondaryGenres: input.secondaryGenres ?? [],
        country: input.country ?? null,
        city: input.city ?? null,
        imageUrl: input.imageUrl ?? null,
        updatedAt: new Date(),
      })
      .returning();
    if (!artist) return { error: "Opslaan mislukt" };
    return { ok: true, artist, created: true };
  } catch (e) {
    const [again] = await db
      .select()
      .from(radarArtists)
      .where(eq(radarArtists.normalizedName, normalizedName))
      .limit(1);
    if (again) return { ok: true, artist: again, created: false };
    return {
      error: e instanceof Error ? e.message : "Opslaan mislukt",
    };
  }
}

export async function setRadarArtistStatus(
  id: string,
  status: RadarArtistStatus,
  userId?: string | null,
): Promise<{ ok: true; artist: RadarArtistRow } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [artist] = await db
    .update(radarArtists)
    .set({
      status,
      statusChangedAt: new Date(),
      statusChangedByUserId: userId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(radarArtists.id, id))
    .returning();
  if (!artist) return { error: "Artiest niet gevonden" };
  return { ok: true, artist };
}

export async function updateRadarArtist(
  id: string,
  patch: {
    notes?: string | null;
    primaryGenre?: string | null;
    secondaryGenres?: string[];
    genreManual?: boolean;
  },
): Promise<{ ok: true; artist: RadarArtistRow } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const values: Partial<typeof radarArtists.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.notes !== undefined) values.notes = patch.notes?.trim() || null;
  if (patch.primaryGenre !== undefined) {
    values.primaryGenre = patch.primaryGenre?.trim() || null;
  }
  if (patch.secondaryGenres !== undefined) {
    values.secondaryGenres = patch.secondaryGenres;
  }
  if (patch.genreManual !== undefined) values.genreManual = patch.genreManual;

  const [artist] = await db
    .update(radarArtists)
    .set(values)
    .where(eq(radarArtists.id, id))
    .returning();
  if (!artist) return { error: "Artiest niet gevonden" };
  return { ok: true, artist };
}

export async function upsertArtistProfile(input: {
  artistId: string;
  platform:
    | "spotify"
    | "instagram"
    | "tiktok"
    | "soundcloud"
    | "resident_advisor"
    | "youtube";
  externalId?: string | null;
  url?: string | null;
  handle?: string | null;
  matchConfidence?: "high" | "medium" | "low" | "unmatched";
  raw?: Record<string, unknown> | null;
}): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  await db
    .insert(radarArtistProfiles)
    .values({
      artistId: input.artistId,
      platform: input.platform,
      externalId: input.externalId ?? null,
      url: input.url ?? null,
      handle: input.handle ?? null,
      matchConfidence: input.matchConfidence ?? "medium",
      raw: input.raw ?? null,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [radarArtistProfiles.artistId, radarArtistProfiles.platform],
      set: {
        externalId: input.externalId ?? null,
        url: input.url ?? null,
        handle: input.handle ?? null,
        matchConfidence: input.matchConfidence ?? "medium",
        raw: input.raw ?? null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function insertMetricSnapshot(input: {
  artistId: string;
  platform:
    | "spotify"
    | "instagram"
    | "tiktok"
    | "soundcloud"
    | "resident_advisor"
    | "youtube";
  metrics: Record<string, number | string | null>;
}): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  await db.insert(radarMetricSnapshots).values({
    artistId: input.artistId,
    platform: input.platform,
    metrics: input.metrics,
    capturedAt: new Date(),
  });
}

export async function listArtistIdsForSync(limit = 200): Promise<string[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select({ id: radarArtists.id })
    .from(radarArtists)
    .where(
      sql`${radarArtists.status} not in ('passed', 'not_relevant', 'booked')`,
    )
    .orderBy(desc(radarArtists.growthScore), asc(radarArtists.name))
    .limit(limit);
  return rows.map((r) => r.id);
}
