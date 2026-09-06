/**
 * Record inbound replies against outreach mails.
 * Brevo transactional webhooks do not emit reply events — replies land in
 * evenement@. Use this from the manual Resultaten form or a future mailbox hook.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  inboundReplies,
  leads,
  outreachEmails,
  prospects,
} from "@/lib/db/schema";

export type RecordInboundReplyInput = {
  fromEmail: string;
  subject?: string | null;
  bodyPreview?: string | null;
  /** Prefer matching a specific outreach mail when known. */
  outreachEmailId?: string | null;
  receivedAt?: Date;
  /** Skip creating a warm lead even if sentiment looks positive. */
  skipLead?: boolean;
};

export type RecordInboundReplyResult =
  | {
      ok: true;
      matched: true;
      replyId: string;
      outreachEmailId: string;
      prospectId: string;
      sentiment: string;
      leadCreated: boolean;
    }
  | { ok: true; matched: false; reason: string }
  | { ok: false; reason: string };

const POSITIVE =
  /\b(ja|graag|interesse|rondleiding|bezichtiging|afspraak|datum|data|tour|capacity|capaciteit|beschikbaar|kom langs|plannen|uitnodig)\b/i;
const NEGATIVE =
  /\b(geen interesse|niet geïnteresseerd|niet interess|uitschrijven|afmelden|stop|unsubscribe|haal.*uit|niet meer mailen)\b/i;

export function inferReplySentiment(
  text: string | null | undefined,
): "positive" | "negative" | "neutral" {
  const raw = (text ?? "").trim();
  if (!raw) return "neutral";
  if (NEGATIVE.test(raw)) return "negative";
  if (POSITIVE.test(raw)) return "positive";
  return "neutral";
}

function preview(text: string | null | undefined, max = 500): string | null {
  if (!text?.trim()) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

export async function recordInboundReply(
  input: RecordInboundReplyInput,
): Promise<RecordInboundReplyResult> {
  if (!hasDatabase()) return { ok: false, reason: "no_db" };

  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!fromEmail || !fromEmail.includes("@")) {
    return { ok: false, reason: "invalid_from" };
  }

  const at = input.receivedAt ?? new Date();
  const subject = input.subject?.trim() || null;
  const bodyPreview = preview(input.bodyPreview);
  const sentiment = inferReplySentiment(
    [subject, bodyPreview].filter(Boolean).join(" "),
  );

  const db = getDb();

  let row:
    | {
        id: string;
        prospectId: string;
        status: string;
        openedAt: Date | null;
        repliedAt: Date | null;
        companyName: string;
      }
    | undefined;

  if (input.outreachEmailId) {
    const [byId] = await db
      .select({
        id: outreachEmails.id,
        prospectId: outreachEmails.prospectId,
        status: outreachEmails.status,
        openedAt: outreachEmails.openedAt,
        repliedAt: outreachEmails.repliedAt,
        companyName: prospects.companyName,
      })
      .from(outreachEmails)
      .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
      .where(eq(outreachEmails.id, input.outreachEmailId))
      .limit(1);
    row = byId;
  }

  if (!row) {
    const [byEmail] = await db
      .select({
        id: outreachEmails.id,
        prospectId: outreachEmails.prospectId,
        status: outreachEmails.status,
        openedAt: outreachEmails.openedAt,
        repliedAt: outreachEmails.repliedAt,
        companyName: prospects.companyName,
      })
      .from(outreachEmails)
      .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
      .where(
        sql`${outreachEmails.status} <> 'draft' and lower(${prospects.email}) = ${fromEmail}`,
      )
      .orderBy(sql`${outreachEmails.sentAt} desc nulls last`)
      .limit(1);
    row = byEmail;
  }

  if (!row) {
    return { ok: true, matched: false, reason: "no_matching_mail" };
  }

  // Soft dedupe: same from + same mail within 2 hours.
  const [dup] = await db
    .select({ id: inboundReplies.id })
    .from(inboundReplies)
    .where(
      and(
        eq(inboundReplies.outreachEmailId, row.id),
        sql`lower(${inboundReplies.fromEmail}) = ${fromEmail}`,
        sql`${inboundReplies.receivedAt} > now() - interval '2 hours'`,
      ),
    )
    .limit(1);

  if (dup) {
    return {
      ok: true,
      matched: true,
      replyId: dup.id,
      outreachEmailId: row.id,
      prospectId: row.prospectId,
      sentiment,
      leadCreated: false,
    };
  }

  const [inserted] = await db
    .insert(inboundReplies)
    .values({
      outreachEmailId: row.id,
      prospectId: row.prospectId,
      fromEmail,
      subject,
      bodyPreview,
      sentiment,
      receivedAt: at,
    })
    .returning({ id: inboundReplies.id });

  const patch: Partial<typeof outreachEmails.$inferInsert> = {
    status: "replied",
  };
  if (!row.repliedAt) patch.repliedAt = at;
  if (!row.openedAt) patch.openedAt = at;

  await db.update(outreachEmails).set(patch).where(eq(outreachEmails.id, row.id));

  await db
    .update(prospects)
    .set({
      status: sentiment === "positive" ? "lead" : "replied",
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, row.prospectId));

  let leadCreated = false;
  if (!input.skipLead && sentiment === "positive") {
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.prospectId, row.prospectId))
      .limit(1);

    if (!existingLead) {
      const summary =
        bodyPreview ??
        subject ??
        `Reply van ${fromEmail} — mogelijk warme interesse.`;
      await db.insert(leads).values({
        prospectId: row.prospectId,
        outreachEmailId: row.id,
        summary,
      });
      leadCreated = true;
    }
  }

  return {
    ok: true,
    matched: true,
    replyId: inserted!.id,
    outreachEmailId: row.id,
    prospectId: row.prospectId,
    sentiment,
    leadCreated,
  };
}
