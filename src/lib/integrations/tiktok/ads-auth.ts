import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { integrationCredentials } from "@/lib/db/schema";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const PROVIDER = "tiktok_ads";
const TOKEN_URL =
  "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";

let memoryToken: string | null = null;

export function tiktokAdsAppCredentials(): {
  appId: string;
  secret: string;
} | null {
  const appId = process.env.TIKTOK_ADS_APP_ID?.trim();
  const secret = process.env.TIKTOK_ADS_APP_SECRET?.trim();
  if (!appId || !secret) return null;
  return { appId, secret };
}

export function tiktokAdsAccessToken(): string | null {
  return process.env.TIKTOK_ADS_ACCESS_TOKEN?.trim() || memoryToken;
}

export async function ensureTikTokAdsAccessToken(): Promise<string | null> {
  const fromEnv = process.env.TIKTOK_ADS_ACCESS_TOKEN?.trim();
  if (fromEnv) {
    memoryToken = fromEnv;
    return fromEnv;
  }
  if (memoryToken) return memoryToken;
  if (!hasDatabase()) return null;

  const db = getDb();
  const rows = await db
    .select({ accessToken: integrationCredentials.accessToken })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, PROVIDER))
    .limit(1);
  const stored = rows[0]?.accessToken?.trim() || null;
  if (stored) memoryToken = stored;
  return stored;
}

export async function persistTikTokAdsAccessToken(options: {
  accessToken: string;
  advertiserIds?: string[];
}): Promise<void> {
  memoryToken = options.accessToken;
  if (!hasDatabase()) return;

  const db = getDb();
  const meta = {
    advertiserIds: options.advertiserIds ?? [],
  };
  const existing = await db
    .select({ provider: integrationCredentials.provider })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.provider, PROVIDER))
    .limit(1);

  if (existing[0]) {
    await db
      .update(integrationCredentials)
      .set({
        accessToken: options.accessToken,
        meta,
        updatedAt: new Date(),
      })
      .where(eq(integrationCredentials.provider, PROVIDER));
    return;
  }

  await db.insert(integrationCredentials).values({
    provider: PROVIDER,
    accessToken: options.accessToken,
    meta,
    updatedAt: new Date(),
  });
}

export async function exchangeTikTokAdsAuthCode(authCode: string): Promise<
  | { ok: true; accessToken: string; advertiserIds: string[] }
  | { ok: false; error: string }
> {
  const creds = tiktokAdsAppCredentials();
  if (!creds) {
    return { ok: false, error: "TIKTOK_ADS_APP_ID of TIKTOK_ADS_APP_SECRET ontbreekt" };
  }

  const code = authCode.trim();
  if (!code) return { ok: false, error: "Geen auth_code" };

  assertExternalReadOnly("POST", TOKEN_URL, { allowAuthTokenPost: true });

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: creds.appId,
        secret: creds.secret,
        auth_code: code,
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      code?: number;
      message?: string;
      data?: { access_token?: string; advertiser_ids?: Array<string | number> };
    };
    const accessToken = json.data?.access_token?.trim();
    if (!res.ok || json.code !== 0 || !accessToken) {
      return {
        ok: false,
        error: json.message || `TikTok token HTTP ${res.status}`,
      };
    }
    const advertiserIds = (json.data?.advertiser_ids ?? []).map((id) =>
      String(id),
    );
    await persistTikTokAdsAccessToken({ accessToken, advertiserIds });
    return { ok: true, accessToken, advertiserIds };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "TikTok token exchange mislukt",
    };
  }
}
