import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { inboundReplies, outreachEmails, prospects } from "@/lib/db/schema";
import { getCompanyCampaignId } from "@/lib/outreach/data";
import { OUTSTANDING_LEAD_SEQUENCE } from "@/lib/outreach/sequence";
import { appendOutreachSignature } from "@/lib/outreach/tone";

export type FollowUpRow = {
  prospectId: string;
  companyName: string;
  email: string;
  stepId: string;
  draftId?: string;
  ok: boolean;
  error?: string;
};

function personalize(body: string, companyName: string): string {
  return body.replace(/\bHoi,\n/, `Hoi,\n\nEven namens Thuishaven, richting ${companyName}.\n`);
}

export async function createDueFollowUpDrafts(limit = 10): Promise<{
  ok: boolean;
  error?: string;
  created: number;
  rows: FollowUpRow[];
}> {
  if (!hasDatabase()) {
    return { ok: false, error: "Geen database", created: 0, rows: [] };
  }

  const campaignId = await getCompanyCampaignId();
  if (!campaignId) {
    return { ok: false, error: "Geen bedrijfscampagne", created: 0, rows: [] };
  }

  const db = getDb();
  const sent = await db
    .select({
      emailId: outreachEmails.id,
      prospectId: outreachEmails.prospectId,
      sentAt: outreachEmails.sentAt,
      variantKey: outreachEmails.variantKey,
      companyName: prospects.companyName,
      email: prospects.email,
      status: prospects.status,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .where(
      and(
        eq(prospects.type, "company"),
        ne(prospects.status, "excluded"),
        ne(prospects.status, "replied"),
        ne(prospects.status, "lead"),
        isNotNull(prospects.email),
        isNotNull(outreachEmails.sentAt),
        sql`${outreachEmails.status} <> 'draft'`,
        sql`${outreachEmails.sentAt} <= now() - interval '3 days'`,
      ),
    )
    .orderBy(outreachEmails.sentAt);

  const latestByProspect = new Map<string, (typeof sent)[number]>();
  for (const row of sent) {
    if (!latestByProspect.has(row.prospectId)) {
      latestByProspect.set(row.prospectId, row);
    }
  }

  const rows: FollowUpRow[] = [];
  let created = 0;

  for (const row of latestByProspect.values()) {
    if (rows.length >= limit) break;
    if (!row.email || !row.sentAt) continue;

    const [reply] = await db
      .select({ id: inboundReplies.id })
      .from(inboundReplies)
      .where(eq(inboundReplies.prospectId, row.prospectId))
      .limit(1);
    if (reply) continue;

    const days = Math.floor(
      (Date.now() - row.sentAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    const step =
      days >= 7
        ? OUTSTANDING_LEAD_SEQUENCE.find((s) => s.id === "day7_soft_close")
        : OUTSTANDING_LEAD_SEQUENCE.find((s) => s.id === "day3_nudge");
    if (!step || step.id === "day0_initial") continue;

    const [existing] = await db
      .select({ id: outreachEmails.id })
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.prospectId, row.prospectId),
          eq(outreachEmails.variantKey, step.id),
        ),
      )
      .limit(1);
    if (existing) continue;

    const [draft] = await db
      .insert(outreachEmails)
      .values({
        campaignId,
        prospectId: row.prospectId,
        subject: step.subjectHint,
        body: appendOutreachSignature(personalize(step.exampleBody, row.companyName)),
        status: "draft",
        variantKey: step.id,
        subjectKey: "a",
      })
      .returning({ id: outreachEmails.id });

    created += 1;
    rows.push({
      prospectId: row.prospectId,
      companyName: row.companyName,
      email: row.email,
      stepId: step.id,
      draftId: draft?.id,
      ok: true,
    });
  }

  return { ok: true, created, rows };
}

export async function listFollowUpQueue(): Promise<{
  due: number;
  drafts: number;
}> {
  if (!hasDatabase()) return { due: 0, drafts: 0 };
  const db = getDb();
  const [due] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .where(
      and(
        eq(prospects.type, "company"),
        ne(prospects.status, "excluded"),
        ne(prospects.status, "replied"),
        ne(prospects.status, "lead"),
        isNotNull(outreachEmails.sentAt),
        sql`${outreachEmails.status} <> 'draft'`,
        sql`${outreachEmails.sentAt} <= now() - interval '3 days'`,
      ),
    );
  const [drafts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.status, "draft"),
        sql`${outreachEmails.variantKey} in ('day3_nudge', 'day7_soft_close')`,
      ),
    );
  return { due: due?.n ?? 0, drafts: drafts?.n ?? 0 };
}
