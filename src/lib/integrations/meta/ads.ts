import { ensureMetaAccessToken, explainMetaError } from "@/lib/integrations/meta/tokens";
import { SOCIAL_SYNC_MAX_ITEMS } from "@/lib/integrations/social/sync-window";

const DEFAULT_VERSION = "v21.0";

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_VERSION;
}

export function metaAdAccountIdFromEnv(): string | null {
  const raw = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!raw) return null;
  return raw.replace(/^act_/i, "");
}

export function explainMetaAdsError(message: string, code?: number): string {
  if (
    code === 200 ||
    /missing permission|not enough permission|ads_read|ads_management|unsupported get request/i.test(
      message,
    )
  ) {
    return "Meta-token heeft geen ads_read. Voeg ads_read toe aan system user “thuishaven-dashboard” in Business Settings, wijs het advertentieaccount toe, en plak daarna dezelfde token opnieuw.";
  }
  return explainMetaError(message, code);
}

type GraphError = { message?: string; type?: string; code?: number };

type GraphPage<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
};

async function graphGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: number }> {
  const ensured = await ensureMetaAccessToken();
  if (!ensured.ok) return { ok: false, error: ensured.error };
  const token = ensured.token;

  const qs = new URLSearchParams({ ...params, access_token: token });
  const version = metaGraphVersion();
  const url = `https://graph.facebook.com/${version}/${path.replace(/^\//, "")}?${qs}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as T & { error?: GraphError };
    if (!res.ok || json.error?.message) {
      const message = json.error?.message ?? `Meta HTTP ${res.status}`;
      return {
        ok: false,
        error: explainMetaAdsError(message, json.error?.code),
        code: json.error?.code,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Meta network error",
    };
  }
}

export type MetaAdAccount = {
  id: string;
  accountId: string;
  name: string;
  status: number | null;
  currency: string;
  amountSpent: number;
};

export async function listMetaAdAccounts(): Promise<
  { ok: true; accounts: MetaAdAccount[] } | { ok: false; error: string }
> {
  const result = await graphGet<
    GraphPage<{
      id?: string;
      account_id?: string;
      name?: string;
      account_status?: number;
      currency?: string;
      amount_spent?: string;
    }>
  >("me/adaccounts", {
    fields: "id,account_id,name,account_status,currency,amount_spent",
    limit: "50",
  });
  if (!result.ok) return result;

  const accounts = (result.data.data ?? [])
    .map((row) => {
      const accountId = (row.account_id ?? row.id ?? "")
        .replace(/^act_/i, "")
        .trim();
      if (!accountId) return null;
      return {
        id: row.id?.startsWith("act_") ? row.id : `act_${accountId}`,
        accountId,
        name: row.name?.trim() || accountId,
        status: row.account_status ?? null,
        currency: row.currency?.trim() || "EUR",
        amountSpent: Number(row.amount_spent ?? 0) || 0,
      };
    })
    .filter((row): row is MetaAdAccount => row != null);

  return { ok: true, accounts };
}

export async function resolveMetaAdAccount(): Promise<
  { ok: true; account: MetaAdAccount } | { ok: false; error: string }
> {
  const fromEnv = metaAdAccountIdFromEnv();
  const listed = await listMetaAdAccounts();
  if (!listed.ok) {
    if (fromEnv) {
      return {
        ok: true,
        account: {
          id: `act_${fromEnv}`,
          accountId: fromEnv,
          name: fromEnv,
          status: null,
          currency: "EUR",
          amountSpent: 0,
        },
      };
    }
    return listed;
  }

  if (fromEnv) {
    const match = listed.accounts.find((a) => a.accountId === fromEnv);
    if (match) return { ok: true, account: match };
    return {
      ok: true,
      account: {
        id: `act_${fromEnv}`,
        accountId: fromEnv,
        name: fromEnv,
        status: null,
        currency: listed.accounts[0]?.currency ?? "EUR",
        amountSpent: 0,
      },
    };
  }

  if (listed.accounts.length === 0) {
    return {
      ok: false,
      error:
        "Geen advertentieaccounts zichtbaar. Wijs het Thuishaven ad account toe aan system user “thuishaven-dashboard”.",
    };
  }

  const named = listed.accounts.find((a) =>
    /thuishaven/i.test(a.name),
  );
  const active = listed.accounts.find((a) => a.status === 1);
  return { ok: true, account: named ?? active ?? listed.accounts[0]! };
}

export type MetaAdInsightRow = {
  adId: string;
  adName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  /** Meta `purchase` action only — omni/pixel aliases count the same event. */
  purchases: number;
  currency: string | null;
  dateStart: string | null;
  dateStop: string | null;
};

function purchaseCount(
  actions: Array<{ action_type?: string; value?: string }> | undefined,
): number {
  const raw = actions?.find((action) => action.action_type === "purchase")
    ?.value;
  const n = Math.round(Number(raw ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type MetaAdObject = {
  adId: string;
  adName: string | null;
  status: string | null;
  createdAt: Date | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function paginateGraph<T>(
  path: string,
  params: Record<string, string>,
  maxItems: number,
): Promise<{ ok: true; rows: T[] } | { ok: false; error: string }> {
  const rows: T[] = [];
  let after: string | undefined;

  while (rows.length < maxItems) {
    const pageSize = Math.min(100, maxItems - rows.length);
    const pageParams: Record<string, string> = {
      ...params,
      limit: String(pageSize),
    };
    if (after) pageParams.after = after;

    const result = await graphGet<GraphPage<T>>(path, pageParams);
    if (!result.ok) return result;

    const page = result.data.data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    after = result.data.paging?.cursors?.after;
    if (!after || !result.data.paging?.next) break;
  }

  return { ok: true, rows };
}

export async function listMetaAdInsights(options: {
  actId: string;
  since: Date;
  until?: Date;
  limit?: number;
}): Promise<
  { ok: true; rows: MetaAdInsightRow[] } | { ok: false; error: string }
> {
  const maxItems = Math.min(
    Math.max(options.limit ?? SOCIAL_SYNC_MAX_ITEMS, 1),
    SOCIAL_SYNC_MAX_ITEMS,
  );
  const until = options.until ?? new Date();
  const listed = await paginateGraph<{
    ad_id?: string;
    ad_name?: string;
    adset_id?: string;
    adset_name?: string;
    campaign_id?: string;
    campaign_name?: string;
    spend?: string;
    impressions?: string;
    reach?: string;
    clicks?: string;
    account_currency?: string;
    date_start?: string;
    date_stop?: string;
    actions?: Array<{ action_type?: string; value?: string }>;
  }>(
    `${encodeURIComponent(options.actId)}/insights`,
    {
      level: "ad",
      fields:
        "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions,account_currency,date_start,date_stop",
      time_range: JSON.stringify({
        since: isoDay(options.since),
        until: isoDay(until),
      }),
    },
    maxItems,
  );
  if (!listed.ok) return listed;

  return {
    ok: true,
    rows: listed.rows
      .map((row) => {
        const adId = row.ad_id?.trim();
        if (!adId) return null;
        return {
          adId,
          adName: row.ad_name?.trim() || null,
          adsetId: row.adset_id?.trim() || null,
          adsetName: row.adset_name?.trim() || null,
          campaignId: row.campaign_id?.trim() || null,
          campaignName: row.campaign_name?.trim() || null,
          spend: Number(row.spend ?? 0) || 0,
          impressions: Math.round(Number(row.impressions ?? 0) || 0),
          reach: Math.round(Number(row.reach ?? 0) || 0),
          clicks: Math.round(Number(row.clicks ?? 0) || 0),
          purchases: purchaseCount(row.actions),
          currency: row.account_currency?.trim() || null,
          dateStart: row.date_start ?? null,
          dateStop: row.date_stop ?? null,
        };
      })
      .filter((row): row is MetaAdInsightRow => row != null),
  };
}

export async function listMetaAds(options: {
  actId: string;
  limit?: number;
}): Promise<{ ok: true; ads: MetaAdObject[] } | { ok: false; error: string }> {
  const maxItems = Math.min(
    Math.max(options.limit ?? SOCIAL_SYNC_MAX_ITEMS, 1),
    SOCIAL_SYNC_MAX_ITEMS,
  );
  const listed = await paginateGraph<{
    id?: string;
    name?: string;
    effective_status?: string;
    created_time?: string;
    campaign?: { id?: string; name?: string };
    adset?: { id?: string; name?: string };
    creative?: {
      thumbnail_url?: string;
      image_url?: string;
      instagram_permalink_url?: string;
    };
  }>(
    `${encodeURIComponent(options.actId)}/ads`,
    {
      fields:
        "id,name,effective_status,created_time,campaign{id,name},adset{id,name},creative{thumbnail_url,image_url,instagram_permalink_url}",
    },
    maxItems,
  );
  if (!listed.ok) return listed;

  return {
    ok: true,
    ads: listed.rows
      .map((row) => {
        const adId = row.id?.trim();
        if (!adId) return null;
        const createdAt = row.created_time ? new Date(row.created_time) : null;
        return {
          adId,
          adName: row.name?.trim() || null,
          status: row.effective_status?.trim() || null,
          createdAt:
            createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
          campaignId: row.campaign?.id?.trim() || null,
          campaignName: row.campaign?.name?.trim() || null,
          adsetId: row.adset?.id?.trim() || null,
          adsetName: row.adset?.name?.trim() || null,
          permalink: row.creative?.instagram_permalink_url?.trim() || null,
          thumbnailUrl:
            row.creative?.thumbnail_url?.trim() ||
            row.creative?.image_url?.trim() ||
            null,
        };
      })
      .filter((row): row is MetaAdObject => row != null),
  };
}
