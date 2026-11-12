/**
 * Radar badges: SQL predicates per badge. One definition drives the list badges,
 * filter chips and chip counts. Labels/tones live in `badge-defs.ts`.
 */
import { sql, type SQL } from "drizzle-orm";
import type { RadarBadgeId } from "@/lib/radar/badge-defs";
import { radarArtists } from "@/lib/radar/schema";

export * from "@/lib/radar/badge-defs";

/** Initial bulk import landed before this; “nieuw deze week” ignores it. */
const SEED_IMPORT_CUTOFF = "2026-11-10";

const NL_COUNTRY_SQL = sql`lower(coalesce(g.country, '')) in ('nl', 'netherlands', 'nederland', 'the netherlands')`;

export function badgePredicate(id: RadarBadgeId): SQL {
  const a = radarArtists;
  switch (id) {
    case "nieuw7":
      return sql`${a.firstSeenAt} >= now() - interval '7 days' and ${a.firstSeenAt} >= ${SEED_IMPORT_CUTOFF}::date`;
    case "debutant":
      return sql`${a.firstEventAt} >= now() - interval '3 years'`;
    case "hot":
      return sql`coalesce(${a.momentumScore}, 0) >= 45`;
    case "ra_groei":
      return sql`coalesce((${a.growthBreakdown}->>'raGrowth')::numeric, 0) >= 0.5`;
    case "venster":
      return sql`coalesce(${a.momentumScore}, 0) >= 40 and coalesce(${a.bookabilityScore}, 100) < 60`;
    case "groot":
      return sql`coalesce(${a.bookabilityScore}, 100) < 60`;
    case "nl":
      return sql`coalesce(${a.nlAudienceScore}, 0) >= 55`;
    case "nl_gig":
      return sql`(
        case
          when nullif(trim(${a.residentCountry}), '') is not null
            then lower(${a.residentCountry}) not in ('nl', 'netherlands', 'nederland', 'the netherlands')
          else coalesce(${a.nlGigShare}, 0) < 0.5
        end
      ) and exists (
        select 1 from radar_gigs g
        where g.artist_id = ${a.id}
          and g.starts_at >= now() - interval '6 hours'
          and g.starts_at < now() + interval '45 days'
          and ${NL_COUNTRY_SQL}
      )`;
    case "mixseries":
      return sql`exists (select 1 from radar_mixseries_appearances m where m.artist_id = ${a.id})`;
    case "viral":
      return sql`exists (
        select 1 from radar_mixseries_appearances m
        where m.artist_id = ${a.id} and coalesce(m.view_count, 0) >= 50000
      )`;
    case "label":
      return sql`exists (
        select 1 from radar_artist_profiles p
        where p.artist_id = ${a.id}
          and p.platform = 'resident_advisor'
          and jsonb_typeof(p.raw->'labels') = 'array'
          and jsonb_array_length(p.raw->'labels') > 0
      )`;
    case "agency":
      return sql`${a.hasAgency} = true`;
  }
}
