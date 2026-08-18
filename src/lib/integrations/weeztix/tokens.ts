import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { integrationCredentials } from "@/lib/db/schema";
import { logIntegration } from "@/lib/integrations/log";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const AUTH_BASE = "https://auth.weeztix.com";
const PROVIDER = "weeztix";
/** Refresh 1 uur voor expiry — access token leeft ~3 dagen. */
const REFRESH_SKEW_MS = 60 * 60 * 1000;
const LOCK_MS = 30_000;
const WAIT_FOR_OTHER_MS = 15_000;

export type WeeztixStoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: Date | null;
  refreshExpiresAt: Date | null;
};

type TokenHttpResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      refreshExpiresIn?: number;
    }
  | { ok: false; error: string; status: number };

let refreshInFlight: Promise<string> | null = null;

export function jwtExpiry(token: string): Date | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

function fromEnv(): WeeztixStoredTokens {
  const accessToken =
    process.env.WEEZTIX_ACCESS_TOKEN?.trim() ||
    process.env.WEEZTIX_API_KEY?.trim() ||
    null;
  const refreshToken = process.env.WEEZTIX_REFRESH_TOKEN?.trim() || null;
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: accessToken ? jwtExpiry(accessToken) : null,
    refreshExpiresAt: null,
  };
}

function rowToStored(
  row: typeof integrationCredentials.$inferSelect,
): WeeztixStoredTokens {
  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accessExpiresAt: row.accessExpiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
  };
}

async function loadFromDb(): Promise<WeeztixStoredTokens | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, PROVIDER))
    .limit(1);
  return rows[0] ? rowToStored(rows[0]) : null;
}

async function loadStored(): Promise<WeeztixStoredTokens> {
  const fromDb = await loadFromDb();
  if (fromDb?.accessToken || fromDb?.refreshToken) return fromDb;

  const env = fromEnv();
  if (env.accessToken || env.refreshToken) {
    try {
      await persistTokens({
        accessToken: env.accessToken,
        refreshToken: env.refreshToken,
        expiresIn: undefined,
        refreshExpiresIn: undefined,
      });
    } catch {
      /* tabel bestaat nog niet */
    }
  }
  return env;
}

export async function persistWeeztixTokens(input: {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number;
  refreshExpiresIn?: number;
}): Promise<void> {
  await persistTokens(input);
}

async function persistTokens(input: {
  accessToken: string | null;
  refreshToken?: string | null;
  expiresIn?: number;
  refreshExpiresIn?: number;
  expectedRefreshToken?: string | null;
}): Promise<boolean> {
  if (!hasDatabase()) return true;

  const db = getDb();
  const now = new Date();
  const accessExpiresAt =
    input.expiresIn != null
      ? new Date(now.getTime() + input.expiresIn * 1000)
      : input.accessToken
        ? jwtExpiry(input.accessToken)
        : null;
  const refreshExpiresAt =
    input.refreshExpiresIn != null
      ? new Date(now.getTime() + input.refreshExpiresIn * 1000)
      : undefined;

  const existing = await db
    .select({ provider: integrationCredentials.provider })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, PROVIDER))
    .limit(1);

  if (existing[0]) {
    const patch: Partial<typeof integrationCredentials.$inferInsert> = {
      accessToken: input.accessToken,
      accessExpiresAt,
      refreshLockUntil: null,
      updatedAt: now,
    };
    if (input.refreshToken) {
      patch.refreshToken = input.refreshToken;
      if (refreshExpiresAt) patch.refreshExpiresAt = refreshExpiresAt;
    }
    const where =
      input.expectedRefreshToken != null
        ? and(
            eq(integrationCredentials.provider, PROVIDER),
            eq(integrationCredentials.refreshToken, input.expectedRefreshToken),
          )
        : eq(integrationCredentials.provider, PROVIDER);
    const updated = await db
      .update(integrationCredentials)
      .set(patch)
      .where(where)
      .returning({ provider: integrationCredentials.provider });
    return Boolean(updated[0]);
  }

  await db.insert(integrationCredentials).values({
    provider: PROVIDER,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    accessExpiresAt,
    refreshExpiresAt: refreshExpiresAt ?? null,
    refreshLockUntil: null,
    updatedAt: now,
  });
  return true;
}

async function claimRefreshLock(): Promise<boolean> {
  if (!hasDatabase()) return true;
  const db = getDb();
  const now = new Date();
  const until = new Date(now.getTime() + LOCK_MS);
  const claimed = await db
    .update(integrationCredentials)
    .set({ refreshLockUntil: until, updatedAt: now })
    .where(
      and(
        eq(integrationCredentials.provider, PROVIDER),
        or(
          isNull(integrationCredentials.refreshLockUntil),
          lt(integrationCredentials.refreshLockUntil, now),
        ),
      ),
    )
    .returning({ provider: integrationCredentials.provider });
  return Boolean(claimed[0]);
}

async function releaseRefreshLock(): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  await db
    .update(integrationCredentials)
    .set({ refreshLockUntil: null, updatedAt: new Date() })
    .where(eq(integrationCredentials.provider, PROVIDER));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForFreshAccess(): Promise<string | null> {
  const deadline = Date.now() + WAIT_FOR_OTHER_MS;
  while (Date.now() < deadline) {
    await sleep(350);
    const stored = await loadFromDb();
    if (stored?.accessToken && !needsRefresh(stored)) return stored.accessToken;
  }
  return null;
}

async function refreshHttp(refreshToken: string): Promise<TokenHttpResult> {
  const clientId = process.env.WEEZTIX_CLIENT_ID?.trim();
  const clientSecret = process.env.WEEZTIX_CLIENT_SECRET?.trim();
  if (!clientId) {
    return { ok: false, error: "WEEZTIX_CLIENT_ID ontbreekt", status: 0 };
  }

  const url = `${AUTH_BASE}/tokens`;
  assertExternalReadOnly("POST", url, { allowAuthTokenPost: true });

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
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
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      status: res.status,
      error:
        data.message ??
        data.error ??
        `Token refresh HTTP ${res.status} — koppel Weeztix opnieuw via OAuth`,
    };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_token_expires_in,
  };
}

function needsRefresh(stored: WeeztixStoredTokens): boolean {
  if (!stored.accessToken) return Boolean(stored.refreshToken);
  const exp = stored.accessExpiresAt ?? jwtExpiry(stored.accessToken);
  if (!exp) return false;
  return exp.getTime() - Date.now() < REFRESH_SKEW_MS;
}

async function performRefresh(stored: WeeztixStoredTokens): Promise<string> {
  if (!stored.refreshToken) {
    const msg =
      "Weeztix access token is verlopen en er is geen refresh token. Koppel opnieuw via Bronnen → Opnieuw koppelen.";
    await logIntegration({
      source: "weeztix",
      level: "error",
      event: "token.missing_refresh",
      message: msg,
    });
    throw new Error(msg);
  }

  const usedRefresh = stored.refreshToken;
  const refreshed = await refreshHttp(usedRefresh);
  if (!refreshed.ok) {
    await logIntegration({
      source: "weeztix",
      level: "error",
      event: "token.refresh_failed",
      message: refreshed.error,
      detail: { status: refreshed.status },
      throttleMs: 0,
    });
    throw new Error(refreshed.error);
  }

  const saved = await persistTokens({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? usedRefresh,
    expiresIn: refreshed.expiresIn,
    refreshExpiresIn: refreshed.refreshExpiresIn,
    expectedRefreshToken: usedRefresh,
  });

  if (!saved) {
    const raced = await loadFromDb();
    if (raced?.accessToken && !needsRefresh(raced)) {
      await logIntegration({
        source: "weeztix",
        level: "info",
        event: "token.refresh_race_ok",
        message: "Andere instance had al ververst; die token gebruikt.",
      });
      return raced.accessToken;
    }
    const msg =
      "Weeztix refresh-token was al verbruikt door een andere instance. Koppel opnieuw als de koppeling rood blijft.";
    await logIntegration({
      source: "weeztix",
      level: "error",
      event: "token.refresh_cas_failed",
      message: msg,
      throttleMs: 0,
    });
    throw new Error(msg);
  }

  const exp =
    refreshed.expiresIn != null
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : jwtExpiry(refreshed.accessToken);
  await logIntegration({
    source: "weeztix",
    level: "info",
    event: "token.refreshed",
    message: `Access token ververst tot ${exp?.toISOString() ?? "?"}`,
    detail: { accessExpiresAt: exp?.toISOString() ?? null },
    throttleMs: 0,
  });
  return refreshed.accessToken;
}

/**
 * Geldige access token. Refresh-token is éénmalig — nieuwe tokens gaan naar Postgres.
 * Mutex in de database zodat serverless-instances niet dezelfde refresh opeten.
 */
export async function ensureWeeztixAccessToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  if (refreshInFlight) {
    try {
      const token = await refreshInFlight;
      return { ok: true, token };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Weeztix token refresh mislukt",
      };
    }
  }

  const run = (async () => {
    const stored = await loadStored();
    if (!needsRefresh(stored) && stored.accessToken) {
      return stored.accessToken;
    }

    if (hasDatabase()) {
      const claimed = await claimRefreshLock();
      if (!claimed) {
        const waited = await waitForFreshAccess();
        if (waited) return waited;
        const retry = await claimRefreshLock();
        if (!retry) {
          const again = await loadFromDb();
          if (again?.accessToken) return again.accessToken;
          const msg =
            "Weeztix token-refresh is bezet en leverde geen verse token. Probeer opnieuw of koppel via Bronnen.";
          await logIntegration({
            source: "weeztix",
            level: "error",
            event: "token.refresh_lock_timeout",
            message: msg,
          });
          throw new Error(msg);
        }
      }

      try {
        const latest = (await loadFromDb()) ?? stored;
        if (!needsRefresh(latest) && latest.accessToken) {
          await releaseRefreshLock();
          return latest.accessToken;
        }
        return await performRefresh(latest);
      } catch (e) {
        await releaseRefreshLock();
        throw e;
      }
    }

    return performRefresh(stored);
  })();

  refreshInFlight = run;
  try {
    const token = await run;
    return { ok: true, token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Weeztix token refresh mislukt",
    };
  } finally {
    refreshInFlight = null;
  }
}

export async function weeztixTokenStatus(): Promise<{
  hasAccess: boolean;
  hasRefresh: boolean;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  expired: boolean;
  source: "database" | "env";
}> {
  const fromDb = await loadFromDb();
  const stored = fromDb ?? fromEnv();
  const exp =
    stored.accessExpiresAt ??
    (stored.accessToken ? jwtExpiry(stored.accessToken) : null);
  return {
    hasAccess: Boolean(stored.accessToken),
    hasRefresh: Boolean(stored.refreshToken),
    accessExpiresAt: exp?.toISOString() ?? null,
    refreshExpiresAt: stored.refreshExpiresAt?.toISOString() ?? null,
    expired: exp ? exp.getTime() <= Date.now() : !stored.accessToken,
    source: fromDb ? "database" : "env",
  };
}
