import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { cache } from "react";
import { DASHBOARD_TTL_MS, rememberTtl } from "@/lib/cache/ttl";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, marketingAds, ticketInventory } from "@/lib/db/schema";
import { amsterdamDay } from "@/lib/time/amsterdam";
import type {
  MarketingAdRow,
  MarketingAdsBundle,
  MarketingAdsCampaignGroup,
} from "@/lib/marketing/ad-metrics";

export type {
  MarketingAdRow,
  MarketingAdsBundle,
  MarketingAdsCampaignGroup,
} from "@/lib/marketing/ad-metrics";
export {
  cpcCents,
  cpmCents,
  ctrPercent,
} from "@/lib/marketing/ad-metrics";

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
      purchases: 0,
      linked: 0,
    },
    lastSyncedAt: null,
    accountCurrency: "EUR",
  };
}

function campaignStartsAt(rows: MarketingAdRow[]): string | null {
  const byEdition = new Map<string, { spend: number; startsAt: string }>();
  for (const row of rows) {
    if (!row.editionId || !row.editionStartsAt) continue;
    const cur = byEdition.get(row.editionId);
    if (cur) cur.spend += row.spendCents;
    else {
      byEdition.set(row.editionId, {
        spend: row.spendCents,
        startsAt: row.editionStartsAt,
      });
    }
  }
  const best = [...byEdition.values()].sort((a, b) => b.spend - a.spend)[0];
  if (best) return best.startsAt;
  const fallback = rows
    .map((row) => row.dateStart || row.publishedAt?.slice(0, 10) || null)
    .filter((day): day is string => Boolean(day))
    .sort();
  return fallback[0] ?? null;
}

/** Newest event first; unlinked / undated campaigns last. */
function compareCampaignsChronologically(
  a: MarketingAdsCampaignGroup,
  b: MarketingAdsCampaignGroup,
): number {
  if (a.startsAt && b.startsAt) {
    const byDay = b.startsAt.localeCompare(a.startsAt);
    if (byDay !== 0) return byDay;
    return b.spendCents - a.spendCents;
  }
  if (a.startsAt) return -1;
  if (b.startsAt) return 1;
  return b.spendCents - a.spendCents;
}

export const loadMarketingAdsBundle = cache(
  async (options?: {
    platform?: "meta" | "tiktok" | "youtube" | "google";
    limit?: number;
  }): Promise<MarketingAdsBundle> => {
    const platform = options?.platform ?? "meta";
    const limit = Math.min(Math.max(options?.limit ?? 5000, 1), 5000);
    return rememberTtl(
      `marketing-ads:${platform}:${limit}`,
      DASHBOARD_TTL_MS,
      () => loadMarketingAdsBundleFresh(platform, limit),
    );
  },
);

async function loadMarketingAdsBundleFresh(
  platform: "meta" | "tiktok" | "youtube" | "google",
  limit: number,
): Promise<MarketingAdsBundle> {
    if (!hasDatabase()) return emptyBundle();
    try {
      const db = getDb();

      const rows = await db
        .select({
          ad: marketingAds,
          editionName: editions.name,
          editionStartsAt: editions.startsAt,
        })
        .from(marketingAds)
        .leftJoin(editions, eq(marketingAds.editionId, editions.id))
        .where(eq(marketingAds.platform, platform))
        .orderBy(desc(marketingAds.spendCents))
        .limit(limit);

      const ads: MarketingAdRow[] = rows.map(({ ad, editionName, editionStartsAt }) => ({
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
        purchases: ad.purchases ?? 0,
        publishedAt: ad.publishedAt?.toISOString() ?? null,
        dateStart: ad.dateStart ?? null,
        dateStop: ad.dateStop ?? null,
        syncedAt: ad.syncedAt?.toISOString() ?? null,
        editionStartsAt: editionStartsAt
          ? amsterdamDay(editionStartsAt)
          : null,
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
            purchases: ad.purchases,
            startsAt: campaignStartsAt([ad]),
            rows: [ad],
          });
          continue;
        }
        existing.ads += 1;
        existing.spendCents += ad.spendCents;
        existing.impressions += ad.impressions;
        existing.reach += ad.reach;
        existing.clicks += ad.clicks;
        existing.purchases += ad.purchases;
        existing.rows.push(ad);
        existing.startsAt = campaignStartsAt(existing.rows);
      }

      for (const campaign of byCampaign.values()) {
        campaign.rows.sort((a, b) => b.spendCents - a.spendCents);
      }

      const campaigns = [...byCampaign.values()].sort(compareCampaignsChronologically);
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
          purchases: ads.reduce((s, a) => s + a.purchases, 0),
          linked: ads.filter((a) => a.editionId).length,
        },
        lastSyncedAt,
        accountCurrency: ads[0]?.currency ?? "EUR",
      };
    } catch {
      return emptyBundle();
    }
}

export type PaidAdsInsightsRow = {
  name: string;
  day: string;
  status: "upcoming" | "past";
  spendCents: number;
  googleSpendCents: number;
  youtubeSpendCents: number;
  metaSpendCents: number;
  tiktokSpendCents: number;
  ads: number;
  sold: number;
  fillPct: number | null;
  roas: number | null;
  /** Meta purchase + TikTok complete_payment + Google Ads conversions. */
  purchases: number;
};

export type PaidAdsInsightsSummary = {
  ads: number;
  linked: number;
  spendCents: number;
  googleSpendCents: number;
  youtubeSpendCents: number;
  metaSpendCents: number;
  tiktokSpendCents: number;
  purchases: number;
  events: number;
  rows: PaidAdsInsightsRow[];
};

/** Compact per-event paid spend for the insights chat snapshot. */
export async function loadPaidAdsInsightsSummary(): Promise<PaidAdsInsightsSummary> {
  const db = getDb();
  const today = amsterdamDay(new Date());
  const grouped = await db
    .select({
      editionId: marketingAds.editionId,
      name: editions.name,
      startsAt: editions.startsAt,
      ads: sql<number>`count(*)::int`,
      spendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}), 0)::int`,
      googleSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'google'), 0)::int`,
      youtubeSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'youtube'), 0)::int`,
      metaSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'meta'), 0)::int`,
      tiktokSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'tiktok'), 0)::int`,
      purchases: sql<number>`coalesce(sum(${marketingAds.purchases}), 0)::int`,
      sold: ticketInventory.sold,
      capacity: ticketInventory.capacity,
      revenueCents: ticketInventory.revenueCents,
    })
    .from(marketingAds)
    .innerJoin(editions, eq(editions.id, marketingAds.editionId))
    .leftJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(isNotNull(marketingAds.editionId))
    .groupBy(
      marketingAds.editionId,
      editions.name,
      editions.startsAt,
      ticketInventory.sold,
      ticketInventory.capacity,
      ticketInventory.revenueCents,
    )
    .orderBy(sql`coalesce(sum(${marketingAds.spendCents}), 0) desc`);

  const totals = await db
    .select({
      ads: sql<number>`count(*)::int`,
      linked: sql<number>`count(*) filter (where ${marketingAds.editionId} is not null)::int`,
      spendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}), 0)::int`,
      googleSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'google'), 0)::int`,
      youtubeSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'youtube'), 0)::int`,
      metaSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'meta'), 0)::int`,
      tiktokSpendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}) filter (where ${marketingAds.platform} = 'tiktok'), 0)::int`,
      purchases: sql<number>`coalesce(sum(${marketingAds.purchases}), 0)::int`,
    })
    .from(marketingAds);

  const mapped: PaidAdsInsightsRow[] = grouped.map((row) => {
    const day = row.startsAt ? amsterdamDay(row.startsAt) : "";
    const sold = row.sold ?? 0;
    const capacity = row.capacity;
    const spendCents = Number(row.spendCents) || 0;
    const revenueCents = row.revenueCents ?? 0;
    return {
      name: row.name,
      day,
      status: day && day >= today ? "upcoming" : "past",
      spendCents,
      googleSpendCents: Number(row.googleSpendCents) || 0,
      youtubeSpendCents: Number(row.youtubeSpendCents) || 0,
      metaSpendCents: Number(row.metaSpendCents) || 0,
      tiktokSpendCents: Number(row.tiktokSpendCents) || 0,
      ads: Number(row.ads) || 0,
      sold,
      fillPct:
        capacity != null && capacity > 0 ? (sold / capacity) * 100 : null,
      roas:
        spendCents > 0 && revenueCents > 0 ? revenueCents / spendCents : null,
      purchases: Number(row.purchases) || 0,
    };
  });
  const top = mapped.slice(0, 24);
  const extraGoogle = mapped
    .filter(
      (row) =>
        (row.googleSpendCents > 0 || row.youtubeSpendCents > 0) &&
        !top.some((existing) => existing.name === row.name && existing.day === row.day),
    )
    .slice(0, 12);
  const rows = [...top, ...extraGoogle];

  return {
    ads: Number(totals[0]?.ads) || 0,
    linked: Number(totals[0]?.linked) || 0,
    spendCents: Number(totals[0]?.spendCents) || 0,
    googleSpendCents: Number(totals[0]?.googleSpendCents) || 0,
    youtubeSpendCents: Number(totals[0]?.youtubeSpendCents) || 0,
    metaSpendCents: Number(totals[0]?.metaSpendCents) || 0,
    tiktokSpendCents: Number(totals[0]?.tiktokSpendCents) || 0,
    purchases: Number(totals[0]?.purchases) || 0,
    events: grouped.length,
    rows,
  };
}
