/**
 * Map KvK profiles → outreach prospect candidates + jubilee helpers.
 */

import type {
  KvkBasisprofiel,
  KvkProspectCandidate,
  KvkVestigingsprofiel,
  KvkZoekenResult,
} from "./types";

/** Places within ~50 km of Amsterdam for Zoeken `plaats` sweeps. */
export const AMS_REGION_PLACES = [
  "Amsterdam",
  "Amstelveen",
  "Zaandam",
  "Haarlem",
  "Hoofddorp",
  "Almere",
  "Hilversum",
  "Utrecht",
  "Weesp",
  "Diemen",
  "Aalsmeer",
  "Uithoorn",
  "Haarlemmermeer",
  "Purmerend",
  "Beverwijk",
] as const;

export const DEFAULT_MIN_EMPLOYEES = 500;
export const DEFAULT_MAX_EMPLOYEES = 5000;
export const JUBILEE_YEARS = [5, 10, 15, 20, 25, 50] as const;

/** KvK dates are YYYYMMDD; unknown parts may be 00. */
export function parseKvkDate(raw?: string | null): Date | null {
  if (!raw || raw === "00000000") return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function anniversaryYearsAt(
  founded: Date,
  at: Date = new Date(),
): number | null {
  let years = at.getUTCFullYear() - founded.getUTCFullYear();
  const beforeAnniversary =
    at.getUTCMonth() < founded.getUTCMonth() ||
    (at.getUTCMonth() === founded.getUTCMonth() &&
      at.getUTCDate() < founded.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years >= 0 ? years : null;
}

export function matchingJubilee(
  founded: Date,
  at: Date = new Date(),
): number | undefined {
  const years = anniversaryYearsAt(founded, at);
  if (years == null) return undefined;
  return JUBILEE_YEARS.includes(years as (typeof JUBILEE_YEARS)[number])
    ? years
    : undefined;
}

function isNonMailing(flag?: string): boolean {
  return /^ja$/i.test(flag?.trim() ?? "");
}

function pickCity(adressen?: KvkVestigingsprofiel["adressen"]): string | undefined {
  const visit =
    adressen?.find((a) => /bezoek/i.test(a.type ?? "")) ?? adressen?.[0];
  return visit?.plaats;
}

function pickPostcode(
  adressen?: KvkVestigingsprofiel["adressen"],
): string | undefined {
  const visit =
    adressen?.find((a) => /bezoek/i.test(a.type ?? "")) ?? adressen?.[0];
  return visit?.postcode;
}

function pickWebsite(websites?: string[]): string | undefined {
  return websites?.find((w) => Boolean(w?.trim()))?.trim();
}

function pickSector(sbi?: KvkVestigingsprofiel["sbiActiviteiten"] | KvkBasisprofiel["sbiActiviteiten"]) {
  const main =
    sbi?.find((s) => /^ja$/i.test(s.indHoofdactiviteit ?? "")) ?? sbi?.[0];
  return {
    sector: main?.sbiOmschrijving,
    sbiCode: main?.sbiCode,
  };
}

export function candidateFromProfiles(input: {
  zoek?: KvkZoekenResult;
  basis?: KvkBasisprofiel;
  vestiging?: KvkVestigingsprofiel;
}): KvkProspectCandidate | null {
  const kvk =
    input.vestiging?.kvkNummer ??
    input.basis?.kvkNummer ??
    input.zoek?.kvkNummer;
  if (!kvk) return null;

  const name =
    input.vestiging?.eersteHandelsnaam ??
    input.basis?.naam ??
    input.zoek?.naam;
  if (!name) return null;

  const founded =
    parseKvkDate(input.vestiging?.materieleRegistratie?.datumAanvang) ??
    parseKvkDate(input.basis?.materieleRegistratie?.datumAanvang) ??
    parseKvkDate(input.vestiging?.formeleRegistratiedatum) ??
    parseKvkDate(input.basis?.formeleRegistratiedatum);

  const { sector, sbiCode } = pickSector(
    input.vestiging?.sbiActiviteiten ?? input.basis?.sbiActiviteiten,
  );

  const nonMailing =
    isNonMailing(input.vestiging?.indNonMailing) ||
    isNonMailing(input.basis?.indNonMailing);

  return {
    kvkNumber: kvk,
    vestigingsnummer:
      input.vestiging?.vestigingsnummer ?? input.zoek?.vestigingsnummer,
    companyName: name,
    city:
      pickCity(input.vestiging?.adressen) ??
      input.zoek?.adres?.binnenlandsAdres?.plaats,
    postcode:
      pickPostcode(input.vestiging?.adressen) ??
      input.zoek?.adres?.binnenlandsAdres?.postcode,
    website: pickWebsite(input.vestiging?.websites),
    employeeCount: input.vestiging?.totaalWerkzamePersonen,
    foundedAt: founded?.toISOString().slice(0, 10),
    anniversaryYears: founded
      ? matchingJubilee(founded) ?? anniversaryYearsAt(founded) ?? undefined
      : undefined,
    sector,
    sbiCode,
    nonMailing,
    source: "kvk",
  };
}

export function passesEmployeeFilter(
  count: number | undefined,
  min = DEFAULT_MIN_EMPLOYEES,
  max = DEFAULT_MAX_EMPLOYEES,
): boolean {
  if (count == null) return false;
  return count >= min && count <= max;
}
