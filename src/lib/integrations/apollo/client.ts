/**
 * Apollo organization search — doelgroep intake (size + HQ location).
 * 1 credit per page (max 100 rows). Not a LinkedIn scrape.
 */

import { DOELGROEP } from "@/lib/outreach/doelgroep";

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
  const perPage = Math.min(options?.perPage ?? 25, 100);

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
