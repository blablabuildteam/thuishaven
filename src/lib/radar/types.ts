export const RADAR_ARTIST_STATUS_NL = {
  new: "Nieuw",
  watching: "Volgen",
  shortlist: "Shortlist",
  contacted: "Gesproken",
  booked: "Geboekt",
  passed: "Gepasseerd",
  not_relevant: "Niet relevant",
} as const;

export type RadarArtistStatus = keyof typeof RADAR_ARTIST_STATUS_NL;

export const RADAR_VENUE_STATUS_NL = {
  seed: "Startlijst",
  suggested: "Suggestie",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
} as const;

export type RadarVenueStatus = keyof typeof RADAR_VENUE_STATUS_NL;

export const RADAR_VENUE_TIER_NL = {
  early: "Early",
  mid: "Mid",
  major: "Major",
  festival: "Festival",
  series: "Series",
} as const;

export type RadarVenueTier = keyof typeof RADAR_VENUE_TIER_NL;

export const RADAR_FEEDBACK_REASON_NL = {
  too_big: "Te groot / te duur",
  wrong_genre: "Verkeerd genre",
  too_unknown: "Te onbekend",
  no_fit: "Geen fit met Thuishaven",
  other: "Anders",
} as const;

export type RadarFeedbackReason = keyof typeof RADAR_FEEDBACK_REASON_NL;

export function normalizeArtistName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
