/**
 * Apollo Organization Search criteria we expose in the UI.
 * Maps 1:1 onto mixed_companies/search filters we actually send.
 */

import { AMS_REGION_PLACES, AMS_WIDE_PLACES, AMS_FAR_PLACES } from "@/lib/integrations/kvk/discovery";
import { isCityInRegion } from "@/lib/outreach/doelgroep";

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

export type PlacePreset = "amsterdam" | "kern" | "ring" | "wide" | "far";

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
  if (preset === "ring") return AMS_REGION_PLACES;
  if (preset === "wide") {
    return [...AMS_REGION_PLACES, ...AMS_WIDE_PLACES];
  }
  return [...AMS_REGION_PLACES, ...AMS_WIDE_PLACES, ...AMS_FAR_PLACES];
}

export function placePresetLabel(preset: PlacePreset): string {
  if (preset === "amsterdam") return "Alleen Amsterdam";
  if (preset === "kern") return "Kern (~15–25 km)";
  if (preset === "ring") return "Amsterdam + ~50 km";
  if (preset === "wide") return "Amsterdam + ~75 km";
  return "Amsterdam + ~100 km";
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
    raw?.placePreset === "ring" ||
    raw?.placePreset === "wide" ||
    raw?.placePreset === "far"
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

/** Drop companies whose Apollo city is known and outside the region allowlist. */
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

/**
 * Concentric search zones. A place preset is the union of zones up to that
 * distance, so widening the radius only adds the outer zone(s) to fetch.
 */
export type SearchZone = "ams" | "kern" | "ring" | "wide" | "far";

export const SEARCH_ZONES: { id: SearchZone; label: string; hint: string }[] = [
  { id: "ams", label: "Amsterdam", hint: "Alleen de stad zelf" },
  {
    id: "kern",
    label: "Kern · tot ~25 km",
    hint: "Amstelveen, Diemen, Zaandam, Schiphol, Hoofddorp…",
  },
  {
    id: "ring",
    label: "Ring · 25–50 km",
    hint: "Haarlem, Almere, Hilversum, Utrecht, Purmerend…",
  },
  {
    id: "wide",
    label: "Wijd · 50–75 km",
    hint: "Leiden, Den Haag, Rotterdam, Amersfoort, Alkmaar…",
  },
  {
    id: "far",
    label: "Ver · 75–100 km",
    hint: "Apeldoorn, Arnhem, Den Bosch, Tilburg, Zwolle…",
  },
];

export function zonesForPreset(preset: PlacePreset): SearchZone[] {
  if (preset === "amsterdam") return ["ams"];
  if (preset === "kern") return ["ams", "kern"];
  if (preset === "ring") return ["ams", "kern", "ring"];
  if (preset === "wide") return ["ams", "kern", "ring", "wide"];
  return ["ams", "kern", "ring", "wide", "far"];
}

export function placesForZone(zone: SearchZone): string[] {
  const lower = (s: string) => s.toLowerCase();
  if (zone === "ams") return ["Amsterdam"];
  if (zone === "kern") {
    return AMS_KERN_PLACES.filter((p) => p !== "Amsterdam");
  }
  if (zone === "ring") {
    const inner = new Set(AMS_KERN_PLACES.map(lower));
    return placesForPreset("ring").filter((p) => !inner.has(lower(p)));
  }
  if (zone === "wide") {
    return [...AMS_WIDE_PLACES];
  }
  return [...AMS_FAR_PLACES];
}

export function zoneLabel(zone: SearchZone): string {
  return SEARCH_ZONES.find((z) => z.id === zone)?.label ?? zone;
}

export function keywordKey(tags: string[]): string {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join("+");
}

export type SearchSlice = {
  key: string;
  zone: SearchZone;
  range: string;
  keywords: string[];
};

export function sliceKey(zone: SearchZone, range: string, tags: string[]): string {
  return `${zone}|${range}|${keywordKey(tags)}`;
}

/** Every zone × headcount bucket the criteria cover, for the given keywords. */
export function slicesForCriteria(c: ApolloSearchCriteria): SearchSlice[] {
  const keywords = keywordKey(c.keywordTags).split("+").filter(Boolean);
  const out: SearchSlice[] = [];
  for (const zone of zonesForPreset(c.placePreset)) {
    for (const range of c.employeeRanges) {
      out.push({ key: sliceKey(zone, range, keywords), zone, range, keywords });
    }
  }
  return out;
}

export function sliceLabel(s: Pick<SearchSlice, "zone" | "range" | "keywords">): string {
  const size =
    APOLLO_EMPLOYEE_RANGES.find((r) => r.id === s.range)?.label ?? s.range;
  const tags = s.keywords.length ? ` · ${s.keywords.join(", ")}` : "";
  return `${zoneLabel(s.zone)} · ${size} mdw${tags}`;
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

/** Slider stops for distance (concentric Apollo zones). */
export type DistanceSliderStop = {
  km: number;
  preset: PlacePreset;
  label: string;
  ready: boolean;
  /** Outer SearchZone unlocked by this stop (null = Amsterdam only). */
  outerZone: SearchZone | null;
};

export const DISTANCE_SLIDER_STOPS: DistanceSliderStop[] = [
  { km: 0, preset: "amsterdam", label: "Amsterdam", ready: true, outerZone: "ams" },
  { km: 25, preset: "kern", label: "~25 km", ready: true, outerZone: "kern" },
  { km: 50, preset: "ring", label: "~50 km", ready: true, outerZone: "ring" },
  { km: 75, preset: "wide", label: "~75 km", ready: true, outerZone: "wide" },
  { km: 100, preset: "far", label: "~100 km", ready: true, outerZone: "far" },
];

export function readyDistanceStops(): DistanceSliderStop[] {
  return DISTANCE_SLIDER_STOPS.filter((s) => s.ready);
}

export function distanceIndexForPreset(preset: PlacePreset): number {
  const ready = readyDistanceStops();
  const i = ready.findIndex((s) => s.preset === preset);
  return i >= 0 ? i : ready.length - 1;
}

export function presetForDistanceIndex(index: number): PlacePreset {
  const ready = readyDistanceStops();
  const stop = ready[Math.max(0, Math.min(ready.length - 1, index))];
  return stop?.preset ?? "ring";
}

/**
 * Apollo match totals for one outer ring under the current employee/keyword
 * filters — used to show “+N bij deze afstand” while tweaking the UI.
 */
export function zoneSliceStats(
  zone: SearchZone,
  employeeRanges: string[],
  keywords: string[],
  coverage: Record<string, { total: number | null; created: number; seen: number; done: boolean }>,
): {
  apolloTotal: number | null;
  created: number;
  remaining: number | null;
  uncounted: number;
  slices: number;
} {
  let apolloTotal = 0;
  let created = 0;
  let remaining = 0;
  let uncounted = 0;
  let known = 0;
  for (const range of employeeRanges) {
    const key = sliceKey(zone, range, keywords);
    const st = coverage[key];
    if (!st || st.total == null) {
      uncounted += 1;
      continue;
    }
    known += 1;
    apolloTotal += st.total;
    created += st.created;
    if (st.done) continue;
    remaining += Math.max(0, st.total - st.seen);
  }
  return {
    apolloTotal: known === 0 && uncounted > 0 ? null : apolloTotal,
    created,
    remaining: uncounted > 0 ? null : remaining,
    uncounted,
    slices: employeeRanges.length,
  };
}

/** Parsed Apollo headcount buckets for slider ↔ API mapping. */
export const EMPLOYEE_BUCKETS = APOLLO_EMPLOYEE_RANGES.map((r) => {
  const [min, max] = r.id.split(",").map((n) => Number(n));
  return { id: r.id, label: r.label, min, max };
});

/** Contiguous Apollo buckets covering [minEmployees, maxEmployees]. */
export function employeeRangesFromBounds(
  minEmployees: number,
  maxEmployees: number,
): string[] {
  const lo = Math.min(minEmployees, maxEmployees);
  const hi = Math.max(minEmployees, maxEmployees);
  const ids = EMPLOYEE_BUCKETS.filter((b) => b.max >= lo && b.min <= hi).map(
    (b) => b.id,
  );
  return ids.length > 0 ? ids : [...DEFAULT_APOLLO_CRITERIA.employeeRanges];
}

/** Slider bounds from selected Apollo range ids (expands to full span). */
export function boundsFromEmployeeRanges(ranges: string[]): {
  min: number;
  max: number;
} {
  const selected = EMPLOYEE_BUCKETS.filter((b) => ranges.includes(b.id));
  if (selected.length === 0) {
    return { min: 501, max: 5000 };
  }
  return {
    min: Math.min(...selected.map((s) => s.min)),
    max: Math.max(...selected.map((s) => s.max)),
  };
}

export function formatEmployeeBounds(min: number, max: number): string {
  const fmt = (n: number) => n.toLocaleString("nl-NL");
  return `${fmt(min)}–${fmt(max)} medewerkers`;
}
