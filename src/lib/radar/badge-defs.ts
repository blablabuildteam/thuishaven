/**
 * Radar badge definitions (client-safe). SQL predicates live in `badges.ts`.
 */

export type RadarBadgeTone =
  | "home"
  | "new"
  | "growth"
  | "nl"
  | "sets"
  | "warn"
  | "muted";

export type RadarBadgeId =
  | "nieuw7"
  | "debutant"
  | "hot"
  | "ra_groei"
  | "venster"
  | "groot"
  | "nl"
  | "nl_gig"
  | "mixseries"
  | "viral"
  | "label"
  | "agency";

export type RadarBadgeGroup = "groei" | "nederland" | "sets" | "profiel";

export const RADAR_BADGE_GROUP_NL: Record<RadarBadgeGroup, string> = {
  groei: "Groei",
  nederland: "Nederland",
  sets: "Sets",
  profiel: "Profiel",
};

export type RadarBadgeDef = {
  id: RadarBadgeId;
  label: string;
  hint: string;
  tone: RadarBadgeTone;
  group: RadarBadgeGroup;
};

export const RADAR_BADGES: RadarBadgeDef[] = [
  {
    id: "nieuw7",
    label: "Nieuw deze week",
    hint: "Afgelopen 7 dagen voor het eerst op de radar (na de eerste bulk-import).",
    tone: "new",
    group: "groei",
  },
  {
    id: "debutant",
    label: "Debutant",
    hint: "Eerste RA-event minder dan 3 jaar geleden.",
    tone: "new",
    group: "groei",
  },
  {
    id: "hot",
    label: "Momentum",
    hint: "Momentum ≥ 45 (top ±7%): meer gigs, hogere billing of meer landen dan vorig kwartaal.",
    tone: "growth",
    group: "groei",
  },
  {
    id: "ra_groei",
    label: "RA-groei",
    hint: "RA-volgers groeien duidelijk sinds de vorige snapshot.",
    tone: "growth",
    group: "groei",
  },
  {
    id: "venster",
    label: "Venster sluit",
    hint: "Momentum ≥ 40 maar bookability < 60: groeit hard, wordt duurder.",
    tone: "warn",
    group: "groei",
  },
  {
    id: "groot",
    label: "Al groot",
    hint: "Bookability < 60: veel volgers/attending — waarschijnlijk duur of laat.",
    tone: "muted",
    group: "profiel",
  },
  {
    id: "nl",
    label: "NL-crowd",
    hint: "NL-audience ≥ 55: veel NL-gigs, woont in NL of RA-regio’s in NL.",
    tone: "nl",
    group: "nederland",
  },
  {
    id: "nl_gig",
    label: "Speelt in NL",
    hint: "Aankomende gig in Nederland (komende 45 dagen).",
    tone: "nl",
    group: "nederland",
  },
  {
    id: "mixseries",
    label: "Mixseries",
    hint: "Set op Boiler Room, HÖR, Dekmantel, Cercle, Mixmag of triple j.",
    tone: "sets",
    group: "sets",
  },
  {
    id: "viral",
    label: "Viral set",
    hint: "Mixseries-set met ≥ 50.000 views.",
    tone: "sets",
    group: "sets",
  },
  {
    id: "label",
    label: "Label",
    hint: "Heeft labels in het RA-profiel.",
    tone: "muted",
    group: "profiel",
  },
  {
    id: "agency",
    label: "Agency",
    hint: "Boekingsbureau in RA-bio — vaak duurder / minder direct.",
    tone: "muted",
    group: "profiel",
  },
];

export const RADAR_BADGE_BY_ID = new Map(RADAR_BADGES.map((b) => [b.id, b]));

export type RadarBadgeFilter = {
  include: RadarBadgeId[];
  exclude: RadarBadgeId[];
};

/** `f=hot,nl,-agency` → include hot+nl, exclude agency. */
export function parseBadgeFilter(raw: string | undefined | null): RadarBadgeFilter {
  const out: RadarBadgeFilter = { include: [], exclude: [] };
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const s = part.trim();
    const neg = s.startsWith("-");
    const id = (neg ? s.slice(1) : s) as RadarBadgeId;
    if (!RADAR_BADGE_BY_ID.has(id)) continue;
    (neg ? out.exclude : out.include).push(id);
  }
  return out;
}

export function serializeBadgeFilter(f: RadarBadgeFilter): string {
  return [...f.include, ...f.exclude.map((id) => `-${id}`)].join(",");
}

export type RadarPresetId =
  | "nu_boeken"
  | "nl_binnenkort"
  | "venster"
  | "viral"
  | "vers"
  | "debutanten";

export type RadarPreset = {
  id: RadarPresetId;
  label: string;
  hint: string;
  filter: RadarBadgeFilter;
  sort?: string;
};

export const RADAR_PRESETS: RadarPreset[] = [
  {
    id: "nu_boeken",
    label: "Nu boeken",
    hint: "Groeit, nog niet groot, geen agency",
    filter: { include: ["hot"], exclude: ["groot", "agency"] },
  },
  {
    id: "nl_binnenkort",
    label: "Speelt binnenkort in NL",
    hint: "NL-gig in de komende 45 dagen",
    filter: { include: ["nl_gig"], exclude: ["groot"] },
  },
  {
    id: "venster",
    label: "Venster sluit",
    hint: "Groeit hard, wordt duurder",
    filter: { include: ["venster"], exclude: [] },
    sort: "momentum",
  },
  {
    id: "viral",
    label: "Viral sets",
    hint: "Mixseries-set met 50k+ views",
    filter: { include: ["viral"], exclude: [] },
  },
  {
    id: "vers",
    label: "Vers binnen",
    hint: "Deze week op de radar",
    filter: { include: ["nieuw7"], exclude: [] },
  },
  {
    id: "debutanten",
    label: "Debutanten",
    hint: "Eerste RA-event < 3 jaar",
    filter: { include: ["debutant"], exclude: ["groot"] },
  },
];

export function sameBadgeFilter(a: RadarBadgeFilter, b: RadarBadgeFilter) {
  const key = (f: RadarBadgeFilter) =>
    [...f.include].sort().join(",") + "|" + [...f.exclude].sort().join(",");
  return key(a) === key(b);
}

export type RadarThuishavenFilter = "nieuw" | "gespeeld" | "alle";

export function parseThuishavenFilter(
  th: string | undefined | null,
  legacyNieuw: string | undefined | null,
): RadarThuishavenFilter {
  if (th === "gespeeld" || th === "alle" || th === "nieuw") return th;
  if (legacyNieuw === "0") return "alle";
  return "nieuw";
}
