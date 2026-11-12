/**
 * Alert types in plain Dutch (client-safe). Groups drive the filter tabs.
 */
import type { RadarBadgeTone } from "@/lib/radar/badge-defs";

export type RadarAlertKind =
  | "new_on_radar"
  | "velocity"
  | "breakthrough"
  | "window_closing"
  | "launch"
  | "mixseries"
  | "lineup"
  | "venue_suggestion"
  | "digest";

export type RadarAlertGroup = "artiest" | "sets" | "curatie" | "systeem";

export type RadarAlertDef = {
  kind: RadarAlertKind;
  label: string;
  /** What it means + what to do, one line each. */
  meaning: string;
  action: string;
  tone: RadarBadgeTone;
  group: RadarAlertGroup;
};

export const RADAR_ALERT_DEFS: RadarAlertDef[] = [
  {
    kind: "new_on_radar",
    label: "Nieuwe naam",
    meaning: "Net ontdekt en scoort meteen boven de drempel.",
    action: "Even checken: past dit bij Thuishaven? Zet op Volgen of Gepasseerd.",
    tone: "new",
    group: "artiest",
  },
  {
    kind: "velocity",
    label: "Groeit snel",
    meaning: "Duidelijk meer gigs dan vorig kwartaal.",
    action: "Kijk of de groei bij de juiste clubs zit — kandidaat voor Shortlist.",
    tone: "growth",
    group: "artiest",
  },
  {
    kind: "breakthrough",
    label: "Doorbraak",
    meaning: "Hoog momentum én snelle groei tegelijk.",
    action: "Prioriteit: nu benaderen, voordat de prijs stijgt.",
    tone: "growth",
    group: "artiest",
  },
  {
    kind: "window_closing",
    label: "Venster sluit",
    meaning: "Groeit hard maar wordt al groter / duurder.",
    action: "Beslis snel: boeken of loslaten.",
    tone: "warn",
    group: "artiest",
  },
  {
    kind: "launch",
    label: "Lanceert",
    meaning: "Volgers op RA/IG/SC knikken omhoog — iemand gaat hard.",
    action: "Open de groei-grafiek. Shortlist als het bij Thuishaven past.",
    tone: "growth",
    group: "artiest",
  },
  {
    kind: "mixseries",
    label: "Set gaat hard",
    meaning: "Set op Boiler Room, HÖR, Dekmantel, NTS, Rinse e.a. met veel views.",
    action: "Bekijk de set — vaak het eerste signaal vóór de clubtour.",
    tone: "sets",
    group: "sets",
  },
  {
    kind: "lineup",
    label: "Line-up",
    meaning: "Interessante naam gespot in een nieuwe line-up.",
    action: "Open het feest en kijk wie er nog meer staat.",
    tone: "nl",
    group: "curatie",
  },
  {
    kind: "venue_suggestion",
    label: "Venue-tip",
    meaning: "Club waar veel Radar-artiesten spelen, nog niet op de startlijst.",
    action: "Accepteer bij Clubs als het een goede scout-plek is.",
    tone: "muted",
    group: "curatie",
  },
  {
    kind: "digest",
    label: "Weekoverzicht",
    meaning: "De wekelijkse samenvatting is verstuurd.",
    action: "Geen actie nodig.",
    tone: "muted",
    group: "systeem",
  },
];

export const RADAR_ALERT_DEF_BY_KIND = new Map(
  RADAR_ALERT_DEFS.map((d) => [d.kind, d]),
);

export const RADAR_ALERT_GROUP_NL: Record<RadarAlertGroup, string> = {
  artiest: "Artiesten",
  sets: "Sets",
  curatie: "Curatie",
  systeem: "Systeem",
};
