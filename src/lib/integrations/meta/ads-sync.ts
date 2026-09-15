import { getDb, hasDatabase } from "@/lib/db/client";
import { marketingAds } from "@/lib/db/schema";
import {
  listMetaAdInsights,
  listMetaAds,
  resolveMetaAdAccount,
} from "@/lib/integrations/meta/ads";
import { logIntegration } from "@/lib/integrations/log";
import { socialSyncSince } from "@/lib/integrations/social/sync-window";

export type MetaAdsSyncResult = {
  ok: boolean;
  fetched: number;
  upserted: number;
  linked?: number;
  accountName?: string;
  error?: string;
  notes: string[];
};

function eurosToCents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

/**
 * Read-only Meta Marketing API sync → marketing_ads (ad-level insights).
 */
export async function syncMetaAdsReadOnly(options?: {
  since?: Date | null;
  limit?: number;
}): Promise<MetaAdsSyncResult> {
  const notes: string[] = [];
  if (!process.env.META_ACCESS_TOKEN?.trim()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      error: "META_ACCESS_TOKEN ontbreekt",
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

  const account = await resolveMetaAdAccount();
  if (!account.ok) {
    await logIntegration({
      source: "meta_ads",
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

  const [insights, ads] = await Promise.all([
    listMetaAdInsights({
      actId: account.account.id,
      since,
      limit: options?.limit,
    }),
    listMetaAds({
      actId: account.account.id,
      limit: options?.limit,
    }),
  ]);

  if (!insights.ok) {
    await logIntegration({
      source: "meta_ads",
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

  if (!ads.ok) {
    notes.push(`Ads-objecten overgeslagen: ${ads.error}`);
  }

  const adById = new Map(
    (ads.ok ? ads.ads : []).map((ad) => [ad.adId, ad]),
  );
  const db = getDb();
  let upserted = 0;
  const errors: string[] = [];
  const currency = account.account.currency || "EUR";

  for (const row of insights.rows) {
    if (row.spend <= 0 && row.impressions <= 0 && row.clicks <= 0) continue;
    const meta = adById.get(row.adId);
    try {
      const publishedAt = meta?.createdAt ?? null;
      await db
        .insert(marketingAds)
        .values({
          platform: "meta",
          adAccountId: account.account.accountId,
          campaignId: row.campaignId ?? meta?.campaignId ?? null,
          campaignName: row.campaignName ?? meta?.campaignName ?? null,
          adsetId: row.adsetId ?? meta?.adsetId ?? null,
          adsetName: row.adsetName ?? meta?.adsetName ?? null,
          adId: row.adId,
          adName: row.adName ?? meta?.adName ?? null,
          status: meta?.status ?? null,
          permalink: meta?.permalink ?? null,
          thumbnailUrl: meta?.thumbnailUrl ?? null,
          currency: row.currency || currency,
          spendCents: eurosToCents(row.spend),
          impressions: row.impressions,
          reach: row.reach,
          clicks: row.clicks,
          publishedAt,
          dateStart: row.dateStart,
          dateStop: row.dateStop,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingAds.platform, marketingAds.adId],
          set: {
            campaignId: row.campaignId ?? meta?.campaignId ?? null,
            campaignName: row.campaignName ?? meta?.campaignName ?? null,
            adsetId: row.adsetId ?? meta?.adsetId ?? null,
            adsetName: row.adsetName ?? meta?.adsetName ?? null,
            adName: row.adName ?? meta?.adName ?? null,
            status: meta?.status ?? null,
            permalink: meta?.permalink ?? null,
            thumbnailUrl: meta?.thumbnailUrl ?? null,
            currency: row.currency || currency,
            spendCents: eurosToCents(row.spend),
            impressions: row.impressions,
            reach: row.reach,
            clicks: row.clicks,
            publishedAt,
            dateStart: row.dateStart,
            dateStop: row.dateStop,
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
        platform: "meta",
        limit: 250,
      });
      linked = result.linked;
      if (linked > 0) notes.push(`${linked} ads → edities`);
    } catch (e) {
      notes.push(
        `Koppelen: ${e instanceof Error ? e.message : "mislukt"}`,
      );
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
    source: "meta_ads",
    level: ok ? "info" : "error",
    event: ok ? "sync.ok" : "sync.failed",
    message: ok
      ? `Meta ads sync: ${upserted}/${insights.rows.length} ads · ${account.account.name}`
      : errors[0] ?? "Meta ads sync mislukt",
    detail: {
      fetched: insights.rows.length,
      upserted,
      linked,
      accountId: account.account.accountId,
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
