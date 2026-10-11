import { OUTREACH_RATES } from "@/lib/outreach/batch-costs";
import { recordUsage } from "@/lib/usage/store";

export function hasHunterConfig(): boolean {
  return Boolean(process.env.HUNTER_API_KEY?.trim());
}

export type HunterEmail = {
  email: string;
  type?: string;
  confidence?: number;
  position?: string;
};

export function domainFromWebsite(website: string): string | null {
  try {
    const url = new URL(
      /^https?:\/\//i.test(website) ? website : `https://${website}`,
    );
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const GENERIC_RANK = [
  /^events?@/i,
  /^evenementen@/i,
  /^evenement@/i,
  /^hospitality@/i,
  /^office@/i,
  /^info@/i,
  /^hello@/i,
  /^contact@/i,
];

function rank(email: string): number {
  const i = GENERIC_RANK.findIndex((re) => re.test(email));
  return i === -1 ? 80 : i;
}

function splitName(fullName: string): { first?: string; last?: string } {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[.,]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return {
    first: parts[0],
    last: parts.slice(1).join(" "),
  };
}

function linkedinHandle(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Event Manager mail: naam + domein (of LinkedIn). 1 Hunter-credit. */
export async function findHunterPersonEmail(input: {
  fullName: string;
  website?: string | null;
  companyName?: string | null;
  linkedinUrl?: string | null;
}): Promise<{
  ok: boolean;
  email?: string;
  score?: number;
  error?: string;
}> {
  const key = process.env.HUNTER_API_KEY?.trim();
  if (!key) return { ok: false, error: "HUNTER_API_KEY ontbreekt" };

  const domain = input.website ? domainFromWebsite(input.website) : null;
  const handle = linkedinHandle(input.linkedinUrl);
  if (!domain && !input.companyName && !handle) {
    return { ok: false, error: "Geen domein, bedrijf of LinkedIn" };
  }

  const { first, last } = splitName(input.fullName);
  const q = new URLSearchParams({ api_key: key });
  if (domain) q.set("domain", domain);
  else if (input.companyName) q.set("company", input.companyName);
  if (handle) q.set("linkedin_handle", handle);
  if (first && last) {
    q.set("first_name", first);
    q.set("last_name", last);
  } else if (input.fullName.trim()) {
    q.set("full_name", input.fullName.trim());
  } else if (!handle) {
    return { ok: false, error: "Geen naam" };
  }

  const res = await fetch(`https://api.hunter.io/v2/email-finder?${q}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    errors?: Array<{ details?: string }>;
    data?: {
      email?: string | null;
      score?: number;
    };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: json.errors?.[0]?.details ?? `Hunter HTTP ${res.status}`,
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "hunter_email_finder",
    units: 1,
    unitLabel: "zoekopdracht",
    costEurCents: OUTREACH_RATES.hunterSearchCents,
    meta: {
      domain: domain ?? undefined,
      company: input.companyName ?? undefined,
      name: input.fullName,
    },
  }).catch(() => undefined);

  const email = json.data?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Geen Hunter-mail voor deze persoon" };
  }
  return { ok: true, email, score: json.data?.score };
}

export type HunterVerifyStatus =
  | "valid"
  | "invalid"
  | "accept_all"
  | "webmail"
  | "disposable"
  | "unknown";

/** Check whether a mailbox exists. 1 verification credit. */
export async function verifyHunterEmail(email: string): Promise<
  | { ok: true; status: HunterVerifyStatus; score?: number }
  | { ok: false; error: string; quota?: boolean }
> {
  const key = process.env.HUNTER_API_KEY?.trim();
  if (!key) return { ok: false, error: "HUNTER_API_KEY ontbreekt" };
  const q = new URLSearchParams({ email: email.trim(), api_key: key });
  const res = await fetch(`https://api.hunter.io/v2/email-verifier?${q}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    errors?: Array<{ id?: string; details?: string }>;
    data?: { status?: string; score?: number };
  };
  if (res.status === 202) {
    return { ok: true, status: "unknown" };
  }
  if (!res.ok) {
    const detail = json.errors?.[0]?.details ?? `Hunter HTTP ${res.status}`;
    return {
      ok: false,
      error: detail,
      quota: res.status === 429 || /usage|limit|quota|credits/i.test(detail),
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "hunter_email_verifier",
    units: 1,
    unitLabel: "controle",
    costEurCents: OUTREACH_RATES.hunterVerifyCents,
    meta: { email },
  }).catch(() => undefined);

  const raw = json.data?.status;
  const status: HunterVerifyStatus =
    raw === "valid" ||
    raw === "invalid" ||
    raw === "accept_all" ||
    raw === "webmail" ||
    raw === "disposable"
      ? raw
      : "unknown";
  return { ok: true, status, score: json.data?.score };
}

export type HunterDomainPerson = {
  name: string;
  title?: string;
  email: string;
  confidence?: number;
  linkedinUrl?: string;
};

/** Personal mailboxes on a domain with job title. 1 search credit. */
export async function findHunterDomainPeople(
  website: string,
): Promise<{ ok: boolean; people: HunterDomainPerson[]; error?: string }> {
  const key = process.env.HUNTER_API_KEY?.trim();
  if (!key) return { ok: false, people: [], error: "HUNTER_API_KEY ontbreekt" };
  const domain = domainFromWebsite(website);
  if (!domain) return { ok: false, people: [], error: "Geen domein" };

  const q = new URLSearchParams({
    domain,
    api_key: key,
    type: "personal",
    limit: "10",
  });
  const res = await fetch(`https://api.hunter.io/v2/domain-search?${q}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    errors?: Array<{ details?: string }>;
    data?: {
      emails?: Array<{
        value?: string;
        confidence?: number;
        position?: string;
        first_name?: string;
        last_name?: string;
        linkedin?: string;
      }>;
    };
  };
  if (!res.ok) {
    return {
      ok: false,
      people: [],
      error: json.errors?.[0]?.details ?? `Hunter HTTP ${res.status}`,
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "hunter_domain_people",
    units: 1,
    unitLabel: "zoekopdracht",
    costEurCents: OUTREACH_RATES.hunterSearchCents,
    meta: { domain },
  }).catch(() => undefined);

  const people = (json.data?.emails ?? [])
    .map((e) => {
      const name = [e.first_name, e.last_name]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .join(" ");
      return {
        name,
        ...(e.position ? { title: e.position } : {}),
        email: e.value?.trim().toLowerCase() ?? "",
        confidence: e.confidence,
        ...(e.linkedin ? { linkedinUrl: e.linkedin } : {}),
      };
    })
    .filter((p) => p.email.includes("@") && p.name.length >= 2);
  return { ok: true, people };
}

/** Generieke inbox op een domein — alleen als er geen Event Manager is. */
export async function findHunterDomainEmail(
  website: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const key = process.env.HUNTER_API_KEY?.trim();
  if (!key) return { ok: false, error: "HUNTER_API_KEY ontbreekt" };
  const domain = domainFromWebsite(website);
  if (!domain) return { ok: false, error: "Geen domein" };

  const q = new URLSearchParams({
    domain,
    api_key: key,
    limit: "10",
  });
  const res = await fetch(`https://api.hunter.io/v2/domain-search?${q}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    errors?: Array<{ details?: string }>;
    data?: {
      emails?: Array<{
        value?: string;
        type?: string;
        confidence?: number;
        position?: string;
      }>;
    };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: json.errors?.[0]?.details ?? `Hunter HTTP ${res.status}`,
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "hunter_domain_search",
    units: 1,
    unitLabel: "zoekopdracht",
    costEurCents: OUTREACH_RATES.hunterSearchCents,
    meta: { domain },
  }).catch(() => undefined);

  const rows = (json.data?.emails ?? [])
    .map((e) => ({
      email: e.value?.trim().toLowerCase() ?? "",
      type: e.type,
      confidence: e.confidence,
      position: e.position,
    }))
    .filter((e) => e.email.includes("@"));

  const generic = rows.filter((e) => e.type === "generic");
  const pool = generic.length ? generic : rows;
  pool.sort(
    (a, b) =>
      rank(a.email) - rank(b.email) ||
      (b.confidence ?? 0) - (a.confidence ?? 0),
  );
  const best = pool[0];
  if (!best) return { ok: false, error: "Geen Hunter-treffer" };
  return { ok: true, email: best.email };
}
