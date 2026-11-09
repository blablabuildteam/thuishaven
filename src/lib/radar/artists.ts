import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  radarArtistProfiles,
  radarArtists,
  radarMetricSnapshots,
} from "@/lib/radar/schema";
import { normalizeArtistName, type RadarArtistStatus } from "@/lib/radar/types";

export type RadarArtistRow = typeof radarArtists.$inferSelect;
export type RadarArtistProfile = typeof radarArtistProfiles.$inferSelect;

export async function listRadarArtists(options?: {
  q?: string;
  status?: RadarArtistStatus | "all";
  genre?: string;
  sort?: "score" | "name" | "newest";
  limit?: number;
  offset?: number;
}): Promise<{ rows: RadarArtistRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 };
  const db = getDb();
  const limit = Math.min(options?.limit ?? 80, 200);
  const offset = options?.offset ?? 0;
  const filters = [];
  if (options?.q?.trim()) {
    const q = `%${options.q.trim()}%`;
    filters.push(
      or(ilike(radarArtists.name, q), ilike(radarArtists.normalizedName, q)),
    );
  }
  if (options?.status && options.status !== "all") {
    filters.push(eq(radarArtists.status, options.status));
  }
  if (options?.genre?.trim()) {
    filters.push(eq(radarArtists.primaryGenre, options.genre.trim()));
  }
  const where = filters.length ? and(...filters) : undefined;

  const order =
    options?.sort === "name"
      ? asc(radarArtists.name)
      : options?.sort === "newest"
        ? desc(radarArtists.firstSeenAt)
        : desc(radarArtists.growthScore);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(radarArtists)
    .where(where);
  const rows = await db
    .select()
    .from(radarArtists)
    .where(where)
    .orderBy(order, asc(radarArtists.name))
    .limit(limit)
    .offset(offset);
  return { rows, total: countRow?.n ?? 0 };
}

export async function getRadarArtist(id: string): Promise<{
  artist: RadarArtistRow;
  profiles: RadarArtistProfile[];
  recentMetrics: Array<typeof radarMetricSnapshots.$inferSelect>;
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
  return { artist, profiles, recentMetrics };
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
