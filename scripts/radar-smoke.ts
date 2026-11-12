import { desc, sql } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { enrichArtistsFromRa } from "../src/lib/radar/ra-enrich";
import { radarArtists } from "../src/lib/radar/schema";
import { recomputeScoresBulk } from "../src/lib/radar/score-v2";

async function main() {
  const db = getDb();
  const pre = await db.execute(sql`
    select
      (select count(*)::int from radar_artists) as artists,
      (select count(*)::int from radar_artists where growth_score is not null) as scored,
      (select count(*)::int from radar_artists where home_gig_count > 0) as home,
      (select count(*)::int from radar_artists where ra_enriched_at is not null) as enriched,
      (select count(*)::int from radar_gigs) as gigs,
      (select count(*)::int from radar_alerts where read_at is null) as unread
  `);
  console.log("pre", pre[0]);

  console.log("enrich 25…");
  const en = await enrichArtistsFromRa({ limit: 25 });
  console.log({
    enriched: en.enriched,
    profiles: en.profilesWritten,
    related: en.relatedCreated,
    errors: en.errors.slice(0, 3),
  });

  const ids = (
    await db
      .select({ id: radarArtists.id })
      .from(radarArtists)
      .orderBy(desc(radarArtists.homeGigCount))
      .limit(80)
  ).map((r) => r.id);
  console.log("rescore", ids.length);
  const sc = await recomputeScoresBulk(ids);
  console.log("scored", sc);

  const post = await db.execute(sql`
    select
      (select count(*)::int from radar_artists where growth_score is not null) as scored,
      (select count(*)::int from radar_artists where ra_enriched_at is not null) as enriched,
      (select count(*)::int from radar_artists where home_gig_count > 0) as home,
      (select count(*)::int from radar_artist_profiles where platform = 'instagram') as ig
  `);
  console.log("post", post[0]);
  await endDb();
}

main().catch(async (e) => {
  console.error(e);
  await endDb();
  process.exit(1);
});
