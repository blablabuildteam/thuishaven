/**
 * Radar badge definitions (client-safe). SQL predicates live in `badges.ts`.
 */

export type RadarBadgeTone =
  | "home"
  | "hot"
  | "new"
  | "good"
  | "info"
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

export type RadarBadgeDef = {
  id: RadarBadgeId;
  label: string;
  hint: string;
  tone: RadarBadgeTone;
};

export const RADAR_BADGES: RadarBadgeDef[] = [
  {
    id: "nieuw7",
    label: "Nieuw deze week",
    hint: "Afgelopen 7 dagen voor het eerst op de radar (na de eerste bulk-import).",
    tone: "new",
  },
  {
    id: "debutant",
    label: "Debutant",
    hint: "Eerste RA-event minder dan 3 jaar geleden.",
    tone: "new",
  },
  {
    id: "hot",
    label: "Momentum",
    hint: "Momentum ≥ 45 (top ±7%): meer gigs, hogere billing of meer landen dan vorig kwartaal.",
    tone: "hot",
  },
  {
    id: "ra_groei",
    label: "RA-groei",
    hint: "RA-volgers groeien duidelijk sinds de vorige snapshot.",
    tone: "hot",
  },
  {
    id: "venster",
    label: "Venster sluit",
    hint: "Momentum ≥ 40 maar bookability < 60: groeit hard, wordt duurder.",
    tone: "warn",
  },
  {
    id: "groot",
    label: "Al groot",
    hint: "Bookability < 60: veel volgers/attending — waarschijnlijk duur of laat.",
    tone: "muted",
  },
  {
    id: "nl",
    label: "NL-crowd",
    hint: "NL-audience ≥ 55: veel NL-gigs, woont in NL of RA-regio’s in NL.",
    tone: "info",
  },
  {
    id: "nl_gig",
    label: "Speelt in NL",
    hint: "Aankomende gig in Nederland (komende 45 dagen).",
    tone: "info",
  },
  {
    id: "mixseries",
    label: "Mixseries",
    hint: "Set op Boiler Room, HÖR, Dekmantel, Cercle, Mixmag of triple j.",
    tone: "info",
  },
  {
    id: "viral",
    label: "Viral set",
    hint: "Mixseries-set met ≥ 50.000 views.",
    tone: "hot",
  },
  {
    id: "label",
    label: "Label",
    hint: "Heeft labels in het RA-profiel.",
    tone: "muted",
  },
  {
    id: "agency",
    label: "Agency",
    hint: "Boekingsbureau in RA-bio — vaak duurder / minder direct.",
    tone: "muted",
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

export type RadarThuishavenFilter = "nieuw" | "gespeeld" | "alle";

export function parseThuishavenFilter(
  th: string | undefined | null,
  legacyNieuw: string | undefined | null,
): RadarThuishavenFilter {
  if (th === "gespeeld" || th === "alle" || th === "nieuw") return th;
  if (legacyNieuw === "0") return "alle";
  return "nieuw";
}
