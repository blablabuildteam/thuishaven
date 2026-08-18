import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { syncWeeztixDailySales } from "../src/lib/integrations/weeztix/daily";

async function main() {
  const limit = Number(process.argv[2] ?? 25);
  const result = await syncWeeztixDailySales({
    limit,
    daysBack: 400,
    concurrency: 3,
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
