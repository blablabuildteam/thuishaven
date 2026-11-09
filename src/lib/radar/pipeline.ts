/**
 * Radar orchestration — discovery → Spotify metrics → scores → alerts.
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
}): Promise<RadarPipelineResult> {
  const startedAt = new Date();
  const notes: string[] = [];

  const discovery = options?.skipDiscovery
    ? {
        venuesScanned: 0,
        eventsSeen: 0,
        artistsUpserted: 0,
        artistsCreated: 0,
        skippedNoRaId: 0,
        errors: [] as string[],
      }
    : await discoverArtistsFromSeedVenues();

  if (discovery.skippedNoRaId > 0) {
    notes.push(
      `${discovery.skippedNoRaId} venue(s) zonder RA-id overgeslagen — vul een ra.co/clubs/… URL in.`,
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
