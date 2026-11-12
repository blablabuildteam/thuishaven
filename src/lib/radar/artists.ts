import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  radarArtistProfiles,
  radarArtists,
  radarGigs,
  radarMetricSnapshots,
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
>;

export type RadarArtistListSort =
  | "score"
  | "momentum"
  | "bookability"
  | "ra_followers"
  | "newest"
  | "name";

export async function listRadarArtists(options?: {
  q?: string;
  status?: RadarArtistStatus | "all";
  genre?: string;
  country?: string;
  /** Default true: only artists never booked at Thuishaven. */
  nieuw?: boolean;
  sort?: RadarArtistListSort;
  limit?: number;
  offset?: number;
  /** Skip expensive count(*) when the UI already has an overview total. */
  includeTotal?: boolean;
}): Promise<{ rows: RadarArtistListItem[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 };
  const db = getDb();
  const limit = Math.min(options?.limit ?? 50, 120);
  const offset = options?.offset ?? 0;
  const filters = [];
  if (options?.q?.trim()) {
    const q = `%${options.q.trim().toLowerCase()}%`;
    filters.push(
      or(
        sql`lower(${radarArtists.name}) like ${q}`,
        sql`${radarArtists.normalizedName} like ${q}`,
      ),
    );
  }
  if (options?.status && options.status !== "all") {
    filters.push(eq(radarArtists.status, options.status));
  }
  if (options?.genre?.trim()) {
    filters.push(eq(radarArtists.primaryGenre, options.genre.trim()));
  }
  if (options?.country?.trim()) {
    const c = options.country.trim();
    filters.push(
      or(
        eq(radarArtists.residentCountry, c),
        eq(radarArtists.country, c),
      ),
    );
  }
  if (options?.nieuw !== false) {
    filters.push(eq(radarArtists.homeGigCount, 0));
  }
  const where = filters.length ? and(...filters) : undefined;
  const needsCount = options?.includeTotal !== false;

  const orderBy =
    options?.sort === "name"
      ? [asc(radarArtists.name)]
      : options?.sort === "newest"
        ? [desc(radarArtists.firstSeenAt), asc(radarArtists.name)]
        : options?.sort === "momentum"
          ? [
              sql`${radarArtists.momentumScore} desc nulls last`,
              asc(radarArtists.name),
            ]
          : options?.sort === "bookability"
            ? [
                sql`${radarArtists.bookabilityScore} desc nulls last`,
                asc(radarArtists.name),
              ]
            : options?.sort === "ra_followers"
              ? [
                  sql`${radarArtists.raFollowerCount} desc nulls last`,
                  asc(radarArtists.name),
                ]
              : [
                  sql`${radarArtists.growthScore} desc nulls last`,
                  asc(radarArtists.name),
                ];

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
    })
    .from(radarArtists)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  if (!needsCount) {
    const rows = await listQuery;
    return { rows, total: rows.length };
  }

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(radarArtists)
    .where(where);
  const rows = await listQuery;
  return { rows, total: countRow?.n ?? 0 };
}

export async function getRadarArtist(id: string): Promise<{
  artist: RadarArtistRow;
  profiles: RadarArtistProfile[];
  recentMetrics: Array<typeof radarMetricSnapshots.$inferSelect>;
  recentGigs: Array<typeof radarGigs.$inferSelect>;
} | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const [artist] = await db
    .select()
    .from(radarArtists)
    .where(eq(radarArtists.id, id))
    .limit(1);
  if (!artist) return null;
  const profiles = await db
    .select()
    .from(radarArtistProfiles)
    .where(eq(radarArtistProfiles.artistId, id));
  const recentMetrics = await db
    .select()
    .from(radarMetricSnapshots)
    .where(eq(radarMetricSnapshots.artistId, id))
    .orderBy(desc(radarMetricSnapshots.capturedAt))
    .limit(40);
  const recentGigs = await db
    .select()
    .from(radarGigs)
    .where(eq(radarGigs.artistId, id))
    .orderBy(desc(radarGigs.startsAt))
    .limit(30);
  return { artist, profiles, recentMetrics, recentGigs };
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
    | "resident_advisor";
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
    | "resident_advisor";
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
