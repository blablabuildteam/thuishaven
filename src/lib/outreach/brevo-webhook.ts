/**
 * Apply Brevo transactional webhook events to outreach_emails.
 */

import { eq, sql } from "drizzle-orm";
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

function normalizeMessageId(id: string | undefined | null): string | null {
  if (!id) return null;
  return id.replace(/^<|>$/g, "").trim() || null;
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
  ].map((t) => t.toLowerCase());
  return tags.some((t) => t.includes("outreach"));
}

export async function applyBrevoOutreachEvent(
  event: BrevoWebhookEvent,
): Promise<{ ok: boolean; matched?: boolean; reason?: string }> {
  if (!hasDatabase()) return { ok: false, reason: "no_db" };

  const eventName = (event.event ?? "").toLowerCase();
  if (!eventName) return { ok: false, reason: "no_event" };

  const messageId = normalizeMessageId(
    event["message-id"] ?? event.messageId,
  );
  const email = event.email?.trim().toLowerCase();

  // Prefer matching outreach-tagged events; still allow match by message-id
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
      .where(eq(outreachEmails.brevoMessageId, messageId))
      .limit(1);
    row = byMsg;
  }

  if (!row && email) {
    // Fallback: latest sent mail to this address
    const [byEmail] = await db
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
        sql`lower(${prospects.email}) = ${email} and ${outreachEmails.status} <> 'draft'`,
      )
      .orderBy(sql`${outreachEmails.sentAt} desc nulls last`)
      .limit(1);
    row = byEmail;
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

  if (eventName === "opened" || eventName === "unique_opened" || eventName === "uniqueOpened") {
    patch.status = "opened";
    if (!row.openedAt) patch.openedAt = at;
  }

  if (eventName === "click" || eventName === "clicks" || eventName === "unique_clicks") {
    patch.status = "clicked";
    if (!row.openedAt) patch.openedAt = at;
    if (!row.clickedAt) patch.clickedAt = at;
  }

  if (
    eventName === "hardBounce" ||
    eventName === "softBounce" ||
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
