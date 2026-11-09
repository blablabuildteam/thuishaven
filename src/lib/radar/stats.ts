import { count, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarAlerts, radarArtists, radarVenues } from "@/lib/radar/schema";

export type RadarOverviewStats = {
  artists: number;
  shortlist: number;
  venuesSeed: number;
  venuesSuggested: number;
  unreadAlerts: number;
};

const EMPTY: RadarOverviewStats = {
  artists: 0,
  shortlist: 0,
  venuesSeed: 0,
  venuesSuggested: 0,
  unreadAlerts: 0,
};

export async function loadRadarOverviewStats(): Promise<RadarOverviewStats> {
  if (!hasDatabase()) return EMPTY;
  const db = getDb();
  const [
    [artists],
    [shortlist],
    [venuesSeed],
    [venuesSuggested],
    [unreadAlerts],
  ] = await Promise.all([
    db.select({ n: count() }).from(radarArtists),
    db
      .select({ n: count() })
      .from(radarArtists)
      .where(eq(radarArtists.status, "shortlist")),
    db
      .select({ n: count() })
      .from(radarVenues)
      .where(inArray(radarVenues.status, ["seed", "accepted"])),
    db
      .select({ n: count() })
      .from(radarVenues)
      .where(eq(radarVenues.status, "suggested")),
    db
      .select({ n: count() })
      .from(radarAlerts)
      .where(isNull(radarAlerts.readAt)),
  ]);

  return {
    artists: artists?.n ?? 0,
    shortlist: shortlist?.n ?? 0,
    venuesSeed: venuesSeed?.n ?? 0,
    venuesSuggested: venuesSuggested?.n ?? 0,
    unreadAlerts: unreadAlerts?.n ?? 0,
  };
}

export async function radarHasAnyData(): Promise<boolean> {
  if (!hasDatabase()) return false;
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(radarArtists)
    .limit(1);
  if (row) return true;
  const [venue] = await db
    .select({ n: sql<number>`1` })
    .from(radarVenues)
    .limit(1);
  return Boolean(venue);
}
