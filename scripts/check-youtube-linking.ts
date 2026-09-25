/**
 * Check which YouTube ads are linked vs unlinked to editions.
 * Run with: npx tsx scripts/check-youtube-linking.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { marketingAds, editions } from "@/lib/db/schema";

async function main() {
  const db = getDb();

  const linkedAds = await db
    .select({
      id: marketingAds.id,
      campaignName: marketingAds.campaignName,
      adName: marketingAds.adName,
      spendCents: marketingAds.spendCents,
      editionId: marketingAds.editionId,
      editionName: editions.name,
    })
    .from(marketingAds)
    .leftJoin(editions, eq(editions.id, marketingAds.editionId))
    .where(and(eq(marketingAds.platform, "youtube"), isNotNull(marketingAds.editionId)));

  const unlinkedAds = await db
    .select({
      id: marketingAds.id,
      campaignName: marketingAds.campaignName,
      adName: marketingAds.adName,
      spendCents: marketingAds.spendCents,
    })
    .from(marketingAds)
    .where(and(eq(marketingAds.platform, "youtube"), isNull(marketingAds.editionId)));

  console.log("\n✅ LINKED YouTube Ads (" + linkedAds.length + "):");
  console.log("─".repeat(80));
  for (const ad of linkedAds) {
    console.log(`  €${((ad.spendCents ?? 0) / 100).toFixed(2).padStart(8)} | ${ad.campaignName?.slice(0, 35).padEnd(35)} → ${ad.editionName?.slice(0, 30)}`);
  }

  console.log("\n❌ UNLINKED YouTube Ads (" + unlinkedAds.length + "):");
  console.log("─".repeat(80));
  for (const ad of unlinkedAds) {
    console.log(`  €${((ad.spendCents ?? 0) / 100).toFixed(2).padStart(8)} | ${ad.campaignName} | ${ad.adName}`);
  }

  console.log("\n📊 Summary: " + linkedAds.length + " linked, " + unlinkedAds.length + " unlinked");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
