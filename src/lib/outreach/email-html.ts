/**
 * Render outreach plain-text body as clean HTML email.
 * Handtekening als echte business-signature: logo + naam + klikbare contacten.
 */

import { OUTREACH_SIGNATURE } from "@/lib/outreach/tone";
import {
  matchSenderProfileFromSignature,
  type OutreachSenderProfile,
} from "@/lib/outreach/sender-profiles";

const FONT =
  "Arial, Helvetica, 'Arial Narrow', sans-serif";
const YELLOW = "#fff201";
const INK = "#111111";
const MUTED = "#666666";
const SOFT = "#8a8a8a";
const LINE = "#e8e8e8";
const LINK = "#1a1a1a";

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
    `<a href="$1" style="color:${LINK};text-decoration:underline">$1</a>`,
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

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function renderSignatureHtml(profile: OutreachSenderProfile): string {
  const contactBits: string[] = [
    `<a href="mailto:${escapeHtml(profile.email)}" style="color:${LINK};text-decoration:none;border-bottom:1px solid #cccccc">${escapeHtml(profile.email)}</a>`,
  ];
  if (profile.phone) {
    contactBits.push(
      `<a href="${telHref(profile.phone)}" style="color:${LINK};text-decoration:none;border-bottom:1px solid #cccccc">${escapeHtml(profile.phone)}</a>`,
    );
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-collapse:collapse">
  <tr>
    <td colspan="2" style="padding:0 0 16px;border-top:1px solid ${LINE};font-size:0;line-height:0">&nbsp;</td>
  </tr>
  <tr>
    <td valign="top" style="padding:0 16px 0 0;width:64px">
      <a href="${escapeHtml(profile.websiteUrl)}" style="text-decoration:none">
        <img src="${logoUrl()}" width="56" height="56" alt="Thuishaven" style="display:block;border:0;width:56px;height:56px;border-radius:6px" />
      </a>
    </td>
    <td valign="top" style="padding:0;font-family:${FONT};color:${INK}">
      <div style="font-size:16px;font-weight:700;line-height:1.25;color:${INK}">${escapeHtml(profile.signatureName)}</div>
      ${profile.signatureOrg
        ? `<div style="margin-top:2px;font-size:13px;font-weight:600;line-height:1.3;color:${INK}">${escapeHtml(profile.signatureOrg)}</div>`
        : ""}
      ${profile.signatureRole
        ? `<div style="margin-top:3px;font-size:12px;line-height:1.4;color:${MUTED}">${escapeHtml(profile.signatureRole)}</div>`
        : ""}
      <div style="margin-top:10px;width:36px;height:3px;background:${YELLOW};font-size:0;line-height:0">&nbsp;</div>
      <div style="margin-top:10px;font-size:12px;line-height:1.7;color:${MUTED}">
        ${contactBits.join(` <span style="color:#c8c8c8">&middot;</span> `)}<br />
        ${escapeHtml(profile.address)}<br />
        <a href="${escapeHtml(profile.websiteUrl)}" style="color:${LINK};text-decoration:none;border-bottom:1px solid #cccccc">${escapeHtml(profile.websiteLabel)}</a>
      </div>
    </td>
  </tr>
</table>`;
}

/** Fallback when signature text doesn't match a known profile. */
function renderLooseSignatureHtml(signature: string): string {
  const lines = signature.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-collapse:collapse">
  <tr>
    <td colspan="2" style="padding:0 0 16px;border-top:1px solid ${LINE};font-size:0;line-height:0">&nbsp;</td>
  </tr>
  <tr>
    <td valign="top" style="padding:0 16px 0 0;width:64px">
      <img src="${logoUrl()}" width="56" height="56" alt="Thuishaven" style="display:block;border:0;width:56px;height:56px;border-radius:6px" />
    </td>
    <td valign="top" style="padding:0;font-family:${FONT};font-size:13px;line-height:1.55;color:${INK}">
      ${lines
        .map((line, i) => {
          const e = linkify(escapeHtml(line));
          if (i === 0) {
            return `<div style="font-size:16px;font-weight:700;line-height:1.25">${e}</div>`;
          }
          if (i === 1) {
            return `<div style="margin-top:2px;font-size:13px;font-weight:600">${e}</div>`;
          }
          if (i === 2) {
            return `<div style="margin-top:3px;font-size:12px;color:${MUTED}">${e}</div>`;
          }
          return `<div style="margin-top:2px;font-size:12px;color:${SOFT}">${e}</div>`;
        })
        .join("")}
    </td>
  </tr>
</table>`;
}

/** Split body vs signature if present. */
export function renderOutreachHtmlEmail(input: {
  body: string;
  testBanner?: string | null;
}): string {
  let body = input.body.trim();
  let signature = "";

  const sigMarkers = [
    "\nReijner\n",
    "\nReiner\n",
    "\nYoram\n",
    "\nThuishaven Evenementen\n",
  ];
  let sigIdx = -1;
  for (const marker of sigMarkers) {
    const idx = body.lastIndexOf(marker);
    if (idx > sigIdx) sigIdx = idx;
  }
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

  const profile = signature ? matchSenderProfileFromSignature(signature) : null;
  const sigHtml = profile
    ? renderSignatureHtml(profile)
    : signature
      ? renderLooseSignatureHtml(signature)
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
