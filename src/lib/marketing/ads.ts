import { desc, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, marketingAds } from "@/lib/db/schema";

export type MarketingAdRow = {
  id: string;
  editionId: string | null;
  editionName: string | null;
  platform: "meta" | "tiktok" | "youtube";
  campaignId: string | null;
  campaignName: string | null;
  adsetName: string | null;
  adId: string;
  adName: string | null;
  status: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  currency: string;
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  publishedAt: string | null;
  dateStart: string | null;
  dateStop: string | null;
  syncedAt: string | null;
};

export type MarketingAdsCampaignGroup = {
  campaignId: string | null;
  campaignName: string;
  ads: number;
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  rows: MarketingAdRow[];
};

export type MarketingAdsBundle = {
  ads: MarketingAdRow[];
  campaigns: MarketingAdsCampaignGroup[];
  totals: {
    ads: number;
    campaigns: number;
    spendCents: number;
    impressions: number;
    reach: number;
    clicks: number;
    linked: number;
  };
  lastSyncedAt: string | null;
  accountCurrency: string;
};

function emptyBundle(): MarketingAdsBundle {
  return {
    ads: [],
    campaigns: [],
    totals: {
      ads: 0,
      campaigns: 0,
      spendCents: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      linked: 0,
    },
    lastSyncedAt: null,
    accountCurrency: "EUR",
  };
}

export function ctrPercent(clicks: number, impressions: number): number | null {
  if (impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

export function cpcCents(spendCents: number, clicks: number): number | null {
  if (clicks <= 0) return null;
  return Math.round(spendCents / clicks);
}

export function cpmCents(
  spendCents: number,
  impressions: number,
): number | null {
  if (impressions <= 0) return null;
  return Math.round((spendCents / impressions) * 1000);
}

export const loadMarketingAdsBundle = cache(
  async (options?: {
    platform?: "meta" | "tiktok" | "youtube";
    limit?: number;
  }): Promise<MarketingAdsBundle> => {
    if (!hasDatabase()) return emptyBundle();
    try {
      const db = getDb();
    const platform = options?.platform ?? "meta";
    const limit = Math.min(Math.max(options?.limit ?? 400, 1), 500);

    const rows = await db
      .select({
        ad: marketingAds,
        editionName: editions.name,
      })
      .from(marketingAds)
      .leftJoin(editions, eq(marketingAds.editionId, editions.id))
      .where(eq(marketingAds.platform, platform))
      .orderBy(desc(marketingAds.spendCents))
      .limit(limit);

    const ads: MarketingAdRow[] = rows.map(({ ad, editionName }) => ({
      id: ad.id,
      editionId: ad.editionId,
      editionName: editionName ?? null,
      platform: ad.platform,
      campaignId: ad.campaignId,
      campaignName: ad.campaignName,
      adsetName: ad.adsetName,
      adId: ad.adId,
      adName: ad.adName,
      status: ad.status,
      permalink: ad.permalink,
      thumbnailUrl: ad.thumbnailUrl,
      currency: ad.currency,
      spendCents: ad.spendCents,
      impressions: ad.impressions ?? 0,
      reach: ad.reach ?? 0,
      clicks: ad.clicks ?? 0,
      publishedAt: ad.publishedAt?.toISOString() ?? null,
      dateStart: ad.dateStart ?? null,
      dateStop: ad.dateStop ?? null,
      syncedAt: ad.syncedAt?.toISOString() ?? null,
    }));

    const byCampaign = new Map<string, MarketingAdsCampaignGroup>();
    for (const ad of ads) {
      const key = ad.campaignId ?? ad.campaignName ?? ad.adId;
      const existing = byCampaign.get(key);
      if (!existing) {
        byCampaign.set(key, {
          campaignId: ad.campaignId,
          campaignName: ad.campaignName?.trim() || "Zonder campagnenaam",
          ads: 1,
          spendCents: ad.spendCents,
          impressions: ad.impressions,
          reach: ad.reach,
          clicks: ad.clicks,
          rows: [ad],
        });
        continue;
      }
      existing.ads += 1;
      existing.spendCents += ad.spendCents;
      existing.impressions += ad.impressions;
      existing.reach += ad.reach;
      existing.clicks += ad.clicks;
      existing.rows.push(ad);
    }

    const campaigns = [...byCampaign.values()].sort(
      (a, b) => b.spendCents - a.spendCents,
    );
    const lastSyncedAt =
      ads
        .map((a) => a.syncedAt)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1) ?? null;

    return {
      ads,
      campaigns,
      totals: {
        ads: ads.length,
        campaigns: campaigns.length,
        spendCents: ads.reduce((s, a) => s + a.spendCents, 0),
        impressions: ads.reduce((s, a) => s + a.impressions, 0),
        reach: ads.reduce((s, a) => s + a.reach, 0),
        clicks: ads.reduce((s, a) => s + a.clicks, 0),
        linked: ads.filter((a) => a.editionId).length,
      },
      lastSyncedAt,
      accountCurrency: ads[0]?.currency ?? "EUR",
    };
    } catch {
      return emptyBundle();
    }
  },
);
