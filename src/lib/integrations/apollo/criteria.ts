/**
 * Apollo Organization Search criteria we expose in the UI.
 * Maps 1:1 onto mixed_companies/search filters we actually send.
 */

import { AMS_REGION_PLACES } from "@/lib/integrations/kvk/discovery";
import { DOELGROEP, isCityInRegion } from "@/lib/outreach/doelgroep";

type CompanyWithCity = { city?: string | null };

/** Apollo’s common headcount buckets (UI toggles). */
export const APOLLO_EMPLOYEE_RANGES = [
  { id: "201,500", label: "201–500" },
  { id: "501,1000", label: "501–1.000" },
  { id: "1001,2000", label: "1.001–2.000" },
  { id: "2001,5000", label: "2.001–5.000" },
  { id: "5001,10000", label: "5.001–10.000" },
] as const;

export type ApolloEmployeeRangeId =
  (typeof APOLLO_EMPLOYEE_RANGES)[number]["id"];

export type PlacePreset = "ring" | "kern" | "amsterdam";

/** Tight core around Amsterdam (~15–25 km). */
export const AMS_KERN_PLACES = [
  "Amsterdam",
  "Amstelveen",
  "Diemen",
  "Duivendrecht",
  "Ouder-Amstel",
  "Zaandam",
  "Hoofddorp",
  "Schiphol",
  "Schiphol-Rijk",
  "Badhoevedorp",
  "Halfweg",
  "Zwanenburg",
] as const;

export type ApolloSearchCriteria = {
  employeeRanges: string[];
  placePreset: PlacePreset;
  /** Optional keyword tags → q_organization_keyword_tags */
  keywordTags: string[];
};

export const DEFAULT_APOLLO_CRITERIA: ApolloSearchCriteria = {
  employeeRanges: ["501,1000", "1001,2000", "2001,5000"],
  placePreset: "ring",
  keywordTags: [],
};

export function placesForPreset(preset: PlacePreset): readonly string[] {
  if (preset === "amsterdam") return ["Amsterdam"];
  if (preset === "kern") return AMS_KERN_PLACES;
  return DOELGROEP.places.length ? DOELGROEP.places : AMS_REGION_PLACES;
}

export function placePresetLabel(preset: PlacePreset): string {
  if (preset === "amsterdam") return "Alleen Amsterdam";
  if (preset === "kern") return "Kern (~15–25 km)";
  return DOELGROEP.regionLabel;
}

export function normalizeCriteria(
  raw?: Partial<ApolloSearchCriteria> | null,
): ApolloSearchCriteria {
  const allowed = new Set(APOLLO_EMPLOYEE_RANGES.map((r) => r.id));
  const ranges = (raw?.employeeRanges ?? DEFAULT_APOLLO_CRITERIA.employeeRanges)
    .map((r) => String(r).trim())
    .filter((r) => allowed.has(r as ApolloEmployeeRangeId));
  const placePreset: PlacePreset =
    raw?.placePreset === "kern" ||
    raw?.placePreset === "amsterdam" ||
    raw?.placePreset === "ring"
      ? raw.placePreset
      : "ring";
  const keywordTags = (raw?.keywordTags ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    employeeRanges:
      ranges.length > 0 ? ranges : [...DEFAULT_APOLLO_CRITERIA.employeeRanges],
    placePreset,
    keywordTags,
  };
}

/** Drop companies whose Apollo city is known and outside the ~50 km allowlist. */
export function splitByRegion<T extends CompanyWithCity>(companies: T[]): {
  inRegion: T[];
  outOfRegion: T[];
  unknownCity: T[];
} {
  const inRegion: T[] = [];
  const outOfRegion: T[] = [];
  const unknownCity: T[] = [];
  for (const c of companies) {
    if (!c.city?.trim()) {
      unknownCity.push(c);
      continue;
    }
    if (isCityInRegion(c.city)) inRegion.push(c);
    else outOfRegion.push(c);
  }
  return { inRegion, outOfRegion, unknownCity };
}

/** Only keep companies we will put on the list (in-region or city still unknown). */
export function keepForIntake<T extends CompanyWithCity>(companies: T[]): T[] {
  const { inRegion, unknownCity } = splitByRegion(companies);
  return [...inRegion, ...unknownCity];
}

export function criteriaSummary(c: ApolloSearchCriteria): string {
  const sizes = c.employeeRanges
    .map((id) => APOLLO_EMPLOYEE_RANGES.find((r) => r.id === id)?.label ?? id)
    .join(" · ");
  const tags = c.keywordTags.length
    ? ` · keywords: ${c.keywordTags.join(", ")}`
    : "";
  return `${placePresetLabel(c.placePreset)} · ${sizes}${tags}`;
}
