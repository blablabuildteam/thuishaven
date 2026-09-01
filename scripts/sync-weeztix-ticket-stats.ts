import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { syncWeeztixTicketStatsFromEditions } from "../src/lib/integrations/weeztix/sync";

async function main() {
  const result = await syncWeeztixTicketStatsFromEditions({
    onlyMissing: false,
    concurrency: 4,
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
