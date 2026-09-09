/**
 * KvK for outreach: enrich companies we already know (name or KvK number).
 * Not for place/SBI targeting — KvK policy.
 */

import { enrichKnownCompany } from "./enrich";
import {
  kvkBasisprofiel,
  kvkVestigingsprofiel,
  kvkZoeken,
  hasKvkConfig,
} from "./client";
import {
  AMS_REGION_PLACES,
  DEFAULT_MAX_EMPLOYEES,
  DEFAULT_MIN_EMPLOYEES,
  candidateFromProfiles,
  matchingJubilee,
  parseKvkDate,
  passesEmployeeFilter,
} from "./discovery";
import type { KvkProspectCandidate } from "./types";

export {
  AMS_REGION_PLACES,
  DEFAULT_MAX_EMPLOYEES,
  DEFAULT_MIN_EMPLOYEES,
  hasKvkConfig,
  kvkBasisprofiel,
  kvkVestigingsprofiel,
  kvkZoeken,
  candidateFromProfiles,
  matchingJubilee,
  parseKvkDate,
  passesEmployeeFilter,
  enrichKnownCompany,
};
export {
  applyKvkCandidateToProspect,
  findProspectForKvk,
} from "./enrich";
export type { KvkProspectCandidate };

export type DiscoverKvkOptions = {
  naam?: string;
  kvkNummer?: string;
};

export type DiscoverKvkResult = {
  ok: boolean;
  error?: string;
  searched: number;
  enriched: number;
  candidates: KvkProspectCandidate[];
  skipped: {
    nonMailing: number;
    employees: number;
    noVestiging: number;
    jubilee: number;
  };
};

/**
 * Look up one company by name or KvK number and return a candidate.
 * Does not write to DB (caller decides).
 */
export async function discoverCompanyProspects(
  options: DiscoverKvkOptions = {},
): Promise<DiscoverKvkResult> {
  const emptySkip = {
    nonMailing: 0,
    employees: 0,
    noVestiging: 0,
    jubilee: 0,
  };

  const result = await enrichKnownCompany({
    naam: options.naam,
    kvkNummer: options.kvkNummer,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      searched: 0,
      enriched: 0,
      candidates: [],
      skipped: emptySkip,
    };
  }

  return {
    ok: true,
    searched: result.matches,
    enriched: 1,
    candidates: [result.candidate],
    skipped: {
      ...emptySkip,
      nonMailing: result.candidate.nonMailing ? 1 : 0,
    },
  };
}
