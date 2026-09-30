/**
 * Outreach send policy — default: geen live sends naar prospects.
 * Testsend naar team@ mag aan (voor open-tracking / A/B validatie).
 */

import { getBrevoKey } from "@/lib/integrations/brevo/client";

export function isOutreachSendEnabled(): boolean {
  return process.env.OUTREACH_SEND_ENABLED?.trim() === "true";
}

/** Testsend naar OUTREACH_TEST_RECIPIENT — default aan. */
export function isOutreachTestSendEnabled(): boolean {
  const raw = process.env.OUTREACH_TEST_SEND_ENABLED?.trim();
  if (raw === "false") return false;
  return true;
}

export function getOutreachBrevoKey(): string | null {
  return process.env.BREVO_OUTREACH_API_KEY?.trim() || getBrevoKey();
}

export function getOutreachSender(): { email: string; name: string } {
  return {
    email:
      process.env.BREVO_OUTREACH_SENDER_EMAIL?.trim() ||
      "zakelijk@thuishaven.nl",
    name:
      process.env.BREVO_OUTREACH_SENDER_NAME?.trim() ||
      "Reijner · Thuishaven",
  };
}

export function getOutreachReplyTo(): { email: string; name: string } {
  return {
    email:
      process.env.BREVO_OUTREACH_REPLY_TO?.trim() ||
      "evenement@thuishaven.nl",
    name:
      process.env.BREVO_OUTREACH_REPLY_TO_NAME?.trim() ||
      "Yoram & Reijner",
  };
}

export function getOutreachTestRecipient(): string {
  return (
    process.env.OUTREACH_TEST_RECIPIENT?.trim() || "team@blablabuild.com"
  );
}

/** Allowed domains for template/mail test sends (never live prospects). */
const TEST_ALLOW_DOMAINS = ["blablabuild.com", "thuishaven.nl"];

export function isAllowedOutreachTestEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  if (e === getOutreachTestRecipient().toLowerCase()) return true;
  const domain = e.split("@")[1] ?? "";
  return TEST_ALLOW_DOMAINS.includes(domain);
}

/** Parse comma/space-separated test addresses; fall back to default. */
export function resolveOutreachTestRecipients(
  requested?: string[] | string | null,
): string[] {
  const raw = Array.isArray(requested)
    ? requested
    : typeof requested === "string"
      ? requested.split(/[,;\s]+/)
      : [];
  const allowed = [
    ...new Set(
      raw
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && isAllowedOutreachTestEmail(e)),
    ),
  ];
  return allowed.length > 0 ? allowed : [getOutreachTestRecipient()];
}

/** Block live prospect sends. */
export function outreachLiveSendBlockReason(): string | null {
  if (!isOutreachSendEnabled()) {
    return "Live versturen staat uit (OUTREACH_SEND_ENABLED ≠ true).";
  }
  if (process.env.OUTREACH_LIVE_SEND?.trim() !== "true") {
    return "OUTREACH_LIVE_SEND ≠ true — alleen testsends naar het testadres.";
  }
  if (!getOutreachBrevoKey()) {
    return "Geen Brevo API-key.";
  }
  return null;
}

/** Block test sends (team@). */
export function outreachTestSendBlockReason(): string | null {
  if (!isOutreachTestSendEnabled()) {
    return "Testsend staat uit (OUTREACH_TEST_SEND_ENABLED=false).";
  }
  if (!getOutreachBrevoKey()) {
    return "Geen Brevo API-key.";
  }
  return null;
}

/** @deprecated use test/live specific helpers */
export function outreachSendBlockReason(): string | null {
  return outreachLiveSendBlockReason();
}
