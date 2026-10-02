/**
 * Outreach settings — afzender, reply-to, send-ritme.
 * Env vars blijven fallback; DB-waarden (via Instellingen) gaan voor.
 */

import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachSettings } from "@/lib/db/schema";
import { amsterdamDay, formatDayShort, shiftIsoDay } from "@/lib/time/amsterdam";

export type OutreachSettings = {
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  replyToName: string;
  /** Addresses Brevo may use as From (comma-separated in DB). */
  allowedSenderEmails: string[];
  testRecipient: string;
  /** ISO weekdays: 1=ma … 5=vr */
  sendWeekdays: number[];
  mailsPerDay: number;
  preferredHour: number;
  notes: string | null;
  updatedAt: string | null;
};

export type SendSlotSuggestion = {
  day: string;
  label: string;
  weekdayLabel: string;
  count: number;
  hourLabel: string;
};

const WEEKDAY_NL = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function envDefaults(): OutreachSettings {
  return {
    senderEmail:
      process.env.BREVO_OUTREACH_SENDER_EMAIL?.trim() ||
      "zakelijk@thuishaven.nl",
    senderName:
      process.env.BREVO_OUTREACH_SENDER_NAME?.trim() || "Reijner · Thuishaven",
    replyToEmail:
      process.env.BREVO_OUTREACH_REPLY_TO?.trim() || "evenement@thuishaven.nl",
    replyToName:
      process.env.BREVO_OUTREACH_REPLY_TO_NAME?.trim() || "Yoram & Reijner",
    allowedSenderEmails: [
      "zakelijk@thuishaven.nl",
      "evenement@thuishaven.nl",
    ],
    testRecipient:
      process.env.OUTREACH_TEST_RECIPIENT?.trim() || "team@blablabuild.com",
    sendWeekdays: [2, 4],
    mailsPerDay: 3,
    preferredHour: 10,
    notes: null,
    updatedAt: null,
  };
}

function parseWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [2, 4];
  const days = value
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : [2, 4];
}

function parseAllowed(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return envDefaults().allowedSenderEmails;
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ];
}

export const loadOutreachSettings = cache(
  async (): Promise<OutreachSettings> => {
    const fallback = envDefaults();
    if (!hasDatabase()) return fallback;
    const db = getDb();
    const [row] = await db
      .select()
      .from(outreachSettings)
      .where(eq(outreachSettings.id, "default"))
      .limit(1);
    if (!row) return fallback;
    return {
      senderEmail: row.senderEmail || fallback.senderEmail,
      senderName: row.senderName || fallback.senderName,
      replyToEmail: row.replyToEmail || fallback.replyToEmail,
      replyToName: row.replyToName || fallback.replyToName,
      allowedSenderEmails: parseAllowed(row.allowedSenderEmails),
      testRecipient: row.testRecipient || fallback.testRecipient,
      sendWeekdays: parseWeekdays(row.sendWeekdays),
      mailsPerDay: Math.max(1, Math.min(40, row.mailsPerDay || 3)),
      preferredHour: Math.max(0, Math.min(23, row.preferredHour ?? 10)),
      notes: row.notes,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  },
);

export type OutreachSettingsInput = {
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  replyToName: string;
  allowedSenderEmails: string;
  testRecipient: string;
  sendWeekdays: number[];
  mailsPerDay: number;
  preferredHour: number;
  notes?: string | null;
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function saveOutreachSettings(
  input: OutreachSettingsInput,
): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };

  const senderEmail = input.senderEmail.trim().toLowerCase();
  const replyToEmail = input.replyToEmail.trim().toLowerCase();
  const testRecipient = input.testRecipient.trim().toLowerCase();
  if (!isEmail(senderEmail)) return { error: "Ongeldig afzenderadres" };
  if (!isEmail(replyToEmail)) return { error: "Ongeldig reply-to-adres" };
  if (!isEmail(testRecipient)) return { error: "Ongeldig testadres" };

  const allowed = parseAllowed(input.allowedSenderEmails);
  if (allowed.length === 0) {
    return { error: "Minimaal één toegestaan afzenderadres" };
  }
  if (!allowed.includes(senderEmail)) {
    return {
      error: `Afzender ${senderEmail} staat niet in de toegestane adressen`,
    };
  }

  const weekdays = parseWeekdays(input.sendWeekdays);
  const mailsPerDay = Math.max(1, Math.min(40, Math.floor(input.mailsPerDay)));
  const preferredHour = Math.max(
    0,
    Math.min(23, Math.floor(input.preferredHour)),
  );

  const db = getDb();
  const values = {
    id: "default" as const,
    senderEmail,
    senderName: input.senderName.trim() || "Reijner · Thuishaven",
    replyToEmail,
    replyToName: input.replyToName.trim() || "Yoram & Reijner",
    allowedSenderEmails: allowed.join(", "),
    testRecipient,
    sendWeekdays: weekdays,
    mailsPerDay,
    preferredHour,
    notes: input.notes?.trim() || null,
    updatedAt: new Date(),
  };

  await db
    .insert(outreachSettings)
    .values(values)
    .onConflictDoUpdate({
      target: outreachSettings.id,
      set: {
        senderEmail: values.senderEmail,
        senderName: values.senderName,
        replyToEmail: values.replyToEmail,
        replyToName: values.replyToName,
        allowedSenderEmails: values.allowedSenderEmails,
        testRecipient: values.testRecipient,
        sendWeekdays: values.sendWeekdays,
        mailsPerDay: values.mailsPerDay,
        preferredHour: values.preferredHour,
        notes: values.notes,
        updatedAt: values.updatedAt,
      },
    });

  return { ok: true };
}

/**
 * Spread `mailCount` mails over upcoming cadence days.
 * Starts from `fromDay` (inclusive) or tomorrow Amsterdam.
 */
export function suggestSendSlots(input: {
  mailCount: number;
  sendWeekdays: number[];
  mailsPerDay: number;
  preferredHour: number;
  fromDay?: string | null;
}): SendSlotSuggestion[] {
  const mailCount = Math.max(0, input.mailCount);
  if (mailCount === 0) return [];

  const weekdays =
    input.sendWeekdays.length > 0 ? input.sendWeekdays : [2, 4];
  const perDay = Math.max(1, input.mailsPerDay);
  const hour = Math.max(0, Math.min(23, input.preferredHour));
  const hourLabel = `${String(hour).padStart(2, "0")}:00`;

  let cursor =
    input.fromDay && /^\d{4}-\d{2}-\d{2}$/.test(input.fromDay)
      ? input.fromDay
      : shiftIsoDay(amsterdamDay(new Date()), 1);

  const slots: SendSlotSuggestion[] = [];
  let remaining = mailCount;
  let guard = 0;

  while (remaining > 0 && guard < 400) {
    const date = new Date(`${cursor}T12:00:00+02:00`);
    const dow = date.getDay();
    const isoDow = dow === 0 ? 7 : dow;
    if (weekdays.includes(isoDow)) {
      const count = Math.min(perDay, remaining);
      slots.push({
        day: cursor,
        label: formatDayShort(cursor),
        weekdayLabel: WEEKDAY_NL[dow] ?? "",
        count,
        hourLabel,
      });
      remaining -= count;
    }
    cursor = shiftIsoDay(cursor, 1);
    guard += 1;
  }

  return slots;
}

export function formatCadenceSummary(settings: OutreachSettings): string {
  const days = settings.sendWeekdays
    .map((d) => ["", "ma", "di", "wo", "do", "vr", "za", "zo"][d] ?? String(d))
    .join(" · ");
  const perWeek = settings.sendWeekdays.length * settings.mailsPerDay;
  return `Max ${settings.mailsPerDay}/dag op ${days} (~${perWeek}/week) · rond ${String(settings.preferredHour).padStart(2, "0")}:00`;
}
