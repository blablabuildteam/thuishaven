import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { syncWeeztixDailySales } from "../src/lib/integrations/weeztix/daily";

async function main() {
  const result = await syncWeeztixDailySales({
    limit: 160,
    daysBack: 900,
    concurrency: 4,
    curvesOnly: true,
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
