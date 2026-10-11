import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { searchDecisionMakers } from "@/lib/integrations/apollo/client";
import {
  findHunterDomainPeople,
  findHunterPersonEmail,
  hasHunterConfig,
} from "@/lib/integrations/hunter/client";
import {
  isMailableTitle,
  titleRelevanceScore,
} from "@/lib/outreach/decision-titles";
import { isGenericLocalPart } from "@/lib/outreach/email-quality";

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

const LOCKED_STATUSES = new Set([
  "contacted",
  "opened",
  "replied",
  "lead",
  "excluded",
]);

type FillTarget = {
  id: string;
  companyName: string;
  website: string | null;
  email: string | null;
  status: (typeof prospects.$inferSelect)["status"];
  metadata: Record<string, unknown> | null;
};

/** Apollo first (events → office → assistant), then Hunter's people on the domain. */
async function findCompanyPeople(target: FillTarget): Promise<{
  ok: boolean;
  error?: string;
  contacts: DecisionMaker[];
  hunterUsed: boolean;
}> {
  const found = await searchDecisionMakers({
    companyName: target.companyName,
    website: target.website,
  });
  const contacts: DecisionMaker[] = [];
  let hunterUsed = false;

  if (found.ok && found.people.length > 0) {
    let finderUsed = false;
    for (const p of found.people) {
      let resolved: Awaited<ReturnType<typeof resolvePersonEmail>> = p.email?.includes("@")
        ? { email: p.email, emailSource: "apollo" }
        : {};
      // Hunter email-finder for the best person only (search credits).
      if (!resolved.email && !finderUsed) {
        finderUsed = true;
        resolved = await resolvePersonEmail(p, target);
        if (resolved.emailSource === "hunter") hunterUsed = true;
      }
      contacts.push({
        name: p.name,
        title: p.title,
        email: resolved.email,
        linkedinUrl: p.linkedinUrl,
        source: "apollo",
        emailSource: resolved.emailSource,
        hunterScore: resolved.hunterScore,
      });
    }
  }

  const hasMailable = contacts.some((c) => c.email);
  if (!hasMailable && hasHunterConfig() && target.website) {
    const domain = await findHunterDomainPeople(target.website);
    if (domain.ok) {
      const relevant = domain.people
        .filter((p) => isMailableTitle(p.title))
        .sort(
          (a, b) =>
            titleRelevanceScore(a.title) - titleRelevanceScore(b.title) ||
            (b.confidence ?? 0) - (a.confidence ?? 0),
        )
        .slice(0, 3);
      for (const p of relevant) {
        if (contacts.some((c) => c.email === p.email)) continue;
        hunterUsed = true;
        contacts.push({
          name: p.name,
          title: p.title,
          email: p.email,
          linkedinUrl: p.linkedinUrl,
          source: "apollo",
          emailSource: "hunter",
          hunterScore: p.confidence,
        });
      }
    }
  }

  if (contacts.length === 0) {
    return {
      ok: false,
      error: found.error ?? "Geen Event/Office Manager of assistent gevonden",
      contacts,
      hunterUsed,
    };
  }
  return { ok: true, contacts, hunterUsed };
}

function manualContacts(meta: Record<string, unknown>): Record<string, unknown>[] {
  const raw = Array.isArray(meta.contacts) ? meta.contacts : [];
  return raw.filter(
    (c): c is Record<string, unknown> =>
      Boolean(c) &&
      typeof c === "object" &&
      (c as { emailSource?: string }).emailSource === "manual",
  );
}

async function storeFoundPeople(
  target: FillTarget,
  contacts: DecisionMaker[],
  extraMeta: Record<string, unknown> = {},
): Promise<DecisionMaker> {
  const db = getDb();
  const meta = { ...(target.metadata ?? {}), ...extraMeta };
  const keep = manualContacts(meta).filter(
    (m) =>
      !contacts.some(
        (c) =>
          c.email &&
          typeof m.email === "string" &&
          c.email.toLowerCase() === m.email.toLowerCase(),
      ),
  );
  const primary = contacts.find((c) => c.email?.includes("@")) ?? contacts[0]!;
  meta.decisionMaker = primary;
  meta.contacts = [...contacts, ...keep];
  meta.decisionMakerAt = new Date().toISOString();
  meta.peopleEnrichedAt = new Date().toISOString();
  if (primary.emailSource === "hunter") meta.emailSource = "hunter";
  delete meta.decisionMakerFails;
  delete meta.decisionMakerError;

  const locked = LOCKED_STATUSES.has(target.status);
  // Company address follows the person we found — unless mailing already started.
  const nextEmail = locked
    ? target.email || primary.email || null
    : primary.email || target.email || null;
  await db
    .update(prospects)
    .set({
      email: nextEmail,
      status:
        !target.email && primary.email && !locked ? "ready" : target.status,
      metadata: meta,
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, target.id));
  return primary;
}

async function storeFailure(target: FillTarget, error: string) {
  const meta = { ...(target.metadata ?? {}) };
  meta.decisionMakerFails =
    typeof meta.decisionMakerFails === "number"
      ? meta.decisionMakerFails + 1
      : 1;
  meta.decisionMakerError = error;
  await getDb()
    .update(prospects)
    .set({ metadata: meta, updatedAt: new Date() })
    .where(eq(prospects.id, target.id));
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
    .limit(Math.min(Math.max(limit, 1), 15));

  const rows: DecisionMakerRow[] = [];
  let filled = 0;
  let withEmail = 0;

  for (const target of targets) {
    const found = await findCompanyPeople(target);
    if (!found.ok) {
      await storeFailure(target, found.error ?? "Geen persoon gevonden");
      rows.push({
        id: target.id,
        companyName: target.companyName,
        ok: false,
        error: found.error ?? "Geen Event/Office Manager",
      });
      continue;
    }
    const dm = await storeFoundPeople(target, found.contacts);
    filled += 1;
    if (dm.email) withEmail += 1;
    rows.push({
      id: target.id,
      companyName: target.companyName,
      ok: true,
      person: dm,
      hunterEmail: found.hunterUsed,
    });
  }

  return { ok: true, processed: rows.length, filled, withEmail, rows };
}

/** Forceer opnieuw zoeken voor één bedrijf (handmatige contacten blijven staan). */
export async function refillDecisionMakerForProspect(
  prospectId: string,
): Promise<{
  ok: boolean;
  error?: string;
  filled: number;
  withEmail: number;
  rows: DecisionMakerRow[];
}> {
  if (!hasDatabase()) {
    return { ok: false, error: "Geen database", filled: 0, withEmail: 0, rows: [] };
  }
  const db = getDb();
  const [target] = await db
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
      website: prospects.website,
      email: prospects.email,
      status: prospects.status,
      metadata: prospects.metadata,
    })
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);

  if (!target) {
    return { ok: false, error: "Prospect niet gevonden", filled: 0, withEmail: 0, rows: [] };
  }
  if (target.status === "excluded") {
    return { ok: false, error: "Prospect uitgesloten", filled: 0, withEmail: 0, rows: [] };
  }

  const found = await findCompanyPeople(target);
  if (!found.ok) {
    await storeFailure(target, found.error ?? "Geen persoon gevonden");
    return {
      ok: false,
      error: found.error ?? "Geen Event/Office Manager gevonden",
      filled: 0,
      withEmail: 0,
      rows: [
        {
          id: target.id,
          companyName: target.companyName,
          ok: false,
          error: found.error ?? "Geen Event/Office Manager",
        },
      ],
    };
  }

  const primary = await storeFoundPeople(target, found.contacts, {
    decisionMakerRefilledAt: new Date().toISOString(),
  });
  return {
    ok: true,
    filled: 1,
    withEmail: primary.email ? 1 : 0,
    rows: [
      {
        id: target.id,
        companyName: target.companyName,
        ok: true,
        person: primary,
        hunterEmail: found.hunterUsed,
      },
    ],
  };
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
    .limit(Math.min(Math.max(limit, 1), 15));

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
    if (Array.isArray(meta.contacts)) {
      meta.contacts = meta.contacts.map((c) =>
        c &&
        typeof c === "object" &&
        (c as { name?: string }).name === current.name &&
        !(c as { email?: string }).email
          ? { ...c, email: hunter.email, emailSource: "hunter", hunterScore: hunter.score }
          : c,
      );
    } else {
      meta.contacts = [dm];
    }
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
    const nextEmail =
      locked.has(target.status) || (target.email && !isGenericLocalPart(target.email))
        ? target.email || hunter.email
        : hunter.email;
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
