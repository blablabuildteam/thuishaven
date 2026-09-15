const API = "https://business-api.tiktok.com/open_api/v1.3";
const PAGE_SIZE = 1000;

export function tiktokAdsAccessToken(): string | null {
  return process.env.TIKTOK_ADS_ACCESS_TOKEN?.trim() || null;
}

export function tiktokAdvertiserIdFromEnv(): string | null {
  return process.env.TIKTOK_ADVERTISER_ID?.trim() || null;
}

function adsAppCredentials(): { appId: string; secret: string } | null {
  const appId = process.env.TIKTOK_ADS_APP_ID?.trim();
  const secret = process.env.TIKTOK_ADS_APP_SECRET?.trim();
  if (!appId || !secret) return null;
  return { appId, secret };
}

export function explainTikTokAdsError(message: string, code?: number): string {
  if (
    code === 40105 ||
    /access token is incorrect|has been revoked/i.test(message)
  ) {
    return "TikTok Login Kit-token werkt niet voor ads. Maak een Marketing API-token in TikTok Ads Manager, autoriseer de advertiser, en zet TIKTOK_ADS_ACCESS_TOKEN.";
  }
  if (
    code === 40001 ||
    /no permission|permission error|scope/i.test(message)
  ) {
    return "TikTok Marketing API-token mist ads-rechten. Autoriseer de advertiser opnieuw met reporting-toegang.";
  }
  return message;
}

type AdsEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

async function adsGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: number }> {
  const token = tiktokAdsAccessToken();
  if (!token) {
    return { ok: false, error: "TIKTOK_ADS_ACCESS_TOKEN ontbreekt" };
  }
  const qs = new URLSearchParams(params);
  const url = `${API}${path.startsWith("/") ? path : `/${path}`}?${qs}`;
  try {
    const res = await fetch(url, {
      headers: { "Access-Token": token },
      cache: "no-store",
    });
    const json = (await res.json()) as AdsEnvelope<T>;
    if (!res.ok || json.code !== 0 || json.data == null) {
      const message = json.message || `TikTok Ads HTTP ${res.status}`;
      return {
        ok: false,
        error: explainTikTokAdsError(message, json.code),
        code: json.code,
      };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "TikTok Ads network error",
    };
  }
}

export type TikTokAdvertiser = {
  advertiserId: string;
  name: string;
  currency: string;
  status: string | null;
};

export async function listTikTokAdvertisers(): Promise<
  { ok: true; accounts: TikTokAdvertiser[] } | { ok: false; error: string }
> {
  const creds = adsAppCredentials();
  if (!creds) {
    return {
      ok: false,
      error:
        "Zet TIKTOK_ADVERTISER_ID, of TIKTOK_ADS_APP_ID + TIKTOK_ADS_APP_SECRET om advertisers te listen. Login Kit-credentials tellen niet.",
    };
  }
  const params: Record<string, string> = {
    app_id: creds.appId,
    secret: creds.secret,
  };
  const result = await adsGet<{
    list?: Array<{
      advertiser_id?: string | number;
      advertiser_name?: string;
    }>;
  }>("/oauth2/advertiser/get/", params);
  if (!result.ok) return result;

  const accounts: TikTokAdvertiser[] = [];
  for (const row of result.data.list ?? []) {
    const advertiserId = String(row.advertiser_id ?? "").trim();
    if (!advertiserId) continue;
    accounts.push({
      advertiserId,
      name: row.advertiser_name?.trim() || advertiserId,
      currency: "EUR",
      status: null,
    });
  }
  return { ok: true, accounts };
}

export async function fetchTikTokAdvertiserInfo(
  advertiserId: string,
): Promise<
  { ok: true; account: TikTokAdvertiser } | { ok: false; error: string }
> {
  const result = await adsGet<{
    list?: Array<{
      advertiser_id?: string | number;
      name?: string;
      advertiser_name?: string;
      currency?: string;
      status?: string;
    }>;
  }>("/advertiser/info/", {
    advertiser_ids: JSON.stringify([advertiserId]),
  });
  if (!result.ok) return result;
  const row = result.data.list?.[0];
  if (!row) {
    return { ok: false, error: "Advertiser niet gevonden bij dit token." };
  }
  return {
    ok: true,
    account: {
      advertiserId: String(row.advertiser_id ?? advertiserId),
      name: row.name?.trim() || row.advertiser_name?.trim() || advertiserId,
      currency: row.currency?.trim() || "EUR",
      status: row.status ?? null,
    },
  };
}

export async function resolveTikTokAdvertiser(): Promise<
  { ok: true; account: TikTokAdvertiser } | { ok: false; error: string }
> {
  if (!tiktokAdsAccessToken()) {
    return { ok: false, error: "TIKTOK_ADS_ACCESS_TOKEN ontbreekt" };
  }

  const fromEnv = tiktokAdvertiserIdFromEnv();
  if (fromEnv) {
    const info = await fetchTikTokAdvertiserInfo(fromEnv);
    if (info.ok) return info;
    return {
      ok: true,
      account: {
        advertiserId: fromEnv,
        name: fromEnv,
        currency: "EUR",
        status: null,
      },
    };
  }

  const listed = await listTikTokAdvertisers();
  if (!listed.ok) return listed;
  if (listed.accounts.length === 0) {
    return {
      ok: false,
      error:
        "Geen advertiser zichtbaar. Zet TIKTOK_ADVERTISER_ID of autoriseer het Thuishaven-account in TikTok Ads Manager.",
    };
  }
  const named = listed.accounts.find((a) => /thuishaven/i.test(a.name));
  const picked = named ?? listed.accounts[0]!;
  const info = await fetchTikTokAdvertiserInfo(picked.advertiserId);
  return info.ok ? info : { ok: true, account: picked };
}

export type TikTokAdInsightRow = {
  adId: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  dateStart: string;
  dateStop: string;
};

export type TikTokAdObject = {
  adId: string;
  adName: string | null;
  status: string | null;
  createdAt: Date | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function windows(since: Date, until: Date): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(Date.UTC(
    since.getUTCFullYear(),
    since.getUTCMonth(),
    since.getUTCDate(),
  ));
  const last = new Date(Date.UTC(
    until.getUTCFullYear(),
    until.getUTCMonth(),
    until.getUTCDate(),
  ));
  while (cursor <= last) {
    const end = addDays(cursor, 29);
    out.push({ start: cursor, end: end > last ? last : end });
    cursor = addDays(end, 1);
  }
  return out;
}

type PageInfo = {
  page?: number;
  page_size?: number;
  total_page?: number;
  total_number?: number;
};

async function paginateAdsGet<T>(
  path: string,
  params: Record<string, string>,
  pick: (data: T) => unknown[],
  maxItems: number,
): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: string }> {
  const rows: unknown[] = [];
  let page = 1;
  let totalPage = 1;
  while (page <= totalPage && rows.length < maxItems) {
    const result = await adsGet<T & { page_info?: PageInfo }>(path, {
      ...params,
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (!result.ok) return result;
    const batch = pick(result.data) ?? [];
    rows.push(...batch);
    totalPage = result.data.page_info?.total_page ?? page;
    page += 1;
    if (batch.length === 0) break;
  }
  return { ok: true, rows: rows.slice(0, maxItems) };
}

async function fetchReportWindow(
  advertiserId: string,
  start: string,
  end: string,
  maxItems: number,
  metrics = ["spend", "impressions", "clicks", "reach"],
): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: string }> {
  const listed = await paginateAdsGet<{
    list?: unknown[];
    page_info?: PageInfo;
  }>(
    "/report/integrated/get/",
    {
      advertiser_id: advertiserId,
      report_type: "BASIC",
      service_type: "AUCTION",
      data_level: "AUCTION_AD",
      dimensions: JSON.stringify(["ad_id"]),
      metrics: JSON.stringify(metrics),
      start_date: start,
      end_date: end,
      query_lifetime: "false",
    },
    (data) => data.list ?? [],
    maxItems,
  );
  if (
    !listed.ok &&
    metrics.includes("reach") &&
    /reach|metric/i.test(listed.error)
  ) {
    return fetchReportWindow(
      advertiserId,
      start,
      end,
      maxItems,
      ["spend", "impressions", "clicks"],
    );
  }
  return listed;
}

export async function listTikTokAdInsights(options: {
  advertiserId: string;
  since: Date;
  until?: Date;
  limit?: number;
}): Promise<
  { ok: true; rows: TikTokAdInsightRow[] } | { ok: false; error: string }
> {
  const until = options.until ?? new Date();
  const maxItems = Math.min(Math.max(options.limit ?? 500, 1), 500);
  const merged = new Map<string, TikTokAdInsightRow>();

  for (const range of windows(options.since, until)) {
    const start = isoDay(range.start);
    const end = isoDay(range.end);
    const listed = await fetchReportWindow(
      options.advertiserId,
      start,
      end,
      maxItems,
    );
    if (!listed.ok) return listed;

    for (const raw of listed.rows) {
      const row = raw as Record<string, unknown> & {
        metrics?: Record<string, string | number | undefined>;
        dimensions?: { ad_id?: string };
      };
      const adId = String(
        row.dimensions?.ad_id ?? row.ad_id ?? "",
      ).trim();
      if (!adId) continue;
      const prev = merged.get(adId);
      const spend = Number(row.metrics?.spend ?? row.spend ?? 0) || 0;
      const impressions = Math.round(
        Number(row.metrics?.impressions ?? row.impressions ?? 0) || 0,
      );
      const reach = Math.round(
        Number(row.metrics?.reach ?? row.reach ?? 0) || 0,
      );
      const clicks = Math.round(
        Number(row.metrics?.clicks ?? row.clicks ?? 0) || 0,
      );
      if (!prev) {
        merged.set(adId, {
          adId,
          spend,
          impressions,
          reach,
          clicks,
          dateStart: start,
          dateStop: end,
        });
        continue;
      }
      prev.spend += spend;
      prev.impressions += impressions;
      prev.reach += reach;
      prev.clicks += clicks;
      if (start < prev.dateStart) prev.dateStart = start;
      if (end > prev.dateStop) prev.dateStop = end;
    }
  }

  return { ok: true, rows: [...merged.values()].slice(0, maxItems) };
}

export async function listTikTokAds(options: {
  advertiserId: string;
  limit?: number;
}): Promise<{ ok: true; ads: TikTokAdObject[] } | { ok: false; error: string }> {
  const maxItems = Math.min(Math.max(options.limit ?? 500, 1), 500);
  const [ads, campaigns, adgroups] = await Promise.all([
    paginateAdsGet<{
      list?: Array<{
        ad_id?: string | number;
        ad_name?: string;
        operation_status?: string;
        create_time?: string;
        campaign_id?: string | number;
        adgroup_id?: string | number;
      }>;
      page_info?: PageInfo;
    }>(
      "/ad/get/",
      {
        advertiser_id: options.advertiserId,
        fields: JSON.stringify([
          "ad_id",
          "ad_name",
          "operation_status",
          "create_time",
          "campaign_id",
          "adgroup_id",
        ]),
      },
      (data) => data.list ?? [],
      maxItems,
    ),
    paginateAdsGet<{
      list?: Array<{
        campaign_id?: string | number;
        campaign_name?: string;
      }>;
      page_info?: PageInfo;
    }>(
      "/campaign/get/",
      {
        advertiser_id: options.advertiserId,
        fields: JSON.stringify(["campaign_id", "campaign_name"]),
      },
      (data) => data.list ?? [],
      maxItems,
    ),
    paginateAdsGet<{
      list?: Array<{
        adgroup_id?: string | number;
        adgroup_name?: string;
      }>;
      page_info?: PageInfo;
    }>(
      "/adgroup/get/",
      {
        advertiser_id: options.advertiserId,
        fields: JSON.stringify(["adgroup_id", "adgroup_name"]),
      },
      (data) => data.list ?? [],
      maxItems,
    ),
  ]);

  if (!ads.ok) return ads;
  const campaignName = new Map<string, string>();
  if (campaigns.ok) {
    for (const raw of campaigns.rows) {
      const row = raw as { campaign_id?: string | number; campaign_name?: string };
      const id = String(row.campaign_id ?? "").trim();
      if (id && row.campaign_name) campaignName.set(id, row.campaign_name);
    }
  }
  const adgroupName = new Map<string, string>();
  if (adgroups.ok) {
    for (const raw of adgroups.rows) {
      const row = raw as { adgroup_id?: string | number; adgroup_name?: string };
      const id = String(row.adgroup_id ?? "").trim();
      if (id && row.adgroup_name) adgroupName.set(id, row.adgroup_name);
    }
  }

  return {
    ok: true,
    ads: ads.rows
      .map((raw) => {
        const row = raw as {
          ad_id?: string | number;
          ad_name?: string;
          operation_status?: string;
          create_time?: string;
          campaign_id?: string | number;
          adgroup_id?: string | number;
        };
        const adId = String(row.ad_id ?? "").trim();
        if (!adId) return null;
        const createdAt = row.create_time ? new Date(row.create_time) : null;
        const campaignId = row.campaign_id
          ? String(row.campaign_id)
          : null;
        const adsetId = row.adgroup_id ? String(row.adgroup_id) : null;
        return {
          adId,
          adName: row.ad_name?.trim() || null,
          status: row.operation_status?.trim() || null,
          createdAt:
            createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
          campaignId,
          campaignName: campaignId
            ? campaignName.get(campaignId) ?? null
            : null,
          adsetId,
          adsetName: adsetId ? adgroupName.get(adsetId) ?? null : null,
        };
      })
      .filter((row): row is TikTokAdObject => row != null),
  };
}
