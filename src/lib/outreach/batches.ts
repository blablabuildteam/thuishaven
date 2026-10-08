/**
 * Outreach bakjes — named batches of drafts ready for review before live send.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  outreachBatches,
  outreachEmails,
  prospects,
} from "@/lib/db/schema";
import { sendStoredDraft } from "@/lib/integrations/outreach";
import { fillBodyTemplate, getBrochureUrl } from "@/lib/outreach/body-templates";
import {
  assertAllowedOutreachSender,
  assertLiveSendAllowed,
  BOUNCE_PAUSE_THRESHOLD,
  countLiveSendsToday,
  countRecentBounces,
  isValidLiveSendConfirm,
  liveDailyCapFromEnvOrCadence,
  outreachLiveSendBlockReason,
} from "@/lib/outreach/send-policy";
import { LIVE_SEND_CONFIRM_PHRASE } from "@/lib/outreach/live-send-constants";
import { resolveOutreachCadence } from "@/lib/outreach/cadence";
import {
  DEFAULT_SENDER_PROFILE_ID,
  getSenderProfile,
  isSenderProfileId,
  senderProfileLabel,
  snapshotSenderProfile,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import {
  formatCadenceSummary,
  loadOutreachSettings,
  suggestSendSlots,
  type SendSlotSuggestion,
} from "@/lib/outreach/settings";
import { listEditableTemplates } from "@/lib/outreach/templates";
import {
  amsterdamClock,
  amsterdamDay,
  formatDayShort,
} from "@/lib/time/amsterdam";
import { getPublicAvailabilityUrl } from "@/lib/mock/availability";
import {
  appendOutreachSignature,
  OUTREACH_VARIANTS,
  type OutreachVariantId,
} from "@/lib/outreach/tone";

export type OutreachBatchStatus = "open" | "ready" | "sent";

export type BatchEmailRow = {
  emailId: string;
  prospectId: string;
  companyName: string;
  /** Recipient (prospect). */
  email: string | null;
  subject: string;
  body: string;
  variantKey: string | null;
  variantLabel: string | null;
  /** True when body ≠ filled base template (AI rewrite or hand edit). */
  templateAdapted: boolean;
  status: string;
  createdAt: string;
  /** Persisted schedule (ISO) when planned. */
  scheduledAt: string | null;
  /** Suggested Amsterdam send day (YYYY-MM-DD) from cadence. */
  suggestedDay: string | null;
  /** Suggested Amsterdam time HH:MM. */
  suggestedTime: string | null;
  /** e.g. "di 6 okt · 09:34" */
  suggestedLabel: string | null;
};

export type OutreachBatchSummary = {
  id: string;
  name: string;
  status: OutreachBatchStatus;
  notes: string | null;
  plannedStartDay: string | null;
  autoSend: boolean;
  armedAt: string | null;
  scheduledCount: number;
  senderProfileId: OutreachSenderProfileId;
  senderProfileLabel: string;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  replyToName: string;
  createdAt: string;
  updatedAt: string;
  mailCount: number;
  variantKeys: string[];
  emails: BatchEmailRow[];
  sendSuggestion: SendSlotSuggestion[];
  sendSuggestionLabel: string;
};

export type UnbatchedDraft = {
  emailId: string;
  prospectId: string;
  companyName: string;
  email: string | null;
  subject: string;
  variantKey: string | null;
  variantLabel: string | null;
  createdAt: string;
};

/** One suggested send moment across all bakjes (Wachtrij planning). */
export type QueueScheduleItem = {
  day: string;
  dayLabel: string;
  weekdayLabel: string;
  time: string;
  batchId: string;
  batchName: string;
  senderLabel: string;
  emailId: string;
  companyName: string;
  toEmail: string | null;
  subject: string;
  variantLabel: string | null;
  templateAdapted: boolean;
};

export type QueueScheduleDay = {
  day: string;
  dayLabel: string;
  weekdayLabel: string;
  items: QueueScheduleItem[];
};

function variantLabel(key: string | null): string | null {
  if (!key) return null;
  return OUTREACH_VARIANTS.find((v) => v.id === key)?.name ?? key;
}

function normalizeMailBody(body: string): string {
  return appendOutreachSignature(body)
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .toLowerCase();
}

function isTemplateAdapted(
  body: string,
  baseline: string | null,
): boolean {
  if (!baseline) return true;
  return normalizeMailBody(body) !== normalizeMailBody(baseline);
}

function flattenSlotTimes(slots: SendSlotSuggestion[]): Array<{
  day: string;
  dayLabel: string;
  weekdayLabel: string;
  time: string;
}> {
  const out: Array<{
    day: string;
    dayLabel: string;
    weekdayLabel: string;
    time: string;
  }> = [];
  for (const slot of slots) {
    for (const time of slot.times) {
      out.push({
        day: slot.day,
        dayLabel: slot.label,
        weekdayLabel: slot.weekdayLabel,
        time,
      });
    }
  }
  return out;
}

function buildQueueSchedule(batches: OutreachBatchSummary[]): QueueScheduleDay[] {
  const items: QueueScheduleItem[] = [];
  for (const batch of batches) {
    if (batch.status === "sent") continue;
    for (const mail of batch.emails) {
      if (!mail.suggestedDay || !mail.suggestedTime) continue;
      items.push({
        day: mail.suggestedDay,
        dayLabel: formatDayShort(mail.suggestedDay),
        weekdayLabel:
          ["zo", "ma", "di", "wo", "do", "vr", "za"][
            new Date(`${mail.suggestedDay}T12:00:00+02:00`).getDay()
          ] ?? "",
        time: mail.suggestedTime,
        batchId: batch.id,
        batchName: batch.name,
        senderLabel: batch.senderProfileLabel,
        emailId: mail.emailId,
        companyName: mail.companyName,
        toEmail: mail.email,
        subject: mail.subject,
        variantLabel: mail.variantLabel,
        templateAdapted: mail.templateAdapted,
      });
    }
  }
  items.sort((a, b) =>
    a.day === b.day
      ? a.time.localeCompare(b.time) || a.companyName.localeCompare(b.companyName)
      : a.day.localeCompare(b.day),
  );

  const byDay = new Map<string, QueueScheduleDay>();
  for (const item of items) {
    let day = byDay.get(item.day);
    if (!day) {
      day = {
        day: item.day,
        dayLabel: item.dayLabel,
        weekdayLabel: item.weekdayLabel,
        items: [],
      };
      byDay.set(item.day, day);
    }
    day.items.push(item);
  }
  return [...byDay.values()];
}

export function defaultBatchName(mailCount: number, at = new Date()): string {
  const day = formatDayShort(amsterdamDay(at));
  return `Batch · ${day} · ${mailCount} mail${mailCount === 1 ? "" : "s"}`;
}

export async function listOpenBatches(): Promise<
  Array<{
    id: string;
    name: string;
    mailCount: number;
    senderProfileId: OutreachSenderProfileId;
    senderProfileLabel: string;
    senderEmail: string;
  }>
> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: outreachBatches.id,
      name: outreachBatches.name,
      senderProfileId: outreachBatches.senderProfileId,
      senderEmail: outreachBatches.senderEmail,
      mailCount: sql<number>`count(${outreachEmails.id})::int`,
    })
    .from(outreachBatches)
    .leftJoin(
      outreachEmails,
      and(
        eq(outreachEmails.batchId, outreachBatches.id),
        eq(outreachEmails.status, "queued"),
      ),
    )
    .where(inArray(outreachBatches.status, ["open", "ready"]))
    .groupBy(
      outreachBatches.id,
      outreachBatches.name,
      outreachBatches.senderProfileId,
      outreachBatches.senderEmail,
    )
    .orderBy(desc(outreachBatches.updatedAt));
  return rows.map((r) => {
    const profileId = isSenderProfileId(r.senderProfileId)
      ? r.senderProfileId
      : DEFAULT_SENDER_PROFILE_ID;
    return {
      id: r.id,
      name: r.name,
      mailCount: Number(r.mailCount) || 0,
      senderProfileId: profileId,
      senderProfileLabel: senderProfileLabel(profileId),
      senderEmail: r.senderEmail,
    };
  });
}

export type LiveSendQuota = {
  sentToday: number;
  dailyCap: number;
  remainingToday: number;
  bouncePause: boolean;
  recentBounces: number;
};

export async function listBatchesWithEmails(): Promise<{
  batches: OutreachBatchSummary[];
  unbatchedDrafts: UnbatchedDraft[];
  liveSendBlockReason: string | null;
  liveSendQuota: LiveSendQuota | null;
  cadenceLabel: string;
  cadenceRationale: string;
  schedule: QueueScheduleDay[];
}> {
  if (!hasDatabase()) {
    return {
      batches: [],
      unbatchedDrafts: [],
      liveSendBlockReason: outreachLiveSendBlockReason(),
      liveSendQuota: null,
      cadenceLabel: "",
      cadenceRationale: "",
      schedule: [],
    };
  }
  const db = getDb();
  const [settings, editableTemplates] = await Promise.all([
    loadOutreachSettings(),
    listEditableTemplates(),
  ]);
  const templateById = new Map(editableTemplates.map((t) => [t.id, t]));
  const availabilityUrl = getPublicAvailabilityUrl();
  const brochureUrl = getBrochureUrl();

  function baselineBody(
    variantKey: string | null,
    companyName: string,
  ): string | null {
    if (!variantKey) return null;
    const t = templateById.get(variantKey as OutreachVariantId);
    if (!t) return null;
    return appendOutreachSignature(
      fillBodyTemplate(t.bodyTemplate, {
        companyName,
        availabilityUrl,
        brochureUrl,
      }),
    );
  }

  const [batchRows, mailRows, draftRows] = await Promise.all([
    db
      .select()
      .from(outreachBatches)
      .orderBy(desc(outreachBatches.updatedAt)),
    db
      .select({
        emailId: outreachEmails.id,
        batchId: outreachEmails.batchId,
        prospectId: outreachEmails.prospectId,
        companyName: prospects.companyName,
        email: prospects.email,
        subject: outreachEmails.subject,
        body: outreachEmails.body,
        variantKey: outreachEmails.variantKey,
        status: outreachEmails.status,
        scheduledAt: outreachEmails.scheduledAt,
        createdAt: outreachEmails.createdAt,
      })
      .from(outreachEmails)
      .innerJoin(prospects, eq(prospects.id, outreachEmails.prospectId))
      .where(
        and(
          eq(outreachEmails.status, "queued"),
          sql`${outreachEmails.batchId} is not null`,
        ),
      )
      .orderBy(
        asc(outreachEmails.scheduledAt),
        asc(prospects.companyName),
      ),
    db
      .select({
        emailId: outreachEmails.id,
        prospectId: outreachEmails.prospectId,
        companyName: prospects.companyName,
        email: prospects.email,
        subject: outreachEmails.subject,
        variantKey: outreachEmails.variantKey,
        createdAt: outreachEmails.createdAt,
      })
      .from(outreachEmails)
      .innerJoin(prospects, eq(prospects.id, outreachEmails.prospectId))
      .where(
        and(eq(outreachEmails.status, "draft"), isNull(outreachEmails.batchId)),
      )
      .orderBy(desc(outreachEmails.createdAt))
      .limit(40),
  ]);

  type RawMail = Omit<
    BatchEmailRow,
    "suggestedDay" | "suggestedTime" | "suggestedLabel"
  >;
  const byBatch = new Map<string, RawMail[]>();
  for (const row of mailRows) {
    if (!row.batchId) continue;
    const list = byBatch.get(row.batchId) ?? [];
    const baseline = baselineBody(row.variantKey, row.companyName);
    list.push({
      emailId: row.emailId,
      prospectId: row.prospectId,
      companyName: row.companyName,
      email: row.email,
      subject: row.subject,
      body: row.body,
      variantKey: row.variantKey,
      variantLabel: variantLabel(row.variantKey),
      templateAdapted: isTemplateAdapted(row.body, baseline),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
    });
    byBatch.set(row.batchId, list);
  }

  const batches: OutreachBatchSummary[] = batchRows.map((b) => {
    const rawEmails = byBatch.get(b.id) ?? [];
    const variantKeys = [
      ...new Set(
        rawEmails
          .map((e) => e.variantKey)
          .filter((k): k is string => Boolean(k)),
      ),
    ];
    const sendSuggestion = suggestSendSlots({
      mailCount: rawEmails.length,
      sendWeekdays: settings.sendWeekdays,
      mailsPerDay: settings.mailsPerDay,
      preferredHour: settings.preferredHour,
      fromDay: b.plannedStartDay,
      seed: b.id,
    });
    const flatTimes = flattenSlotTimes(sendSuggestion);
    const emails: BatchEmailRow[] = rawEmails.map((mail, idx) => {
      if (mail.scheduledAt) {
        const at = new Date(mail.scheduledAt);
        const day = amsterdamDay(at);
        const time = amsterdamClock(at);
        const weekdayLabel =
          ["zo", "ma", "di", "wo", "do", "vr", "za"][at.getDay()] ?? "";
        return {
          ...mail,
          suggestedDay: day,
          suggestedTime: time,
          suggestedLabel: `${weekdayLabel} ${formatDayShort(day)} · ${time}`,
        };
      }
      const slot = flatTimes[idx] ?? null;
      const suggestedLabel = slot
        ? `${slot.weekdayLabel} ${slot.dayLabel} · ${slot.time}`
        : null;
      return {
        ...mail,
        suggestedDay: slot?.day ?? null,
        suggestedTime: slot?.time ?? null,
        suggestedLabel,
      };
    });
    const sendSuggestionLabel =
      sendSuggestion.length === 0
        ? "Geen mails in dit bakje"
        : sendSuggestion
            .map(
              (s) =>
                `${s.weekdayLabel} ${s.label} ${s.hourLabel} (${s.count})`,
            )
            .join(" · ");
    const profileId = isSenderProfileId(b.senderProfileId)
      ? b.senderProfileId
      : DEFAULT_SENDER_PROFILE_ID;
    const profile = getSenderProfile(profileId);
    const scheduledCount = emails.filter((e) => e.scheduledAt).length;
    return {
      id: b.id,
      name: b.name,
      status: b.status as OutreachBatchStatus,
      notes: b.notes,
      plannedStartDay: b.plannedStartDay,
      autoSend: Boolean(b.autoSend),
      armedAt: b.armedAt?.toISOString() ?? null,
      scheduledCount,
      senderProfileId: profileId,
      senderProfileLabel: profile.label,
      senderEmail: b.senderEmail || profile.email,
      senderName: b.senderName || profile.name,
      replyToEmail: b.replyToEmail || profile.replyToEmail,
      replyToName: b.replyToName || profile.replyToName,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      mailCount: emails.length,
      variantKeys,
      emails,
      sendSuggestion,
      sendSuggestionLabel,
    };
  });

  return {
    batches,
    unbatchedDrafts: draftRows.map((d) => ({
      emailId: d.emailId,
      prospectId: d.prospectId,
      companyName: d.companyName,
      email: d.email,
      subject: d.subject,
      variantKey: d.variantKey,
      variantLabel: variantLabel(d.variantKey),
      createdAt: d.createdAt.toISOString(),
    })),
    liveSendBlockReason: outreachLiveSendBlockReason(),
    liveSendQuota: await (async (): Promise<LiveSendQuota> => {
      const cadence = await resolveOutreachCadence();
      const dailyCap = liveDailyCapFromEnvOrCadence(cadence.mailsPerDay);
      const sentToday = await countLiveSendsToday();
      const recentBounces = await countRecentBounces(24);
      return {
        sentToday,
        dailyCap,
        remainingToday: Math.max(0, dailyCap - sentToday),
        bouncePause: recentBounces >= BOUNCE_PAUSE_THRESHOLD,
        recentBounces,
      };
    })(),
    cadenceLabel: formatCadenceSummary(settings),
    cadenceRationale: settings.cadenceRationale,
    schedule: buildQueueSchedule(batches),
  };
}

export async function enqueueEmails(input: {
  emailIds: string[];
  batchId?: string;
  batchName?: string;
  /** Required when creating a new bakje. Ignored when adding to an existing one. */
  senderProfileId?: OutreachSenderProfileId;
}): Promise<
  | {
      batchId: string;
      batchName: string;
      enqueued: number;
      senderProfileId: OutreachSenderProfileId;
      senderEmail: string;
    }
  | { error: string }
> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const ids = [...new Set(input.emailIds.filter(Boolean))];
  if (!ids.length) return { error: "Geen mails geselecteerd" };

  const db = getDb();
  const existing = await db
    .select({
      id: outreachEmails.id,
      status: outreachEmails.status,
    })
    .from(outreachEmails)
    .where(inArray(outreachEmails.id, ids));

  if (existing.length !== ids.length) {
    return { error: "Eén of meer drafts niet gevonden" };
  }
  const notEditable = existing.filter(
    (r) => r.status !== "draft" && r.status !== "queued",
  );
  if (notEditable.length) {
    return {
      error: "Alleen drafts of mails in een bakje kun je in een bakje zetten",
    };
  }

  let batchId = input.batchId?.trim() || null;
  let batchName = input.batchName?.trim() || "";
  let senderProfileId: OutreachSenderProfileId = DEFAULT_SENDER_PROFILE_ID;
  let senderEmail = getSenderProfile(senderProfileId).email;

  if (batchId) {
    const [batch] = await db
      .select()
      .from(outreachBatches)
      .where(eq(outreachBatches.id, batchId))
      .limit(1);
    if (!batch) return { error: "Bakje niet gevonden" };
    if (batch.status === "sent") {
      return { error: "Dit bakje is al verstuurd" };
    }
    batchName = batch.name;
    senderProfileId = isSenderProfileId(batch.senderProfileId)
      ? batch.senderProfileId
      : DEFAULT_SENDER_PROFILE_ID;
    senderEmail = batch.senderEmail || getSenderProfile(senderProfileId).email;
  } else {
    const requested = input.senderProfileId ?? DEFAULT_SENDER_PROFILE_ID;
    if (!isSenderProfileId(requested)) {
      return { error: "Ongeldig afzenderprofiel" };
    }
    const snap = snapshotSenderProfile(requested);
    const allowed = await assertAllowedOutreachSender(snap.senderEmail);
    if ("error" in allowed) return allowed;

    if (!batchName) batchName = defaultBatchName(ids.length);
    const [created] = await db
      .insert(outreachBatches)
      .values({
        name: batchName,
        status: "open",
        senderProfileId: snap.senderProfileId,
        senderEmail: snap.senderEmail,
        senderName: snap.senderName,
        replyToEmail: snap.replyToEmail,
        replyToName: snap.replyToName,
      })
      .returning();
    if (!created) return { error: "Bakje aanmaken mislukt" };
    batchId = created.id;
    senderProfileId = snap.senderProfileId;
    senderEmail = snap.senderEmail;
  }

  await db
    .update(outreachEmails)
    .set({
      batchId,
      status: "queued",
    })
    .where(inArray(outreachEmails.id, ids));

  await db
    .update(outreachBatches)
    .set({ updatedAt: new Date(), status: "ready" })
    .where(eq(outreachBatches.id, batchId));

  return {
    batchId,
    batchName,
    enqueued: ids.length,
    senderProfileId,
    senderEmail,
  };
}

export async function dequeueEmails(input: {
  emailIds: string[];
}): Promise<{ dequeued: number } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const ids = [...new Set(input.emailIds.filter(Boolean))];
  if (!ids.length) return { error: "Geen mails geselecteerd" };

  const db = getDb();
  const rows = await db
    .select({
      id: outreachEmails.id,
      batchId: outreachEmails.batchId,
      status: outreachEmails.status,
    })
    .from(outreachEmails)
    .where(inArray(outreachEmails.id, ids));

  const queued = rows.filter((r) => r.status === "queued");
  if (!queued.length) return { error: "Geen mails in een bakje gevonden" };

  const batchIds = [
    ...new Set(queued.map((r) => r.batchId).filter(Boolean)),
  ] as string[];

  await db
    .update(outreachEmails)
    .set({ batchId: null, status: "draft" })
    .where(
      inArray(
        outreachEmails.id,
        queued.map((r) => r.id),
      ),
    );

  for (const batchId of batchIds) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.batchId, batchId),
          eq(outreachEmails.status, "queued"),
        ),
      );
    await db
      .update(outreachBatches)
      .set({
        updatedAt: new Date(),
        status: Number(count) > 0 ? "ready" : "open",
      })
      .where(eq(outreachBatches.id, batchId));
  }

  return { dequeued: queued.length };
}

export async function updateBatchMeta(input: {
  batchId: string;
  name?: string;
  notes?: string | null;
  plannedStartDay?: string | null;
  senderProfileId?: OutreachSenderProfileId;
}): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [batch] = await db
    .select({ id: outreachBatches.id, status: outreachBatches.status })
    .from(outreachBatches)
    .where(eq(outreachBatches.id, input.batchId))
    .limit(1);
  if (!batch) return { error: "Bakje niet gevonden" };
  if (batch.status === "sent") {
    return { error: "Verstuurd bakje kun je niet meer aanpassen" };
  }

  const patch: {
    name?: string;
    notes?: string | null;
    plannedStartDay?: string | null;
    senderProfileId?: string;
    senderEmail?: string;
    senderName?: string;
    replyToEmail?: string;
    replyToName?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (typeof input.name === "string" && input.name.trim()) {
    patch.name = input.name.trim();
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim() || null;
  }
  if (input.plannedStartDay !== undefined) {
    patch.plannedStartDay = input.plannedStartDay || null;
  }
  if (input.senderProfileId !== undefined) {
    if (!isSenderProfileId(input.senderProfileId)) {
      return { error: "Ongeldig afzenderprofiel" };
    }
    const snap = snapshotSenderProfile(input.senderProfileId);
    const allowed = await assertAllowedOutreachSender(snap.senderEmail);
    if ("error" in allowed) return allowed;
    patch.senderProfileId = snap.senderProfileId;
    patch.senderEmail = snap.senderEmail;
    patch.senderName = snap.senderName;
    patch.replyToEmail = snap.replyToEmail;
    patch.replyToName = snap.replyToName;
  }

  await db
    .update(outreachBatches)
    .set(patch)
    .where(eq(outreachBatches.id, input.batchId));
  return { ok: true };
}

/** Allow editing subject/body while draft or queued in a bakje. */
export async function updateQueuedOrDraft(input: {
  emailId: string;
  subject: string;
  body: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [row] = await db
    .select({ id: outreachEmails.id, status: outreachEmails.status })
    .from(outreachEmails)
    .where(eq(outreachEmails.id, input.emailId))
    .limit(1);
  if (!row) return { error: "Mail niet gevonden" };
  if (row.status !== "draft" && row.status !== "queued") {
    return { error: "Alleen drafts of bakjes-mails kun je nog aanpassen" };
  }
  await db
    .update(outreachEmails)
    .set({
      subject: input.subject.trim(),
      body: input.body.trim(),
    })
    .where(eq(outreachEmails.id, input.emailId));
  return { ok: true };
}

export async function sendBatch(input: {
  batchId: string;
  /** Must match bakjenaam exactly, or LIVE_SEND_CONFIRM_PHRASE. */
  confirmText: string;
}): Promise<
  | {
      ok: number;
      failed: number;
      skippedCap: number;
      sentToday: number;
      dailyCap: number;
      results: Array<{ emailId: string; ok: boolean; error?: string }>;
    }
  | { error: string }
> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };

  const db = getDb();
  const [batch] = await db
    .select()
    .from(outreachBatches)
    .where(eq(outreachBatches.id, input.batchId))
    .limit(1);
  if (!batch) return { error: "Bakje niet gevonden" };
  if (batch.status === "sent") return { error: "Dit bakje is al verstuurd" };

  if (!isValidLiveSendConfirm(input.confirmText, batch.name)) {
    return {
      error: `Bevestiging onjuist. Typ exact de bakjenaam “${batch.name}” of “${LIVE_SEND_CONFIRM_PHRASE}”.`,
    };
  }

  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.batchId, input.batchId),
        eq(outreachEmails.status, "queued"),
      ),
    );

  if (!rows.length) return { error: "Geen mails in dit bakje" };

  const gate = await assertLiveSendAllowed(rows.length);
  if ("error" in gate) return gate;

  const toSend = rows.slice(0, gate.allowCount);
  const skippedCap = rows.length - toSend.length;

  const results: Array<{ emailId: string; ok: boolean; error?: string }> = [];
  for (const row of toSend) {
    // Re-check bounce pause between sends (webhook can land mid-batch).
    if (results.length > 0) {
      const mid = await assertLiveSendAllowed(1);
      if ("error" in mid) {
        results.push({ emailId: row.id, ok: false, error: mid.error });
        break;
      }
    }
    const sent = await sendStoredDraft({
      emailId: row.id,
      forceTest: false,
    });
    if ("error" in sent) {
      results.push({ emailId: row.id, ok: false, error: sent.error });
    } else {
      results.push({ emailId: row.id, ok: true });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  if (ok === rows.length) {
    await db
      .update(outreachBatches)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(outreachBatches.id, input.batchId));
  } else if (ok > 0 || skippedCap > 0) {
    await db
      .update(outreachBatches)
      .set({ updatedAt: new Date() })
      .where(eq(outreachBatches.id, input.batchId));
  }

  return {
    ok,
    failed: results.length - ok,
    skippedCap,
    sentToday: gate.sentToday + ok,
    dailyCap: gate.dailyCap,
    results,
  };
}
