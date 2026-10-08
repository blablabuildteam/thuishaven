/**
 * Schedule queued bakje mails and auto-send via cron when due.
 */

import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachBatches, outreachEmails } from "@/lib/db/schema";
import { sendStoredDraft } from "@/lib/integrations/outreach";
import {
  assertLiveSendAllowed,
  isValidLiveSendConfirm,
  LIVE_SEND_CONFIRM_PHRASE,
  outreachLiveSendBlockReason,
} from "@/lib/outreach/send-policy";
import { loadOutreachSettings, suggestSendSlots } from "@/lib/outreach/settings";
import { amsterdamDateTimeToUtc } from "@/lib/time/amsterdam";

const MAX_SENDS_PER_CRON = 10;

export async function scheduleBatchEmails(input: {
  batchId: string;
}): Promise<
  | { ok: true; scheduled: number; firstAt: string | null; lastAt: string | null }
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

  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.batchId, input.batchId),
        eq(outreachEmails.status, "queued"),
      ),
    )
    .orderBy(asc(outreachEmails.createdAt));

  if (!rows.length) return { error: "Geen mails in dit bakje" };

  const settings = await loadOutreachSettings();
  const slots = suggestSendSlots({
    mailCount: rows.length,
    sendWeekdays: settings.sendWeekdays,
    mailsPerDay: settings.mailsPerDay,
    preferredHour: settings.preferredHour,
    fromDay: batch.plannedStartDay,
    seed: batch.id,
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

  for (let i = 0; i < rows.length; i++) {
    const cell = flat[i]!;
    let at = amsterdamDateTimeToUtc(cell.day, cell.time);
    if (Number.isNaN(at.getTime())) {
      return { error: `Ongeldig tijdstip ${cell.day} ${cell.time}` };
    }
    // Never schedule in the past — push a few minutes ahead if needed.
    if (at.getTime() < now.getTime() + 2 * 60_000) {
      at = new Date(now.getTime() + (3 + i) * 60_000);
    }
    if (!firstAt || at < firstAt) firstAt = at;
    if (!lastAt || at > lastAt) lastAt = at;
    await db
      .update(outreachEmails)
      .set({ scheduledAt: at })
      .where(eq(outreachEmails.id, rows[i]!.id));
  }

  await db
    .update(outreachBatches)
    .set({
      updatedAt: new Date(),
      status: "ready",
      // Re-planning clears arm so operator must reconfirm auto-send.
      autoSend: false,
      armedAt: null,
    })
    .where(eq(outreachBatches.id, input.batchId));

  return {
    ok: true,
    scheduled: rows.length,
    firstAt: firstAt?.toISOString() ?? null,
    lastAt: lastAt?.toISOString() ?? null,
  };
}

export async function armBatchAutoSend(input: {
  batchId: string;
  confirmText: string;
}): Promise<{ ok: true; armed: number } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const envBlock = outreachLiveSendBlockReason();
  if (envBlock) return { error: envBlock };

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
      error: `Bevestiging onjuist. Typ exact “${batch.name}” of “${LIVE_SEND_CONFIRM_PHRASE}”.`,
    };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.batchId, input.batchId),
        eq(outreachEmails.status, "queued"),
        isNotNull(outreachEmails.scheduledAt),
      ),
    );
  const armed = Number(count) || 0;
  if (!armed) {
    return {
      error: "Eerst inplannen — geen mails met gepland tijdstip in dit bakje.",
    };
  }

  // Bounce/env must be clear; day-cap alone may still arm (mails can be tomorrow).
  const gate = await assertLiveSendAllowed(1);
  if ("error" in gate && !gate.error.includes("Daglimiet")) {
    return { error: gate.error };
  }

  await db
    .update(outreachBatches)
    .set({
      autoSend: true,
      armedAt: new Date(),
      status: "ready",
      updatedAt: new Date(),
    })
    .where(eq(outreachBatches.id, input.batchId));

  return { ok: true, armed };
}

export async function disarmBatchAutoSend(input: {
  batchId: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [batch] = await db
    .select({ id: outreachBatches.id })
    .from(outreachBatches)
    .where(eq(outreachBatches.id, input.batchId))
    .limit(1);
  if (!batch) return { error: "Bakje niet gevonden" };

  await db
    .update(outreachBatches)
    .set({ autoSend: false, armedAt: null, updatedAt: new Date() })
    .where(eq(outreachBatches.id, input.batchId));
  return { ok: true };
}

export async function processDueOutreachSends(limit = MAX_SENDS_PER_CRON): Promise<{
  ok: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skipped: string | null;
  results: Array<{ emailId: string; ok: boolean; error?: string }>;
}> {
  const envBlock = outreachLiveSendBlockReason();
  if (envBlock) {
    return {
      ok: true,
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: envBlock,
      results: [],
    };
  }
  if (!hasDatabase()) {
    return {
      ok: false,
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: "DATABASE_URL ontbreekt",
      results: [],
    };
  }

  const gate = await assertLiveSendAllowed(limit);
  if ("error" in gate) {
    return {
      ok: true,
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: gate.error,
      results: [],
    };
  }

  const allow = Math.min(limit, gate.allowCount, MAX_SENDS_PER_CRON);
  if (allow <= 0) {
    return {
      ok: true,
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: "Geen ruimte in daglimiet",
      results: [],
    };
  }

  const db = getDb();
  const now = new Date();
  const due = await db
    .select({
      emailId: outreachEmails.id,
      batchId: outreachEmails.batchId,
    })
    .from(outreachEmails)
    .innerJoin(
      outreachBatches,
      eq(outreachEmails.batchId, outreachBatches.id),
    )
    .where(
      and(
        eq(outreachEmails.status, "queued"),
        eq(outreachBatches.autoSend, true),
        isNotNull(outreachEmails.scheduledAt),
        lte(outreachEmails.scheduledAt, now),
        sql`${outreachBatches.status} <> 'sent'`,
      ),
    )
    .orderBy(asc(outreachEmails.scheduledAt))
    .limit(allow);

  const results: Array<{ emailId: string; ok: boolean; error?: string }> = [];
  const touchedBatches = new Set<string>();

  for (const row of due) {
    if (results.filter((r) => r.ok).length >= allow) break;
    const mid = await assertLiveSendAllowed(1);
    if ("error" in mid) {
      results.push({ emailId: row.emailId, ok: false, error: mid.error });
      break;
    }
    const sent = await sendStoredDraft({
      emailId: row.emailId,
      forceTest: false,
    });
    if ("error" in sent) {
      results.push({ emailId: row.emailId, ok: false, error: sent.error });
    } else {
      results.push({ emailId: row.emailId, ok: true });
      if (row.batchId) touchedBatches.add(row.batchId);
    }
  }

  for (const batchId of touchedBatches) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.batchId, batchId),
          eq(outreachEmails.status, "queued"),
        ),
      );
    if (Number(count) === 0) {
      await db
        .update(outreachBatches)
        .set({
          status: "sent",
          autoSend: false,
          updatedAt: new Date(),
        })
        .where(eq(outreachBatches.id, batchId));
    } else {
      await db
        .update(outreachBatches)
        .set({ updatedAt: new Date() })
        .where(eq(outreachBatches.id, batchId));
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return {
    ok: true,
    attempted: results.length,
    sent,
    failed: results.length - sent,
    skipped: null,
    results,
  };
}
