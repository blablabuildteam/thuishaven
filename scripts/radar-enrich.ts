/**
 * One-shot RA enrich for top artists by gig count.
 * Usage: npx tsx --env-file=.env.local scripts/radar-enrich.ts [limit]
 */
import { endDb } from "../src/lib/db/client";
import { enrichArtistsFromRa } from "../src/lib/radar/ra-enrich";

async function main() {
  const limit = Number(process.argv[2]) || 200;
  console.log(`Enriching up to ${limit} artists from RA…`);
  const result = await enrichArtistsFromRa({ limit });
  console.log(JSON.stringify(result, null, 2));
  await endDb();
}

main().catch(async (e) => {
  console.error(e);
  await endDb();
  process.exit(1);
});
