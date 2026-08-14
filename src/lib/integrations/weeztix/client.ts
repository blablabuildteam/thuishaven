import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const DEFAULT_API = "https://api.weeztix.com";
const AUTH_BASE = "https://auth.weeztix.com";

export type WeeztixConfig = {
  apiUrl: string;
  accessToken: string;
  companyGuid?: string;
};

export function getWeeztixConfig(): WeeztixConfig | { error: string } {
  const accessToken =
    process.env.WEEZTIX_ACCESS_TOKEN?.trim() ||
    process.env.WEEZTIX_API_KEY?.trim();
  if (!accessToken) {
    return {
      error:
        "WEEZTIX_ACCESS_TOKEN (of legacy WEEZTIX_API_KEY) ontbreekt — OAuth access token",
    };
  }
  return {
    apiUrl: (process.env.WEEZTIX_API_URL || DEFAULT_API).replace(/\/$/, ""),
    accessToken,
    companyGuid: process.env.WEEZTIX_COMPANY_GUID?.trim() || undefined,
  };
}

type WeeztixFetchOptions = {
  path: string;
  searchParams?: Record<string, string | undefined>;
  /** Override company header for this call */
  companyGuid?: string | null;
};

/**
 * Alleen GET naar api.weeztix.com.
 * Schrijfacties gooien ReadOnlyViolationError.
 */
export async function weeztixGet<T = unknown>(
  options: WeeztixFetchOptions,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  const cfg = getWeeztixConfig();
  if ("error" in cfg) {
    return { ok: false, error: cfg.error, status: 0 };
  }

  const url = new URL(
    options.path.startsWith("http")
      ? options.path
      : `${cfg.apiUrl}${options.path.startsWith("/") ? "" : "/"}${options.path}`,
  );
  if (options.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }

  assertExternalReadOnly("GET", url.toString());

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${cfg.accessToken}`,
  };
  const company =
    options.companyGuid === null
      ? undefined
      : (options.companyGuid ?? cfg.companyGuid);
  if (company) headers.Company = company;

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Weeztix HTTP ${res.status}: ${typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : text.slice(0, 200)}`,
      };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

/** Token-validatie via auth host (GET). */
export async function weeztixWhoAmI(): Promise<
  | {
      ok: true;
      user: {
        guid?: string;
        email?: string;
        default_company?: string;
        companies?: unknown;
      };
    }
  | { ok: false; error: string; status: number }
> {
  const cfg = getWeeztixConfig();
  if ("error" in cfg) return { ok: false, error: cfg.error, status: 0 };

  const url = `${AUTH_BASE}/users/me`;
  assertExternalReadOnly("GET", url);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${cfg.accessToken}`,
    };
    if (cfg.companyGuid) headers.Company = cfg.companyGuid;

    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Auth HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      user: {
        guid: typeof data.guid === "string" ? data.guid : undefined,
        email: typeof data.email === "string" ? data.email : undefined,
        default_company:
          typeof data.default_company === "string"
            ? data.default_company
            : undefined,
        companies: data.companies,
      },
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

/**
 * Vernieuw access token via refresh_token.
 * Enige toegestane POST: auth.weeztix.com/tokens (geen event/order mutatie).
 */
export async function weeztixRefreshAccessToken(): Promise<
  | { ok: true; accessToken: string; expiresIn?: number }
  | { ok: false; error: string }
> {
  const refresh = process.env.WEEZTIX_REFRESH_TOKEN?.trim();
  const clientId = process.env.WEEZTIX_CLIENT_ID?.trim();
  const clientSecret = process.env.WEEZTIX_CLIENT_SECRET?.trim();
  if (!refresh || !clientId) {
    return {
      ok: false,
      error: "WEEZTIX_REFRESH_TOKEN + WEEZTIX_CLIENT_ID nodig voor refresh",
    };
  }

  const url = `${AUTH_BASE}/tokens`;
  assertExternalReadOnly("POST", url, { allowAuthTokenPost: true });

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: clientId,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: data.error ?? `Token refresh HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

export type WeeztixEvent = {
  guid?: string;
  name?: string;
  type?: string;
  start?: string;
  end?: string;
  company_id?: string;
  description?: string;
  [key: string]: unknown;
};

function asEventList(data: unknown): WeeztixEvent[] {
  if (Array.isArray(data)) return data as WeeztixEvent[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["data", "events", "items", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as WeeztixEvent[];
    }
  }
  return [];
}

/** Read-only: lijst events voor company. */
export async function listWeeztixEvents(): Promise<
  | { ok: true; events: WeeztixEvent[]; raw: unknown }
  | { ok: false; error: string; status: number }
> {
  const res = await weeztixGet<unknown>({ path: "/event" });
  if (!res.ok) return res;
  return { ok: true, events: asEventList(res.data), raw: res.data };
}

export async function getWeeztixEvent(guid: string): Promise<
  | { ok: true; event: WeeztixEvent }
  | { ok: false; error: string; status: number }
> {
  const res = await weeztixGet<WeeztixEvent>({ path: `/event/${guid}` });
  if (!res.ok) return res;
  return { ok: true, event: res.data };
}

export type WeeztixTicketType = {
  guid?: string;
  name?: string;
  min_price?: number;
  available_stock?: number;
  sold_count?: number;
  scanned_count?: number;
  status?: string;
  [key: string]: unknown;
};

/** Read-only: tickettypes + sold_count per event. */
export async function listWeeztixEventTickets(eventGuid: string): Promise<
  | { ok: true; tickets: WeeztixTicketType[] }
  | { ok: false; error: string; status: number }
> {
  const res = await weeztixGet<unknown>({
    path: `/event/${eventGuid}/ticket`,
  });
  if (!res.ok) return res;
  const tickets = Array.isArray(res.data)
    ? (res.data as WeeztixTicketType[])
    : [];
  return { ok: true, tickets };
}

/** Read-only dashboard statistics voor event (indien beschikbaar). */
export async function getWeeztixEventStatistics(eventGuid?: string): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string; status: number }
> {
  const path = eventGuid
    ? `/statistics/dashboard/${eventGuid}`
    : "/statistics/dashboard";
  return weeztixGet({ path });
}
