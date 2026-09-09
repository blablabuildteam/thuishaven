import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, gte, isNotNull } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { editions, ticketInventory } from "../src/lib/db/schema";
import { snapshotWeeztixInventoryToday } from "../src/lib/integrations/weeztix/daily";

async function main() {
  const db = getDb();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 14);
  const rows = await db
    .select({ editionId: ticketInventory.editionId })
    .from(ticketInventory)
    .innerJoin(editions, eq(editions.id, ticketInventory.editionId))
    .where(
      and(
        eq(ticketInventory.platform, "weeztix"),
        isNotNull(editions.weeztixEventId),
        gte(editions.startsAt, from),
      ),
    );
  const result = await snapshotWeeztixInventoryToday(
    rows.map((row) => row.editionId),
  );
  console.log(
    JSON.stringify({ editions: rows.length, ...result }, null, 2),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
