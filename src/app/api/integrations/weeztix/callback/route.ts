import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";
import { persistWeeztixTokens } from "@/lib/integrations/weeztix/tokens";
import { logIntegration } from "@/lib/integrations/log";

export const dynamic = "force-dynamic";

/**
 * OAuth callback: wisselt code om voor tokens (POST alleen naar auth.weeztix.com/tokens).
 * Bewaart tokens in Postgres (refresh is éénmalig). Schrijft niets naar Weeztix resources.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");

  if (err) {
    await logIntegration({
      source: "weeztix",
      level: "error",
      event: "oauth.denied",
      message: err,
      throttleMs: 0,
    });
    return htmlPage("Weeztix OAuth mislukt", `<p>${escapeHtml(err)}</p>`);
  }
  if (!code) {
    return htmlPage("Weeztix OAuth", "<p>Geen authorization code ontvangen.</p>");
  }

  const jar = await cookies();
  const expected = jar.get("weeztix_oauth_state")?.value;
  if (!expected || !state || expected !== state) {
    return htmlPage(
      "Weeztix OAuth",
      "<p>State mismatch — start opnieuw via Koppelingen → Weeztix opnieuw koppelen (eerst inloggen als admin).</p>",
    );
  }

  const session = await auth();
  if (session?.user && session.user.role !== "admin") {
    return new NextResponse("Alleen admins", { status: 403 });
  }

  const clientId = process.env.WEEZTIX_CLIENT_ID?.trim();
  const clientSecret = process.env.WEEZTIX_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.WEEZTIX_REDIRECT_URI?.trim() ||
    `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"}/api/integrations/weeztix/callback`;

  if (!clientId) {
    return htmlPage("Weeztix OAuth", "<p>WEEZTIX_CLIENT_ID ontbreekt.</p>");
  }

  const tokenUrl = "https://auth.weeztix.com/tokens";
  assertExternalReadOnly("POST", tokenUrl, { allowAuthTokenPost: true });

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const res = await fetch(tokenUrl, {
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
    const msg = data.message ?? data.error ?? `HTTP ${res.status}`;
    await logIntegration({
      source: "weeztix",
      level: "error",
      event: "oauth.exchange_failed",
      message: msg,
      detail: { status: res.status },
      throttleMs: 0,
    });
    return htmlPage(
      "Token exchange mislukt",
      `<p>${escapeHtml(msg)}</p>`,
    );
  }

  try {
    await persistWeeztixTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      refreshExpiresIn: data.refresh_token_expires_in,
    });
  } catch (e) {
    await logIntegration({
      source: "weeztix",
      level: "error",
      event: "oauth.persist_failed",
      message: e instanceof Error ? e.message : "Databasefout",
      throttleMs: 0,
    });
    return htmlPage(
      "Tokens ontvangen, opslaan mislukt",
      `<p>${escapeHtml(e instanceof Error ? e.message : "Databasefout")}. Probeer opnieuw te koppelen.</p>`,
    );
  }

  await logIntegration({
    source: "weeztix",
    level: "info",
    event: "oauth.connected",
    message: "Weeztix opnieuw gekoppeld via OAuth. Tokens in database opgeslagen.",
    detail: { expiresIn: data.expires_in ?? null },
    throttleMs: 0,
  });

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || ""
  ).trim();
  const dest = `${appUrl || ""}/koppelingen?weeztix=connected`;

  return htmlPage(
    "Weeztix gekoppeld",
    `
    <p>Tokens zijn opgeslagen. Access token verloopt over ~3 dagen; we verversen automatisch (refresh token is éénmalig en staat niet meer in env).</p>
    <p>Expires in: ${data.expires_in ?? "?"} seconden.</p>
    <p><a href="${escapeHtml(dest)}">Terug naar koppelingen</a></p>
    `,
  );
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlPage(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5}</style>
    </head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
