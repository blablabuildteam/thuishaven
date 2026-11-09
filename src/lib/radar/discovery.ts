import { listRaVenueEvents } from "@/lib/integrations/ra/client";
import { upsertRadarArtist } from "@/lib/radar/artists";
import { loadRadarSettings } from "@/lib/radar/settings";
import {
  listActiveSeedVenues,
  parseRaVenueId,
  updateRadarVenue,
} from "@/lib/radar/venues";
import { createRadarAlert } from "@/lib/radar/alerts";

export type DiscoveryResult = {
  venuesScanned: number;
  eventsSeen: number;
  artistsUpserted: number;
  artistsCreated: number;
  skippedNoRaId: number;
  errors: string[];
};

/**
 * Sneeuwbal stap 0→1: line-ups van seed/accepted venues → artiesten op de radar.
 * Max hops komt uit settings (default 2); deze stap zet discoveryHops=0/1.
 */
export async function discoverArtistsFromSeedVenues(options?: {
  limitPerVenue?: number;
}): Promise<DiscoveryResult> {
  const settings = await loadRadarSettings();
  const venues = await listActiveSeedVenues();
  const result: DiscoveryResult = {
    venuesScanned: 0,
    eventsSeen: 0,
    artistsUpserted: 0,
    artistsCreated: 0,
    skippedNoRaId: 0,
    errors: [],
  };

  for (const venue of venues) {
    const raId = parseRaVenueId(venue.raUrl);
    if (!raId) {
      result.skippedNoRaId += 1;
      continue;
    }
    result.venuesScanned += 1;
    const events = await listRaVenueEvents({
      venueId: raId,
      type: "LATEST",
      limit: options?.limitPerVenue ?? 30,
    });
    if (!events.ok) {
      result.errors.push(`${venue.name}: ${events.error}`);
      continue;
    }
    result.eventsSeen += events.events.length;
    const hops = Math.min(venue.discoveryHops + 0, settings.discovery.maxHops);
    for (const event of events.events) {
      for (const name of event.artists) {
        const up = await upsertRadarArtist({
          name,
          discoverySource: "lineup",
          discoveryHops: hops,
          discoveredViaVenueId: venue.id,
        });
        if ("error" in up) {
          result.errors.push(up.error);
          continue;
        }
        result.artistsUpserted += 1;
        if (up.created) result.artistsCreated += 1;
      }
    }
  }

  return result;
}

/**
 * Mark a suggested venue as accepted (adds to active seed set).
 */
export async function acceptVenueSuggestion(venueId: string) {
  const updated = await updateRadarVenue(venueId, { status: "accepted" });
  if ("error" in updated) return updated;
  await createRadarAlert({
    kind: "venue_suggestion",
    venueId,
    title: `Venue toegevoegd: ${updated.venue.name}`,
    body: "Staat nu op de actieve startlijst voor line-up discovery.",
  });
  return updated;
}
