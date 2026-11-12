import { createSign } from "node:crypto";

/**
 * Read-only Google Sheets access via a service account (JWT bearer flow).
 * Uses node:crypto instead of googleapis to keep the bundle small.
 *
 * Env: GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY (PEM, "\n"-escaped
 * is fine). The sheet must be shared with the service account as Viewer.
 */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

export type SheetCell = string | number | boolean;

export class GoogleSheetsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleSheetsError";
  }
}

export function hasGoogleSheetsCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim() &&
      process.env.GOOGLE_SHEETS_PRIVATE_KEY?.trim(),
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!email || !key) {
    throw new GoogleSheetsError(
      "GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY ontbreken",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const b64 = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new GoogleSheetsError(
      `Google-login mislukt: ${body.error_description ?? body.error ?? res.status}`,
      res.status,
    );
  }
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    const reason =
      res.status === 403
        ? "geen toegang — is de sheet gedeeld met het service-account?"
        : res.status === 404
          ? "sheet niet gevonden — klopt de sheet-ID?"
          : (body.error?.message ?? `HTTP ${res.status}`);
    throw new GoogleSheetsError(`Google Sheets: ${reason}`, res.status);
  }
  return body;
}

export async function listSheetTabs(spreadsheetId: string): Promise<string[]> {
  const body = await get<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    `${API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
  );
  return (body.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter(Boolean);
}

/**
 * All values of the given tabs. Numbers come back as numbers, dates as the
 * text shown in the sheet (so "01-02-2026" stays a string).
 */
export async function readSheetTabs(
  spreadsheetId: string,
  tabs: string[],
): Promise<Map<string, SheetCell[][]>> {
  const out = new Map<string, SheetCell[][]>();
  if (tabs.length === 0) return out;
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  for (const tab of tabs) {
    params.append("ranges", `'${tab.replace(/'/g, "''")}'`);
  }
  const body = await get<{
    valueRanges?: Array<{ values?: SheetCell[][] }>;
  }>(`${API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`);
  (body.valueRanges ?? []).forEach((range, index) => {
    const tab = tabs[index];
    if (tab) out.set(tab, range.values ?? []);
  });
  return out;
}
