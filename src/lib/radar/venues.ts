import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarVenues } from "@/lib/radar/schema";

export type RadarVenueRow = typeof radarVenues.$inferSelect;

export type CreateVenueInput = {
  name: string;
  kind?: "club" | "festival" | "other";
  status?: "seed" | "suggested" | "accepted" | "rejected";
  city?: string | null;
  country?: string | null;
  raUrl?: string | null;
  websiteUrl?: string | null;
  notes?: string | null;
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
      .orderBy(desc(radarVenues.venueScore), asc(radarVenues.name));
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
  const db = getDb();
  const [venue] = await db
    .insert(radarVenues)
    .values({
      name,
      kind: input.kind ?? "club",
      status,
      city: input.city?.trim() || null,
      country: input.country?.trim() || "NL",
      raUrl: input.raUrl?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      discoveryHops: status === "seed" || status === "accepted" ? 0 : 1,
      acceptedAt: status === "accepted" || status === "seed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .returning();
  if (!venue) return { error: "Opslaan mislukt" };
  return { ok: true, venue };
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
  if (patch.city !== undefined) values.city = patch.city?.trim() || null;
  if (patch.country !== undefined) values.country = patch.country?.trim() || null;
  if (patch.raUrl !== undefined) values.raUrl = patch.raUrl?.trim() || null;
  if (patch.websiteUrl !== undefined) {
    values.websiteUrl = patch.websiteUrl?.trim() || null;
  }
  if (patch.notes !== undefined) values.notes = patch.notes?.trim() || null;
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
