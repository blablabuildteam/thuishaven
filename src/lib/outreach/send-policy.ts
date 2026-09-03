/**
 * Outreach send policy — default: niets versturen.
 * Visitor/marketing Brevo blijft gescheiden via aparte outreach-credentials.
 */

export function isOutreachSendEnabled(): boolean {
  return process.env.OUTREACH_SEND_ENABLED?.trim() === "true";
}

/** Dedicated outreach Brevo key — never fall back to marketing MCP token. */
export function getOutreachBrevoKey(): string | null {
  return process.env.BREVO_OUTREACH_API_KEY?.trim() || null;
}

export function getOutreachSender(): { email: string; name: string } {
  return {
    email:
      process.env.BREVO_OUTREACH_SENDER_EMAIL?.trim() ||
      "events.outreach@thuishaven.nl",
    name:
      process.env.BREVO_OUTREACH_SENDER_NAME?.trim() ||
      "Thuishaven Events",
  };
}

export function outreachSendBlockReason(): string | null {
  if (!isOutreachSendEnabled()) {
    return "Versturen staat uit (OUTREACH_SEND_ENABLED ≠ true). Alleen drafts + planning.";
  }
  if (!getOutreachBrevoKey()) {
    return "BREVO_OUTREACH_API_KEY ontbreekt — outreach gebruikt niet de marketing-Brevo sleutel.";
  }
  return null;
}
