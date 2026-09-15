import { sendBrevoTransactionalEmail } from "@/lib/integrations/brevo/client";
import { isAllowedAuthEmail } from "@/lib/auth/domains";

/** Public URL in outbound auth mail — never localhost, so invite/reset links work. */
function appUrl(): string {
  const dedicated = process.env.EMAIL_PUBLIC_BASE_URL?.replace(/\/$/, "").trim();
  if (dedicated) return dedicated;

  for (const raw of [
    process.env.AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
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
  existingAccount?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedAuthEmail(input.to)) {
    return { ok: false, error: "E-maildomein niet toegestaan" };
  }
  const link = `${appUrl()}/account/invite?token=${encodeURIComponent(input.rawToken)}`;
  const login = `${appUrl()}/login`;
  const reset = `${appUrl()}/forgot-password`;
  const existing = Boolean(input.existingAccount);
  const subject = existing
    ? "Wachtwoord instellen — Thuishaven Tools"
    : "Uitnodiging voor Thuishaven Tools";
  const intro = existing
    ? "Stel (opnieuw) je wachtwoord in voor Thuishaven Tools."
    : "Je bent uitgenodigd voor Thuishaven Tools.";
  const result = await sendBrevoTransactionalEmail({
    to: [input.to],
    subject,
    sender: authSender(),
    text: `Hoi ${input.name},\n\n${intro}\nStel je wachtwoord in via:\n${link}\n\nDe link verloopt over 7 dagen. Daarna log je in via ${login}. Wachtwoord later vergeten? Vraag een reset aan via ${reset}.\n\nNiet aangevraagd? Negeer deze mail.`,
    html: `<p>Hoi ${escapeHtml(input.name)},</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${link}">Wachtwoord instellen</a></p>
<p>De link verloopt over 7 dagen. Daarna log je in via <a href="${login}">de inlogpagina</a>.</p>
<p>Wachtwoord later vergeten? Gebruik <a href="${reset}">Wachtwoord vergeten</a>.</p>
<p>Niet aangevraagd? Negeer deze mail.</p>`,
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
  const login = `${appUrl()}/login`;
  const result = await sendBrevoTransactionalEmail({
    to: [input.to],
    subject: "Wachtwoord resetten — Thuishaven Tools",
    sender: authSender(),
    text: `Hoi ${input.name},\n\nReset je wachtwoord via:\n${link}\n\nDe link verloopt over 1 uur. Daarna log je in via ${login}.\n\nNiet aangevraagd? Negeer deze mail.`,
    html: `<p>Hoi ${escapeHtml(input.name)},</p>
<p>We ontvingen een verzoek om je wachtwoord te resetten.</p>
<p><a href="${link}">Nieuw wachtwoord instellen</a></p>
<p>De link verloopt over 1 uur. Daarna log je in via <a href="${login}">de inlogpagina</a>.</p>
<p>Niet aangevraagd? Negeer deze mail.</p>`,
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
