/**
 * Who do we mail at a company — pure ranking, safe for client components.
 * Order: events → office/facility → assistant/communicatie → algemeen adres.
 * Never: niet-relevante functies, adressen die niet bestaan.
 */

import { titleTier } from "@/lib/outreach/decision-titles";
import {
  contactNameMismatch,
  emailFitsCompany,
  isGenericLocalPart,
} from "@/lib/outreach/email-quality";

export type EmailCheckStatus =
  | "valid"
  | "invalid"
  | "accept_all"
  | "webmail"
  | "disposable"
  | "unknown";

export type EmailCheck = {
  status: EmailCheckStatus;
  score?: number;
  at: string;
};

export type RankableContact = {
  name: string;
  title?: string;
  email?: string;
  emailSource?: string;
};

/** 0 events · 1 office/facility · 2 assistent/communicatie of handmatig · 3 algemeen adres · 9 niet mailen */
export type TargetTier = 0 | 1 | 2 | 3 | 9;

export type MailTarget = {
  name: string;
  title?: string;
  email: string;
  tier: TargetTier;
  check?: EmailCheck;
  emailSource?: string;
  /** Address belongs to another company / private mailbox. */
  otherCompany?: boolean;
};

export type CompanyRef = {
  website?: string | null;
  companyName?: string | null;
};

export const MAX_TARGETS_PER_COMPANY = 3;

export function readEmailChecks(
  meta: Record<string, unknown> | null | undefined,
): Record<string, EmailCheck> {
  const raw = meta?.emailChecks;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, EmailCheck> = {};
  for (const [email, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const c = v as Record<string, unknown>;
    if (typeof c.status !== "string" || typeof c.at !== "string") continue;
    out[email.toLowerCase()] = {
      status: c.status as EmailCheckStatus,
      ...(typeof c.score === "number" ? { score: c.score } : {}),
      at: c.at,
    };
  }
  return out;
}

export function isUndeliverable(check: EmailCheck | undefined): boolean {
  return check?.status === "invalid" || check?.status === "disposable";
}

function checkRank(check: EmailCheck | undefined): number {
  if (!check) return 2;
  if (check.status === "valid") return 0;
  if (check.status === "accept_all" || check.status === "webmail") return 1;
  return 3;
}

export function isOtherCompanyEmail(
  c: RankableContact,
  company: CompanyRef | undefined,
): boolean {
  if (!c.email || !company || c.emailSource === "manual") return false;
  return !emailFitsCompany(c.email, company.website, company.companyName);
}

export function contactTargetTier(
  c: RankableContact,
  company?: CompanyRef,
): TargetTier {
  if (!c.email) return 9;
  if (isOtherCompanyEmail(c, company)) return 9;
  if (isGenericLocalPart(c.email)) return 3;
  const t = titleTier(c.title);
  if (t <= 2) return t;
  // Handmatig toegevoegd of aangepast: bewuste keuze van het team.
  if (c.emailSource === "manual") return 2;
  return 9;
}

export const TARGET_TIER_LABEL: Record<TargetTier, string> = {
  0: "Events",
  1: "Office / facility",
  2: "Assistent / communicatie",
  3: "Algemeen adres",
  9: "Niet relevant",
};

export function checkLabel(check: EmailCheck | undefined): string {
  if (!check) return "Nog niet gecontroleerd";
  switch (check.status) {
    case "valid":
      return "Adres bestaat";
    case "invalid":
      return "Adres bestaat niet";
    case "disposable":
      return "Wegwerpadres";
    case "accept_all":
      return "Niet zeker (server accepteert alles)";
    case "webmail":
      return "Privé-mailbox";
    default:
      return "Onbekend";
  }
}

export function rankMailTargets(input: {
  contacts: RankableContact[];
  company?: CompanyRef;
  companyEmail?: string | null;
  checks?: Record<string, EmailCheck>;
  /** Already mailed or in Wachtrij (lowercase). */
  exclude?: Iterable<string>;
  max?: number;
}): { targets: MailTarget[]; skipped: MailTarget[] } {
  const checks = input.checks ?? {};
  const exclude = new Set(
    [...(input.exclude ?? [])].map((e) => e.toLowerCase()),
  );
  const seen = new Set<string>();
  const all: MailTarget[] = [];

  const push = (c: RankableContact) => {
    const email = c.email?.trim();
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    all.push({
      name: c.name,
      ...(c.title ? { title: c.title } : {}),
      email,
      tier: contactTargetTier(c, input.company),
      check: checks[key],
      ...(c.emailSource ? { emailSource: c.emailSource } : {}),
      ...(isOtherCompanyEmail(c, input.company) ? { otherCompany: true } : {}),
    });
  };

  for (const c of input.contacts) push(c);

  const company = input.companyEmail?.trim();
  if (company && !seen.has(company.toLowerCase())) {
    // Loose company address: only use a name when it clearly belongs to that person.
    const owner = input.contacts.find(
      (c) => c.name && !contactNameMismatch(company, c.name),
    );
    const generic = isGenericLocalPart(company);
    seen.add(company.toLowerCase());
    all.push({
      name: generic || !owner ? "" : owner.name,
      ...(owner?.title && !generic ? { title: owner.title } : {}),
      email: company,
      tier: generic ? 3 : owner ? contactTargetTier({ ...owner, email: company }) : 3,
      check: checks[company.toLowerCase()],
    });
  }

  const usable = all.filter(
    (t) => t.tier !== 9 && !isUndeliverable(t.check),
  );
  const skipped = all.filter(
    (t) => t.tier === 9 || isUndeliverable(t.check),
  );

  usable.sort(
    (a, b) => a.tier - b.tier || checkRank(a.check) - checkRank(b.check),
  );

  const personal = usable.filter((t) => t.tier <= 2);
  // Algemeen adres alleen als er niemand persoonlijk is.
  const pool = personal.length > 0 ? personal : usable;
  const targets = pool
    .filter((t) => !exclude.has(t.email.toLowerCase()))
    .slice(0, input.max ?? MAX_TARGETS_PER_COMPANY);

  return { targets, skipped };
}
