/**
 * Re-score existing company prospects on size/city only (ignore KvK non-mailing).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { prospects } from "../src/lib/db/schema";
import { scoreDoelgroep } from "../src/lib/outreach/doelgroep";

async function main() {
  const db = getDb();
  const rows = await db.select().from(prospects);
  let updated = 0;
  for (const row of rows) {
    if (row.type !== "company") continue;
    const scored = scoreDoelgroep({
      employeeCount: row.employeeCount,
      city: row.city,
    });
    const meta = { ...(row.metadata ?? {}) };
    if (
      meta.doelgroepFit === scored.fit &&
      meta.doelgroepReason === scored.reason
    ) {
      continue;
    }
    meta.doelgroepFit = scored.fit;
    meta.doelgroepReason = scored.reason;
    await db
      .update(prospects)
      .set({ metadata: meta, updatedAt: new Date() })
      .where(eq(prospects.id, row.id));
    updated += 1;
    console.log(`${row.companyName}: ${scored.fit} · ${scored.reason}`);
  }
  console.log(`[rescore] ${updated} bijgewerkt`);
  await endDb();
}

main().catch(async (e) => {
  console.error(e);
  await endDb().catch(() => undefined);
  process.exit(1);
});
