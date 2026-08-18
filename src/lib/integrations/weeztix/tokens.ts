import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { integrationCredentials } from "@/lib/db/schema";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const AUTH_BASE = "https://auth.weeztix.com";
const PROVIDER = "weeztix";
/** Refresh 1 uur voor expiry — access token leeft ~3 dagen. */
const REFRESH_SKEW_MS = 60 * 60 * 1000;

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

async function loadStored(): Promise<WeeztixStoredTokens> {
  if (!hasDatabase()) return fromEnv();

  const db = getDb();
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, PROVIDER))
    .limit(1);
  const row = rows[0];
  if (row?.accessToken || row?.refreshToken) {
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      accessExpiresAt: row.accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
    };
  }

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
}): Promise<void> {
  if (!hasDatabase()) return;

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

  const values = {
    provider: PROVIDER,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    accessExpiresAt,
    ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
    updatedAt: now,
  };

  if (existing[0]) {
    const patch: Partial<typeof integrationCredentials.$inferInsert> = {
      accessToken: input.accessToken,
      accessExpiresAt,
      updatedAt: now,
    };
    if (input.refreshToken) {
      patch.refreshToken = input.refreshToken;
      if (refreshExpiresAt) patch.refreshExpiresAt = refreshExpiresAt;
    }
    await db
      .update(integrationCredentials)
      .set(patch)
      .where(eq(integrationCredentials.provider, PROVIDER));
  } else {
    await db.insert(integrationCredentials).values(values);
  }
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

/**
 * Geldige access token. Refresh-token is éénmalig — nieuwe tokens gaan naar Postgres.
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
    if (!stored.refreshToken) {
      if (stored.accessToken && !needsRefresh(stored)) return stored.accessToken;
      throw new Error(
        "Weeztix access token is verlopen en er is geen refresh token. Koppel opnieuw via /api/integrations/weeztix/oauth/start",
      );
    }

    const refreshed = await refreshHttp(stored.refreshToken);
    if (!refreshed.ok) {
      throw new Error(refreshed.error);
    }

    await persistTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      expiresIn: refreshed.expiresIn,
      refreshExpiresIn: refreshed.refreshExpiresIn,
    });
    return refreshed.accessToken;
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
  expired: boolean;
  source: "database" | "env";
}> {
  const inDb =
    hasDatabase() &&
    Boolean(
      (
        await getDb()
          .select({ provider: integrationCredentials.provider })
          .from(integrationCredentials)
          .where(eq(integrationCredentials.provider, PROVIDER))
          .limit(1)
      )[0],
    );
  const stored = await loadStored();
  const exp = stored.accessExpiresAt ?? (stored.accessToken ? jwtExpiry(stored.accessToken) : null);
  return {
    hasAccess: Boolean(stored.accessToken),
    hasRefresh: Boolean(stored.refreshToken),
    accessExpiresAt: exp?.toISOString() ?? null,
    expired: exp ? exp.getTime() <= Date.now() : !stored.accessToken,
    source: inDb ? "database" : "env",
  };
}
