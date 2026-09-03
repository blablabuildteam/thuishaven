/**
 * Apply Brevo transactional webhook events to outreach_emails.
 */

import { eq, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { inboundReplies, outreachEmails, prospects } from "@/lib/db/schema";

export type BrevoWebhookEvent = {
  event?: string;
  email?: string;
  date?: string;
  "message-id"?: string;
  messageId?: string;
  subject?: string;
  tag?: string | string[];
  tags?: string[];
  link?: string;
};

/** Strip wrapping <> — Brevo + our store may differ. */
export function normalizeMessageId(id: string | undefined | null): string | null {
  if (!id) return null;
  return id.replace(/^<|>$/g, "").trim() || null;
}

function messageIdVariants(id: string): string[] {
  const bare = normalizeMessageId(id)!;
  return [...new Set([bare, `<${bare}>`, id.trim()])];
}

function eventTime(raw?: string): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function hasOutreachTag(event: BrevoWebhookEvent): boolean {
  const tags = [
    ...(Array.isArray(event.tags) ? event.tags : []),
    ...(Array.isArray(event.tag) ? event.tag : event.tag ? [event.tag] : []),
  ]
    .flatMap((t) => String(t).split(","))
    .map((t) => t.trim().toLowerCase());
  return tags.some((t) => t.includes("outreach"));
}

export async function applyBrevoOutreachEvent(
  event: BrevoWebhookEvent,
): Promise<{ ok: boolean; matched?: boolean; reason?: string }> {
  if (!hasDatabase()) return { ok: false, reason: "no_db" };

  const eventName = (event.event ?? "").toLowerCase();
  if (!eventName) return { ok: false, reason: "no_event" };

  const rawMessageId = event["message-id"] ?? event.messageId;
  const messageId = normalizeMessageId(rawMessageId);
  const email = event.email?.trim().toLowerCase();

  const db = getDb();

  let row:
    | {
        id: string;
        prospectId: string;
        status: string;
        openedAt: Date | null;
        clickedAt: Date | null;
        repliedAt: Date | null;
      }
    | undefined;

  if (messageId) {
    const variants = messageIdVariants(rawMessageId!);
    const [byMsg] = await db
      .select({
        id: outreachEmails.id,
        prospectId: outreachEmails.prospectId,
        status: outreachEmails.status,
        openedAt: outreachEmails.openedAt,
        clickedAt: outreachEmails.clickedAt,
        repliedAt: outreachEmails.repliedAt,
      })
      .from(outreachEmails)
      .where(
        or(
          ...variants.map((v) => eq(outreachEmails.brevoMessageId, v)),
          sql`replace(replace(${outreachEmails.brevoMessageId}, '<', ''), '>', '') = ${messageId}`,
        ),
      )
      .limit(1);
    row = byMsg;
  }

  if (!row && email) {
    const [byProspectEmail] = await db
      .select({
        id: outreachEmails.id,
        prospectId: outreachEmails.prospectId,
        status: outreachEmails.status,
        openedAt: outreachEmails.openedAt,
        clickedAt: outreachEmails.clickedAt,
        repliedAt: outreachEmails.repliedAt,
      })
      .from(outreachEmails)
      .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
      .where(
        sql`${outreachEmails.status} <> 'draft' and lower(${prospects.email}) = ${email}`,
      )
      .orderBy(sql`${outreachEmails.sentAt} desc nulls last`)
      .limit(1);
    row = byProspectEmail;
  }

  if (!row) {
    return {
      ok: true,
      matched: false,
      reason: hasOutreachTag(event) ? "unmatched_outreach" : "unmatched",
    };
  }

  const at = eventTime(event.date);
  const patch: Partial<typeof outreachEmails.$inferInsert> = {};

  if (
    eventName === "delivered" ||
    eventName === "requests" ||
    eventName === "request"
  ) {
    if (row.status === "queued" || row.status === "draft") {
      patch.status = "sent";
      patch.sentAt = at;
    }
  }

  if (
    eventName === "opened" ||
    eventName === "unique_opened" ||
    eventName === "uniqueopened"
  ) {
    patch.status = "opened";
    if (!row.openedAt) patch.openedAt = at;
  }

  if (
    eventName === "click" ||
    eventName === "clicks" ||
    eventName === "unique_clicks" ||
    eventName === "uniqueclicks"
  ) {
    patch.status = "clicked";
    if (!row.openedAt) patch.openedAt = at;
    if (!row.clickedAt) patch.clickedAt = at;
  }

  if (
    eventName === "hardbounce" ||
    eventName === "softbounce" ||
    eventName === "bounce" ||
    eventName === "blocked" ||
    eventName === "invalid"
  ) {
    patch.status = "bounced";
  }

  if (eventName === "unsubscribed") {
    patch.status = "opted_out";
  }

  if (eventName === "reply" || eventName === "inbound" || eventName === "replied") {
    patch.status = "replied";
    if (!row.repliedAt) patch.repliedAt = at;
    if (!row.openedAt) patch.openedAt = at;

    await db.insert(inboundReplies).values({
      outreachEmailId: row.id,
      prospectId: row.prospectId,
      fromEmail: email ?? "unknown",
      subject: event.subject ?? null,
      bodyPreview: null,
      sentiment: null,
      receivedAt: at,
    });
  }

  if (Object.keys(patch).length) {
    await db
      .update(outreachEmails)
      .set(patch)
      .where(eq(outreachEmails.id, row.id));
  }

  return { ok: true, matched: true };
}
