/**
 * Radar orchestration — RA discovery/history → score v2 → Spotify (optioneel).
 * Social (Apify) en SoundCloud haken hier later op dezelfde sync-loop in.
 */
import { discoverArtistsFromSeedVenues } from "@/lib/radar/discovery";
import { syncSpotifyForRadarArtists } from "@/lib/radar/spotify-sync";
import { isSpotifyConfigured } from "@/lib/integrations/spotify/client";

export type RadarPipelineResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  discovery: Awaited<ReturnType<typeof discoverArtistsFromSeedVenues>>;
  spotify: Awaited<ReturnType<typeof syncSpotifyForRadarArtists>> | null;
  notes: string[];
};

export async function runRadarPipeline(options?: {
  skipDiscovery?: boolean;
  skipSpotify?: boolean;
  spotifyLimit?: number;
  historyYears?: number;
}): Promise<RadarPipelineResult> {
  const startedAt = new Date();
  const notes: string[] = [];

  const discovery = options?.skipDiscovery
    ? {
        venuesScanned: 0,
        eventsSeen: 0,
        artistsUpserted: 0,
        artistsCreated: 0,
        gigsUpserted: 0,
        venuesSuggested: 0,
        scored: 0,
        skippedNoRaId: 0,
        errors: [] as string[],
      }
    : await discoverArtistsFromSeedVenues({
        historyYears: options?.historyYears ?? 2,
        limitPerVenue: 35,
        venueLimit: 12,
        scoreLimit: 50,
        snowballArtists: 8,
      });

  if (discovery.skippedNoRaId > 0) {
    notes.push(
      `${discovery.skippedNoRaId} venue(s) zonder RA-id overgeslagen — vul een ra.co/clubs/… URL in.`,
    );
  }
  if (!options?.skipDiscovery) {
    notes.push(
      `RA: ${discovery.eventsSeen} events, ${discovery.gigsUpserted} gigs, ${discovery.artistsCreated} nieuwe artiesten, ${discovery.venuesSuggested} venue-suggesties, ${discovery.scored} gescoord.`,
    );
  }

  let spotify: RadarPipelineResult["spotify"] = null;
  if (!options?.skipSpotify) {
    if (!isSpotifyConfigured()) {
      notes.push("Spotify overgeslagen: SPOTIFY_CLIENT_ID/SECRET ontbreekt.");
    } else {
      spotify = await syncSpotifyForRadarArtists({
        limit: options?.spotifyLimit ?? 80,
      });
    }
  }

  notes.push(
    "Instagram/TikTok (Apify) en SoundCloud volgen in de volgende datapipeline-sprint.",
  );

  return {
    ok: discovery.errors.length === 0 && (spotify?.errors.length ?? 0) === 0,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    discovery,
    spotify,
    notes,
  };
}
