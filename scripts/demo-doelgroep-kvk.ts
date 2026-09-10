/**
 * Demo: zet doelgroep-startlijst klaar en verrijk een batch via KvK.
 * Usage: npx tsx scripts/demo-doelgroep-kvk.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { enrichCompanyProspectsBatch } from "../src/lib/integrations/kvk/batch-enrich";
import { DOELGROEP_STARTLIJST } from "../src/lib/outreach/doelgroep";
import { addProspects } from "../src/lib/outreach/intake";

async function main() {
  const added = await addProspects({
    drafts: DOELGROEP_STARTLIJST.map((companyName) => ({ companyName })),
    type: "company",
    source: "manual",
  });
  if (!added.ok) {
    throw new Error(added.error ?? "intake failed");
  }
  console.log(
    `[demo] lijst: +${added.created} · al aanwezig ${added.duplicate} · niet mailen ${added.excluded}`,
  );

  const first = await enrichCompanyProspectsBatch(10);
  if (!first.ok) throw new Error(first.error ?? "enrich failed");
  for (const row of first.rows) {
    const mark = row.ok ? row.fit ?? "ok" : "fout";
    console.log(
      `  ${row.companyName}: ${mark}${row.reason ? ` · ${row.reason}` : ""}${row.error ? ` · ${row.error}` : ""}`,
    );
  }

  const second = await enrichCompanyProspectsBatch(10);
  console.log(
    `[demo] KvK: ${first.processed + (second.processed ?? 0)} profielen`,
  );
  if (second.ok) {
    for (const row of second.rows) {
      const mark = row.ok ? row.fit ?? "ok" : "fout";
      console.log(
        `  ${row.companyName}: ${mark}${row.reason ? ` · ${row.reason}` : ""}${row.error ? ` · ${row.error}` : ""}`,
      );
    }
  }

  await endDb();
}

main().catch(async (e) => {
  console.error(e);
  await endDb().catch(() => undefined);
  process.exit(1);
});
