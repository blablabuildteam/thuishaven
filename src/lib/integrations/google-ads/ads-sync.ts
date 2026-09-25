import { getDb, hasDatabase } from "@/lib/db/client";
import { marketingAds } from "@/lib/db/schema";
import {
  fetchGoogleAdsAccount,
  googleAdsConfigured,
  googleAdsCustomerId,
  listSearchAdInsights,
  listYouTubeAdInsights,
} from "@/lib/integrations/google-ads/client";
import { logIntegration } from "@/lib/integrations/log";
import { socialSyncSince } from "@/lib/integrations/social/sync-window";

export type GoogleAdsSyncResult = {
  ok: boolean;
  fetched: number;
  upserted: number;
  linked?: number;
  accountName?: string;
  error?: string;
  notes: string[];
};

function microsToCents(micros: number): number {
  if (!Number.isFinite(micros) || micros <= 0) return 0;
  return Math.round(micros / 10_000);
}

/**
 * Read-only Google Ads Video / Demand Gen → marketing_ads (platform youtube).
 */
export async function syncYouTubeAdsReadOnly(options?: {
  since?: Date | null;
  limit?: number;
}): Promise<GoogleAdsSyncResult> {
  const notes: string[] = [];
  if (!googleAdsConfigured()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      error: "Google Ads OAuth-env ontbreekt (client, secret, refresh, customer)",
      notes,
    };
  }
  if (!hasDatabase()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      error: "DATABASE_URL ontbreekt",
      notes,
    };
  }

  const account = await fetchGoogleAdsAccount();
  if (!account.ok) {
    await logIntegration({
      source: "youtube_ads",
      level: "error",
      event: "sync.failed",
      message: account.error,
      throttleMs: 0,
    }).catch(() => null);
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      error: account.error,
      notes,
    };
  }

  const since =
    options?.since === null
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      : (options?.since ?? socialSyncSince());

  const insights = await listYouTubeAdInsights({
    since,
    limit: options?.limit,
  });
  if (!insights.ok) {
    await logIntegration({
      source: "youtube_ads",
      level: "error",
      event: "sync.failed",
      message: insights.error,
      throttleMs: 0,
    }).catch(() => null);
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      accountName: account.account.name,
      error: insights.error,
      notes,
    };
  }

  const db = getDb();
  const customerId = googleAdsCustomerId() ?? account.account.customerId;
  const currency = account.account.currency || "EUR";
  const until = new Date();
  const dateStart = since.toISOString().slice(0, 10);
  const dateStop = until.toISOString().slice(0, 10);
  let upserted = 0;
  const errors: string[] = [];

  for (const row of insights.rows) {
    if (row.spendMicros <= 0 && row.impressions <= 0 && row.clicks <= 0) {
      continue;
    }
    const permalink = row.youtubeVideoId
      ? `https://www.youtube.com/watch?v=${row.youtubeVideoId}`
      : row.campaignId
        ? `https://ads.google.com/aw/campaigns?campaignId=${row.campaignId}`
        : null;
    const publishedAt = row.campaignStartDate
      ? new Date(`${row.campaignStartDate}T00:00:00.000Z`)
      : null;

    try {
      await db
        .insert(marketingAds)
        .values({
          platform: "youtube",
          adAccountId: customerId,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          adsetId: row.adsetId,
          adsetName: row.adsetName,
          adId: row.adId,
          adName: row.adName,
          status: row.status,
          permalink,
          currency,
          spendCents: microsToCents(row.spendMicros),
          impressions: row.impressions,
          reach: row.videoViews,
          clicks: row.clicks,
          purchases: Math.round(row.conversions),
          publishedAt,
          dateStart,
          dateStop,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingAds.platform, marketingAds.adId],
          set: {
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            adsetId: row.adsetId,
            adsetName: row.adsetName,
            adName: row.adName,
            status: row.status,
            permalink,
            currency,
            spendCents: microsToCents(row.spendMicros),
            impressions: row.impressions,
            reach: row.videoViews,
            clicks: row.clicks,
            purchases: Math.round(row.conversions),
            publishedAt,
            dateStart,
            dateStop,
            syncedAt: new Date(),
          },
        });
      upserted += 1;
    } catch (e) {
      errors.push(
        `${row.adId}: ${e instanceof Error ? e.message : "upsert mislukt"}`,
      );
    }
  }

  const ok = upserted > 0 || insights.rows.length === 0;
  let linked = 0;
  if (ok) {
    try {
      const { linkAdsToEditions } = await import(
        "@/lib/marketing/ad-edition-link"
      );
      const result = await linkAdsToEditions({
        platform: "youtube",
        limit: 250,
      });
      linked = result.linked;
      if (linked > 0) notes.push(`${linked} ads → edities`);
    } catch (e) {
      notes.push(`Koppelen: ${e instanceof Error ? e.message : "mislukt"}`);
    }
    try {
      const { invalidateEventInsightsCache } = await import(
        "@/lib/insights/event-insights"
      );
      await invalidateEventInsightsCache();
    } catch {
      /* non-fatal */
    }
  }

  await logIntegration({
    source: "youtube_ads",
    level: ok ? "info" : "error",
    event: ok ? "sync.ok" : "sync.failed",
    message: ok
      ? `YouTube ads sync: ${upserted}/${insights.rows.length} ads · ${account.account.name}`
      : errors[0] ?? "YouTube ads sync mislukt",
    detail: {
      fetched: insights.rows.length,
      upserted,
      linked,
      customerId,
      errors: errors.slice(0, 5),
    },
    throttleMs: 0,
  }).catch(() => null);

  return {
    ok,
    fetched: insights.rows.length,
    upserted,
    linked,
    accountName: account.account.name,
    error: ok ? undefined : errors[0] ?? "Geen ads opgeslagen",
    notes: [...notes, ...errors.slice(0, 3)],
  };
}

/**
 * Read-only Google Ads Search / Performance Max / Display → marketing_ads (platform google).
 */
export async function syncGoogleSearchAdsReadOnly(options?: {
  since?: Date | null;
  limit?: number;
}): Promise<GoogleAdsSyncResult> {
  const notes: string[] = [];
  if (!googleAdsConfigured()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      error: "Google Ads OAuth-env ontbreekt (client, secret, refresh, customer)",
      notes,
    };
  }
  if (!hasDatabase()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      error: "DATABASE_URL ontbreekt",
      notes,
    };
  }

  const account = await fetchGoogleAdsAccount();
  if (!account.ok) {
    await logIntegration({
      source: "google_ads",
      level: "error",
      event: "sync.failed",
      message: account.error,
      throttleMs: 0,
    }).catch(() => null);
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      error: account.error,
      notes,
    };
  }

  const since =
    options?.since === null
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      : (options?.since ?? socialSyncSince());

  const insights = await listSearchAdInsights({
    since,
    limit: options?.limit,
  });
  if (!insights.ok) {
    await logIntegration({
      source: "google_ads",
      level: "error",
      event: "sync.failed",
      message: insights.error,
      throttleMs: 0,
    }).catch(() => null);
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      accountName: account.account.name,
      error: insights.error,
      notes,
    };
  }

  const db = getDb();
  const customerId = googleAdsCustomerId() ?? account.account.customerId;
  const currency = account.account.currency || "EUR";
  const until = new Date();
  const dateStart = since.toISOString().slice(0, 10);
  const dateStop = until.toISOString().slice(0, 10);
  let upserted = 0;
  const errors: string[] = [];

  for (const row of insights.rows) {
    if (row.spendMicros <= 0 && row.impressions <= 0 && row.clicks <= 0) {
      continue;
    }
    const permalink = row.campaignId
      ? `https://ads.google.com/aw/campaigns?campaignId=${row.campaignId}`
      : null;
    const publishedAt = row.campaignStartDate
      ? new Date(`${row.campaignStartDate}T00:00:00.000Z`)
      : null;

    try {
      await db
        .insert(marketingAds)
        .values({
          platform: "google",
          adAccountId: customerId,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          adsetId: row.adsetId,
          adsetName: row.adsetName,
          adId: row.adId,
          adName: row.adName,
          status: row.status,
          permalink,
          currency,
          spendCents: microsToCents(row.spendMicros),
          impressions: row.impressions,
          reach: 0,
          clicks: row.clicks,
          purchases: Math.round(row.conversions),
          publishedAt,
          dateStart,
          dateStop,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingAds.platform, marketingAds.adId],
          set: {
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            adsetId: row.adsetId,
            adsetName: row.adsetName,
            adName: row.adName,
            status: row.status,
            permalink,
            currency,
            spendCents: microsToCents(row.spendMicros),
            impressions: row.impressions,
            reach: 0,
            clicks: row.clicks,
            purchases: Math.round(row.conversions),
            publishedAt,
            dateStart,
            dateStop,
            syncedAt: new Date(),
          },
        });
      upserted += 1;
    } catch (e) {
      errors.push(
        `${row.adId}: ${e instanceof Error ? e.message : "upsert mislukt"}`,
      );
    }
  }

  const ok = upserted > 0 || insights.rows.length === 0;
  let linked = 0;
  if (ok) {
    try {
      const { linkAdsToEditions } = await import(
        "@/lib/marketing/ad-edition-link"
      );
      const result = await linkAdsToEditions({
        platform: "google",
        limit: 250,
      });
      linked = result.linked;
      if (linked > 0) notes.push(`${linked} ads → edities`);
    } catch (e) {
      notes.push(`Koppelen: ${e instanceof Error ? e.message : "mislukt"}`);
    }
    try {
      const { invalidateEventInsightsCache } = await import(
        "@/lib/insights/event-insights"
      );
      await invalidateEventInsightsCache();
    } catch {
      /* non-fatal */
    }
  }

  await logIntegration({
    source: "google_ads",
    level: ok ? "info" : "error",
    event: ok ? "sync.ok" : "sync.failed",
    message: ok
      ? `Google Ads sync: ${upserted}/${insights.rows.length} ads · ${account.account.name}`
      : errors[0] ?? "Google Ads sync mislukt",
    detail: {
      fetched: insights.rows.length,
      upserted,
      linked,
      customerId,
      errors: errors.slice(0, 5),
    },
    throttleMs: 0,
  }).catch(() => null);

  return {
    ok,
    fetched: insights.rows.length,
    upserted,
    linked,
    accountName: account.account.name,
    error: ok ? undefined : errors[0] ?? "Geen ads opgeslagen",
    notes: [...notes, ...errors.slice(0, 3)],
  };
}
