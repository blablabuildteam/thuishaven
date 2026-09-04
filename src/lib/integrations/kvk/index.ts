/**
 * Discover outreach company prospects via KvK Zoeken → Basis → Vestiging.
 */

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
};
export type { KvkProspectCandidate };

export type DiscoverKvkOptions = {
  places?: string[];
  /** Free-text name seed (optional; without naam Zoeken needs plaats). */
  naam?: string;
  minEmployees?: number;
  maxEmployees?: number;
  /** Only keep jubilee years (5/10/25/…). */
  jubileeOnly?: boolean;
  maxPerPlace?: number;
  /** Cap total profile enrichments (basis+vestiging) this run. */
  maxEnrich?: number;
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
 * Sweep places → zoeken hoofdvestiging → enrich → filter size / non-mailing / jubilee.
 * Does not write to DB (caller decides).
 */
export async function discoverCompanyProspects(
  options: DiscoverKvkOptions = {},
): Promise<DiscoverKvkResult> {
  if (!hasKvkConfig()) {
    return {
      ok: false,
      error: "KVK_API_KEY ontbreekt",
      searched: 0,
      enriched: 0,
      candidates: [],
      skipped: { nonMailing: 0, employees: 0, noVestiging: 0, jubilee: 0 },
    };
  }

  const places = options.places?.length
    ? options.places
    : [...AMS_REGION_PLACES];
  const min = options.minEmployees ?? DEFAULT_MIN_EMPLOYEES;
  const max = options.maxEmployees ?? DEFAULT_MAX_EMPLOYEES;
  const maxPerPlace = options.maxPerPlace ?? 20;
  const maxEnrich = options.maxEnrich ?? 40;

  const skipped = {
    nonMailing: 0,
    employees: 0,
    noVestiging: 0,
    jubilee: 0,
  };
  const candidates: KvkProspectCandidate[] = [];
  const seen = new Set<string>();
  let searched = 0;
  let enriched = 0;

  for (const plaats of places) {
    if (enriched >= maxEnrich) break;

    const zoek = await kvkZoeken({
      plaats,
      naam: options.naam,
      type: "hoofdvestiging",
      resultatenPerPagina: Math.min(maxPerPlace, 100),
      pagina: 1,
    });
    if (zoek.error || !zoek.data?.resultaten) {
      if (zoek.error && !candidates.length && searched === 0) {
        return {
          ok: false,
          error: zoek.error,
          searched,
          enriched,
          candidates,
          skipped,
        };
      }
      continue;
    }

    for (const hit of zoek.data.resultaten) {
      searched += 1;
      if (enriched >= maxEnrich) break;
      const kvk = hit.kvkNummer;
      if (!kvk || seen.has(kvk)) continue;
      seen.add(kvk);

      const basis = await kvkBasisprofiel(kvk);
      enriched += 1;
      if (basis.error || !basis.data) continue;

      const vestNr =
        hit.vestigingsnummer ??
        basis.data._embedded?.hoofdvestiging?.vestigingsnummer;
      if (!vestNr) {
        skipped.noVestiging += 1;
        continue;
      }

      const vest = await kvkVestigingsprofiel(vestNr);
      enriched += 1;
      if (vest.error || !vest.data) continue;

      const candidate = candidateFromProfiles({
        zoek: hit,
        basis: basis.data,
        vestiging: vest.data,
      });
      if (!candidate) continue;

      if (candidate.nonMailing) {
        skipped.nonMailing += 1;
        continue;
      }
      if (!passesEmployeeFilter(candidate.employeeCount, min, max)) {
        skipped.employees += 1;
        continue;
      }
      if (options.jubileeOnly) {
        const founded = parseKvkDate(
          vest.data.materieleRegistratie?.datumAanvang ??
            basis.data.materieleRegistratie?.datumAanvang ??
            vest.data.formeleRegistratiedatum ??
            basis.data.formeleRegistratiedatum,
        );
        if (!founded || matchingJubilee(founded) == null) {
          skipped.jubilee += 1;
          continue;
        }
      }

      candidates.push(candidate);
    }
  }

  return {
    ok: true,
    searched,
    enriched,
    candidates,
    skipped,
  };
}
