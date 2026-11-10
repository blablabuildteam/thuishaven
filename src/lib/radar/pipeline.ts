/**
 * Radar orchestration — RA discovery → enrich → score v2 → Spotify → social → digest.
 */
import { discoverArtistsFromSeedVenues } from "@/lib/radar/discovery";
import { enrichArtistsFromRa } from "@/lib/radar/ra-enrich";
import { rescoreStaleArtists } from "@/lib/radar/score-v2";
import { syncSpotifyForRadarArtists } from "@/lib/radar/spotify-sync";
import { syncSocialForTopArtists } from "@/lib/radar/social-sync";
import { nextVenueBatch } from "@/lib/radar/rotation";
import { isSpotifyConfigured } from "@/lib/integrations/spotify/client";
import {
  amsterdamIsoWeekday,
  sendRadarDigest,
} from "@/lib/radar/digest";
import { amsterdamHour } from "@/lib/integrations/cron";
import { loadRadarSettings } from "@/lib/radar/settings";

export type RadarPipelineResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  discovery: Awaited<ReturnType<typeof discoverArtistsFromSeedVenues>>;
  enrich: Awaited<ReturnType<typeof enrichArtistsFromRa>> | null;
  rescore: Awaited<ReturnType<typeof rescoreStaleArtists>> | null;
  spotify: Awaited<ReturnType<typeof syncSpotifyForRadarArtists>> | null;
  social: Awaited<ReturnType<typeof syncSocialForTopArtists>> | null;
  digest: Awaited<ReturnType<typeof sendRadarDigest>> | null;
  notes: string[];
};

export async function runRadarPipeline(options?: {
  skipDiscovery?: boolean;
  skipEnrich?: boolean;
  skipRescore?: boolean;
  skipSpotify?: boolean;
  skipSocial?: boolean;
  skipDigest?: boolean;
  spotifyLimit?: number;
  historyYears?: number;
  venueLimit?: number;
  enrichLimit?: number;
  rescoreLimit?: number;
  forceDigest?: boolean;
  /** Soft deadline — stop starting new heavy steps after this. */
  deadlineMs?: number;
}): Promise<RadarPipelineResult> {
  const startedAt = new Date();
  const notes: string[] = [];
  const settings = await loadRadarSettings();
  const deadline =
    options?.deadlineMs ?? Date.now() + 240_000;

  const pastDeadline = () => Date.now() >= deadline;

  let discovery: RadarPipelineResult["discovery"] = {
    venuesScanned: 0,
    eventsSeen: 0,
    artistsUpserted: 0,
    artistsCreated: 0,
    gigsUpserted: 0,
    venuesSuggested: 0,
    scored: 0,
    skippedNoRaId: 0,
    errors: [],
  };

  if (!options?.skipDiscovery) {
    if (pastDeadline()) {
      notes.push("Discovery overgeslagen: tijdslimiet.");
    } else {
      const batch = await nextVenueBatch(options?.venueLimit ?? 12);
      notes.push(
        `Venue-rotatie: offset ${batch.offset}/${batch.total} → ${batch.venueIds.length} venues.`,
      );
      discovery = await discoverArtistsFromSeedVenues({
        historyYears: options?.historyYears ?? 2,
        limitPerVenue: 35,
        venueIds: batch.venueIds,
        scoreLimit: 50,
        snowballArtists: 8,
      });
    }
  }

  if (discovery.skippedNoRaId > 0) {
    notes.push(
      `${discovery.skippedNoRaId} venue(s) zonder RA-id overgeslagen — vul een ra.co/clubs/… URL in.`,
    );
  }
  if (!options?.skipDiscovery && discovery.venuesScanned > 0) {
    notes.push(
      `RA: ${discovery.eventsSeen} events, ${discovery.gigsUpserted} gigs, ${discovery.artistsCreated} nieuwe artiesten, ${discovery.venuesSuggested} venue-suggesties, ${discovery.scored} gescoord.`,
    );
  }

  let enrich: RadarPipelineResult["enrich"] = null;
  if (!options?.skipEnrich) {
    if (pastDeadline()) {
      notes.push("RA-enrich overgeslagen: tijdslimiet.");
    } else {
      enrich = await enrichArtistsFromRa({
        limit: options?.enrichLimit ?? 150,
      });
      notes.push(
        `RA-enrich: ${enrich.enriched}/${enrich.attempted} verrijkt, ${enrich.relatedCreated} related, ${enrich.errors.length} fouten.`,
      );
    }
  }

  let rescore: RadarPipelineResult["rescore"] = null;
  if (!options?.skipRescore) {
    if (pastDeadline()) {
      notes.push("Rescore overgeslagen: tijdslimiet.");
    } else {
      rescore = await rescoreStaleArtists({
        limit: options?.rescoreLimit ?? 1500,
      });
      notes.push(
        `Rescore: ${rescore.scored}/${rescore.candidateCount} artiesten.`,
      );
    }
  }

  let spotify: RadarPipelineResult["spotify"] = null;
  if (!options?.skipSpotify) {
    if (pastDeadline()) {
      notes.push("Spotify overgeslagen: tijdslimiet.");
    } else if (!isSpotifyConfigured()) {
      notes.push("Spotify overgeslagen: SPOTIFY_CLIENT_ID/SECRET ontbreekt.");
    } else {
      spotify = await syncSpotifyForRadarArtists({
        limit: options?.spotifyLimit ?? 80,
      });
    }
  }

  let social: RadarPipelineResult["social"] = null;
  if (!options?.skipSocial) {
    if (pastDeadline()) {
      notes.push("Social overgeslagen: tijdslimiet.");
    } else {
      social = await syncSocialForTopArtists({ limit: 30 });
      if (social.note) notes.push(social.note);
    }
  }

  let digest: RadarPipelineResult["digest"] = null;
  if (!options?.skipDigest) {
    const now = new Date();
    const weekday = amsterdamIsoWeekday(now);
    const hour = amsterdamHour(now);
    const due =
      options?.forceDigest ||
      (settings.digest.enabled &&
        weekday === settings.digest.weekday &&
        hour === settings.digest.hourAmsterdam);
    if (due) {
      digest = await sendRadarDigest({ force: options?.forceDigest });
      if (digest.skipped) {
        notes.push(`Digest overgeslagen: ${digest.reason}`);
      } else if (digest.ok) {
        notes.push(
          `Digest verstuurd naar ${(digest.recipients ?? []).join(", ") || "—"}.`,
        );
      } else {
        notes.push(`Digest mislukt: ${digest.error}`);
      }
    }
  }

  return {
    ok:
      discovery.errors.length === 0 &&
      (enrich?.errors.length ?? 0) === 0 &&
      (rescore?.errors.length ?? 0) === 0 &&
      (spotify?.errors.length ?? 0) === 0 &&
      (digest?.ok !== false),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    discovery,
    enrich,
    rescore,
    spotify,
    social,
    digest,
    notes,
  };
}
