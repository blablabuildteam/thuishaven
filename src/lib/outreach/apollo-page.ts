import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { normalizeCompanyKey } from "@/lib/outreach/data";

export const APOLLO_CURSOR_NAME = "__apollo_cursor__";

/** Next Apollo search page so repeat clicks don't burn credits on the same 25. */
export async function nextApolloDiscoverPage(): Promise<number> {
  if (!hasDatabase()) return 1;
  const db = getDb();
  const rows = await db.select({ metadata: prospects.metadata }).from(prospects);
  let maxPage = 0;
  for (const row of rows) {
    const page = row.metadata?.apolloPage;
    if (typeof page === "number" && page > maxPage) maxPage = page;
  }
  return maxPage + 1;
}

async function upsertApolloCursor(page: number): Promise<void> {
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
    apolloPage: page,
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

/** Stamp the fetched page even when every name was a duplicate or excluded. */
export async function rememberApolloPage(
  page: number,
  companyNames: string[],
): Promise<void> {
  if (!hasDatabase()) return;
  await upsertApolloCursor(page);
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
