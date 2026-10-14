import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { syncBrevoCampaignsReadOnly } from "../src/lib/integrations/brevo/sync";

async function main() {
  const started = Date.now();
  console.log("[brevo-sync] starting…");
  const result = await syncBrevoCampaignsReadOnly();
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log("[brevo-sync] done in", elapsedSec, "s");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("[brevo-sync] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await endDb().catch(() => undefined);
  });
