/**
 * Outreach settings — afzender + reply-to (Instellingen).
 * Verzendritme komt uit `resolveOutreachCadence` (data/benchmark), niet uit de UI.
 */

import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachSettings } from "@/lib/db/schema";
import { DEFAULT_ALLOWED_SENDER_EMAILS } from "@/lib/outreach/sender-profiles";
import { amsterdamDay, formatDayShort, shiftIsoDay } from "@/lib/time/amsterdam";
import {
  formatMorningWindowLabel,
  formatResolvedCadence,
  resolveOutreachCadence,
  staggeredSendTimes,
  type CadenceSource,
} from "./cadence";

export type OutreachSettings = {
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  replyToName: string;
  /** Addresses Brevo may use as From (comma-separated in DB). */
  allowedSenderEmails: string[];
  testRecipient: string;
  /** ISO weekdays: 1=ma … 5=vr — uit cadence-engine */
  sendWeekdays: number[];
  mailsPerDay: number;
  preferredHour: number;
  cadenceSource: CadenceSource;
  cadenceRationale: string;
  cadenceSampleOpens: number;
  notes: string | null;
  updatedAt: string | null;
};

export type SendSlotSuggestion = {
  day: string;
  label: string;
  weekdayLabel: string;
  count: number;
  /** Human window / list, e.g. "09:12 · 09:41 · 10:08" */
  hourLabel: string;
  /** Individual suggested times for that day (Amsterdam). */
  times: string[];
};

const WEEKDAY_NL = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function envDefaults(): OutreachSettings {
  return {
    senderEmail:
      process.env.BREVO_OUTREACH_SENDER_EMAIL?.trim() ||
      "reiner@thuishaven.nl",
    senderName:
      process.env.BREVO_OUTREACH_SENDER_NAME?.trim() || "Reiner · Thuishaven",
    replyToEmail:
      process.env.BREVO_OUTREACH_REPLY_TO?.trim() || "evenementen@thuishaven.nl",
    replyToName:
      process.env.BREVO_OUTREACH_REPLY_TO_NAME?.trim() ||
      "Thuishaven Evenementen",
    allowedSenderEmails: [...DEFAULT_ALLOWED_SENDER_EMAILS],
    testRecipient:
      process.env.OUTREACH_TEST_RECIPIENT?.trim() || "team@blablabuild.com",
    sendWeekdays: [2, 4],
    mailsPerDay: 3,
    preferredHour: 9,
    cadenceSource: "benchmark",
    cadenceRationale:
      "Nog geen eigen open-data — Benelux B2B-benchmark (di/do · ochtendvenster ~08:40–10:25, tijden per mail gespreid).",
    cadenceSampleOpens: 0,
    notes: null,
    updatedAt: null,
  };
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
    const cadence = await resolveOutreachCadence();
    const withCadence = (base: OutreachSettings): OutreachSettings => ({
      ...base,
      sendWeekdays: cadence.sendWeekdays,
      mailsPerDay: cadence.mailsPerDay,
      preferredHour: cadence.preferredHour,
      cadenceSource: cadence.source,
      cadenceRationale: cadence.rationale,
      cadenceSampleOpens: cadence.sampleOpens,
    });

    if (!hasDatabase()) return withCadence(fallback);
    const db = getDb();
    const [row] = await db
      .select()
      .from(outreachSettings)
      .where(eq(outreachSettings.id, "default"))
      .limit(1);
    if (!row) return withCadence(fallback);
    return withCadence({
      senderEmail: row.senderEmail || fallback.senderEmail,
      senderName: row.senderName || fallback.senderName,
      replyToEmail: row.replyToEmail || fallback.replyToEmail,
      replyToName: row.replyToName || fallback.replyToName,
      allowedSenderEmails: parseAllowed(row.allowedSenderEmails),
      testRecipient: row.testRecipient || fallback.testRecipient,
      sendWeekdays: cadence.sendWeekdays,
      mailsPerDay: cadence.mailsPerDay,
      preferredHour: cadence.preferredHour,
      cadenceSource: cadence.source,
      cadenceRationale: cadence.rationale,
      cadenceSampleOpens: cadence.sampleOpens,
      notes: row.notes,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    });
  },
);

export type OutreachSettingsInput = {
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  replyToName: string;
  allowedSenderEmails: string;
  testRecipient: string;
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

  const cadence = await resolveOutreachCadence();

  const db = getDb();
  const values = {
    id: "default" as const,
    senderEmail,
    senderName: input.senderName.trim() || "Reijner · Thuishaven",
    replyToEmail,
    replyToName: input.replyToName.trim() || "Yoram & Reijner",
    allowedSenderEmails: allowed.join(", "),
    testRecipient,
    // Keep DB columns in sync with engine (audit / legacy readers).
    sendWeekdays: cadence.sendWeekdays,
    mailsPerDay: cadence.mailsPerDay,
    preferredHour: cadence.preferredHour,
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
 * Per day: staggered irregular morning times (not all on the hour).
 * Starts from `fromDay` (inclusive) or tomorrow Amsterdam.
 */
export function suggestSendSlots(input: {
  mailCount: number;
  sendWeekdays: number[];
  mailsPerDay: number;
  preferredHour: number;
  fromDay?: string | null;
  /** Extra seed so different bakjes get different minute patterns. */
  seed?: string | null;
  /** Mails al ingepland per dag (YYYY-MM-DD) — tellen mee voor de daglimiet. */
  occupiedPerDay?: Record<string, number>;
}): SendSlotSuggestion[] {
  const mailCount = Math.max(0, input.mailCount);
  if (mailCount === 0) return [];

  const weekdays =
    input.sendWeekdays.length > 0 ? input.sendWeekdays : [2, 4];
  const perDay = Math.max(1, input.mailsPerDay);
  const hour = Math.max(0, Math.min(23, input.preferredHour));

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
    const free = perDay - (input.occupiedPerDay?.[cursor] ?? 0);
    if (weekdays.includes(isoDow) && free > 0) {
      const count = Math.min(free, remaining);
      const times = staggeredSendTimes({
        preferredHour: hour,
        count,
        seed: `${input.seed ?? "batch"}|${cursor}|${count}`,
      });
      slots.push({
        day: cursor,
        label: formatDayShort(cursor),
        weekdayLabel: WEEKDAY_NL[dow] ?? "",
        count,
        hourLabel: times.join(" · "),
        times,
      });
      remaining -= count;
    }
    cursor = shiftIsoDay(cursor, 1);
    guard += 1;
  }

  return slots;
}

export function formatCadenceSummary(settings: OutreachSettings): string {
  return formatResolvedCadence({
    sendWeekdays: settings.sendWeekdays,
    mailsPerDay: settings.mailsPerDay,
    preferredHour: settings.preferredHour,
    source: settings.cadenceSource,
    sampleOpens: settings.cadenceSampleOpens,
    rationale: settings.cadenceRationale,
  });
}

/** Expose window label for UI that already has preferredHour. */
export { formatMorningWindowLabel };
