import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarGigs, radarVenues } from "@/lib/radar/schema";

export type RadarGigRow = typeof radarGigs.$inferSelect;

export type UpsertGigInput = {
  artistId: string;
  venueId?: string | null;
  eventName?: string | null;
  startsAt?: Date | null;
  city?: string | null;
  country?: string | null;
  source?: string;
  sourceUrl?: string | null;
  externalEventId: string;
  billingIndex?: number | null;
  isHeadliner?: boolean;
  attending?: number | null;
};

export async function upsertRadarGig(
  input: UpsertGigInput,
): Promise<{ ok: true; gig: RadarGigRow } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  if (!input.externalEventId.trim()) {
    return { error: "externalEventId is verplicht" };
  }
  const db = getDb();
  const [gig] = await db
    .insert(radarGigs)
    .values({
      artistId: input.artistId,
      venueId: input.venueId ?? null,
      eventName: input.eventName ?? null,
      startsAt: input.startsAt ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      source: input.source ?? "resident_advisor",
      sourceUrl: input.sourceUrl ?? null,
      externalEventId: input.externalEventId.trim(),
      billingIndex: input.billingIndex ?? null,
      isHeadliner: input.isHeadliner ?? false,
      attending: input.attending ?? null,
    })
    .onConflictDoUpdate({
      target: [radarGigs.artistId, radarGigs.externalEventId],
      set: {
        venueId: input.venueId ?? null,
        eventName: input.eventName ?? null,
        startsAt: input.startsAt ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        sourceUrl: input.sourceUrl ?? null,
        billingIndex: input.billingIndex ?? null,
        isHeadliner: input.isHeadliner ?? false,
        attending: input.attending ?? null,
      },
    })
    .returning();
  if (!gig) return { error: "Gig opslaan mislukt" };
  return { ok: true, gig };
}

export async function listArtistGigs(
  artistId: string,
  limit = 40,
): Promise<RadarGigRow[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  return db
    .select()
    .from(radarGigs)
    .where(eq(radarGigs.artistId, artistId))
    .orderBy(desc(radarGigs.startsAt))
    .limit(limit);
}

export type GigWindowStats = {
  count: number;
  avgAttending: number | null;
  avgBillingIndex: number | null;
  headlinerCount: number;
  earlyVenueCount: number;
  distinctCountries: number;
  topVenueNames: string[];
};

export async function gigStatsForWindow(
  artistId: string,
  from: Date,
  to: Date,
): Promise<GigWindowStats> {
  if (!hasDatabase()) {
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
  const db = getDb();
  const rows = await db
    .select({
      attending: radarGigs.attending,
      billingIndex: radarGigs.billingIndex,
      isHeadliner: radarGigs.isHeadliner,
      country: radarGigs.country,
      venueTier: radarVenues.tier,
      venueName: radarVenues.name,
      curatorScore: radarVenues.curatorScore,
    })
    .from(radarGigs)
    .leftJoin(radarVenues, eq(radarGigs.venueId, radarVenues.id))
    .where(
      and(
        eq(radarGigs.artistId, artistId),
        gte(radarGigs.startsAt, from),
        lt(radarGigs.startsAt, to),
      ),
    );

  if (rows.length === 0) {
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

  let attSum = 0;
  let attN = 0;
  let billSum = 0;
  let billN = 0;
  let headlinerCount = 0;
  let earlyVenueCount = 0;
  const countries = new Set<string>();
  const venueHits = new Map<string, number>();

  for (const row of rows) {
    if (row.attending != null) {
      attSum += row.attending;
      attN += 1;
    }
    if (row.billingIndex != null) {
      billSum += row.billingIndex;
      billN += 1;
    }
    if (row.isHeadliner) headlinerCount += 1;
    if (row.venueTier === "early") earlyVenueCount += 1;
    if (row.country) countries.add(row.country);
    if (row.venueName) {
      venueHits.set(row.venueName, (venueHits.get(row.venueName) ?? 0) + 1);
    }
  }

  const topVenueNames = [...venueHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return {
    count: rows.length,
    avgAttending: attN ? attSum / attN : null,
    avgBillingIndex: billN ? billSum / billN : null,
    headlinerCount,
    earlyVenueCount,
    distinctCountries: countries.size,
    topVenueNames,
  };
}

export async function countGigsByArtist(): Promise<Map<string, number>> {
  if (!hasDatabase()) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      artistId: radarGigs.artistId,
      n: sql<number>`count(*)::int`,
    })
    .from(radarGigs)
    .groupBy(radarGigs.artistId);
  return new Map(rows.map((r) => [r.artistId, r.n]));
}
