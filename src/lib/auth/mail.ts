import { sendBrevoTransactionalEmail } from "@/lib/integrations/brevo/client";
import { isAllowedAuthEmail } from "@/lib/auth/domains";

const CREAM = "#f1eee7";
const BLACK = "#000000";
const MUTED = "#555555";
const DIM = "#8a867c";
const WHITE = "#ffffff";
const YELLOW = "#fff201";
const BORDER = "#d2cdc2";

/** Public URL in outbound auth mail — never localhost, so invite/reset links work. */
function appUrl(): string {
  const dedicated = process.env.EMAIL_PUBLIC_BASE_URL?.replace(/\/$/, "").trim();
  if (dedicated) return dedicated;

  for (const raw of [process.env.AUTH_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    const value = raw?.replace(/\/$/, "").trim();
    if (
      value &&
      !value.includes("localhost") &&
      !value.includes("127.0.0.1")
    ) {
      return value;
    }
  }
  return "https://thuishaven.vercel.app";
}

function logoUrl(): string {
  return `${appUrl()}/brand/logo-mark.png`;
}

function authSender() {
  return {
    email:
      process.env.AUTH_FROM_EMAIL?.trim() ||
      process.env.ALERT_FROM_EMAIL?.trim() ||
      "noreply@thuishaven.nl",
    name:
      process.env.AUTH_FROM_NAME?.trim() ||
      process.env.ALERT_FROM_NAME?.trim() ||
      "Thuishaven Tools",
  };
}

function renderAuthEmail(input: {
  title: string;
  eyebrow: string;
  greeting: string;
  intro: string;
  ctaLabel: string;
  ctaHref: string;
  expiry: string;
  secondaryHtml: string;
  footer: string;
}): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:0 0 20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${logoUrl()}" width="36" height="36" alt="" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-family:'Arial Narrow',Arial,Helvetica,sans-serif;font-size:22px;letter-spacing:0.06em;color:${BLACK};">THUISHAVEN</p>
                    <p style="margin:2px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${DIM};">${escapeHtml(input.eyebrow)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:${YELLOW};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 0 8px 0;">
              <h1 style="margin:0;font-family:'Arial Narrow',Arial,Helvetica,sans-serif;font-size:32px;line-height:1.1;letter-spacing:0.03em;color:${BLACK};">
                ${escapeHtml(input.title)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px 0;">
              <p style="margin:0;font-family:Georgia,Times,'Times New Roman',serif;font-size:16px;line-height:1.6;color:${MUTED};">
                ${escapeHtml(input.greeting)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 24px 0;">
              <p style="margin:0;font-family:Georgia,Times,'Times New Roman',serif;font-size:16px;line-height:1.6;color:${MUTED};">
                ${escapeHtml(input.intro)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 12px 0;">
              <a href="${input.ctaHref}" style="display:inline-block;background:${BLACK};color:${WHITE};font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:12px 18px;">
                ${escapeHtml(input.ctaLabel)}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0;">
              <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${DIM};">
                ${escapeHtml(input.expiry)}
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${DIM};">
                ${input.secondaryHtml}
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${BORDER};padding:16px 0 0 0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${DIM};">
                ${escapeHtml(input.footer)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "THUISHAVEN — " + input.eyebrow,
    "",
    input.title,
    "",
    input.greeting,
    input.intro,
    "",
    `${input.ctaLabel}: ${input.ctaHref}`,
    input.expiry,
    "",
    input.footer,
  ].join("\n");

  return { html, text };
}

export function buildInviteEmail(input: {
  name: string;
  rawToken: string;
  existingAccount?: boolean;
}): { subject: string; html: string; text: string } {
  const link = `${appUrl()}/account/invite?token=${encodeURIComponent(input.rawToken)}`;
  const login = `${appUrl()}/login`;
  const reset = `${appUrl()}/forgot-password`;
  const existing = Boolean(input.existingAccount);
  const rendered = renderAuthEmail({
    eyebrow: "Medewerkers",
    title: existing ? "Wachtwoord instellen" : "Je bent uitgenodigd",
    greeting: `Hoi ${input.name},`,
    intro: existing
      ? "Stel (opnieuw) je wachtwoord in voor Thuishaven Tools. Daarna kun je inloggen."
      : "Je bent uitgenodigd voor Thuishaven Tools. Stel je wachtwoord in om in te loggen.",
    ctaLabel: "Wachtwoord instellen",
    ctaHref: link,
    expiry: "De link verloopt over 7 dagen.",
    secondaryHtml: `Daarna log je in via <a href="${login}" style="color:${BLACK};">de inlogpagina</a>. Wachtwoord later vergeten? Gebruik <a href="${reset}" style="color:${BLACK};">Wachtwoord vergeten</a>.`,
    footer:
      "Niet aangevraagd? Negeer deze mail. Thuishaven Tools · uitnodiging medewerkers.",
  });
  return {
    subject: existing
      ? "Wachtwoord instellen — Thuishaven Tools"
      : "Uitnodiging voor Thuishaven Tools",
    html: rendered.html,
    text: `${rendered.text}\n\nInloggen: ${login}\nWachtwoord vergeten: ${reset}`,
  };
}

export function buildPasswordResetEmail(input: {
  name: string;
  rawToken: string;
}): { subject: string; html: string; text: string } {
  const link = `${appUrl()}/account/reset-password?token=${encodeURIComponent(input.rawToken)}`;
  const login = `${appUrl()}/login`;
  const rendered = renderAuthEmail({
    eyebrow: "Account",
    title: "Wachtwoord resetten",
    greeting: `Hoi ${input.name},`,
    intro:
      "We ontvingen een verzoek om je wachtwoord te resetten. Kies hier een nieuw wachtwoord.",
    ctaLabel: "Nieuw wachtwoord instellen",
    ctaHref: link,
    expiry: "De link verloopt over 1 uur.",
    secondaryHtml: `Daarna log je in via <a href="${login}" style="color:${BLACK};">de inlogpagina</a>.`,
    footer:
      "Niet aangevraagd? Negeer deze mail. Thuishaven Tools · wachtwoord reset.",
  });
  return {
    subject: "Wachtwoord resetten — Thuishaven Tools",
    html: rendered.html,
    text: `${rendered.text}\n\nInloggen: ${login}`,
  };
}

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  rawToken: string;
  existingAccount?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedAuthEmail(input.to)) {
    return { ok: false, error: "E-maildomein niet toegestaan" };
  }
  const built = buildInviteEmail(input);
  const result = await sendBrevoTransactionalEmail({
    to: [input.to],
    subject: built.subject,
    sender: authSender(),
    text: built.text,
    html: built.html,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  rawToken: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedAuthEmail(input.to)) {
    return { ok: false, error: "E-maildomein niet toegestaan" };
  }
  const built = buildPasswordResetEmail(input);
  const result = await sendBrevoTransactionalEmail({
    to: [input.to],
    subject: built.subject,
    sender: authSender(),
    text: built.text,
    html: built.html,
  });
  if (!result.ok) return result;
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
