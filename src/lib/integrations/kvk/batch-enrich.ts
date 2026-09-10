/**
 * Enrich existing company prospects one-by-one via name/KvK number.
 */

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import {
  applyKvkCandidateToProspect,
  enrichKnownCompany,
} from "./enrich";

export type BatchEnrichRow = {
  id: string;
  companyName: string;
  ok: boolean;
  error?: string;
  fit?: string;
  reason?: string;
};

export async function enrichCompanyProspectsBatch(limit = 10): Promise<{
  ok: boolean;
  error?: string;
  processed: number;
  rows: BatchEnrichRow[];
}> {
  if (!hasDatabase()) {
    return { ok: false, error: "Geen database", processed: 0, rows: [] };
  }

  const db = getDb();
  const targets = await db
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
      kvkNumber: prospects.kvkNumber,
    })
    .from(prospects)
    .where(
      and(
        eq(prospects.type, "company"),
        ne(prospects.status, "excluded"),
        isNull(prospects.kvkNumber),
      ),
    )
    .orderBy(sql`${prospects.createdAt} asc`)
    .limit(Math.min(Math.max(limit, 1), 15));

  const rows: BatchEnrichRow[] = [];

  for (const target of targets) {
    const found = await enrichKnownCompany({
      naam: target.companyName,
      kvkNummer: target.kvkNumber ?? undefined,
    });
    if (!found.ok) {
      rows.push({
        id: target.id,
        companyName: target.companyName,
        ok: false,
        error: found.error,
      });
      continue;
    }

    const applied = await applyKvkCandidateToProspect(target.id, found.candidate);
    if (!applied.ok) {
      rows.push({
        id: target.id,
        companyName: target.companyName,
        ok: false,
        error: applied.error,
      });
      continue;
    }

    const [row] = await db
      .select({ metadata: prospects.metadata })
      .from(prospects)
      .where(eq(prospects.id, target.id))
      .limit(1);
    const meta = row?.metadata ?? {};
    const fit = typeof meta.doelgroepFit === "string" ? meta.doelgroepFit : undefined;
    const reason =
      typeof meta.doelgroepReason === "string" ? meta.doelgroepReason : undefined;

    rows.push({
      id: target.id,
      companyName: target.companyName,
      ok: true,
      fit,
      reason,
    });
  }

  return { ok: true, processed: rows.length, rows };
}
