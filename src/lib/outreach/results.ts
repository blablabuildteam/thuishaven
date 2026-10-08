/**
 * Outreach results — open/click/reply + A/B by variant/subject.
 */

import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  inboundReplies,
  outreachEmails,
  prospects,
} from "@/lib/db/schema";
import {
  outreachLiveSendBlockReason,
  outreachTestSendBlockReason,
} from "./send-policy";
import { OUTREACH_SENDER_PROFILES } from "./sender-profiles";
import { FOLLOW_UP_READY_AFTER_DAYS } from "./sequence";
import { getOutreachVariant, type OutreachVariantId } from "./tone";

export type OutreachMailResultRow = {
  id: string;
  companyName: string;
  toEmail: string | null;
  subject: string;
  variantKey: string | null;
  subjectKey: string | null;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
};

export type AbRow = {
  variantKey: string;
  variantName: string;
  subjectKey: string;
  subject: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  winner?: boolean;
};

export type SenderKpiRow = {
  senderKey: string;
  label: string;
  senderEmail: string | null;
  senderProfileId: string | null;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
};

export type OutreachResultsSnapshot = {
  source: "db" | "empty";
  sendLocked: boolean;
  testSendAllowed: boolean;
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
  /** KPIs grouped by From / sender profile (Evenementen / Reiner / Yoram). */
  bySender: SenderKpiRow[];
  ab: AbRow[];
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
  /** Sent, opened, no reply — candidates for a soft reminder (not auto-sent). */
  followUpCandidates: Array<{
    id: string;
    companyName: string;
    toEmail: string | null;
    subject: string;
    sentAt: string;
    openedAt: string | null;
    daysSinceSent: number;
    ready: boolean;
  }>;
};

function senderLabel(
  profileId: string | null,
  email: string | null,
): string {
  if (profileId) {
    const found = OUTREACH_SENDER_PROFILES.find((p) => p.id === profileId);
    if (found) return found.label;
  }
  if (email) {
    const byEmail = OUTREACH_SENDER_PROFILES.find((p) => p.email === email);
    if (byEmail) return byEmail.label;
    return email;
  }
  return "Onbekend / legacy";
}

function rate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

export async function getOutreachResultsSnapshot(): Promise<OutreachResultsSnapshot> {
  const liveBlock = outreachLiveSendBlockReason();
  const testBlock = outreachTestSendBlockReason();

  if (!hasDatabase()) {
    return {
      source: "empty",
      sendLocked: Boolean(liveBlock),
      testSendAllowed: !testBlock,
      sendBlockReason: liveBlock,
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
      bySender: [],
      ab: [],
      rows: [],
      recentReplies: [],
      followUpCandidates: [],
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
      variantKey: outreachEmails.variantKey,
      subjectKey: outreachEmails.subjectKey,
      senderEmail: outreachEmails.senderEmail,
      senderProfileId: outreachEmails.senderProfileId,
      companyName: prospects.companyName,
      toEmail: prospects.email,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .orderBy(desc(outreachEmails.createdAt))
    .limit(100);

  const senderAgg = await db
    .select({
      senderEmail: outreachEmails.senderEmail,
      senderProfileId: outreachEmails.senderProfileId,
      sent: sql<number>`count(*)::int`,
      opened: sql<number>`count(*) filter (where ${outreachEmails.openedAt} is not null or ${outreachEmails.status} in ('opened','clicked','replied'))::int`,
      clicked: sql<number>`count(*) filter (where ${outreachEmails.clickedAt} is not null or ${outreachEmails.status} in ('clicked','replied'))::int`,
      replied: sql<number>`count(*) filter (where ${outreachEmails.repliedAt} is not null or ${outreachEmails.status} = 'replied')::int`,
      bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')::int`,
    })
    .from(outreachEmails)
    .where(
      sql`${outreachEmails.status} in ('sent','opened','clicked','replied','bounced','opted_out')
          or ${outreachEmails.sentAt} is not null`,
    )
    .groupBy(outreachEmails.senderEmail, outreachEmails.senderProfileId);

  const bySender: SenderKpiRow[] = senderAgg
    .map((r) => {
      const sentN = r.sent ?? 0;
      const openedN = r.opened ?? 0;
      const clickedN = r.clicked ?? 0;
      const repliedN = r.replied ?? 0;
      const key = r.senderProfileId ?? r.senderEmail ?? "unknown";
      return {
        senderKey: key,
        label: senderLabel(r.senderProfileId, r.senderEmail),
        senderEmail: r.senderEmail,
        senderProfileId: r.senderProfileId,
        sent: sentN,
        opened: openedN,
        clicked: clickedN,
        replied: repliedN,
        bounced: r.bounced ?? 0,
        openRate: rate(openedN, sentN),
        clickRate: rate(clickedN, sentN),
        replyRate: rate(repliedN, sentN),
      };
    })
    .sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label, "nl"));

  const abMap = new Map<string, AbRow>();
  for (const r of mailRows) {
    const isSent = ["sent", "opened", "clicked", "replied", "bounced", "opted_out"].includes(
      r.status,
    ) || Boolean(r.sentAt);
    if (!isSent) continue;
    const vk = r.variantKey ?? "unknown";
    const sk = r.subjectKey ?? "?";
    const key = `${vk}::${sk}`;
    const variantName = (() => {
      try {
        return getOutreachVariant(vk as OutreachVariantId).name;
      } catch {
        return vk;
      }
    })();
    const row =
      abMap.get(key) ??
      ({
        variantKey: vk,
        variantName,
        subjectKey: sk,
        subject: r.subject,
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        openRate: 0,
        clickRate: 0,
        replyRate: 0,
      } satisfies AbRow);
    row.sent += 1;
    if (r.openedAt || ["opened", "clicked", "replied"].includes(r.status)) {
      row.opened += 1;
    }
    if (r.clickedAt || ["clicked", "replied"].includes(r.status)) {
      row.clicked += 1;
    }
    if (r.repliedAt || r.status === "replied") row.replied += 1;
    abMap.set(key, row);
  }

  const ab = [...abMap.values()].map((r) => ({
    ...r,
    openRate: rate(r.opened, r.sent),
    clickRate: rate(r.clicked, r.sent),
    replyRate: rate(r.replied, r.sent),
  }));

  // Mark winner per variant (highest open rate with ≥1 sent)
  const byVariant = new Map<string, AbRow[]>();
  for (const row of ab) {
    const list = byVariant.get(row.variantKey);
    if (list) list.push(row);
    else byVariant.set(row.variantKey, [row]);
  }
  for (const group of byVariant.values()) {
    if (group.length < 2) continue;
    const best = [...group].sort((a, b) => b.openRate - a.openRate)[0];
    if (best && best.sent > 0) best.winner = true;
  }

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
    sendLocked: Boolean(liveBlock),
    testSendAllowed: !testBlock,
    sendBlockReason: liveBlock,
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
    bySender,
    ab: ab.sort((a, b) => a.variantKey.localeCompare(b.variantKey)),
    rows: mailRows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      toEmail: r.toEmail,
      subject: r.subject,
      variantKey: r.variantKey,
      subjectKey: r.subjectKey,
      status: r.status,
      sentAt: r.sentAt?.toISOString() ?? null,
      openedAt: r.openedAt?.toISOString() ?? null,
      clickedAt: r.clickedAt?.toISOString() ?? null,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      opened:
        Boolean(r.openedAt) ||
        ["opened", "clicked", "replied"].includes(r.status),
      clicked:
        Boolean(r.clickedAt) || ["clicked", "replied"].includes(r.status),
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
    followUpCandidates: mailRows
      .filter((r) => {
        const opened =
          Boolean(r.openedAt) ||
          ["opened", "clicked"].includes(r.status);
        const replied =
          Boolean(r.repliedAt) || r.status === "replied";
        return Boolean(r.sentAt) && opened && !replied;
      })
      .map((r) => {
        const sentAt = r.sentAt!;
        const daysSinceSent = Math.floor(
          (Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          id: r.id,
          companyName: r.companyName,
          toEmail: r.toEmail,
          subject: r.subject,
          sentAt: sentAt.toISOString(),
          openedAt: r.openedAt?.toISOString() ?? null,
          daysSinceSent,
          ready: daysSinceSent >= FOLLOW_UP_READY_AFTER_DAYS,
        };
      })
      .sort((a, b) => b.daysSinceSent - a.daysSinceSent),
  };
}
