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
  const locations = placesForPreset(criteria.placePreset).map(
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

export type ApolloPerson = {
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
};

const DECISION_TITLES = [
  "event manager",
  "office manager",
  "facilities manager",
  "internal communications",
  "people operations",
  "workplace manager",
];

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

export async function searchDecisionMakers(input: {
  companyName: string;
  website?: string | null;
}): Promise<{ ok: boolean; error?: string; people: ApolloPerson[] }> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "APOLLO_API_KEY ontbreekt", people: [] };
  }

  const domain = domainFromWebsite(input.website);
  const body: Record<string, unknown> = {
    page: 1,
    per_page: 5,
    person_titles: DECISION_TITLES,
    include_similar_titles: true,
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
    people?: Array<{
      id?: string;
      name?: string;
      first_name?: string;
      last_name?: string;
      last_name_obfuscated?: string;
      title?: string;
      email?: string;
      linkedin_url?: string;
      has_email?: boolean;
    }>;
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
    meta: { companyName: input.companyName, endpoint: "api_search" },
  }).catch(() => undefined);

  const candidates = [...(json.people ?? [])].sort((a, b) => {
    const titleScore = (t?: string) => {
      const s = (t ?? "").toLowerCase();
      if (s.includes("event")) return 0;
      if (s.includes("office") || s.includes("facilit")) return 1;
      if (s.includes("workplace") || s.includes("people")) return 2;
      return 3;
    };
    const ae = a.has_email === true ? 0 : 1;
    const be = b.has_email === true ? 0 : 1;
    return ae - be || titleScore(a.title) - titleScore(b.title);
  });

  const people: ApolloPerson[] = [];
  // Unlock #1 fully (credit). Keep 2 more from search as contact-opties (naam/titel/LI).
  for (let i = 0; i < Math.min(candidates.length, 3); i++) {
    const raw = candidates[i]!;
    if (i === 0 && raw.id) {
      const enriched = await enrichApolloPerson(key, raw.id);
      if (enriched) {
        people.push(enriched);
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
