import { NextResponse } from "next/server";
import { exchangeTikTokAdsAuthCode } from "@/lib/integrations/tiktok/ads-auth";
import { logIntegration } from "@/lib/integrations/log";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/tiktok-ads/callback
 * TikTok Marketing API advertiser auth → long-term access token.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const err = searchParams.get("error");
  const authCode =
    searchParams.get("auth_code")?.trim() ||
    searchParams.get("code")?.trim() ||
    "";

  if (err) {
    await logIntegration({
      source: "tiktok_ads",
      level: "error",
      event: "oauth.denied",
      message: err,
      throttleMs: 0,
    }).catch(() => null);
    return htmlPage("TikTok ads OAuth mislukt", `<p>${escapeHtml(err)}</p>`);
  }

  if (!authCode) {
    return htmlPage(
      "TikTok ads OAuth",
      "<p>Geen auth_code ontvangen. Start opnieuw via de Advertiser authorization URL in My Apps.</p>",
    );
  }

  const result = await exchangeTikTokAdsAuthCode(authCode);
  if (!result.ok) {
    await logIntegration({
      source: "tiktok_ads",
      level: "error",
      event: "oauth.exchange_failed",
      message: result.error,
      throttleMs: 0,
    }).catch(() => null);
    return htmlPage(
      "TikTok ads token exchange mislukt",
      `<p>${escapeHtml(result.error)}</p>
       <p>De auth_code is éénmalig. Vraag een nieuwe Advertiser authorization URL aan.</p>`,
    );
  }

  await logIntegration({
    source: "tiktok_ads",
    level: "info",
    event: "oauth.connected",
    message: `TikTok ads gekoppeld · ${result.advertiserIds.join(", ") || "geen advertiser-ids"}`,
    detail: { advertiserIds: result.advertiserIds },
    throttleMs: 0,
  }).catch(() => null);

  const dest = "/koppelingen";
  return htmlPage(
    "TikTok ads gekoppeld",
    `
    <p>Long-term access token is opgeslagen. Advertiser: ${escapeHtml(
      result.advertiserIds.join(", ") || "onbekend",
    )}.</p>
    <p>Zet dezelfde token ook in Vercel als <code>TIKTOK_ADS_ACCESS_TOKEN</code> als de sync daar nog env gebruikt.</p>
    <p><a href="${dest}">Terug naar Bronnen</a></p>
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
