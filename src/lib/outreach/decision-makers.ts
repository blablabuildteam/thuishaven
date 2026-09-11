import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { searchDecisionMakers } from "@/lib/integrations/apollo/client";
import {
  findHunterPersonEmail,
  hasHunterConfig,
} from "@/lib/integrations/hunter/client";

export type DecisionMaker = {
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  source: "apollo";
  emailSource?: "apollo" | "hunter";
  hunterScore?: number;
};

export type DecisionMakerRow = {
  id: string;
  companyName: string;
  ok: boolean;
  person?: DecisionMaker;
  hunterEmail?: boolean;
  error?: string;
};

async function resolvePersonEmail(
  person: {
    name: string;
    email?: string;
    linkedinUrl?: string;
  },
  company: {
    companyName: string;
    website?: string | null;
  },
): Promise<{
  email?: string;
  emailSource?: "apollo" | "hunter";
  hunterScore?: number;
}> {
  if (person.email?.includes("@")) {
    return { email: person.email, emailSource: "apollo" };
  }
  if (!hasHunterConfig()) return {};

  const hunter = await findHunterPersonEmail({
    fullName: person.name,
    website: company.website,
    companyName: company.companyName,
    linkedinUrl: person.linkedinUrl,
  });
  if (!hunter.ok || !hunter.email) return {};
  return {
    email: hunter.email,
    emailSource: "hunter",
    hunterScore: hunter.score,
  };
}

export async function fillDecisionMakers(limit = 8): Promise<{
  ok: boolean;
  error?: string;
  processed: number;
  filled: number;
  withEmail: number;
  rows: DecisionMakerRow[];
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      error: "Geen database",
      processed: 0,
      filled: 0,
      withEmail: 0,
      rows: [],
    };
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
        sql`coalesce(${prospects.metadata}->>'doelgroepFit', '') <> 'nee'`,
      ),
    )
    .orderBy(sql`${prospects.createdAt} asc`)
    .limit(Math.min(Math.max(limit, 1), 8));

  const rows: DecisionMakerRow[] = [];
  let filled = 0;
  let withEmail = 0;

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
    const resolved = await resolvePersonEmail(person, target);
    const dm: DecisionMaker = {
      name: person.name,
      title: person.title,
      email: resolved.email,
      linkedinUrl: person.linkedinUrl,
      source: "apollo",
      emailSource: resolved.emailSource,
      hunterScore: resolved.hunterScore,
    };
    meta.decisionMaker = dm;
    meta.decisionMakerAt = new Date().toISOString();
    if (resolved.emailSource === "hunter") {
      meta.emailSource = "hunter";
    }
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
    if (dm.email) withEmail += 1;
    rows.push({
      id: target.id,
      companyName: target.companyName,
      ok: true,
      person: dm,
      hunterEmail: resolved.emailSource === "hunter",
    });
  }

  return { ok: true, processed: rows.length, filled, withEmail, rows };
}

/** Hunter-mail voor Event Managers die Apollo al vond, maar zonder e-mail. */
export async function fillHunterEmailsForDecisionMakers(limit = 8): Promise<{
  ok: boolean;
  error?: string;
  processed: number;
  filled: number;
  rows: DecisionMakerRow[];
}> {
  if (!hasDatabase()) {
    return { ok: false, error: "Geen database", processed: 0, filled: 0, rows: [] };
  }
  if (!hasHunterConfig()) {
    return {
      ok: false,
      error: "HUNTER_API_KEY ontbreekt",
      processed: 0,
      filled: 0,
      rows: [],
    };
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
        sql`${prospects.metadata}->>'decisionMaker' is not null`,
        sql`coalesce(${prospects.metadata}->'decisionMaker'->>'email', '') = ''`,
        sql`coalesce((${prospects.metadata}->>'hunterEmailFails')::int, 0) < 2`,
        sql`coalesce(${prospects.metadata}->>'doelgroepFit', '') <> 'nee'`,
      ),
    )
    .orderBy(sql`${prospects.createdAt} asc`)
    .limit(Math.min(Math.max(limit, 1), 8));

  const rows: DecisionMakerRow[] = [];
  let filled = 0;

  for (const target of targets) {
    const meta = { ...(target.metadata ?? {}) };
    const raw = meta.decisionMaker;
    if (!raw || typeof raw !== "object") continue;
    const current = raw as DecisionMaker;
    if (!current.name) continue;

    const hunter = await findHunterPersonEmail({
      fullName: current.name,
      website: target.website,
      companyName: target.companyName,
      linkedinUrl: current.linkedinUrl,
    });

    if (!hunter.ok || !hunter.email) {
      meta.hunterEmailFails =
        typeof meta.hunterEmailFails === "number"
          ? meta.hunterEmailFails + 1
          : 1;
      meta.hunterEmailError = hunter.error ?? "Geen Hunter-mail";
      await db
        .update(prospects)
        .set({ metadata: meta, updatedAt: new Date() })
        .where(eq(prospects.id, target.id));
      rows.push({
        id: target.id,
        companyName: target.companyName,
        ok: false,
        error: hunter.error ?? "Geen Hunter-mail",
      });
      continue;
    }

    const dm: DecisionMaker = {
      ...current,
      email: hunter.email,
      emailSource: "hunter",
      hunterScore: hunter.score,
    };
    meta.decisionMaker = dm;
    meta.emailSource = "hunter";
    meta.hunterEmailAt = new Date().toISOString();
    delete meta.hunterEmailFails;
    delete meta.hunterEmailError;

    const locked = new Set([
      "contacted",
      "opened",
      "replied",
      "lead",
      "excluded",
    ]);
    const nextEmail = target.email || hunter.email;
    await db
      .update(prospects)
      .set({
        email: nextEmail,
        status:
          !target.email && !locked.has(target.status) ? "ready" : target.status,
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
      hunterEmail: true,
    });
  }

  return { ok: true, processed: rows.length, filled, rows };
}
