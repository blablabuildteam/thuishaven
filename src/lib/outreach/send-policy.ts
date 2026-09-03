/**
 * Outreach send policy — default: niets versturen.
 *
 * Isolatie t.o.v. visitor-mailings:
 * - From: zakelijk@ (niet postduif@)
 * - Reply-To: evenement@
 * - tags: outreach
 * - OUTREACH_SEND_ENABLED hard off tot jullie groen licht geven
 *
 * Zelfde Brevo-account/API mag; aparte key is optioneel (revoke), geen must.
 */

import { getBrevoKey } from "@/lib/integrations/brevo/client";

export function isOutreachSendEnabled(): boolean {
  return process.env.OUTREACH_SEND_ENABLED?.trim() === "true";
}

/**
 * Prefer dedicated outreach key; otherwise reuse existing Brevo API
 * (BREVO_API_KEY / BREVO_MCP_TOKEN).
 */
export function getOutreachBrevoKey(): string | null {
  return (
    process.env.BREVO_OUTREACH_API_KEY?.trim() ||
    getBrevoKey()
  );
}

export function getOutreachSender(): { email: string; name: string } {
  return {
    email:
      process.env.BREVO_OUTREACH_SENDER_EMAIL?.trim() ||
      "zakelijk@thuishaven.nl",
    name:
      process.env.BREVO_OUTREACH_SENDER_NAME?.trim() ||
      "Thuishaven Events",
  };
}

/** Replies from prospects go to the existing B2B inbox. */
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

export function outreachSendBlockReason(): string | null {
  if (!isOutreachSendEnabled()) {
    return "Versturen staat uit (OUTREACH_SEND_ENABLED ≠ true). Alleen drafts + planning.";
  }
  if (!getOutreachBrevoKey()) {
    return "Geen Brevo API-key (BREVO_OUTREACH_API_KEY of BREVO_API_KEY / MCP).";
  }
  return null;
}
