/**
 * Outreach data layer — DB first, mock fallback.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  campaigns,
  exclusions,
  leads,
  outreachEmails,
  prospects,
} from "@/lib/db/schema";
import {
  campaigns as mockCampaigns,
  leads as mockLeads,
  prospects as mockProspects,
  sampleEmails as mockEmails,
  outreachKpis as mockKpis,
  statusLabels,
  type ProspectStatus,
  type ProspectType,
} from "@/lib/mock/outreach";

export { statusLabels };
export type { ProspectStatus, ProspectType };

export type OutreachProspect = {
  id: string;
  type: ProspectType;
  companyName: string;
  sector: string | null;
  employeeCount: number | null;
  city: string | null;
  anniversaryYears: number | null;
  email: string | null;
  status: ProspectStatus;
  contacts?: string[];
  excludedReason?: string | null;
  source?: string;
};

export type OutreachLead = {
  id: string;
  companyName: string;
  summary: string | null;
  createdAt: string;
  notified: boolean;
  email?: string | null;
};

export type OutreachEmailRow = {
  id: string;
  prospectName: string;
  audience: ProspectType;
  subject: string;
  body: string;
  status: string;
  toEmail?: string | null;
};

export type OutreachExclusion = {
  id: string;
  companyName: string | null;
  email: string | null;
  reason: string;
  createdAt: string;
};

export async function listProspects(options?: {
  type?: ProspectType;
}): Promise<{ rows: OutreachProspect[]; source: "db" | "mock" }> {
  if (!hasDatabase()) {
    const rows = mockProspects
      .filter((p) => !options?.type || p.type === options.type)
      .map((p) => ({ ...p, sector: p.sector }));
    return { rows, source: "mock" };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(prospects)
    .where(options?.type ? eq(prospects.type, options.type) : undefined)
    .orderBy(prospects.companyName);

  return {
    source: "db",
    rows: rows.map((p) => {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      const contacts = Array.isArray(meta.contacts)
        ? meta.contacts.filter((c): c is string => typeof c === "string")
        : undefined;
      return {
        id: p.id,
        type: p.type,
        companyName: p.companyName,
        sector: p.sector,
        employeeCount: p.employeeCount,
        city: p.city,
        anniversaryYears: p.anniversaryYears,
        email: p.email,
        status: p.status,
        contacts,
        excludedReason: p.excludedReason,
        source: typeof meta.source === "string" ? meta.source : undefined,
      };
    }),
  };
}

export async function listExclusions(): Promise<{
  rows: OutreachExclusion[];
  source: "db" | "mock";
}> {
  if (!hasDatabase()) {
    return {
      source: "mock",
      rows: [
        {
          id: "ex-mock",
          companyName: "Booking.com",
          email: null,
          reason: "Bestaande relatie / no-go (mock)",
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(exclusions)
    .orderBy(exclusions.companyName);

  return {
    source: "db",
    rows: rows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      email: r.email,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function listLeads(): Promise<{
  rows: OutreachLead[];
  source: "db" | "mock";
}> {
  if (!hasDatabase()) {
    return {
      source: "mock",
      rows: mockLeads.map((l) => ({
        id: l.id,
        companyName: l.companyName,
        summary: l.summary,
        createdAt: l.createdAt,
        notified: l.notified,
      })),
    };
  }

  const db = getDb();
  const rows = await db
    .select({
      id: leads.id,
      summary: leads.summary,
      createdAt: leads.createdAt,
      notifiedAt: leads.notifiedAt,
      companyName: prospects.companyName,
      email: prospects.email,
    })
    .from(leads)
    .innerJoin(prospects, eq(leads.prospectId, prospects.id))
    .orderBy(desc(leads.createdAt));

  return {
    source: "db",
    rows: rows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      summary: r.summary,
      createdAt: r.createdAt.toISOString(),
      notified: Boolean(r.notifiedAt),
      email: r.email,
    })),
  };
}

export async function listOutreachEmails(limit = 40): Promise<{
  rows: OutreachEmailRow[];
  source: "db" | "mock";
}> {
  if (!hasDatabase()) {
    return {
      source: "mock",
      rows: mockEmails.map((e) => ({
        id: e.id,
        prospectName: e.prospectName,
        audience: e.audience,
        subject: e.subject,
        body: e.body,
        status: e.status,
      })),
    };
  }

  const db = getDb();
  const rows = await db
    .select({
      id: outreachEmails.id,
      subject: outreachEmails.subject,
      body: outreachEmails.body,
      status: outreachEmails.status,
      companyName: prospects.companyName,
      type: prospects.type,
      email: prospects.email,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .orderBy(desc(outreachEmails.createdAt))
    .limit(limit);

  if (rows.length === 0) {
    return {
      source: "db",
      rows: mockEmails.map((e) => ({
        id: e.id,
        prospectName: e.prospectName,
        audience: e.audience,
        subject: e.subject,
        body: e.body,
        status: e.status,
      })),
    };
  }

  return {
    source: "db",
    rows: rows.map((r) => ({
      id: r.id,
      prospectName: r.companyName,
      audience: r.type,
      subject: r.subject,
      body: r.body,
      status: r.status,
      toEmail: r.email,
    })),
  };
}

export async function getOutreachOverview() {
  if (!hasDatabase()) {
    return {
      source: "mock" as const,
      kpis: mockKpis,
      campaigns: mockCampaigns.map((c) => ({
        ...c,
        sentCount: 0,
        openCount: 0,
        replyCount: 0,
        leadCount: 0,
        status: "draft" as const,
      })),
      leads: mockLeads,
      prospectCount: mockProspects.length,
      exclusionCount: 1,
    };
  }

  const db = getDb();
  const [prospectCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prospects);
  const [exclusionCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(exclusions);
  const [sentRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      sql`${outreachEmails.status} in ('sent','opened','clicked','replied')`,
    );
  const [openedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(
      sql`${outreachEmails.status} in ('opened','clicked','replied')`,
    );
  const [repliedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outreachEmails)
    .where(eq(outreachEmails.status, "replied"));
  const [leadCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads);
  const [unreachableRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prospects)
    .where(eq(prospects.status, "unreachable"));

  const campaignsLive = await listCampaignsWithLiveStats();
  const leadRows = await listLeads();

  return {
    source: "db" as const,
    kpis: {
      prospectsTotal: prospectCountRow?.count ?? 0,
      sent: sentRow?.count ?? 0,
      opened: openedRow?.count ?? 0,
      replied: repliedRow?.count ?? 0,
      leads: leadCountRow?.count ?? 0,
      unreachable: unreachableRow?.count ?? 0,
    },
    campaigns: campaignsLive.rows,
    leads: leadRows.rows,
    prospectCount: prospectCountRow?.count ?? 0,
    exclusionCount: exclusionCountRow?.count ?? 0,
  };
}

/** Campaign cards with live mail stats (not stale mock counters). */
export async function listCampaignsWithLiveStats(): Promise<{
  source: "db" | "mock";
  rows: Array<{
    id: string;
    name: string;
    audience: ProspectType;
    status: string;
    description: string;
    sentCount: number;
    openCount: number;
    replyCount: number;
    leadCount: number;
  }>;
}> {
  if (!hasDatabase()) {
    return {
      source: "mock",
      rows: mockCampaigns.map((c) => ({
        ...c,
        sentCount: 0,
        openCount: 0,
        replyCount: 0,
        leadCount: 0,
        status: "draft",
      })),
    };
  }

  const db = getDb();
  const campRows = await db.select().from(campaigns).orderBy(campaigns.name);

  const stats = await db
    .select({
      audience: prospects.type,
      sent: sql<number>`count(*) filter (where ${outreachEmails.status} in ('sent','opened','clicked','replied') or ${outreachEmails.sentAt} is not null)::int`,
      opened: sql<number>`count(*) filter (where ${outreachEmails.openedAt} is not null or ${outreachEmails.status} in ('opened','clicked','replied'))::int`,
      replied: sql<number>`count(*) filter (where ${outreachEmails.repliedAt} is not null or ${outreachEmails.status} = 'replied')::int`,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .groupBy(prospects.type);

  const leadsByAudience = await db
    .select({
      audience: prospects.type,
      c: sql<number>`count(*)::int`,
    })
    .from(leads)
    .innerJoin(prospects, eq(leads.prospectId, prospects.id))
    .groupBy(prospects.type);

  const statMap = new Map(stats.map((s) => [s.audience, s]));
  const leadMap = new Map(leadsByAudience.map((s) => [s.audience, s.c]));

  const rows =
    campRows.length > 0
      ? campRows.map((c) => {
          const s = statMap.get(c.audience);
          return {
            id: c.id,
            name: c.name,
            audience: c.audience,
            status: c.status,
            description: c.description ?? "",
            sentCount: s?.sent ?? 0,
            openCount: s?.opened ?? 0,
            replyCount: s?.replied ?? 0,
            leadCount: leadMap.get(c.audience) ?? 0,
          };
        })
      : mockCampaigns.map((c) => ({
          ...c,
          sentCount: 0,
          openCount: 0,
          replyCount: 0,
          leadCount: 0,
          status: "draft",
        }));

  return { source: "db", rows };
}

export async function getProspectById(id: string) {
  if (!hasDatabase()) {
    return mockProspects.find((p) => p.id === id) ?? null;
  }
  const db = getDb();
  const [row] = await db.select().from(prospects).where(eq(prospects.id, id));
  return row ?? null;
}

export async function ensureDefaultCampaigns() {
  if (!hasDatabase()) return;
  const db = getDb();
  const existing = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
  if (existing.length) return;

  await db.insert(campaigns).values([
    {
      name: "Jubilea Amsterdam · open",
      audience: "company",
      status: "draft",
      description:
        "Bedrijven 500–5.000 medewerkers, Amsterdam + 50 km, focus op 5/10/25-jarig jubileum.",
    },
    {
      name: "Open data · Event bureaus",
      audience: "agency",
      status: "active",
      description:
        "Doorlopende beschikbaarheids-updates naar partner event management bureaus.",
    },
  ]);
}

export async function getAgencyCampaignId(): Promise<string | null> {
  if (!hasDatabase()) return null;
  await ensureDefaultCampaigns();
  const db = getDb();
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.audience, "agency")))
    .limit(1);
  return row?.id ?? null;
}

export function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(n\.?v\.?|b\.?v\.?|vof|ltd|inc|groep|group)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
