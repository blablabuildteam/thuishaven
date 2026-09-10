import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { searchDecisionMakers } from "@/lib/integrations/apollo/client";

export type DecisionMaker = {
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  source: "apollo";
};

export type DecisionMakerRow = {
  id: string;
  companyName: string;
  ok: boolean;
  person?: DecisionMaker;
  error?: string;
};

export async function fillDecisionMakers(limit = 8): Promise<{
  ok: boolean;
  error?: string;
  processed: number;
  filled: number;
  rows: DecisionMakerRow[];
}> {
  if (!hasDatabase()) {
    return { ok: false, error: "Geen database", processed: 0, filled: 0, rows: [] };
  }

  const db = getDb();
  const targets = await db
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
      website: prospects.website,
      email: prospects.email,
      status: prospects.status,
      metadata: prospects.metadata,
    })
    .from(prospects)
    .where(
      and(
        eq(prospects.type, "company"),
        ne(prospects.status, "excluded"),
        sql`coalesce(${prospects.metadata}->>'source', '') <> 'system'`,
        sql`${prospects.metadata}->>'decisionMaker' is null`,
        sql`coalesce((${prospects.metadata}->>'decisionMakerFails')::int, 0) < 2`,
      ),
    )
    .orderBy(sql`${prospects.createdAt} asc`)
    .limit(Math.min(Math.max(limit, 1), 8));

  const rows: DecisionMakerRow[] = [];
  let filled = 0;

  for (const target of targets) {
    const found = await searchDecisionMakers({
      companyName: target.companyName,
      website: target.website,
    });
    const meta = { ...(target.metadata ?? {}) };
    if (!found.ok || found.people.length === 0) {
      meta.decisionMakerFails =
        typeof meta.decisionMakerFails === "number"
          ? meta.decisionMakerFails + 1
          : 1;
      meta.decisionMakerError = found.error ?? "Geen persoon gevonden";
      await db
        .update(prospects)
        .set({ metadata: meta, updatedAt: new Date() })
        .where(eq(prospects.id, target.id));
      rows.push({
        id: target.id,
        companyName: target.companyName,
        ok: false,
        error: found.error ?? "Geen Event/Office Manager",
      });
      continue;
    }

    const person = found.people[0]!;
    const dm: DecisionMaker = {
      name: person.name,
      title: person.title,
      email: person.email,
      linkedinUrl: person.linkedinUrl,
      source: "apollo",
    };
    meta.decisionMaker = dm;
    meta.decisionMakerAt = new Date().toISOString();
    delete meta.decisionMakerFails;
    delete meta.decisionMakerError;

    const locked = new Set([
      "contacted",
      "opened",
      "replied",
      "lead",
      "excluded",
    ]);
    const nextEmail = target.email || dm.email || null;
    await db
      .update(prospects)
      .set({
        email: nextEmail,
        status:
          !target.email && dm.email && !locked.has(target.status)
            ? "ready"
            : target.status,
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, target.id));

    filled += 1;
    rows.push({
      id: target.id,
      companyName: target.companyName,
      ok: true,
      person: dm,
    });
  }

  return { ok: true, processed: rows.length, filled, rows };
}
