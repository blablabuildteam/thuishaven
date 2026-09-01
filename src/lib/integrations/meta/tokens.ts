import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { integrationCredentials } from "@/lib/db/schema";
import { logIntegration } from "@/lib/integrations/log";

const PROVIDER = "instagram";
const GRAPH = "https://graph.facebook.com";
/** Exchange again when fewer than 7 days remain (long-lived tokens last ~60 days). */
const REFRESH_SKEW_MS = 7 * 24 * 60 * 60 * 1000;

type StoredTokens = {
  accessToken: string | null;
  accessExpiresAt: Date | null;
};

type ExchangeResult =
  | { ok: true; accessToken: string; expiresIn?: number }
  | { ok: false; error: string; status: number };

let refreshInFlight: Promise<string> | null = null;
let memoryTokens: StoredTokens | null = null;

export function explainMetaError(message: string, code?: number): string {
  if (/cannot get application info/i.test(message) || code === 101) {
    return "META_APP_ID of META_APP_SECRET wordt geweigerd. Vernieuw het app secret in developers.facebook.com.";
  }
  if (/api access blocked/i.test(message) || code === 200) {
    return "Meta blokkeert deze app/token. Check Business Verification en app-modus, daarna een nieuw long-lived token plakken.";
  }
  if (
    /session has expired|has expired|code 190|invalid oauth/i.test(message) ||
    code === 190
  ) {
    return "Meta access token is verlopen. Plak een nieuw long-lived of system-user token in META_ACCESS_TOKEN.";
  }
  return message;
}

function graphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
}

function appCredentials(): { appId: string; appSecret: string } | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

function fromEnv(): StoredTokens {
  return {
    accessToken: process.env.META_ACCESS_TOKEN?.trim() || null,
    accessExpiresAt: null,
  };
}

async function loadFromDb(): Promise<StoredTokens | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, PROVIDER))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: row.accessToken,
    accessExpiresAt: row.accessExpiresAt,
  };
}

async function loadStored(): Promise<StoredTokens> {
  const fromDb = await loadFromDb();
  if (fromDb?.accessToken) return fromDb;
  if (memoryTokens?.accessToken) return memoryTokens;

  const env = fromEnv();
  if (env.accessToken) {
    try {
      await persistTokens({ accessToken: env.accessToken });
    } catch {
      /* tabel bestaat nog niet */
    }
  }
  return env;
}

async function persistTokens(input: {
  accessToken: string;
  expiresIn?: number;
  expiresAt?: Date | null;
}): Promise<void> {
  const now = new Date();
  const accessExpiresAt =
    input.expiresAt ??
    (input.expiresIn != null
      ? new Date(now.getTime() + input.expiresIn * 1000)
      : null);

  memoryTokens = { accessToken: input.accessToken, accessExpiresAt };

  if (!hasDatabase()) return;
  const db = getDb();
  const existing = await db
    .select({ provider: integrationCredentials.provider })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, PROVIDER))
    .limit(1);

  const patch = {
    accessToken: input.accessToken,
    accessExpiresAt,
    refreshLockUntil: null,
    updatedAt: now,
  };

  if (existing[0]) {
    await db
      .update(integrationCredentials)
      .set(patch)
      .where(eq(integrationCredentials.provider, PROVIDER));
    return;
  }

  await db.insert(integrationCredentials).values({
    provider: PROVIDER,
    ...patch,
  });
}

function needsRefresh(stored: StoredTokens): boolean {
  if (!stored.accessToken) return false;
  if (!stored.accessExpiresAt) return true;
  if (stored.accessExpiresAt.getTime() === 0) return false;
  return stored.accessExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;
}

async function debugToken(token: string): Promise<{
  ok: boolean;
  isValid?: boolean;
  expiresAt?: Date | null;
  neverExpires?: boolean;
  error?: string;
  code?: number;
}> {
  const creds = appCredentials();
  if (!creds) return { ok: false, error: "META_APP_ID of META_APP_SECRET ontbreekt" };

  const qs = new URLSearchParams({
    input_token: token,
    access_token: `${creds.appId}|${creds.appSecret}`,
  });
  const res = await fetch(`${GRAPH}/${graphVersion()}/debug_token?${qs}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as {
    data?: {
      is_valid?: boolean;
      expires_at?: number;
      error?: { message?: string; code?: number };
    };
    error?: { message?: string; code?: number };
  };
  const err = json.error ?? json.data?.error;
  if (!res.ok || err?.message) {
    return {
      ok: false,
      error: explainMetaError(err?.message ?? `debug_token HTTP ${res.status}`, err?.code),
      code: err?.code,
    };
  }
  const expiresUnix = json.data?.expires_at;
  const neverExpires = expiresUnix === 0;
  return {
    ok: true,
    isValid: json.data?.is_valid === true,
    neverExpires,
    expiresAt: neverExpires
      ? new Date(0)
      : typeof expiresUnix === "number"
        ? new Date(expiresUnix * 1000)
        : null,
  };
}

async function exchangeLongLived(token: string): Promise<ExchangeResult> {
  const creds = appCredentials();
  if (!creds) {
    return {
      ok: false,
      error: "META_APP_ID of META_APP_SECRET ontbreekt — token kan niet verlengd worden",
      status: 0,
    };
  }

  const qs = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: creds.appId,
    client_secret: creds.appSecret,
    fb_exchange_token: token,
  });
  const res = await fetch(
    `${GRAPH}/${graphVersion()}/oauth/access_token?${qs}`,
    { cache: "no-store" },
  );
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || !json.access_token) {
    return {
      ok: false,
      status: res.status,
      error: explainMetaError(
        json.error?.message ?? `Meta token exchange HTTP ${res.status}`,
        json.error?.code,
      ),
    };
  }
  return {
    ok: true,
    accessToken: json.access_token,
    expiresIn: json.expires_in,
  };
}

async function refreshStored(stored: StoredTokens): Promise<string> {
  if (!stored.accessToken) {
    throw new Error("META_ACCESS_TOKEN ontbreekt");
  }

  const inspected = await debugToken(stored.accessToken);
  if (inspected.ok && inspected.neverExpires && inspected.isValid) {
    await persistTokens({
      accessToken: stored.accessToken,
      expiresAt: new Date(0),
    });
    return stored.accessToken;
  }
  if (inspected.ok && inspected.isValid && inspected.expiresAt) {
    const msLeft = inspected.expiresAt.getTime() - Date.now();
    if (msLeft >= REFRESH_SKEW_MS) {
      await persistTokens({
        accessToken: stored.accessToken,
        expiresAt: inspected.expiresAt,
      });
      return stored.accessToken;
    }
  }

  const exchanged = await exchangeLongLived(stored.accessToken);
  if (!exchanged.ok) {
    await logIntegration({
      source: "instagram",
      level: "error",
      event: "token.refresh_failed",
      message: exchanged.error,
      detail: { status: exchanged.status },
      throttleMs: 0,
    });
    if (stored.accessExpiresAt && stored.accessExpiresAt.getTime() > Date.now()) {
      return stored.accessToken;
    }
    throw new Error(exchanged.error);
  }

  await persistTokens({
    accessToken: exchanged.accessToken,
    expiresIn: exchanged.expiresIn,
  });
  const exp =
    exchanged.expiresIn != null
      ? new Date(Date.now() + exchanged.expiresIn * 1000)
      : null;
  await logIntegration({
    source: "instagram",
    level: "info",
    event: "token.refreshed",
    message: `Long-lived Meta token tot ${exp?.toISOString() ?? "?"}`,
    detail: { accessExpiresAt: exp?.toISOString() ?? null },
    throttleMs: 0,
  });
  return exchanged.accessToken;
}

export async function ensureMetaAccessToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  if (refreshInFlight) {
    try {
      return { ok: true, token: await refreshInFlight };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Meta token refresh mislukt",
      };
    }
  }

  const run = (async () => {
    const stored = await loadStored();
    if (!stored.accessToken) {
      throw new Error("META_ACCESS_TOKEN ontbreekt");
    }
    if (!needsRefresh(stored)) return stored.accessToken;
    return refreshStored(stored);
  })();

  refreshInFlight = run;
  try {
    return { ok: true, token: await run };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Meta token refresh mislukt",
    };
  } finally {
    refreshInFlight = null;
  }
}
