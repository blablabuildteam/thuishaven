/**
 * Read-only Google Ads API (REST). Access level lives on the Cloud project
 * that owns the OAuth client (Explorer+). Developer token is optional after
 * the Sept 2026 sunset.
 */

const DEFAULT_VERSION = "v25";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleAdsApiVersion(): string {
  return process.env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_VERSION;
}

export function googleAdsCustomerId(): string | null {
  const raw = process.env.GOOGLE_ADS_CUSTOMER_ID?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function googleAdsLoginCustomerId(): string | null {
  const raw = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function googleAdsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID?.trim() &&
      process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() &&
      googleAdsCustomerId(),
  );
}

export function explainGoogleAdsError(message: string): string {
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|ACTION_NOT_PERMITTED/i.test(message)) {
    return "Cloud-project heeft Test-access. Vraag Explorer aan op de Google Ads API Overview in Google Cloud Console.";
  }
  if (/UNAUTHENTICATED|invalid_grant|invalid_client/i.test(message)) {
    return "Google Ads OAuth ongeldig. Vernieuw GOOGLE_ADS_REFRESH_TOKEN (team@blablabuild.com).";
  }
  if (/CUSTOMER_NOT_ENABLED|USER_PERMISSION_DENIED|NOT_ADS_USER/i.test(message)) {
    return "Dit OAuth-account mag dat Ads-account niet lezen. team@ is Admin op Thuishaven, maar mogelijk geen user op de MCC — laat GOOGLE_ADS_LOGIN_CUSTOMER_ID weg of nodig team@ uit op de MCC.";
  }
  if (/DEVELOPER_TOKEN/i.test(message) && /required|missing/i.test(message)) {
    return "Deze API-versie wil nog een developer-token header. Zet GOOGLE_ADS_DEVELOPER_TOKEN of gebruik een nieuwere Ads API-versie.";
  }
  return message;
}

type AdsError = {
  error?: {
    message?: string;
    status?: string;
    details?: Array<{ errors?: Array<{ message?: string }> }>;
  };
  error_description?: string;
};

async function getAccessToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET of GOOGLE_ADS_REFRESH_TOKEN ontbreekt",
    };
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      return {
        ok: false,
        error: explainGoogleAdsError(
          json.error_description || json.error || `OAuth HTTP ${res.status}`,
        ),
      };
    }
    return { ok: true, token: json.access_token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Google OAuth network error",
    };
  }
}

function firstAdsMessage(json: AdsError, fallback: string): string {
  const nested = json.error?.details?.[0]?.errors?.[0]?.message;
  return nested || json.error?.message || json.error_description || fallback;
}

async function adsSearchOnce<T>(
  query: string,
  token: string,
  useLoginCustomer: boolean,
): Promise<
  | { ok: true; results: T[] }
  | { ok: false; error: string; permissionDenied?: boolean }
> {
  const customerId = googleAdsCustomerId();
  if (!customerId) {
    return { ok: false, error: "GOOGLE_ADS_CUSTOMER_ID ontbreekt" };
  }

  const version = googleAdsApiVersion();
  const url = `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const loginId = googleAdsLoginCustomerId();
  if (useLoginCustomer && loginId) headers["login-customer-id"] = loginId;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (developerToken) headers["developer-token"] = developerToken;

  const results: T[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          ...(pageToken ? { pageToken } : {}),
        }),
        cache: "no-store",
      });
      const text = await res.text();
      let json: AdsError & {
        results?: T[];
        nextPageToken?: string;
      };
      try {
        json = JSON.parse(text) as AdsError & {
          results?: T[];
          nextPageToken?: string;
        };
      } catch {
        return {
          ok: false,
          error: explainGoogleAdsError(
            `Google Ads HTTP ${res.status}: ${text.slice(0, 180)}`,
          ),
        };
      }
      if (!res.ok) {
        const message = firstAdsMessage(json, `Google Ads HTTP ${res.status}`);
        return {
          ok: false,
          error: explainGoogleAdsError(message),
          permissionDenied: /USER_PERMISSION_DENIED/i.test(message),
        };
      }
      results.push(...(json.results ?? []));
      pageToken = json.nextPageToken || undefined;
    } while (pageToken);

    return { ok: true, results };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Google Ads network error",
    };
  }
}

async function adsSearch<T>(query: string): Promise<
  { ok: true; results: T[] } | { ok: false; error: string }
> {
  const auth = await getAccessToken();
  if (!auth.ok) return auth;

  const withLogin = Boolean(googleAdsLoginCustomerId());
  const first = await adsSearchOnce<T>(query, auth.token, withLogin);
  if (first.ok) return first;
  if (withLogin && first.permissionDenied) {
    const retry = await adsSearchOnce<T>(query, auth.token, false);
    if (retry.ok) return retry;
    return { ok: false, error: retry.error };
  }
  return { ok: false, error: first.error };
}

export type GoogleAdsAccount = {
  customerId: string;
  name: string;
  currency: string;
};

export async function fetchGoogleAdsAccount(): Promise<
  { ok: true; account: GoogleAdsAccount } | { ok: false; error: string }
> {
  const customerId = googleAdsCustomerId();
  if (!customerId) {
    return { ok: false, error: "GOOGLE_ADS_CUSTOMER_ID ontbreekt" };
  }
  if (!googleAdsConfigured()) {
    return { ok: false, error: "Google Ads OAuth-env ontbreekt" };
  }

  const result = await adsSearch<{
    customer?: {
      id?: string;
      descriptiveName?: string;
      currencyCode?: string;
    };
  }>(
    "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
  );
  if (!result.ok) return result;
  const row = result.results[0]?.customer;
  return {
    ok: true,
    account: {
      customerId: String(row?.id ?? customerId),
      name: row?.descriptiveName?.trim() || "Thuishaven",
      currency: row?.currencyCode?.trim() || "EUR",
    },
  };
}

export type GoogleAdsInsightRow = {
  adId: string;
  adName: string | null;
  status: string | null;
  campaignId: string | null;
  campaignName: string | null;
  channelType: string | null;
  adsetId: string | null;
  adsetName: string | null;
  youtubeVideoId: string | null;
  spendMicros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  videoViews: number;
  campaignStartDate: string | null;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const YOUTUBE_CHANNELS = "('VIDEO', 'DEMAND_GEN')";
const SEARCH_CHANNELS = "('SEARCH', 'PERFORMANCE_MAX', 'DISPLAY', 'SMART')";

export async function listYouTubeAdInsights(options?: {
  since?: Date;
  until?: Date;
  limit?: number;
}): Promise<
  { ok: true; rows: GoogleAdsInsightRow[] } | { ok: false; error: string }
> {
  const until = options?.until ?? new Date();
  const since =
    options?.since ?? new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000);

  const query = `
SELECT
  campaign.id,
  campaign.name,
  campaign.advertising_channel_type,
  campaign.status,
  ad_group.id,
  ad_group.name,
  ad_group_ad.ad.id,
  ad_group_ad.ad.name,
  ad_group_ad.status,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions
FROM ad_group_ad
WHERE segments.date BETWEEN '${isoDay(since)}' AND '${isoDay(until)}'
  AND campaign.advertising_channel_type IN ${YOUTUBE_CHANNELS}
  AND campaign.status != 'REMOVED'
`.trim();

  const result = await adsSearch<{
    campaign?: {
      id?: string;
      name?: string;
      advertisingChannelType?: string;
      startDate?: string;
      status?: string;
    };
    adGroup?: { id?: string; name?: string };
    adGroupAd?: {
      status?: string;
      ad?: { id?: string; name?: string };
    };
    metrics?: {
      costMicros?: string;
      impressions?: string;
      clicks?: string;
      conversions?: number;
      videoViews?: string;
    };
  }>(query);
  if (!result.ok) return result;

  const byAd = new Map<string, GoogleAdsInsightRow>();
  for (const row of result.results) {
    const adId = String(row.adGroupAd?.ad?.id ?? "").trim();
    if (!adId) continue;
    const spendMicros = Number(row.metrics?.costMicros ?? 0);
    const impressions = Number(row.metrics?.impressions ?? 0);
    const clicks = Number(row.metrics?.clicks ?? 0);
    const conversions = Number(row.metrics?.conversions ?? 0);
    const videoViews = Number(row.metrics?.videoViews ?? 0);
    const existing = byAd.get(adId);
    if (existing) {
      existing.spendMicros += spendMicros;
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.conversions += conversions;
      existing.videoViews += videoViews;
      continue;
    }
    byAd.set(adId, {
      adId,
      adName: row.adGroupAd?.ad?.name?.trim() || null,
      status: row.adGroupAd?.status ?? row.campaign?.status ?? null,
      campaignId: row.campaign?.id ? String(row.campaign.id) : null,
      campaignName: row.campaign?.name?.trim() || null,
      channelType: row.campaign?.advertisingChannelType ?? null,
      adsetId: row.adGroup?.id ? String(row.adGroup.id) : null,
      adsetName: row.adGroup?.name?.trim() || null,
      youtubeVideoId: null,
      spendMicros,
      impressions,
      clicks,
      conversions,
      videoViews,
      campaignStartDate: row.campaign?.startDate ?? null,
    });
  }

  const rows = [...byAd.values()]
    .sort((a, b) => b.spendMicros - a.spendMicros)
    .slice(0, limit);

  return { ok: true, rows };
}

/**
 * Search, Performance Max, Display & Smart campaigns → GoogleAdsInsightRow[].
 */
export async function listSearchAdInsights(options?: {
  since?: Date;
  until?: Date;
  limit?: number;
}): Promise<
  { ok: true; rows: GoogleAdsInsightRow[] } | { ok: false; error: string }
> {
  const until = options?.until ?? new Date();
  const since =
    options?.since ?? new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000);

  const query = `
SELECT
  campaign.id,
  campaign.name,
  campaign.advertising_channel_type,
  campaign.status,
  ad_group.id,
  ad_group.name,
  ad_group_ad.ad.id,
  ad_group_ad.ad.name,
  ad_group_ad.status,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions
FROM ad_group_ad
WHERE segments.date BETWEEN '${isoDay(since)}' AND '${isoDay(until)}'
  AND campaign.advertising_channel_type IN ${SEARCH_CHANNELS}
  AND campaign.status != 'REMOVED'
`.trim();

  const result = await adsSearch<{
    campaign?: {
      id?: string;
      name?: string;
      advertisingChannelType?: string;
      startDate?: string;
      status?: string;
    };
    adGroup?: { id?: string; name?: string };
    adGroupAd?: {
      status?: string;
      ad?: { id?: string; name?: string };
    };
    metrics?: {
      costMicros?: string;
      impressions?: string;
      clicks?: string;
      conversions?: number;
    };
  }>(query);
  if (!result.ok) return result;

  const byAd = new Map<string, GoogleAdsInsightRow>();
  for (const row of result.results) {
    const adId = String(row.adGroupAd?.ad?.id ?? "").trim();
    if (!adId) continue;
    const spendMicros = Number(row.metrics?.costMicros ?? 0);
    const impressions = Number(row.metrics?.impressions ?? 0);
    const clicks = Number(row.metrics?.clicks ?? 0);
    const conversions = Number(row.metrics?.conversions ?? 0);
    const existing = byAd.get(adId);
    if (existing) {
      existing.spendMicros += spendMicros;
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.conversions += conversions;
      continue;
    }
    byAd.set(adId, {
      adId,
      adName: row.adGroupAd?.ad?.name?.trim() || null,
      status: row.adGroupAd?.status ?? row.campaign?.status ?? null,
      campaignId: row.campaign?.id ? String(row.campaign.id) : null,
      campaignName: row.campaign?.name?.trim() || null,
      channelType: row.campaign?.advertisingChannelType ?? null,
      adsetId: row.adGroup?.id ? String(row.adGroup.id) : null,
      adsetName: row.adGroup?.name?.trim() || null,
      youtubeVideoId: null,
      spendMicros,
      impressions,
      clicks,
      conversions,
      videoViews: 0,
      campaignStartDate: row.campaign?.startDate ?? null,
    });
  }

  const rows = [...byAd.values()]
    .sort((a, b) => b.spendMicros - a.spendMicros)
    .slice(0, limit);

  return { ok: true, rows };
}
