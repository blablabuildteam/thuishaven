/**
 * Outreach send policy — default: geen live sends naar prospects.
 * Testsend naar team@ mag aan (voor open-tracking / A/B validatie).
 * Afzender/reply-to komen uit outreach_settings (env als fallback).
 */

import { and, gte, inArray, sql } from "drizzle-orm";
import { getBrevoKey } from "@/lib/integrations/brevo/client";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachEmails } from "@/lib/db/schema";
import { resolveOutreachCadence } from "@/lib/outreach/cadence";
import { loadOutreachSettings } from "@/lib/outreach/settings";
import { amsterdamDay } from "@/lib/time/amsterdam";
import {
  BOUNCE_PAUSE_THRESHOLD,
  DEFAULT_LIVE_DAILY_CAP,
  LIVE_SEND_CONFIRM_PHRASE,
} from "@/lib/outreach/live-send-constants";

export {
  BOUNCE_PAUSE_THRESHOLD,
  DEFAULT_LIVE_DAILY_CAP,
  LIVE_SEND_CONFIRM_PHRASE,
} from "@/lib/outreach/live-send-constants";

const LIVE_SENT_STATUSES = [
  "sent",
  "opened",
  "clicked",
  "replied",
  "bounced",
  "opted_out",
] as const;

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

/** Block live prospect sends (env gates only — sync). */
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

export function liveDailyCapFromEnvOrCadence(mailsPerDay: number): number {
  const raw = process.env.OUTREACH_DAILY_CAP?.trim();
  if (raw && /^\d+$/.test(raw)) {
    return Math.max(0, Number(raw));
  }
  return Math.max(1, mailsPerDay || DEFAULT_LIVE_DAILY_CAP);
}

/** How many live mails already went out today (Amsterdam). */
export async function countLiveSendsToday(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const today = amsterdamDay(new Date());
  const rows = await db
    .select({
      sentAt: outreachEmails.sentAt,
    })
    .from(outreachEmails)
    .where(
      and(
        inArray(outreachEmails.status, [...LIVE_SENT_STATUSES]),
        sql`${outreachEmails.sentAt} is not null`,
      ),
    );
  return rows.filter(
    (r) => r.sentAt && amsterdamDay(r.sentAt) === today,
  ).length;
}

/** Soft/hard bounces among mails sent in the last 24 hours. */
export async function countRecentBounces(hours = 24): Promise<number> {
  if (!hasDatabase()) return 0;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const db = getDb();
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      and(
        sql`${outreachEmails.status} = 'bounced'`,
        gte(outreachEmails.sentAt, since),
      ),
    );
  return Number(row?.c) || 0;
}

export function isValidLiveSendConfirm(
  confirmText: string,
  batchName: string,
): boolean {
  const typed = confirmText.trim();
  if (!typed) return false;
  if (typed.toUpperCase() === LIVE_SEND_CONFIRM_PHRASE) return true;
  return typed === batchName.trim();
}

/**
 * Full live-send gate: env + bounce pause + daily cap.
 * Call before sending a bakje.
 */
export async function assertLiveSendAllowed(wantCount: number): Promise<
  | {
      ok: true;
      remainingToday: number;
      dailyCap: number;
      sentToday: number;
      allowCount: number;
    }
  | { error: string }
> {
  const envBlock = outreachLiveSendBlockReason();
  if (envBlock) return { error: envBlock };

  const cadence = await resolveOutreachCadence();
  const dailyCap = liveDailyCapFromEnvOrCadence(cadence.mailsPerDay);
  const sentToday = await countLiveSendsToday();
  const remainingToday = Math.max(0, dailyCap - sentToday);

  const bounces = await countRecentBounces(24);
  if (bounces >= BOUNCE_PAUSE_THRESHOLD) {
    return {
      error: `Live send gepauzeerd: ${bounces} bounces in de laatste 24u (drempel ${BOUNCE_PAUSE_THRESHOLD}). Check Brevo/lijst en hervat daarna.`,
    };
  }

  if (remainingToday <= 0) {
    return {
      error: `Daglimiet bereikt (${sentToday}/${dailyCap} vandaag, Amsterdam). Morgen weer, of verhoog OUTREACH_DAILY_CAP.`,
    };
  }

  const want = Math.max(0, wantCount);
  const allowCount = Math.min(want, remainingToday);
  if (want > 0 && allowCount <= 0) {
    return {
      error: `Geen ruimte meer vandaag (${sentToday}/${dailyCap}).`,
    };
  }

  return {
    ok: true,
    remainingToday,
    dailyCap,
    sentToday,
    allowCount,
  };
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
