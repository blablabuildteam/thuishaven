import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";

export const dynamic = "force-dynamic";

/**
 * OAuth callback: wisselt code om voor tokens (POST alleen naar auth.weeztix.com/tokens).
 * Toont tokens één keer aan admin om in .env.local / Vercel te zetten.
 * Schrijft niets naar Weeztix resources.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");

  if (err) {
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
      "<p>State mismatch — start opnieuw via /api/integrations/weeztix/oauth/start (eerst inloggen als admin).</p>",
    );
  }

  // Optioneel: liever ingelogd, maar code mag niet verloren gaan
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
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.access_token) {
    return htmlPage(
      "Token exchange mislukt",
      `<pre>${escapeHtml(JSON.stringify(data, null, 2) || `HTTP ${res.status}`)}</pre>`,
    );
  }

  const lines = [
    `WEEZTIX_ACCESS_TOKEN=${data.access_token}`,
    data.refresh_token ? `WEEZTIX_REFRESH_TOKEN=${data.refresh_token}` : null,
  ].filter(Boolean);

  return htmlPage(
    "Weeztix tokens — read-only klaar",
    `
    <p>Kopieer deze regels naar <code>.env.local</code> (en daarna naar Vercel). Deel ze niet in chat.</p>
    <pre style="white-space:pre-wrap;word-break:break-all;background:#111;color:#eee;padding:12px;border-radius:4px">${escapeHtml(lines.join("\n"))}</pre>
    <p>Expires in: ${data.expires_in ?? "?"} seconden. Daarna refresh_token gebruiken.</p>
    <p><a href="/koppelingen">Terug naar koppelingen</a></p>
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
