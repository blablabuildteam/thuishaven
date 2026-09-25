/** Client-safe paid-ad types and metric helpers — no DB / Node imports. */

export type MarketingAdRow = {
  id: string;
  editionId: string | null;
  editionName: string | null;
  platform: "meta" | "tiktok" | "youtube" | "google";
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
  /** Platform-reported purchases (Meta pixel / TikTok complete payment). */
  purchases: number;
  publishedAt: string | null;
  dateStart: string | null;
  dateStop: string | null;
  syncedAt: string | null;
  /** Amsterdam YYYY-MM-DD of the linked edition, if any. */
  editionStartsAt: string | null;
};

export type MarketingAdsCampaignGroup = {
  campaignId: string | null;
  campaignName: string;
  ads: number;
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  /** Linked event day (YYYY-MM-DD), used to sort campaigns chronologically. */
  startsAt: string | null;
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
    purchases: number;
    linked: number;
  };
  lastSyncedAt: string | null;
  accountCurrency: string;
};

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

export type PaidSpendByPlatform = {
  meta: number;
  tiktok: number;
  youtube: number;
  google: number;
};

export function paidSpendByPlatform(
  ads: Array<{ platform: string; spendCents: number }>,
): PaidSpendByPlatform {
  const out: PaidSpendByPlatform = { meta: 0, tiktok: 0, youtube: 0, google: 0 };
  for (const ad of ads) {
    if (ad.platform === "tiktok") out.tiktok += ad.spendCents;
    else if (ad.platform === "youtube") out.youtube += ad.spendCents;
    else if (ad.platform === "meta") out.meta += ad.spendCents;
    else if (ad.platform === "google") out.google += ad.spendCents;
  }
  return out;
}

export function formatPaidSpendSplit(spend: PaidSpendByPlatform | undefined | null): string | null {
  if (!spend) return null;
  const parts: string[] = [];
  // Defensive checks for older cached data that may not have all platforms
  if ((spend.google ?? 0) > 0) {
    parts.push(`Google €${Math.round(spend.google / 100).toLocaleString("nl-NL")}`);
  }
  if ((spend.youtube ?? 0) > 0) {
    parts.push(`YouTube €${Math.round(spend.youtube / 100).toLocaleString("nl-NL")}`);
  }
  if ((spend.meta ?? 0) > 0) {
    parts.push(`Meta €${Math.round(spend.meta / 100).toLocaleString("nl-NL")}`);
  }
  if ((spend.tiktok ?? 0) > 0) {
    parts.push(`TikTok €${Math.round(spend.tiktok / 100).toLocaleString("nl-NL")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
