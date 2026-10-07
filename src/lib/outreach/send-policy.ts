/**
 * Outreach send policy — default: geen live sends naar prospects.
 * Testsend naar team@ mag aan (voor open-tracking / A/B validatie).
 * Afzender/reply-to komen uit outreach_settings (env als fallback).
 */

import { getBrevoKey } from "@/lib/integrations/brevo/client";
import { loadOutreachSettings } from "@/lib/outreach/settings";

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

/** Sync env-only fallback — prefer resolveOutreachSender() when sending. */
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

export async function resolveOutreachSender(): Promise<{
  email: string;
  name: string;
}> {
  const s = await loadOutreachSettings();
  return { email: s.senderEmail, name: s.senderName };
}

export async function resolveOutreachReplyTo(): Promise<{
  email: string;
  name: string;
}> {
  const s = await loadOutreachSettings();
  return { email: s.replyToEmail, name: s.replyToName };
}

export async function resolveOutreachTestRecipient(): Promise<string> {
  const s = await loadOutreachSettings();
  return s.testRecipient;
}

/** True if From-address may be used (allowlist in settings). */
export async function isAllowedOutreachSender(
  email: string,
): Promise<boolean> {
  const s = await loadOutreachSettings();
  const e = email.trim().toLowerCase();
  return s.allowedSenderEmails.includes(e);
}

export async function assertAllowedOutreachSender(
  email: string,
): Promise<{ ok: true } | { error: string }> {
  const e = email.trim().toLowerCase();
  if (!(await isAllowedOutreachSender(e))) {
    return {
      error: `Afzender ${e} staat niet in de toegestane adressen (Instellingen). Zet dit adres eerst op de allowlist én verifieer het in Brevo.`,
    };
  }
  return { ok: true };
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

export async function isAllowedOutreachTestEmailAsync(
  email: string,
): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const testTo = (await resolveOutreachTestRecipient()).toLowerCase();
  if (e === testTo) return true;
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

export async function resolveOutreachTestRecipientsAsync(
  requested?: string[] | string | null,
): Promise<string[]> {
  const raw = Array.isArray(requested)
    ? requested
    : typeof requested === "string"
      ? requested.split(/[,;\s]+/)
      : [];
  const allowed: string[] = [];
  for (const part of raw) {
    const e = part.trim().toLowerCase();
    if (e && (await isAllowedOutreachTestEmailAsync(e))) allowed.push(e);
  }
  const unique = [...new Set(allowed)];
  if (unique.length > 0) return unique;
  return [await resolveOutreachTestRecipient()];
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
