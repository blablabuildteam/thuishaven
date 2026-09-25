/**
 * List all Google Ads campaign types in the account.
 * Run with: npx tsx scripts/list-google-ads-campaigns.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error("OAuth failed");
  return json.access_token;
}

async function main() {
  const token = await getAccessToken();
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/\D/g, "");
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");

  // Calculate date range (last 365 days)
  const until = new Date();
  const since = new Date(until.getTime() - 365 * 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      campaign.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${sinceStr}' AND '${untilStr}'
  `;

  const url = `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    // Retry without login-customer-id
    delete headers["login-customer-id"];
    const retry = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });
    const data = await retry.json();
    if (!retry.ok) {
      console.error("API Error:", JSON.stringify(data, null, 2));
      process.exit(1);
    }
    handleResults(data.results || []);
    return;
  }

  const data = await res.json();
  handleResults(data.results || []);
}

type CampaignRow = {
  campaign?: { id?: string; name?: string; advertisingChannelType?: string; status?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string };
};

function handleResults(results: CampaignRow[]) {
  // Group by channel type
  const byType = new Map<string, { count: number; spend: number; campaigns: string[] }>();
  
  for (const row of results) {
    const type = row.campaign?.advertisingChannelType || "UNKNOWN";
    const spend = Number(row.metrics?.costMicros || 0) / 1_000_000;
    const entry = byType.get(type) || { count: 0, spend: 0, campaigns: [] };
    entry.count++;
    entry.spend += spend;
    if (entry.campaigns.length < 5) {
      entry.campaigns.push(row.campaign?.name || "(no name)");
    }
    byType.set(type, entry);
  }

  console.log("\n📊 Google Ads Campaign Types (last 365 days):");
  console.log("═".repeat(70));
  
  const sorted = [...byType.entries()].sort((a, b) => b[1].spend - a[1].spend);
  for (const [type, data] of sorted) {
    const status = type === "VIDEO" || type === "DEMAND_GEN" ? "✅ (YouTube - al gesynchroniseerd)" : "⏳ (nog niet geïmporteerd)";
    console.log(`\n${type} ${status}`);
    console.log(`  Campaigns: ${data.count}`);
    console.log(`  Spend: €${data.spend.toFixed(2)}`);
    console.log(`  Examples: ${data.campaigns.slice(0, 3).join(", ")}`);
  }

  console.log("\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
