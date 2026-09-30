/**
 * Success per mail template (variant) across every real send.
 */

import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachEmails } from "@/lib/db/schema";

import type { TemplateStat } from "./template-stat-label";

export type { TemplateStat };

export async function getTemplateStats(): Promise<Record<string, TemplateStat>> {
  if (!hasDatabase()) return {};
  const db = getDb();
  const rows = await db
    .select({
      variantKey: outreachEmails.variantKey,
      sent: sql<number>`count(*)::int`,
      opened: sql<number>`count(*) filter (where ${outreachEmails.openedAt} is not null or ${outreachEmails.status} in ('opened','clicked','replied'))::int`,
      clicked: sql<number>`count(*) filter (where ${outreachEmails.clickedAt} is not null or ${outreachEmails.status} in ('clicked','replied'))::int`,
      replied: sql<number>`count(*) filter (where ${outreachEmails.repliedAt} is not null or ${outreachEmails.status} = 'replied')::int`,
    })
    .from(outreachEmails)
    .where(sql`${outreachEmails.status} <> 'draft' and ${outreachEmails.sentAt} is not null`)
    .groupBy(outreachEmails.variantKey);

  const out: Record<string, TemplateStat> = {};
  for (const r of rows) {
    const key = r.variantKey ?? "unknown";
    out[key] = {
      variantKey: key,
      sent: r.sent,
      opened: r.opened,
      clicked: r.clicked,
      replied: r.replied,
      openRate: r.sent ? (r.opened / r.sent) * 100 : 0,
      replyRate: r.sent ? (r.replied / r.sent) * 100 : 0,
    };
  }
  return out;
}