/**
 * Apollo organization search — doelgroep intake (size + HQ location).
 * 1 credit per page (max 100 rows). Not a LinkedIn scrape.
 */

import { OUTREACH_RATES } from "@/lib/outreach/batch-costs";
import { recordUsage } from "@/lib/usage/store";
import {
  DEFAULT_APOLLO_CRITERIA,
  normalizeCriteria,
  placesForPreset,
  type ApolloSearchCriteria,
} from "./criteria";

export function hasApolloConfig(): boolean {
  return Boolean(process.env.APOLLO_API_KEY?.trim());
}

export type ApolloCompany = {
  name: string;
  website?: string;
  linkedinUrl?: string;
  city?: string;
  country?: string;
  industry?: string;
  employeeCount?: number;
};

export type ApolloSearchResult = {
  ok: boolean;
  error?: string;
  page: number;
  total: number;
  companies: ApolloCompany[];
  criteria: ApolloSearchCriteria;
};

export async function searchDoelgroepCompanies(options?: {
  page?: number;
  perPage?: number;
  criteria?: Partial<ApolloSearchCriteria> | null;
  /** Overrides the preset's place list (used for per-zone coverage slices). */
  places?: readonly string[];
}): Promise<ApolloSearchResult> {
  const criteria = normalizeCriteria(options?.criteria ?? DEFAULT_APOLLO_CRITERIA);
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      error: "APOLLO_API_KEY ontbreekt",
      page: 1,
      total: 0,
      companies: [],
      criteria,
    };
  }

  const page = options?.page ?? 1;
  const perPage = Math.min(options?.perPage ?? 100, 100);
  const locations = (options?.places ?? placesForPreset(criteria.placePreset)).map(
    (p) => `${p}, Netherlands`,
  );

  const body: Record<string, unknown> = {
    page,
    per_page: perPage,
    organization_locations: locations,
    organization_num_employees_ranges: criteria.employeeRanges,
  };
  if (criteria.keywordTags.length > 0) {
    body.q_organization_keyword_tags = criteria.keywordTags;
  }

  const res = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    organizations?: Array<{
      name?: string;
      website_url?: string;
      linkedin_url?: string;
      city?: string;
      country?: string;
      industry?: string;
      estimated_num_employees?: number;
    }>;
    pagination?: { total_entries?: number; page?: number };
  };

  if (!res.ok) {
    return {
      ok: false,
      error: json.error ?? json.message ?? `Apollo HTTP ${res.status}`,
      page,
      total: 0,
      companies: [],
      criteria,
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "apollo_org_search",
    units: 1,
    unitLabel: "credit",
    costEurCents: OUTREACH_RATES.apolloCreditCents,
    meta: {
      page,
      perPage,
      placePreset: criteria.placePreset,
      employeeRanges: criteria.employeeRanges,
      keywordTags: criteria.keywordTags,
    },
  }).catch(() => undefined);

  const companies = (json.organizations ?? [])
    .map((org) => ({
      name: org.name?.trim() ?? "",
      website: org.website_url ?? undefined,
      linkedinUrl: org.linkedin_url ?? undefined,
      city: org.city ?? undefined,
      country: org.country ?? undefined,
      industry: org.industry ?? undefined,
      employeeCount: org.estimated_num_employees ?? undefined,
    }))
    .filter((c) => c.name);

  return {
    ok: true,
    page: json.pagination?.page ?? page,
    total: json.pagination?.total_entries ?? companies.length,
    companies,
    criteria,
  };
}

import {
  BROADER_DECISION_TITLES,
  DECISION_TITLES,
  isEventRelevantTitle,
  isMailableTitle,
  titleRelevanceScore,
} from "@/lib/outreach/decision-titles";

export type ApolloPerson = {
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
};

function domainFromWebsite(website?: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(website) ? website : `https://${website}`,
    );
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Fill missing concern headcount via Apollo org enrich (domain). */
export async function enrichOrganizationHeadcount(
  website?: string | null,
): Promise<{
  ok: boolean;
  error?: string;
  employeeCount?: number;
  city?: string;
}> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) return { ok: false, error: "APOLLO_API_KEY ontbreekt" };
  const domain = domainFromWebsite(website);
  if (!domain) return { ok: false, error: "Geen website/domein" };

  const res = await fetch("https://api.apollo.io/api/v1/organizations/enrich", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify({ domain }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    organization?: {
      estimated_num_employees?: number;
      city?: string;
      primary_domain?: string;
    };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: json.error ?? json.message ?? `Apollo HTTP ${res.status}`,
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "apollo_org_enrich",
    units: 1,
    unitLabel: "credit",
    costEurCents: OUTREACH_RATES.apolloCreditCents,
    meta: { domain },
  }).catch(() => undefined);

  const org = json.organization;
  if (!org?.estimated_num_employees) {
    return { ok: false, error: "Geen medewerkers in Apollo-enrich" };
  }
  return {
    ok: true,
    employeeCount: org.estimated_num_employees,
    city: org.city,
  };
}

type ApolloSearchHit = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  has_email?: boolean;
};

async function apolloPeopleSearch(
  key: string,
  input: { companyName: string; website?: string | null },
  titles: readonly string[],
  round: "core" | "broader",
): Promise<{ ok: boolean; error?: string; people: ApolloSearchHit[] }> {
  const domain = domainFromWebsite(input.website);
  const body: Record<string, unknown> = {
    page: 1,
    per_page: 10,
    person_titles: [...titles],
    include_similar_titles: false,
  };
  if (domain) body.q_organization_domains_list = [domain];
  else body.q_organization_name = input.companyName;

  // New People API search (0 credits) — returns obfuscated last names, no emails.
  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    people?: ApolloSearchHit[];
  };
  if (!res.ok) {
    return {
      ok: false,
      error: json.error ?? json.message ?? `Apollo HTTP ${res.status}`,
      people: [],
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "apollo_people_search",
    units: 1,
    unitLabel: "search",
    costEurCents: 0,
    meta: { companyName: input.companyName, endpoint: "api_search", round },
  }).catch(() => undefined);

  return { ok: true, people: json.people ?? [] };
}

export async function searchDecisionMakers(input: {
  companyName: string;
  website?: string | null;
}): Promise<{ ok: boolean; error?: string; people: ApolloPerson[] }> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "APOLLO_API_KEY ontbreekt", people: [] };
  }

  const core = await apolloPeopleSearch(key, input, DECISION_TITLES, "core");
  if (!core.ok) return { ok: false, error: core.error, people: [] };
  let pool = core.people.filter((p) => isEventRelevantTitle(p.title));

  if (pool.length === 0) {
    const broader = await apolloPeopleSearch(
      key,
      input,
      BROADER_DECISION_TITLES,
      "broader",
    );
    if (broader.ok) {
      pool = broader.people.filter((p) => isMailableTitle(p.title));
    }
  }
  if (pool.length === 0) {
    return { ok: true, people: [] };
  }

  pool.sort((a, b) => {
    const ae = a.has_email === true ? 0 : 1;
    const be = b.has_email === true ? 0 : 1;
    return (
      titleRelevanceScore(a.title) - titleRelevanceScore(b.title) || ae - be
    );
  });

  const people: ApolloPerson[] = [];
  // Unlock (1 credit each): always the best match, others only if Apollo has an email.
  for (let i = 0; i < Math.min(pool.length, 4); i++) {
    const raw = pool[i]!;
    const wantUnlock = Boolean(raw.id) && (i === 0 || raw.has_email === true);
    if (wantUnlock && raw.id) {
      const enriched = await enrichApolloPerson(key, raw.id);
      if (enriched) {
        people.push({ ...enriched, title: enriched.title ?? raw.title });
        continue;
      }
    }
    const parts = [raw.first_name, raw.last_name]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s && s.toLowerCase() !== "undefined");
    const name = raw.name?.trim() || parts.join(" ").trim();
    if (name.length >= 2) {
      people.push({
        name,
        title: raw.title ?? undefined,
        email: raw.email && raw.email.includes("@") ? raw.email : undefined,
        linkedinUrl: raw.linkedin_url ?? undefined,
      });
    }
  }

  return { ok: true, people };
}

/** Unlock full name + work email for a person id from api_search (uses credits). */
async function enrichApolloPerson(
  key: string,
  personId: string,
): Promise<ApolloPerson | null> {
  const res = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify({ id: personId }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    person?: {
      name?: string;
      first_name?: string;
      last_name?: string;
      title?: string;
      email?: string;
      linkedin_url?: string;
    };
  };
  if (!res.ok || !json.person) return null;

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "apollo_people_match",
    units: 1,
    unitLabel: "credit",
    costEurCents: OUTREACH_RATES.apolloCreditCents,
    meta: { personId },
  }).catch(() => undefined);

  const p = json.person;
  const name =
    p.name?.trim() ||
    [p.first_name, p.last_name]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
  if (!name) return null;
  return {
    name,
    title: p.title ?? undefined,
    email: p.email && p.email.includes("@") ? p.email : undefined,
    linkedinUrl: p.linkedin_url ?? undefined,
  };
}
