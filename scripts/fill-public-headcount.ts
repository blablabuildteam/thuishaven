/**
 * Vul ontbrekende / rare KvK-headcounts met Wikidata (gratis).
 * npx tsx scripts/fill-public-headcount.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { fillPublicHeadcounts } from "../src/lib/outreach/public-headcount";

async function main() {
  const result = await fillPublicHeadcounts({ onlyOffKvk: true });
  console.log(
    `[headcount] geprobeerd ${result.tried} · gevonden ${result.filled}`,
  );
  if (result.missed.length) {
    console.log("[headcount] geen treffer:", result.missed.join(", "));
  }
  await endDb();
}

main().catch(async (e) => {
  console.error(e);
  await endDb().catch(() => undefined);
  process.exit(1);
});
