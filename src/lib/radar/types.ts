export const RADAR_ARTIST_STATUS_NL = {
  new: "Nieuw",
  watching: "Volgen",
  shortlist: "Kortlijst",
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

export function normalizeArtistName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
