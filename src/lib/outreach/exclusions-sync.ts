/**
 * Sync "Niet mailen" exclusions into CRM dossiers.
 * Keeps the exclusions table as the intake gate; CRM gets visible records.
 */

import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { exclusions, prospects } from "@/lib/db/schema";
import { normalizeCompanyKey } from "@/lib/outreach/data";

export const EXISTING_CUSTOMER_REASON = "Al klant / niet mailen";
export const EXCLUSION_IMPORT_SOURCE = "exclusion_import";

export type SyncExclusionsResult = {
  ok: boolean;
  error?: string;
  created: number;
  updated: number;
  partnersLeft: number;
};

export async function syncExclusionsToCrm(): Promise<SyncExclusionsResult> {
  if (!hasDatabase()) {
    return {
      ok: false,
      error: "Geen database",
      created: 0,
      updated: 0,
      partnersLeft: 0,
    };
  }

  const db = getDb();
  const exclusionRows = await db.select().from(exclusions);
  const existing = await db.select().from(prospects);
  const byKey = new Map(
    existing.map((p) => [normalizeCompanyKey(p.companyName), p]),
  );

  let created = 0;
  let updated = 0;
  let partnersLeft = 0;
  const now = new Date();

  for (const row of exclusionRows) {
    const companyName = row.companyName?.trim();
    if (!companyName) continue;

    const key = normalizeCompanyKey(companyName);
    if (!key) continue;

    const match = byKey.get(key);
    if (match) {
      const meta = (match.metadata ?? {}) as Record<string, unknown>;
      const isPartner =
        match.type === "agency" && meta.source === "bureau_import";

      if (isPartner) {
        partnersLeft += 1;
        if (
          match.status !== "excluded" ||
          !match.excludedReason ||
          match.email !== (row.email ?? match.email)
        ) {
          await db
            .update(prospects)
            .set({
              status: "excluded",
              excludedReason:
                match.excludedReason ??
                "Staat op uitsluitingslijst / bestaande relatie",
              email: match.email ?? row.email ?? null,
              updatedAt: now,
            })
            .where(eq(prospects.id, match.id));
          updated += 1;
        }
        continue;
      }

      const nextMeta = {
        ...meta,
        source:
          typeof meta.source === "string" && meta.source !== EXCLUSION_IMPORT_SOURCE
            ? meta.source
            : EXCLUSION_IMPORT_SOURCE,
        doNotMailLabel: EXISTING_CUSTOMER_REASON,
        exclusionSyncedAt: now.toISOString(),
      };

      const needsUpdate =
        match.status !== "excluded" ||
        match.excludedReason !== EXISTING_CUSTOMER_REASON ||
        meta.doNotMailLabel !== EXISTING_CUSTOMER_REASON ||
        (row.email && !match.email);

      if (needsUpdate) {
        await db
          .update(prospects)
          .set({
            status: "excluded",
            excludedReason: EXISTING_CUSTOMER_REASON,
            email: match.email ?? row.email ?? null,
            metadata: nextMeta,
            updatedAt: now,
          })
          .where(eq(prospects.id, match.id));
        updated += 1;
      }
      continue;
    }

    const [inserted] = await db
      .insert(prospects)
      .values({
        type: "company",
        companyName,
        email: row.email ?? null,
        status: "excluded",
        excludedReason: EXISTING_CUSTOMER_REASON,
        metadata: {
          source: EXCLUSION_IMPORT_SOURCE,
          doNotMailLabel: EXISTING_CUSTOMER_REASON,
          exclusionSyncedAt: now.toISOString(),
          notes: row.reason || undefined,
        },
      })
      .returning();

    byKey.set(key, inserted!);
    created += 1;
  }

  return { ok: true, created, updated, partnersLeft };
}
