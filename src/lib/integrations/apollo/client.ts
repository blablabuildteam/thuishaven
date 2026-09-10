/**
 * Apollo organization search — doelgroep intake (size + HQ location).
 * 1 credit per page (max 100 rows). Not a LinkedIn scrape.
 */

import { DOELGROEP } from "@/lib/outreach/doelgroep";
import { OUTREACH_RATES } from "@/lib/outreach/batch-costs";
import { recordUsage } from "@/lib/usage/store";

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
};

function locations(): string[] {
  return DOELGROEP.places.map((p) => `${p}, Netherlands`);
}

export async function searchDoelgroepCompanies(options?: {
  page?: number;
  perPage?: number;
}): Promise<ApolloSearchResult> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      error: "APOLLO_API_KEY ontbreekt",
      page: 1,
      total: 0,
      companies: [],
    };
  }

  const page = options?.page ?? 1;
  const perPage = Math.min(options?.perPage ?? 100, 100);

  const res = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify({
      page,
      per_page: perPage,
      organization_locations: locations(),
      organization_num_employees_ranges: ["501,1000", "1001,2000", "2001,5000"],
    }),
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
    };
  }

  void recordUsage({
    tool: "outreach",
    vendor: "enrichment",
    operation: "apollo_org_search",
    units: 1,
    unitLabel: "credit",
    costEurCents: OUTREACH_RATES.apolloCreditCents,
    meta: { page, perPage },
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

  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
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
      name?: string;
      first_name?: string;
      last_name?: string;
      title?: string;
      email?: string;
      linkedin_url?: string;
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
    unitLabel: "credit",
    costEurCents: OUTREACH_RATES.apolloCreditCents,
    meta: { companyName: input.companyName },
  }).catch(() => undefined);

  const people = (json.people ?? [])
    .map((p) => ({
      name:
        p.name?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
      title: p.title ?? undefined,
      email: p.email && p.email.includes("@") ? p.email : undefined,
      linkedinUrl: p.linkedin_url ?? undefined,
    }))
    .filter((p) => p.name);

  return { ok: true, people };
}
