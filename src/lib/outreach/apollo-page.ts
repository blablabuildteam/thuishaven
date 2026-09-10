import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { normalizeCompanyKey } from "@/lib/outreach/data";

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

/** Stamp the fetched page even when every name was already on the list. */
export async function rememberApolloPage(
  page: number,
  companyNames: string[],
): Promise<void> {
  if (!hasDatabase() || companyNames.length === 0) return;
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
