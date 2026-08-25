import { sendBrevoTransactionalEmail } from "@/lib/integrations/brevo/client";
import { isAllowedAuthEmail } from "@/lib/auth/domains";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
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

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  rawToken: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedAuthEmail(input.to)) {
    return { ok: false, error: "E-maildomein niet toegestaan" };
  }
  const link = `${appUrl()}/account/invite?token=${encodeURIComponent(input.rawToken)}`;
  const result = await sendBrevoTransactionalEmail({
    to: [input.to],
    subject: "Uitnodiging voor Thuishaven Tools",
    sender: authSender(),
    text: `Hoi ${input.name},\n\nJe bent uitgenodigd voor Thuishaven Tools. Stel je wachtwoord in via:\n${link}\n\nDe link verloopt over 7 dagen.`,
    html: `<p>Hoi ${escapeHtml(input.name)},</p>
<p>Je bent uitgenodigd voor <strong>Thuishaven Tools</strong>.</p>
<p><a href="${link}">Stel je wachtwoord in</a></p>
<p>De link verloopt over 7 dagen. Niet aangevraagd? Negeer deze mail.</p>`,
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
  const link = `${appUrl()}/account/reset-password?token=${encodeURIComponent(input.rawToken)}`;
  const result = await sendBrevoTransactionalEmail({
    to: [input.to],
    subject: "Wachtwoord resetten — Thuishaven Tools",
    sender: authSender(),
    text: `Hoi ${input.name},\n\nReset je wachtwoord via:\n${link}\n\nDe link verloopt over 1 uur.`,
    html: `<p>Hoi ${escapeHtml(input.name)},</p>
<p>We ontvingen een verzoek om je wachtwoord te resetten.</p>
<p><a href="${link}">Nieuw wachtwoord instellen</a></p>
<p>De link verloopt over 1 uur. Niet aangevraagd? Negeer deze mail.</p>`,
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
