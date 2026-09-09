import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { syncWeeztixSaleDays } from "../src/lib/integrations/weeztix/daily";

async function main() {
  const result = await syncWeeztixSaleDays({
    limit: Number(process.argv[2] ?? 120),
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
