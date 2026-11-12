/**
 * NL-audience proxy: share of recent gigs in NL + resident country + RA regions.
 * Not YouTube geo (unavailable for others' videos) — booking geography.
 *
 * score = nlGigShare × 70 + (resident NL ? 20 : 0) + NL-share of RA regions × 10, capped 100.
 */
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";

export type NlAudienceResult = {
  updated: number;
  errors: string[];
};

const NL_COUNTRY = `('nl', 'netherlands', 'nederland', 'the netherlands')`;
const NL_REGION_RE =
  "nederland|netherlands|amsterdam|rotterdam|utrecht|eindhoven|den haag|the hague|groningen|tilburg|nijmegen|arnhem";

export async function refreshNlAudienceScores(): Promise<NlAudienceResult> {
  const result: NlAudienceResult = { updated: 0, errors: [] };
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }
  try {
    const rows = await getDb().execute(sql`
      with gigs as (
        select artist_id,
               count(*)::numeric as total,
               count(*) filter (
                 where lower(coalesce(country, '')) in ${sql.raw(NL_COUNTRY)}
               )::numeric as nl
        from radar_gigs
        where starts_at >= now() - interval '180 days'
        group by artist_id
      ),
      calc as (
        select a.id,
               case when g.total > 0 then g.nl / g.total else 0 end as share,
               case when lower(coalesce(a.resident_country, '')) in ${sql.raw(NL_COUNTRY)}
                    then 20 else 0 end as resident_pts,
               case when jsonb_typeof(a.regions_most_played) = 'array'
                     and jsonb_array_length(a.regions_most_played) > 0
                    then least(10, 10.0 * (
                      select count(*) from jsonb_array_elements(a.regions_most_played) r
                      where r->>'name' ~* ${NL_REGION_RE}
                         or lower(coalesce(r->>'country', '')) in ${sql.raw(NL_COUNTRY)}
                    ) / jsonb_array_length(a.regions_most_played))
                    else 0 end as region_pts
        from radar_artists a
        left join gigs g on g.artist_id = a.id
        where a.status not in ('passed', 'not_relevant')
      )
      update radar_artists a
      set nl_gig_share = round(c.share, 3),
          nl_audience_score = round(least(100, c.share * 70 + c.resident_pts + c.region_pts), 1)
      from calc c
      where a.id = c.id
        and (a.nl_audience_score is distinct from round(least(100, c.share * 70 + c.resident_pts + c.region_pts), 1)
          or a.nl_gig_share is distinct from round(c.share, 3))
      returning a.id
    `);
    result.updated = Array.isArray(rows) ? rows.length : (rows as { rowCount?: number }).rowCount ?? 0;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "nl score failed");
  }
  return result;
}
