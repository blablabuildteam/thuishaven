/**
 * Flat wachtrij — drafts + queued mails as one reviewable list.
 */

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachBatches, outreachEmails, prospects } from "@/lib/db/schema";
import {
  assertAllowedOutreachSender,
  assertLiveSendAllowed,
  isValidLiveSendConfirm,
  LIVE_SEND_CONFIRM_PHRASE,
  outreachLiveSendBlockReason,
} from "@/lib/outreach/send-policy";
import {
  DEFAULT_SENDER_PROFILE_ID,
  getSenderProfile,
  isSenderProfileId,
  snapshotSenderProfile,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import { loadOutreachSettings, suggestSendSlots } from "@/lib/outreach/settings";
import { OUTREACH_VARIANTS, type OutreachVariantId } from "@/lib/outreach/tone";
import {
  amsterdamClock,
  amsterdamDateTimeToUtc,
  amsterdamDay,
  formatDayShort,
} from "@/lib/time/amsterdam";

export type QueueItemStatusLabel =
  | "concept"
  | "review"
  | "gepland"
  | "actief";

export type QueueItem = {
  emailId: string;
  prospectId: string;
  companyName: string;
  toEmail: string | null;
  subject: string;
  body: string;
  variantKey: string | null;
  variantLabel: string | null;
  status: string;
  statusLabel: QueueItemStatusLabel;
  scheduledAt: string | null;
  scheduledLabel: string | null;
  armedAt: string | null;
  senderProfileId: OutreachSenderProfileId;
  senderProfileLabel: string;
  senderEmail: string;
  batchId: string | null;
  batchName: string | null;
  createdAt: string;
};

function variantLabel(key: string | null): string | null {
  if (!key) return null;
  return OUTREACH_VARIANTS.find((v) => v.id === key)?.name ?? key;
}

function statusLabel(row: {
  status: string;
  scheduledAt: Date | null;
  armedAt: Date | null;
  batchAutoSend: boolean | null;
}): QueueItemStatusLabel {
  const armed = Boolean(row.armedAt) || Boolean(row.batchAutoSend);
  if (armed && row.scheduledAt) return "actief";
  if (row.scheduledAt) return "gepland";
  if (row.status === "queued") return "review";
  return "concept";
}

export async function listQueueItems(): Promise<QueueItem[]> {
  if (!hasDatabase()) return [];
  const db = getDb();

  const rows = await db
    .select({
      emailId: outreachEmails.id,
      prospectId: outreachEmails.prospectId,
      companyName: prospects.companyName,
      toEmail: prospects.email,
      subject: outreachEmails.subject,
      body: outreachEmails.body,
      variantKey: outreachEmails.variantKey,
      status: outreachEmails.status,
      scheduledAt: outreachEmails.scheduledAt,
      armedAt: outreachEmails.armedAt,
      senderEmail: outreachEmails.senderEmail,
      senderProfileId: outreachEmails.senderProfileId,
      batchId: outreachEmails.batchId,
      batchName: outreachBatches.name,
      batchSenderProfileId: outreachBatches.senderProfileId,
      batchSenderEmail: outreachBatches.senderEmail,
      batchAutoSend: outreachBatches.autoSend,
      createdAt: outreachEmails.createdAt,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .leftJoin(
      outreachBatches,
      eq(outreachEmails.batchId, outreachBatches.id),
    )
    .where(inArray(outreachEmails.status, ["draft", "queued"]))
    .orderBy(
      asc(outreachEmails.scheduledAt),
      desc(outreachEmails.createdAt),
    )
    .limit(500);

  return rows.map((r) => {
    const profileId = isSenderProfileId(r.senderProfileId)
      ? r.senderProfileId
      : isSenderProfileId(r.batchSenderProfileId)
        ? r.batchSenderProfileId
        : DEFAULT_SENDER_PROFILE_ID;
    const profile = getSenderProfile(profileId);
    const scheduledAt = r.scheduledAt;
    let scheduledLabel: string | null = null;
    if (scheduledAt) {
      const day = amsterdamDay(scheduledAt);
      const time = amsterdamClock(scheduledAt);
      const weekdayLabel =
        ["zo", "ma", "di", "wo", "do", "vr", "za"][scheduledAt.getDay()] ?? "";
      scheduledLabel = `${weekdayLabel} ${formatDayShort(day)} · ${time}`;
    }
    return {
      emailId: r.emailId,
      prospectId: r.prospectId,
      companyName: r.companyName,
      toEmail: r.toEmail,
      subject: r.subject,
      body: r.body,
      variantKey: r.variantKey,
      variantLabel: variantLabel(r.variantKey),
      status: r.status,
      statusLabel: statusLabel({
        status: r.status,
        scheduledAt: r.scheduledAt,
        armedAt: r.armedAt,
        batchAutoSend: r.batchAutoSend,
      }),
      scheduledAt: scheduledAt?.toISOString() ?? null,
      scheduledLabel,
      armedAt: r.armedAt?.toISOString() ?? null,
      senderProfileId: profileId,
      senderProfileLabel: profile.label,
      senderEmail: r.senderEmail || r.batchSenderEmail || profile.email,
      batchId: r.batchId,
      batchName: r.batchName,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** Promote drafts into the review queue (no bakje required). */
export async function promoteToQueue(input: {
  emailIds: string[];
  senderProfileId?: OutreachSenderProfileId;
}): Promise<{ ok: true; promoted: number } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const ids = [...new Set(input.emailIds.filter(Boolean))];
  if (!ids.length) return { error: "Geen mails geselecteerd" };

  const profileId = input.senderProfileId ?? DEFAULT_SENDER_PROFILE_ID;
  if (!isSenderProfileId(profileId)) return { error: "Ongeldig afzenderprofiel" };
  const snap = snapshotSenderProfile(profileId);
  const allowed = await assertAllowedOutreachSender(snap.senderEmail);
  if ("error" in allowed) return allowed;

  const db = getDb();
  const updated = await db
    .update(outreachEmails)
    .set({
      status: "queued",
      senderProfileId: snap.senderProfileId,
      senderEmail: snap.senderEmail,
    })
    .where(
      and(
        inArray(outreachEmails.id, ids),
        inArray(outreachEmails.status, ["draft", "queued"]),
      ),
    )
    .returning({ id: outreachEmails.id });

  return { ok: true, promoted: updated.length };
}

export async function updateQueueItem(input: {
  emailId: string;
  subject?: string;
  body?: string;
  senderProfileId?: OutreachSenderProfileId;
  variantKey?: OutreachVariantId | null;
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
    return { error: "Alleen concepten of wachtrij-mails kun je nog aanpassen" };
  }

  const patch: {
    subject?: string;
    body?: string;
    senderProfileId?: string;
    senderEmail?: string;
    variantKey?: string | null;
    armedAt?: null;
  } = {};

  if (typeof input.subject === "string" && input.subject.trim()) {
    patch.subject = input.subject.trim();
  }
  if (typeof input.body === "string" && input.body.trim()) {
    patch.body = input.body.trim();
  }
  if (input.variantKey !== undefined) {
    patch.variantKey = input.variantKey;
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
    // Changing sender clears arm — must reconfirm.
    patch.armedAt = null;
  }

  if (Object.keys(patch).length === 0) {
    return { error: "Niets om op te slaan" };
  }

  await db
    .update(outreachEmails)
    .set(patch)
    .where(eq(outreachEmails.id, input.emailId));
  return { ok: true };
}

/** Assign cadence slots to selected mails (bulk plan). */
export async function scheduleQueueEmails(input: {
  emailIds: string[];
  fromDay?: string | null;
}): Promise<
  | { ok: true; scheduled: number; firstAt: string | null; lastAt: string | null }
  | { error: string }
> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const ids = [...new Set(input.emailIds.filter(Boolean))];
  if (!ids.length) return { error: "Geen mails geselecteerd" };
  if (ids.length > 80) return { error: "Max 80 mails per keer inplannen" };

  const db = getDb();
  const rows = await db
    .select({
      id: outreachEmails.id,
      status: outreachEmails.status,
      senderProfileId: outreachEmails.senderProfileId,
    })
    .from(outreachEmails)
    .where(inArray(outreachEmails.id, ids));

  if (rows.length !== ids.length) {
    return { error: "Eén of meer mails niet gevonden" };
  }
  const notEditable = rows.filter(
    (r) => r.status !== "draft" && r.status !== "queued",
  );
  if (notEditable.length) {
    return { error: "Alleen concepten / wachtrij-mails kun je inplannen" };
  }

  const settings = await loadOutreachSettings();
  const slots = suggestSendSlots({
    mailCount: rows.length,
    sendWeekdays: settings.sendWeekdays,
    mailsPerDay: settings.mailsPerDay,
    preferredHour: settings.preferredHour,
    fromDay: input.fromDay ?? undefined,
    seed: ids[0],
  });

  const flat: Array<{ day: string; time: string }> = [];
  for (const slot of slots) {
    for (const time of slot.times) {
      flat.push({ day: slot.day, time });
    }
  }
  if (flat.length < rows.length) {
    return { error: "Kon geen planning maken — check verzendritme" };
  }

  const now = new Date();
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;
  const defaultSnap = snapshotSenderProfile(DEFAULT_SENDER_PROFILE_ID);

  // Preserve selection order from input ids.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)!);

  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i]!;
    const cell = flat[i]!;
    let at = amsterdamDateTimeToUtc(cell.day, cell.time);
    if (Number.isNaN(at.getTime())) {
      return { error: `Ongeldig tijdstip ${cell.day} ${cell.time}` };
    }
    if (at.getTime() < now.getTime() + 2 * 60_000) {
      at = new Date(now.getTime() + (3 + i) * 60_000);
    }
    if (!firstAt || at < firstAt) firstAt = at;
    if (!lastAt || at > lastAt) lastAt = at;

    const hasSender = isSenderProfileId(row.senderProfileId);
    await db
      .update(outreachEmails)
      .set({
        status: "queued",
        scheduledAt: at,
        armedAt: null,
        ...(hasSender
          ? {}
          : {
              senderProfileId: defaultSnap.senderProfileId,
              senderEmail: defaultSnap.senderEmail,
            }),
      })
      .where(eq(outreachEmails.id, row.id));
  }

  return {
    ok: true,
    scheduled: ordered.length,
    firstAt: firstAt?.toISOString() ?? null,
    lastAt: lastAt?.toISOString() ?? null,
  };
}

export async function clearQueueSchedule(input: {
  emailIds: string[];
}): Promise<{ ok: true; cleared: number } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const ids = [...new Set(input.emailIds.filter(Boolean))];
  if (!ids.length) return { error: "Geen mails geselecteerd" };
  const db = getDb();
  const updated = await db
    .update(outreachEmails)
    .set({ scheduledAt: null, armedAt: null })
    .where(
      and(
        inArray(outreachEmails.id, ids),
        inArray(outreachEmails.status, ["draft", "queued"]),
      ),
    )
    .returning({ id: outreachEmails.id });
  return { ok: true, cleared: updated.length };
}

export async function armQueueEmails(input: {
  emailIds: string[];
  confirmText: string;
}): Promise<{ ok: true; armed: number } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const envBlock = outreachLiveSendBlockReason();
  if (envBlock) return { error: envBlock };

  if (!isValidLiveSendConfirm(input.confirmText, "wachtrij")) {
    return {
      error: `Bevestiging onjuist. Typ “wachtrij” of “${LIVE_SEND_CONFIRM_PHRASE}”.`,
    };
  }

  const ids = [...new Set(input.emailIds.filter(Boolean))];
  if (!ids.length) return { error: "Geen mails geselecteerd" };

  const gate = await assertLiveSendAllowed(1);
  if ("error" in gate && !gate.error.includes("Daglimiet")) {
    return { error: gate.error };
  }

  const db = getDb();
  const updated = await db
    .update(outreachEmails)
    .set({ armedAt: new Date(), status: "queued" })
    .where(
      and(
        inArray(outreachEmails.id, ids),
        eq(outreachEmails.status, "queued"),
        isNotNull(outreachEmails.scheduledAt),
      ),
    )
    .returning({ id: outreachEmails.id });

  if (!updated.length) {
    return {
      error: "Eerst inplannen — selecteer mails die al een gepland tijdstip hebben.",
    };
  }
  return { ok: true, armed: updated.length };
}

export async function disarmQueueEmails(input: {
  emailIds: string[];
}): Promise<{ ok: true; disarmed: number } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const ids = [...new Set(input.emailIds.filter(Boolean))];
  if (!ids.length) return { error: "Geen mails geselecteerd" };
  const db = getDb();
  const updated = await db
    .update(outreachEmails)
    .set({ armedAt: null })
    .where(inArray(outreachEmails.id, ids))
    .returning({ id: outreachEmails.id });
  return { ok: true, disarmed: updated.length };
}
