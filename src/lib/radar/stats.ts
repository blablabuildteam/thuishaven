import { getDb, hasDatabase } from "@/lib/db/client";
import { sql } from "drizzle-orm";

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

/** One round-trip instead of five count queries. */
export async function loadRadarOverviewStats(): Promise<RadarOverviewStats> {
  if (!hasDatabase()) return EMPTY;
  const db = getDb();
  const [row] = await db.execute<{
    artists: number;
    shortlist: number;
    venues_seed: number;
    venues_suggested: number;
    unread_alerts: number;
  }>(sql`
    select
      (select count(*)::int from radar_artists) as artists,
      (select count(*)::int from radar_artists where status = 'shortlist') as shortlist,
      (select count(*)::int from radar_venues where status in ('seed', 'accepted')) as venues_seed,
      (select count(*)::int from radar_venues where status = 'suggested') as venues_suggested,
      (select count(*)::int from radar_alerts where read_at is null) as unread_alerts
  `);

  return {
    artists: Number(row?.artists ?? 0),
    shortlist: Number(row?.shortlist ?? 0),
    venuesSeed: Number(row?.venues_seed ?? 0),
    venuesSuggested: Number(row?.venues_suggested ?? 0),
    unreadAlerts: Number(row?.unread_alerts ?? 0),
  };
}

export async function radarHasAnyData(): Promise<boolean> {
  if (!hasDatabase()) return false;
  const db = getDb();
  const [row] = await db.execute<{ ok: number }>(sql`
    select 1::int as ok
    where exists (select 1 from radar_artists limit 1)
       or exists (select 1 from radar_venues limit 1)
  `);
  return Boolean(row?.ok);
}
