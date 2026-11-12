/**
 * Radar orchestration — multi-source discovery → enrich → mixseries/SC → score → social → digest.
 */
import { discoverArtistsFromSeedVenues } from "@/lib/radar/discovery";
import { enrichArtistsFromRa } from "@/lib/radar/ra-enrich";
import { rescoreStaleArtists } from "@/lib/radar/score-v2";
import { syncSpotifyForRadarArtists } from "@/lib/radar/spotify-sync";
import { syncSocialForTopArtists } from "@/lib/radar/social-sync";
import { syncWebsiteVenues } from "@/lib/radar/sources/website";
import { syncInstagramVenues } from "@/lib/radar/sources/instagram-venue";
import { syncMixseriesChannels } from "@/lib/radar/sources/mixseries-sync";
import { syncSoundCloudForShortlist } from "@/lib/radar/sources/soundcloud-sync";
import { refreshNlAudienceScores } from "@/lib/radar/nl-audience";
import { nextVenueBatch } from "@/lib/radar/rotation";
import { refreshSuggestedVenueScores } from "@/lib/radar/venues";
import { detectLaunchAlerts } from "@/lib/radar/launch-detect";
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
  website: Awaited<ReturnType<typeof syncWebsiteVenues>> | null;
  instagramVenues: Awaited<ReturnType<typeof syncInstagramVenues>> | null;
  mixseries: Awaited<ReturnType<typeof syncMixseriesChannels>> | null;
  soundcloud: Awaited<ReturnType<typeof syncSoundCloudForShortlist>> | null;
  nlAudience: Awaited<ReturnType<typeof refreshNlAudienceScores>> | null;
  enrich: Awaited<ReturnType<typeof enrichArtistsFromRa>> | null;
  rescore: Awaited<ReturnType<typeof rescoreStaleArtists>> | null;
  spotify: Awaited<ReturnType<typeof syncSpotifyForRadarArtists>> | null;
  social: Awaited<ReturnType<typeof syncSocialForTopArtists>> | null;
  launch: Awaited<ReturnType<typeof detectLaunchAlerts>> | null;
  digest: Awaited<ReturnType<typeof sendRadarDigest>> | null;
  notes: string[];
};

export async function runRadarPipeline(options?: {
  skipDiscovery?: boolean;
  skipWebsite?: boolean;
  skipInstagramVenues?: boolean;
  skipMixseries?: boolean;
  skipSoundcloud?: boolean;
  skipNlAudience?: boolean;
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
  deadlineMs?: number;
}): Promise<RadarPipelineResult> {
  const startedAt = new Date();
  const notes: string[] = [];
  const settings = await loadRadarSettings();
  const deadline = options?.deadlineMs ?? Date.now() + 240_000;
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

  let website: RadarPipelineResult["website"] = null;
  if (!options?.skipWebsite && !pastDeadline()) {
    website = await syncWebsiteVenues({ limit: 4 });
    notes.push(
      `Website: ${website.venuesTried} venues, ${website.partiesIngested} parties, ${website.artistsCreated} nieuwe namen.`,
    );
  }

  let instagramVenues: RadarPipelineResult["instagramVenues"] = null;
  if (!options?.skipInstagramVenues && !pastDeadline()) {
    instagramVenues = await syncInstagramVenues({ limit: 3 });
    if (instagramVenues.note) notes.push(instagramVenues.note);
    else {
      notes.push(
        `IG-venues: ${instagramVenues.venuesTried} accounts, ${instagramVenues.partiesIngested} parties.`,
      );
    }
  }

  let mixseries: RadarPipelineResult["mixseries"] = null;
  if (!options?.skipMixseries && !pastDeadline()) {
    // Meer kanalen → iets minder video's per kanaal (YouTube-quota)
    mixseries = await syncMixseriesChannels({ videosPerChannel: 8 });
    if (mixseries.note) notes.push(mixseries.note);
    else {
      notes.push(
        `Mixseries: ${mixseries.channelsTried} kanalen, ${mixseries.matched} matches, ${mixseries.viralAlerts} viral alerts.`,
      );
    }
  }

  let soundcloud: RadarPipelineResult["soundcloud"] = null;
  if (!options?.skipSoundcloud && !pastDeadline()) {
    soundcloud = await syncSoundCloudForShortlist({ limit: 25 });
    notes.push(
      `SoundCloud: ${soundcloud.synced}/${soundcloud.attempted} profiles.`,
    );
  }

  if (!options?.skipDiscovery && !pastDeadline()) {
    const venueScores = await refreshSuggestedVenueScores();
    notes.push(
      `Venue-suggesties: ${venueScores.scored} gescoord, ${venueScores.rejected} auto-afgewezen.`,
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
        `RA-enrich: ${enrich.enriched}/${enrich.attempted} verrijkt, ${enrich.relatedCreated} related.`,
      );
    }
  }

  let nlAudience: RadarPipelineResult["nlAudience"] = null;
  if (!options?.skipNlAudience && !pastDeadline()) {
    nlAudience = await refreshNlAudienceScores();
    notes.push(
      nlAudience.errors.length
        ? `NL-audience mislukt: ${nlAudience.errors[0]}`
        : `NL-audience: ${nlAudience.updated} scores bijgewerkt.`,
    );
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
  if (options?.skipSpotify === false) {
    if (!pastDeadline() && isSpotifyConfigured()) {
      spotify = await syncSpotifyForRadarArtists({
        limit: options?.spotifyLimit ?? 40,
      });
    } else {
      notes.push("Spotify overgeslagen.");
    }
  } else {
    notes.push("Spotify overgeslagen (niet prioriteit voor DJ-radar).");
  }

  let social: RadarPipelineResult["social"] = null;
  if (!options?.skipSocial && !pastDeadline()) {
    try {
      social = await syncSocialForTopArtists({ limit: 25, followGigs: true });
      if (social.note) notes.push(social.note);
      else {
        notes.push(
          `IG-social: ${social.synced}/${social.attempted} ververst` +
            (social.gigsDetected ? `, ${social.gigsDetected} gig-hints` : ""),
        );
      }
      if (social.errors.length) {
        notes.push(`IG-social errors: ${social.errors.slice(0, 2).join("; ")}`);
      }
    } catch (e) {
      notes.push(
        `IG-social crash: ${e instanceof Error ? e.message : String(e)}`,
      );
      social = {
        attempted: 0,
        synced: 0,
        skipped: 0,
        gigsDetected: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      };
    }
  }

  let launch: RadarPipelineResult["launch"] = null;
  if (!pastDeadline()) {
    launch = await detectLaunchAlerts({ limit: 200 });
    if (launch.alerts > 0 || launch.checked > 0) {
      notes.push(
        `Lanceert: ${launch.alerts} alerts op ${launch.checked} watchlist-artiesten.`,
      );
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
      if (digest.skipped) notes.push(`Digest overgeslagen: ${digest.reason}`);
      else if (digest.ok) {
        notes.push(
          `Digest verstuurd naar ${(digest.recipients ?? []).join(", ") || "—"}.`,
        );
      } else notes.push(`Digest mislukt: ${digest.error}`);
    }
  }

  return {
    ok:
      discovery.errors.length === 0 &&
      (website?.errors.length ?? 0) === 0 &&
      (enrich?.errors.length ?? 0) === 0 &&
      (rescore?.errors.length ?? 0) === 0 &&
      (digest?.ok !== false),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    discovery,
    website,
    instagramVenues,
    mixseries,
    soundcloud,
    nlAudience,
    enrich,
    rescore,
    spotify,
    social,
    launch,
    digest,
    notes,
  };
}
