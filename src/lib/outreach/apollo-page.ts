import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { normalizeCompanyKey } from "@/lib/outreach/data";
import {
  criteriaSummary,
  DEFAULT_APOLLO_CRITERIA,
  normalizeCriteria,
  type ApolloSearchCriteria,
} from "@/lib/integrations/apollo/criteria";

export const APOLLO_CURSOR_NAME = "__apollo_cursor__";

export type ApolloUniverseSnapshot = {
  total: number;
  page: number;
  nextPage: number;
  criteriaLabel: string;
  criteria: ApolloSearchCriteria;
  checkedAt: string | null;
};

/** Next Apollo search page so repeat clicks don't burn credits on the same batch. */
export async function nextApolloDiscoverPage(): Promise<number> {
  const snap = await getApolloUniverseSnapshot();
  return snap.nextPage;
}

async function readCursorMeta(): Promise<Record<string, unknown>> {
  if (!hasDatabase()) return {};
  const db = getDb();
  const [existing] = await db
    .select({ metadata: prospects.metadata })
    .from(prospects)
    .where(eq(prospects.companyName, APOLLO_CURSOR_NAME))
    .limit(1);
  return (existing?.metadata ?? {}) as Record<string, unknown>;
}

export async function getApolloUniverseSnapshot(): Promise<ApolloUniverseSnapshot> {
  const meta = await readCursorMeta();
  const page = typeof meta.apolloPage === "number" ? meta.apolloPage : 0;
  const criteria = normalizeCriteria(
    meta.apolloCriteria && typeof meta.apolloCriteria === "object"
      ? (meta.apolloCriteria as Partial<ApolloSearchCriteria>)
      : DEFAULT_APOLLO_CRITERIA,
  );
  return {
    total:
      typeof meta.apolloUniverseTotal === "number"
        ? meta.apolloUniverseTotal
        : 0,
    page,
    nextPage: page + 1,
    criteriaLabel:
      typeof meta.apolloCriteriaLabel === "string"
        ? meta.apolloCriteriaLabel
        : criteriaSummary(criteria),
    criteria,
    checkedAt:
      typeof meta.apolloUniverseCheckedAt === "string"
        ? meta.apolloUniverseCheckedAt
        : null,
  };
}

async function upsertApolloCursor(
  patch: Record<string, unknown>,
): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  const [existing] = await db
    .select({ id: prospects.id, metadata: prospects.metadata })
    .from(prospects)
    .where(eq(prospects.companyName, APOLLO_CURSOR_NAME))
    .limit(1);

  const metadata = {
    ...(existing?.metadata ?? {}),
    source: "system",
    ...patch,
  };
  const now = new Date();

  if (existing) {
    await db
      .update(prospects)
      .set({ metadata, status: "excluded", updatedAt: now })
      .where(eq(prospects.id, existing.id));
    return;
  }

  await db.insert(prospects).values({
    type: "company",
    companyName: APOLLO_CURSOR_NAME,
    status: "excluded",
    excludedReason: "Systeem · Apollo-pagina",
    metadata,
  });
}

/** Remember Apollo's reported universe size for the active criteria. */
export async function rememberApolloUniverse(input: {
  total: number;
  criteria: ApolloSearchCriteria;
}): Promise<void> {
  await upsertApolloCursor({
    apolloUniverseTotal: input.total,
    apolloUniverseCheckedAt: new Date().toISOString(),
    apolloCriteria: input.criteria,
    apolloCriteriaLabel: criteriaSummary(input.criteria),
  });
}

/** Stamp the fetched page even when every name was a duplicate or excluded. */
export async function rememberApolloPage(
  page: number,
  companyNames: string[],
): Promise<void> {
  if (!hasDatabase()) return;
  await upsertApolloCursor({ apolloPage: page });
  if (companyNames.length === 0) return;

  const db = getDb();
  const keys = new Set(companyNames.map(normalizeCompanyKey).filter(Boolean));
  const rows = await db
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
      metadata: prospects.metadata,
    })
    .from(prospects);

  const now = new Date();
  for (const row of rows) {
    if (!keys.has(normalizeCompanyKey(row.companyName))) continue;
    await db
      .update(prospects)
      .set({
        metadata: { ...(row.metadata ?? {}), apolloPage: page },
        updatedAt: now,
      })
      .where(eq(prospects.id, row.id));
  }
}

export function isSystemProspect(input: {
  companyName?: string | null;
  source?: string | null;
}): boolean {
  return (
    input.source === "system" || input.companyName === APOLLO_CURSOR_NAME
  );
}
