/**
 * Sync Google Ads (Search/PMax/Display) now.
 * Run with: npx tsx scripts/sync-google-ads-now.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { syncGoogleSearchAdsReadOnly } from "@/lib/integrations/google-ads/ads-sync";

async function main() {
  console.log("Starting Google Ads (Search/Display) sync...");
  const result = await syncGoogleSearchAdsReadOnly();
  console.log("\n📊 Result:");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
