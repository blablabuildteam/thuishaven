import { config } from "dotenv";
config({ path: ".env.local" });

import {
  fetchGoogleAdsAccount,
  listYouTubeAdInsights,
} from "../src/lib/integrations/google-ads/client";

async function main() {
  const account = await fetchGoogleAdsAccount();
  console.log("account", account);
  if (!account.ok) process.exit(1);

  const insights = await listYouTubeAdInsights({
    since: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    limit: 50,
  });
  if (!insights.ok) {
    console.log("insights error", insights.error);
    process.exit(1);
  }
  console.log("rows", insights.rows.length);
  for (const row of insights.rows.slice(0, 8)) {
    console.log({
      ad: row.adName ?? row.adId,
      campaign: row.campaignName,
      channel: row.channelType,
      spendMicros: row.spendMicros,
      impressions: row.impressions,
      clicks: row.clicks,
    });
  }
}

void main();
