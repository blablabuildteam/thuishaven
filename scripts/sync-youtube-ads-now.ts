import { config } from "dotenv";
config({ path: ".env.local" });

import { syncYouTubeAdsReadOnly } from "../src/lib/integrations/google-ads/ads-sync";

async function main() {
  const result = await syncYouTubeAdsReadOnly();
  console.log(result);
  process.exit(result.ok ? 0 : 1);
}

void main();
