/**
 * Render outreach plain-text body as clean HTML email.
 * Brand-aligned: sans body, logo in signature (hosted on app URL).
 */

import { OUTREACH_SIGNATURE } from "@/lib/outreach/tone";

const FONT =
  "Arial, Helvetica, 'Arial Narrow', sans-serif";
const YELLOW = "#fff201";

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  if (fromEnv && !fromEnv.includes("tools.thuishaven.nl")) return fromEnv;
  return "https://thuishaven.vercel.app";
}

function logoUrl(): string {
  return `${appBaseUrl()}/brand/logo-mark.png`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#111;text-decoration:underline">$1</a>',
  );
}

function paragraphsFromText(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const withBreaks = linkify(escapeHtml(block)).replace(/\n/g, "<br />\n");
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:#1a1a1a">${withBreaks}</p>`;
    })
    .join("\n");
}

/** Split body vs signature if present. */
export function renderOutreachHtmlEmail(input: {
  body: string;
  testBanner?: string | null;
}): string {
  let body = input.body.trim();
  let signature = "";

  const sigIdx = body.lastIndexOf("\nReijner\n");
  if (sigIdx >= 0) {
    signature = body.slice(sigIdx).trim();
    body = body.slice(0, sigIdx).trim();
  } else if (body.includes(OUTREACH_SIGNATURE)) {
    signature = OUTREACH_SIGNATURE;
    body = body.replace(OUTREACH_SIGNATURE, "").trim();
  }

  const banner = input.testBanner
    ? `<p style="margin:0 0 20px;padding:10px 12px;background:#f7f7f5;border-left:3px solid ${YELLOW};font-family:${FONT};font-size:12px;line-height:1.4;color:#555">${escapeHtml(input.testBanner)}</p>`
    : "";

  const lines = signature ? signature.split("\n") : [];
  const sigHtml = lines.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e5e5;width:100%">
        <tr>
          <td style="vertical-align:top;padding-right:14px;width:44px">
            <img src="${logoUrl()}" width="40" height="40" alt="Thuishaven" style="display:block;border:0;width:40px;height:40px" />
          </td>
          <td style="vertical-align:top;font-family:${FONT};font-size:13px;line-height:1.5;color:#1a1a1a">
            ${lines
              .map((line, i) => {
                const e = linkify(escapeHtml(line));
                if (i === 0) {
                  return `<div style="font-weight:700;font-size:15px;letter-spacing:0.02em">${e}</div>`;
                }
                if (i === 1) {
                  return `<div style="margin-top:1px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-size:12px">${e}</div>`;
                }
                if (i === 2) {
                  return `<div style="margin-top:4px;color:#666;font-size:12px">${e}</div>`;
                }
                return `<div style="margin-top:2px;color:#555;font-size:12px">${e}</div>`;
              })
              .join("")}
          </td>
        </tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ffffff">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:${FONT}">
    ${banner}
    ${paragraphsFromText(body)}
    ${sigHtml}
  </div>
</body></html>`;
}
