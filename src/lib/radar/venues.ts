import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarVenues } from "@/lib/radar/schema";

export type RadarVenueRow = typeof radarVenues.$inferSelect;

export type RadarVenueTier = "early" | "mid" | "major" | "festival" | "series";

export type CreateVenueInput = {
  name: string;
  kind?: "club" | "festival" | "other";
  status?: "seed" | "suggested" | "accepted" | "rejected";
  tier?: RadarVenueTier;
  city?: string | null;
  country?: string | null;
  raUrl?: string | null;
  raExternalId?: string | null;
  websiteUrl?: string | null;
  notes?: string | null;
  curatorScore?: number | null;
  discoveryHops?: number;
};

/** Extract RA club/venue id from ra.co/clubs/123 or plain digits. */
export function parseRaVenueId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/ra\.co\/(?:clubs|venues)\/(\d+)/i);
  return m?.[1] ?? null;
}

export async function listRadarVenues(options?: {
  status?: Array<"seed" | "suggested" | "accepted" | "rejected">;
}): Promise<RadarVenueRow[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const statuses = options?.status;
  if (statuses?.length) {
    return db
      .select()
      .from(radarVenues)
      .where(inArray(radarVenues.status, statuses))
      .orderBy(
        desc(radarVenues.curatorScore),
        desc(radarVenues.venueScore),
        asc(radarVenues.name),
      );
  }
  return db
    .select()
    .from(radarVenues)
    .orderBy(asc(radarVenues.status), asc(radarVenues.name));
}

export async function createRadarVenue(
  input: CreateVenueInput,
): Promise<{ ok: true; venue: RadarVenueRow } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const name = input.name.trim();
  if (!name) return { error: "Naam is verplicht" };

  const status = input.status ?? "seed";
  const raExternalId =
    input.raExternalId?.trim() || parseRaVenueId(input.raUrl) || null;
  const raUrl =
    input.raUrl?.trim() ||
    (raExternalId ? `https://ra.co/clubs/${raExternalId}` : null);
  const curator =
    input.curatorScore != null && Number.isFinite(input.curatorScore)
      ? String(input.curatorScore)
      : null;

  const db = getDb();
  try {
    const [venue] = await db
      .insert(radarVenues)
      .values({
        name,
        kind: input.kind ?? "club",
        status,
        tier: input.tier ?? "mid",
        city: input.city?.trim() || null,
        country: input.country?.trim() || "NL",
        raUrl,
        raExternalId,
        websiteUrl: input.websiteUrl?.trim() || null,
        notes: input.notes?.trim() || null,
        curatorScore: curator,
        venueScore: curator,
        discoveryHops:
          input.discoveryHops ??
          (status === "seed" || status === "accepted" ? 0 : 1),
        acceptedAt:
          status === "accepted" || status === "seed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .returning();
    if (!venue) return { error: "Opslaan mislukt" };
    return { ok: true, venue };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Opslaan mislukt";
    if (/unique|duplicate/i.test(msg)) {
      return { error: "Venue met dit RA-id bestaat al" };
    }
    return { error: msg };
  }
}

export async function updateRadarVenue(
  id: string,
  patch: Partial<CreateVenueInput> & {
    status?: "seed" | "suggested" | "accepted" | "rejected";
  },
): Promise<{ ok: true; venue: RadarVenueRow } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const values: Partial<typeof radarVenues.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.name != null) {
    const name = patch.name.trim();
    if (!name) return { error: "Naam is verplicht" };
    values.name = name;
  }
  if (patch.kind) values.kind = patch.kind;
  if (patch.tier) values.tier = patch.tier;
  if (patch.city !== undefined) values.city = patch.city?.trim() || null;
  if (patch.country !== undefined) values.country = patch.country?.trim() || null;
  if (patch.raUrl !== undefined) {
    values.raUrl = patch.raUrl?.trim() || null;
    const parsed = parseRaVenueId(patch.raUrl);
    if (parsed) values.raExternalId = parsed;
  }
  if (patch.raExternalId !== undefined) {
    values.raExternalId = patch.raExternalId?.trim() || null;
  }
  if (patch.websiteUrl !== undefined) {
    values.websiteUrl = patch.websiteUrl?.trim() || null;
  }
  if (patch.notes !== undefined) values.notes = patch.notes?.trim() || null;
  if (patch.curatorScore !== undefined) {
    values.curatorScore =
      patch.curatorScore == null ? null : String(patch.curatorScore);
    values.venueScore = values.curatorScore;
  }
  if (patch.discoveryHops !== undefined) {
    values.discoveryHops = patch.discoveryHops;
  }
  if (patch.status) {
    values.status = patch.status;
    if (patch.status === "accepted" || patch.status === "seed") {
      values.acceptedAt = new Date();
      values.rejectedAt = null;
    }
    if (patch.status === "rejected") {
      values.rejectedAt = new Date();
    }
  }

  const [venue] = await db
    .update(radarVenues)
    .set(values)
    .where(eq(radarVenues.id, id))
    .returning();
  if (!venue) return { error: "Venue niet gevonden" };
  return { ok: true, venue };
}

export async function deleteRadarVenue(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const deleted = await db
    .delete(radarVenues)
    .where(eq(radarVenues.id, id))
    .returning({ id: radarVenues.id });
  if (!deleted.length) return { error: "Venue niet gevonden" };
  return { ok: true };
}

/** Venues that feed discovery (startlijst + geaccepteerde suggesties). */
export async function listActiveSeedVenues(): Promise<RadarVenueRow[]> {
  return listRadarVenues({ status: ["seed", "accepted"] });
}

export async function countVenuesByStatus(): Promise<Record<string, number>> {
  if (!hasDatabase()) return {};
  const db = getDb();
  const rows = await db
    .select({
      status: radarVenues.status,
      n: sql<number>`count(*)::int`,
    })
    .from(radarVenues)
    .groupBy(radarVenues.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/**
 * Score suggested venues from radar artist overlap, auto-reject noise.
 * venue_score ≈ distinct artists × share with growth_score ≥ 50.
 */
export async function refreshSuggestedVenueScores(): Promise<{
  scored: number;
  rejected: number;
}> {
  if (!hasDatabase()) return { scored: 0, rejected: 0 };
  const db = getDb();
  const rows = await db.execute(sql`
    with stats as (
      select
        g.venue_id,
        count(distinct g.artist_id)::int as artists,
        count(distinct g.artist_id) filter (
          where a.growth_score::float >= 50
        )::float as strong,
        avg(g.attending)::float as avg_attending
      from radar_gigs g
      join radar_artists a on a.id = g.artist_id
      join radar_venues v on v.id = g.venue_id
      where v.status = 'suggested'
        and g.venue_id is not null
      group by g.venue_id
    )
    select
      venue_id as "venueId",
      artists,
      strong,
      avg_attending as "avgAttending",
      round((artists * (case when artists > 0 then strong / artists else 0 end))::numeric, 2) as score
    from stats
  `);

  let scored = 0;
  let rejected = 0;
  for (const raw of rows as unknown as Array<{
    venueId: string;
    artists: number;
    avgAttending: number | null;
    score: string | number;
  }>) {
    const artists = Number(raw.artists) || 0;
    const avgAttending =
      raw.avgAttending == null ? null : Number(raw.avgAttending);
    const score = Number(raw.score) || 0;
    if (artists < 2 || (avgAttending != null && avgAttending > 1500)) {
      await db
        .update(radarVenues)
        .set({
          status: "rejected",
          rejectedAt: new Date(),
          venueScore: String(score),
          updatedAt: new Date(),
        })
        .where(eq(radarVenues.id, raw.venueId));
      rejected += 1;
      continue;
    }
    const tier =
      avgAttending != null && avgAttending < 300 ? "early" : "mid";
    await db
      .update(radarVenues)
      .set({
        venueScore: String(score),
        tier,
        updatedAt: new Date(),
      })
      .where(eq(radarVenues.id, raw.venueId));
    scored += 1;
  }
  return { scored, rejected };
}

/** Upsert seed list by raExternalId (idempotent). */
export async function upsertSeedVenue(
  input: CreateVenueInput & { raExternalId: string },
): Promise<{ ok: true; venue: RadarVenueRow; created: boolean } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const raExternalId = input.raExternalId.trim();
  const [existing] = await db
    .select()
    .from(radarVenues)
    .where(eq(radarVenues.raExternalId, raExternalId))
    .limit(1);
  if (existing) {
    const updated = await updateRadarVenue(existing.id, {
      ...input,
      status: existing.status === "rejected" ? existing.status : input.status ?? "seed",
      raExternalId,
    });
    if ("error" in updated) return updated;
    return { ok: true, venue: updated.venue, created: false };
  }
  const created = await createRadarVenue({
    ...input,
    raExternalId,
    status: input.status ?? "seed",
  });
  if ("error" in created) return created;
  return { ok: true, venue: created.venue, created: true };
}
