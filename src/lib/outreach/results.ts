/**
 * Outreach results — open/click/reply metrics from DB.
 */

import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  inboundReplies,
  outreachEmails,
  prospects,
} from "@/lib/db/schema";
import { outreachSendBlockReason } from "./send-policy";

export type OutreachMailResultRow = {
  id: string;
  companyName: string;
  toEmail: string | null;
  subject: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
};

export type OutreachResultsSnapshot = {
  source: "db" | "empty";
  sendLocked: boolean;
  sendBlockReason: string | null;
  kpis: {
    drafts: number;
    sent: number;
    deliveredLike: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
  };
  rows: OutreachMailResultRow[];
  recentReplies: Array<{
    id: string;
    fromEmail: string;
    subject: string | null;
    bodyPreview: string | null;
    sentiment: string | null;
    receivedAt: string;
    companyName: string | null;
  }>;
};

function rate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

export async function getOutreachResultsSnapshot(): Promise<OutreachResultsSnapshot> {
  const block = outreachSendBlockReason();

  if (!hasDatabase()) {
    return {
      source: "empty",
      sendLocked: true,
      sendBlockReason: block,
      kpis: {
        drafts: 0,
        sent: 0,
        deliveredLike: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        openRate: 0,
        clickRate: 0,
        replyRate: 0,
      },
      rows: [],
      recentReplies: [],
    };
  }

  const db = getDb();

  const [drafts] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(eq(outreachEmails.status, "draft"));

  const [sent] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      sql`${outreachEmails.status} in ('sent','opened','clicked','replied','bounced','opted_out')`,
    );

  const [opened] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      sql`${outreachEmails.openedAt} is not null or ${outreachEmails.status} in ('opened','clicked','replied')`,
    );

  const [clicked] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      sql`${outreachEmails.clickedAt} is not null or ${outreachEmails.status} in ('clicked','replied')`,
    );

  const [replied] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      sql`${outreachEmails.repliedAt} is not null or ${outreachEmails.status} = 'replied'`,
    );

  const [bounced] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(eq(outreachEmails.status, "bounced"));

  const sentCount = sent?.c ?? 0;
  const openedCount = opened?.c ?? 0;
  const clickedCount = clicked?.c ?? 0;
  const repliedCount = replied?.c ?? 0;

  const mailRows = await db
    .select({
      id: outreachEmails.id,
      subject: outreachEmails.subject,
      status: outreachEmails.status,
      sentAt: outreachEmails.sentAt,
      openedAt: outreachEmails.openedAt,
      clickedAt: outreachEmails.clickedAt,
      repliedAt: outreachEmails.repliedAt,
      companyName: prospects.companyName,
      toEmail: prospects.email,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .orderBy(desc(outreachEmails.createdAt))
    .limit(100);

  const replies = await db
    .select({
      id: inboundReplies.id,
      fromEmail: inboundReplies.fromEmail,
      subject: inboundReplies.subject,
      bodyPreview: inboundReplies.bodyPreview,
      sentiment: inboundReplies.sentiment,
      receivedAt: inboundReplies.receivedAt,
      companyName: prospects.companyName,
    })
    .from(inboundReplies)
    .leftJoin(prospects, eq(inboundReplies.prospectId, prospects.id))
    .orderBy(desc(inboundReplies.receivedAt))
    .limit(20);

  return {
    source: "db",
    sendLocked: Boolean(block),
    sendBlockReason: block,
    kpis: {
      drafts: drafts?.c ?? 0,
      sent: sentCount,
      deliveredLike: sentCount - (bounced?.c ?? 0),
      opened: openedCount,
      clicked: clickedCount,
      replied: repliedCount,
      bounced: bounced?.c ?? 0,
      openRate: rate(openedCount, sentCount),
      clickRate: rate(clickedCount, sentCount),
      replyRate: rate(repliedCount, sentCount),
    },
    rows: mailRows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      toEmail: r.toEmail,
      subject: r.subject,
      status: r.status,
      sentAt: r.sentAt?.toISOString() ?? null,
      openedAt: r.openedAt?.toISOString() ?? null,
      clickedAt: r.clickedAt?.toISOString() ?? null,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      opened: Boolean(r.openedAt) || ["opened", "clicked", "replied"].includes(r.status),
      clicked: Boolean(r.clickedAt) || ["clicked", "replied"].includes(r.status),
      replied: Boolean(r.repliedAt) || r.status === "replied",
    })),
    recentReplies: replies.map((r) => ({
      id: r.id,
      fromEmail: r.fromEmail,
      subject: r.subject,
      bodyPreview: r.bodyPreview,
      sentiment: r.sentiment,
      receivedAt: r.receivedAt.toISOString(),
      companyName: r.companyName,
    })),
  };
}
