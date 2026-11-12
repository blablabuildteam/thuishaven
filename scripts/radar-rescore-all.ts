/**
 * One-shot: bulk-rescore all radar artists in chunks.
 * Usage: npx tsx --env-file=.env.local scripts/radar-rescore-all.ts
 */
import { endDb, getDb } from "../src/lib/db/client";
import { radarArtists } from "../src/lib/radar/schema";
import { recomputeScoresBulk } from "../src/lib/radar/score-v2";
import { asc } from "drizzle-orm";

async function main() {
  const db = getDb();
  const all = await db
    .select({ id: radarArtists.id })
    .from(radarArtists)
    .orderBy(asc(radarArtists.name));
  console.log(`Rescoring ${all.length} artists…`);
  let scored = 0;
  const chunk = 400;
  for (let i = 0; i < all.length; i += chunk) {
    const ids = all.slice(i, i + chunk).map((r) => r.id);
    const result = await recomputeScoresBulk(ids);
    scored += result.scored;
    console.log(
      `  chunk ${Math.floor(i / chunk) + 1}: ${result.scored}/${ids.length} (total ${scored})`,
    );
  }
  console.log(`Done. Scored ${scored}.`);
  await endDb();
}

main().catch(async (e) => {
  console.error(e);
  await endDb();
  process.exit(1);
});
