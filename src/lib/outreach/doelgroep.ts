/**
 * Cold outreach doelgroep: mid-size companies around Amsterdam.
 * Partner bureaus are NOT this list.
 */

import { AMS_REGION_PLACES, DEFAULT_MAX_EMPLOYEES, DEFAULT_MIN_EMPLOYEES } from "@/lib/integrations/kvk/discovery";

export const DOELGROEP = {
  type: "company" as const,
  minEmployees: DEFAULT_MIN_EMPLOYEES,
  maxEmployees: DEFAULT_MAX_EMPLOYEES,
  regionLabel: "Amsterdam + ~50 km",
  places: AMS_REGION_PLACES,
  trigger: "Jubileum (5 / 10 / 15 / 20 / 25 / 50 jaar) of intern event",
  linkedinCompanySearch:
    "Companies · Netherlands · Amsterdam Area · 501–5.000 employees",
  linkedinPeopleSearch:
    "Event Manager OR Office Manager OR Facilities Manager OR Internal Communications",
} as const;

/**
 * Startlijst: publieke werkgevers in de regio, niet de partnerbureaus.
 * Geen mails — alleen namen. KvK checkt daarna size / plaats / jubileum.
 * Namen die op Niet mailen staan, slaat intake over.
 */
export const DOELGROEP_STARTLIJST: string[] = [
  "TomTom",
  "Adyen",
  "Mollie",
  "Picnic",
  "Catawiki",
  "Backbase",
  "Elastic",
  "Flow Traders",
  "IMC Trading",
  "Optiver",
  "VodafoneZiggo",
  "KPN",
  "PostNL",
  "Alliander",
  "Eneco",
  "Vattenfall Nederland",
  "AkzoNobel",
  "Arcadis",
  "Wolters Kluwer",
  "Elsevier",
  "DPG Media",
  "RTL Nederland",
  "Talpa Network",
  "PVH Europe",
  "Nike European Headquarters",
  "Suit Supply",
  "WeTransfer",
  "Miro",
  "Bunq",
  "NN Group",
  "a.s.r.",
  "Achmea",
  "Coolblue",
  "Exact",
  "AFAS Software",
  "MessageBird",
  "GrandVision",
  "CBRE Nederland",
  "JLL Nederland",
  "Port of Amsterdam",
  "Tata Steel Nederland",
];

export type DoelgroepFit = "ja" | "nee" | "onbekend";

/** Concern estimate (Apollo/LinkedIn) wins over KvK vestiging. */
export function employeeCountForFit(input: {
  kvkCount?: number | null;
  estimate?: number | null;
}): number | null {
  const kvk = input.kvkCount ?? null;
  const estimate = input.estimate ?? null;
  if (estimate != null && estimate > 0) return estimate;
  return kvk;
}

export function isCityInRegion(city: string): boolean {
  const n = city
    .trim()
    .toLowerCase()
    .replace(/[-–]/g, " ");
  return DOELGROEP.places.some((p) => {
    const pl = p.toLowerCase();
    const token = new RegExp(`(?:^|[\\s,])${pl}(?:$|[\\s,])`);
    return n === pl || n.startsWith(`${pl} `) || n.startsWith(`${pl},`) || token.test(n);
  });
}

export function preferRegionCity(
  existing?: string | null,
  incoming?: string | null,
): string | null {
  if (incoming && isCityInRegion(incoming)) return incoming;
  if (existing && isCityInRegion(existing)) return existing;
  return incoming?.trim() || existing?.trim() || null;
}

export function scoreDoelgroep(input: {
  employeeCount?: number | null;
  city?: string | null;
}): { fit: DoelgroepFit; reason: string } {
  const count = input.employeeCount ?? null;
  if (count != null) {
    if (count < DOELGROEP.minEmployees) {
      return { fit: "nee", reason: `Te klein (${count})` };
    }
    if (count > DOELGROEP.maxEmployees) {
      return { fit: "nee", reason: `Te groot (${count})` };
    }
  }

  const city = input.city?.trim();
  if (city && !isCityInRegion(city)) {
    return { fit: "nee", reason: `Buiten regio (${city})` };
  }

  if (count == null) {
    return { fit: "onbekend", reason: "Nog geen medewerkersaantal" };
  }

  return { fit: "ja", reason: `${count} mdw · ${city ?? "regio ok"}` };
}
