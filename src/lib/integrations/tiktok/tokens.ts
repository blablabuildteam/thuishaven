import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { integrationCredentials } from "@/lib/db/schema";
import { logIntegration } from "@/lib/integrations/log";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const PROVIDER = "tiktok";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
/** Refresh 1 uur voor expiry — access token leeft 24 uur. */
const REFRESH_SKEW_MS = 60 * 60 * 1000;
const LOCK_MS = 30_000;
const WAIT_FOR_OTHER_MS = 15_000;

type StoredTokens = {
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
let memoryTokens: StoredTokens | null = null;

function fromEnv(): StoredTokens {
  return {
    accessToken: process.env.TIKTOK_ACCESS_TOKEN?.trim() || null,
    refreshToken: process.env.TIKTOK_REFRESH_TOKEN?.trim() || null,
    accessExpiresAt: null,
    refreshExpiresAt: null,
  };
}

function rowToStored(
  row: typeof integrationCredentials.$inferSelect,
): StoredTokens {
  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accessExpiresAt: row.accessExpiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
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
  return rows[0] ? rowToStored(rows[0]) : null;
}

async function loadStored(): Promise<StoredTokens> {
  const fromDb = await loadFromDb();
  if (fromDb?.accessToken || fromDb?.refreshToken) return fromDb;
  if (memoryTokens?.accessToken || memoryTokens?.refreshToken) {
    return memoryTokens;
  }

  const env = fromEnv();
  if (env.accessToken || env.refreshToken) {
    try {
      await persistTokens({
        accessToken: env.accessToken,
        refreshToken: env.refreshToken,
      });
    } catch {
      /* tabel bestaat nog niet */
    }
  }
  return env;
}

async function persistTokens(input: {
  accessToken: string | null;
  refreshToken?: string | null;
  expiresIn?: number;
  refreshExpiresIn?: number;
  expectedRefreshToken?: string | null;
}): Promise<boolean> {
  const now = new Date();
  const accessExpiresAt =
    input.expiresIn != null
      ? new Date(now.getTime() + input.expiresIn * 1000)
      : null;
  const refreshExpiresAt =
    input.refreshExpiresIn != null
      ? new Date(now.getTime() + input.refreshExpiresIn * 1000)
      : undefined;

  memoryTokens = {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? memoryTokens?.refreshToken ?? null,
    accessExpiresAt,
    refreshExpiresAt: refreshExpiresAt ?? memoryTokens?.refreshExpiresAt ?? null,
  };

  if (!hasDatabase()) return true;

  const db = getDb();
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

function needsRefresh(stored: StoredTokens): boolean {
  if (!stored.accessToken) return Boolean(stored.refreshToken);
  if (!stored.accessExpiresAt) return Boolean(stored.refreshToken);
  return stored.accessExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;
}

async function refreshHttp(refreshToken: string): Promise<TokenHttpResult> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret) {
    return {
      ok: false,
      error: "TIKTOK_CLIENT_KEY of TIKTOK_CLIENT_SECRET ontbreekt",
      status: 0,
    };
  }

  assertExternalReadOnly("POST", TOKEN_URL, { allowAuthTokenPost: true });

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    error?: string;
    error_description?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      status: res.status,
      error:
        data.error_description ??
        data.message ??
        data.error ??
        `TikTok token refresh HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_expires_in,
  };
}

async function performRefresh(stored: StoredTokens): Promise<string> {
  if (!stored.refreshToken) {
    const msg =
      "TikTok access token is verlopen en er is geen refresh token. Autoriseer opnieuw via Login Kit.";
    await logIntegration({
      source: "tiktok",
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
      source: "tiktok",
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
    if (raced?.accessToken && !needsRefresh(raced)) return raced.accessToken;
    throw new Error(
      "TikTok refresh-token was al verbruikt. Autoriseer opnieuw als de koppeling rood blijft.",
    );
  }

  const exp =
    refreshed.expiresIn != null
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : null;
  await logIntegration({
    source: "tiktok",
    level: "info",
    event: "token.refreshed",
    message: `Access token ververst tot ${exp?.toISOString() ?? "?"}`,
    detail: { accessExpiresAt: exp?.toISOString() ?? null },
    throttleMs: 0,
  });
  return refreshed.accessToken;
}

export async function ensureTikTokAccessToken(options?: {
  force?: boolean;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (refreshInFlight) {
    try {
      const token = await refreshInFlight;
      return { ok: true, token };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "TikTok token refresh mislukt",
      };
    }
  }

  const run = (async () => {
    const stored = await loadStored();
    if (!options?.force && !needsRefresh(stored) && stored.accessToken) {
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
          throw new Error(
            "TikTok token-refresh is bezet. Probeer opnieuw via Bronnen.",
          );
        }
      }

      try {
        const latest = (await loadFromDb()) ?? stored;
        if (!options?.force && !needsRefresh(latest) && latest.accessToken) {
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
      error: e instanceof Error ? e.message : "TikTok token refresh mislukt",
    };
  } finally {
    refreshInFlight = null;
  }
}
