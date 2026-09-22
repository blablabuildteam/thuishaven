/**
 * Real-data fill: count pending, optionally discover one page, then auto-fill rounds.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fill-outreach-now.ts
 *   npx tsx --env-file=.env.local scripts/fill-outreach-now.ts --discover
 *   npx tsx --env-file=.env.local scripts/fill-outreach-now.ts --rounds=3
 */

import {
  countAutoFillPending,
  runOutreachAutoFill,
} from "../src/lib/outreach/auto-fill";
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "../src/lib/db/client";

async function stats() {
  if (!hasDatabase()) return null;
  const db = getDb();
  const rows = await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where type = 'company')::int as companies,
      count(*) filter (where email is not null and length(trim(email)) > 0)::int as with_email,
      count(*) filter (where kvk_number is not null)::int as with_kvk,
      count(*) filter (where anniversary_years is not null)::int as with_anniv
    from prospects
  `);
  return rows[0] ?? rows;
}

async function main() {
  const args = process.argv.slice(2);
  const discover = args.includes("--discover");
  const roundsArg = args.find((a) => a.startsWith("--rounds="));
  const rounds = roundsArg ? Math.max(1, Number(roundsArg.split("=")[1]) || 1) : 2;

  console.log("=== before ===");
  console.log("stats", await stats());
  console.log("pending", await countAutoFillPending());

  for (let i = 0; i < rounds; i++) {
    console.log(`\n=== round ${i + 1}/${rounds} (discover=${discover && i === 0}) ===`);
    const result = await runOutreachAutoFill({
      discover: discover && i === 0,
      fillHeadcounts: true,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) break;
    const pending = await countAutoFillPending();
    console.log("pending after", pending);
    const open =
      pending.kvk +
      pending.people +
      pending.hunter +
      pending.website +
      pending.headcount;
    if (open === 0 && !(discover && i === 0)) break;
  }

  console.log("\n=== after ===");
  console.log("stats", await stats());
  console.log("pending", await countAutoFillPending());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
