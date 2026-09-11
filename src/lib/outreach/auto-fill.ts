/**
 * Hands-off enrichment drain: KvK → people → Hunter → website-mail.
 * Optional: pull one Apollo discover page first.
 */

import {
  hasApolloConfig,
  searchDoelgroepCompanies,
  enrichOrganizationHeadcount,
} from "@/lib/integrations/apollo/client";
import {
  keepForIntake,
  normalizeCriteria,
  type ApolloSearchCriteria,
} from "@/lib/integrations/apollo/criteria";
import { enrichCompanyProspectsBatch } from "@/lib/integrations/kvk/batch-enrich";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasHunterConfig } from "@/lib/integrations/hunter/client";
import { addProspects } from "@/lib/outreach/intake";
import {
  nextApolloDiscoverPage,
  rememberApolloPage,
} from "@/lib/outreach/apollo-page";
import {
  fillDecisionMakers,
  fillHunterEmailsForDecisionMakers,
} from "@/lib/outreach/decision-makers";
import { fillCompanyWebsiteEmails } from "@/lib/outreach/website-email";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

export type AutoFillSummary = {
  ok: boolean;
  error?: string;
  discover?: {
    page: number;
    created: number;
    duplicate: number;
    outOfRegion: number;
  };
  headcountFilled: number;
  kvkProcessed: number;
  kvkOk: number;
  peopleFilled: number;
  hunterFilled: number;
  websiteFilled: number;
  rounds: {
    kvk: number;
    people: number;
    hunter: number;
    website: number;
  };
};

async function fillMissingApolloHeadcounts(limit = 20): Promise<number> {
  if (!hasDatabase() || !hasApolloConfig()) return 0;
  const db = getDb();
  const rows = await db
    .select({
      id: prospects.id,
      website: prospects.website,
      metadata: prospects.metadata,
      employeeCount: prospects.employeeCount,
    })
    .from(prospects)
    .where(
      and(
        eq(prospects.type, "company"),
        ne(prospects.status, "excluded"),
        sql`coalesce(${prospects.metadata}->>'source', '') <> 'system'`,
        sql`coalesce(${prospects.metadata}->>'doelgroepFit', '') <> 'nee'`,
        sql`${prospects.website} is not null`,
        sql`(${prospects.metadata}->>'apolloEmployeeCount') is null`,
        sql`coalesce((${prospects.metadata}->>'apolloHeadcountFails')::int, 0) < 2`,
      ),
    )
    .orderBy(sql`${prospects.createdAt} asc`)
    .limit(Math.min(Math.max(limit, 1), 25));

  let filled = 0;
  for (const row of rows) {
    const meta = { ...(row.metadata ?? {}) };
    const result = await enrichOrganizationHeadcount(row.website);
    if (!result.ok || result.employeeCount == null) {
      meta.apolloHeadcountFails =
        typeof meta.apolloHeadcountFails === "number"
          ? meta.apolloHeadcountFails + 1
          : 1;
      meta.apolloHeadcountError = result.error ?? "geen headcount";
      await db
        .update(prospects)
        .set({ metadata: meta, updatedAt: new Date() })
        .where(eq(prospects.id, row.id));
      continue;
    }
    meta.apolloEmployeeCount = result.employeeCount;
    if (result.city) meta.apolloCity = result.city;
    delete meta.apolloHeadcountFails;
    delete meta.apolloHeadcountError;
    await db
      .update(prospects)
      .set({
        metadata: meta,
        employeeCount: result.employeeCount,
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, row.id));
    filled += 1;
  }
  return filled;
}

export async function runOutreachAutoFill(options?: {
  discover?: boolean;
  criteria?: Partial<ApolloSearchCriteria> | null;
  maxKvkRounds?: number;
  maxPeopleRounds?: number;
  maxHunterRounds?: number;
  maxWebsiteRounds?: number;
  fillHeadcounts?: boolean;
}): Promise<AutoFillSummary> {
  const summary: AutoFillSummary = {
    ok: true,
    headcountFilled: 0,
    kvkProcessed: 0,
    kvkOk: 0,
    peopleFilled: 0,
    hunterFilled: 0,
    websiteFilled: 0,
    rounds: { kvk: 0, people: 0, hunter: 0, website: 0 },
  };

  if (options?.discover) {
    if (!hasApolloConfig()) {
      return { ...summary, ok: false, error: "Apollo niet gekoppeld" };
    }
    const criteria = normalizeCriteria(options.criteria);
    const page = await nextApolloDiscoverPage();
    const search = await searchDoelgroepCompanies({
      page,
      perPage: 100,
      criteria,
    });
    if (!search.ok) {
      return { ...summary, ok: false, error: search.error };
    }
    const keep = keepForIntake(search.companies);
    const outOfRegion = search.companies.length - keep.length;
    const added = await addProspects({
      type: "company",
      source: "apollo",
      drafts: keep.map((c) => ({
        companyName: c.name,
        website: c.website ?? null,
        linkedinUrl: c.linkedinUrl ?? null,
        city: c.city ?? null,
        employeeCount: c.employeeCount ?? null,
        sector: c.industry ?? null,
        apolloPage: search.page,
      })),
    });
    if (!added.ok) {
      return { ...summary, ok: false, error: added.error };
    }
    await rememberApolloPage(
      search.page,
      search.companies.map((c) => c.name),
    );
    summary.discover = {
      page: search.page,
      created: added.created,
      duplicate: added.duplicate,
      outOfRegion,
    };
  }

  if (options?.fillHeadcounts !== false && hasApolloConfig()) {
    summary.headcountFilled = await fillMissingApolloHeadcounts(20);
  }

  if (hasKvkConfig()) {
    const maxRounds = options?.maxKvkRounds ?? 8;
    for (let i = 0; i < maxRounds; i++) {
      const batch = await enrichCompanyProspectsBatch(12);
      if (!batch.ok) {
        return { ...summary, ok: false, error: batch.error };
      }
      if (batch.processed === 0) break;
      summary.rounds.kvk += 1;
      summary.kvkProcessed += batch.processed;
      summary.kvkOk += batch.rows.filter((r) => r.ok).length;
    }
  }

  if (hasApolloConfig()) {
    const maxRounds = options?.maxPeopleRounds ?? 10;
    for (let i = 0; i < maxRounds; i++) {
      const batch = await fillDecisionMakers(12);
      if (!batch.ok) {
        return { ...summary, ok: false, error: batch.error };
      }
      if (batch.processed === 0) break;
      summary.rounds.people += 1;
      summary.peopleFilled += batch.filled;
    }
  }

  if (hasHunterConfig()) {
    const maxRounds = options?.maxHunterRounds ?? 8;
    for (let i = 0; i < maxRounds; i++) {
      const batch = await fillHunterEmailsForDecisionMakers(12);
      if (!batch.ok) break;
      if (batch.processed === 0) break;
      summary.rounds.hunter += 1;
      summary.hunterFilled += batch.filled;
    }
  }

  {
    const maxRounds = options?.maxWebsiteRounds ?? 6;
    for (let i = 0; i < maxRounds; i++) {
      const batch = await fillCompanyWebsiteEmails(10);
      if (!batch.ok) break;
      if (batch.processed === 0) break;
      summary.rounds.website += 1;
      summary.websiteFilled += batch.filled;
    }
  }

  return summary;
}

/** Count open work that auto-fill can still touch (excludes permanent fails). */
export async function countAutoFillPending(): Promise<{
  kvk: number;
  people: number;
  hunter: number;
  website: number;
  headcount: number;
}> {
  if (!hasDatabase()) {
    return { kvk: 0, people: 0, hunter: 0, website: 0, headcount: 0 };
  }
  const db = getDb();
  const base = and(
    eq(prospects.type, "company"),
    ne(prospects.status, "excluded"),
    sql`coalesce(${prospects.metadata}->>'source', '') <> 'system'`,
    sql`coalesce(${prospects.metadata}->>'doelgroepFit', '') <> 'nee'`,
  );

  const [kvk] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(
      and(
        base,
        isNull(prospects.kvkNumber),
        sql`coalesce((${prospects.metadata}->>'kvkEnrichFails')::int, 0) < 2`,
      ),
    );

  const [people] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(
      and(
        base,
        sql`${prospects.metadata}->>'decisionMaker' is null`,
        sql`coalesce((${prospects.metadata}->>'decisionMakerFails')::int, 0) < 2`,
      ),
    );

  const [hunter] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(
      and(
        base,
        sql`${prospects.metadata}->>'decisionMaker' is not null`,
        sql`coalesce(${prospects.metadata}->'decisionMaker'->>'email', '') = ''`,
        sql`coalesce((${prospects.metadata}->>'hunterEmailFails')::int, 0) < 2`,
      ),
    );

  const [website] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(
      and(
        base,
        isNull(prospects.email),
        sql`${prospects.website} is not null`,
        sql`coalesce((${prospects.metadata}->>'websiteEmailFails')::int, 0) < 2`,
      ),
    );

  const [headcount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(
      and(
        base,
        sql`${prospects.website} is not null`,
        sql`(${prospects.metadata}->>'apolloEmployeeCount') is null`,
        sql`coalesce((${prospects.metadata}->>'apolloHeadcountFails')::int, 0) < 2`,
      ),
    );

  return {
    kvk: kvk?.n ?? 0,
    people: people?.n ?? 0,
    hunter: hunter?.n ?? 0,
    website: website?.n ?? 0,
    headcount: headcount?.n ?? 0,
  };
}
