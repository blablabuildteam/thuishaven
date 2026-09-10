/**
 * Cheap LinkedIn helper — no API, no Sales Nav required.
 * Opens LinkedIn search in the browser; we store the estimate they type back.
 */

import { DOELGROEP } from "./doelgroep";

/** KvK often returns the legal vestiging (0–20 people), not the concern. */
export function kvkHeadcountLooksOff(
  count: number | null | undefined,
): boolean {
  if (count == null) return false;
  return count < 50;
}

export function linkedinCompanySearchUrl(companyName: string): string {
  const q = new URLSearchParams({ keywords: companyName });
  return `https://www.linkedin.com/search/results/companies/?${q}`;
}

export function linkedinPeopleSearchUrl(companyName: string): string {
  const q = new URLSearchParams({
    keywords: `${DOELGROEP.linkedinPeopleSearch} ${companyName}`,
  });
  return `https://www.linkedin.com/search/results/people/?${q}`;
}

export function linkedinDoelgroepSearchUrl(): string {
  const q = new URLSearchParams({
    keywords: "Amsterdam",
  });
  return `https://www.linkedin.com/search/results/companies/?${q}`;
}
