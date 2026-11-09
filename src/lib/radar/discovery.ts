import {
  listRaArtistEvents,
  listRaVenueEvents,
  type RaEvent,
} from "@/lib/integrations/ra/client";
import {
  upsertArtistProfile,
  upsertRadarArtist,
  type RadarArtistRow,
} from "@/lib/radar/artists";
import { createRadarAlert } from "@/lib/radar/alerts";
import { upsertRadarGig } from "@/lib/radar/gigs";
import { loadRadarSettings } from "@/lib/radar/settings";
import { maybeAlertForScore } from "@/lib/radar/alerts";
import { recomputeArtistScoreV2 } from "@/lib/radar/score-v2";
import { normalizeArtistName } from "@/lib/radar/types";
import {
  createRadarVenue,
  listActiveSeedVenues,
  listRadarVenues,
  parseRaVenueId,
  updateRadarVenue,
} from "@/lib/radar/venues";

export type DiscoveryResult = {
  venuesScanned: number;
  eventsSeen: number;
  artistsUpserted: number;
  artistsCreated: number;
  gigsUpserted: number;
  venuesSuggested: number;
  scored: number;
  skippedNoRaId: number;
  errors: string[];
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function eventStart(ev: RaEvent): Date | null {
  const raw = ev.startTime || ev.date;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function raContentUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `https://ra.co${path.startsWith("/") ? path : `/${path}`}`;
}

async function collectVenueEvents(
  raId: string,
  historyYears: number,
  limitPerBatch: number,
): Promise<{ events: RaEvent[]; errors: string[] }> {
  const byId = new Map<string, RaEvent>();
  const errors: string[] = [];
  const year = new Date().getFullYear();
  const batches: Array<{ type: "LATEST" | "ARCHIVE"; year?: number }> = [
    { type: "LATEST" },
  ];
  for (let ago = 0; ago < historyYears; ago += 1) {
    batches.push({ type: "ARCHIVE", year: year - ago });
  }

  for (const batch of batches) {
    const res = await listRaVenueEvents({
      venueId: raId,
      type: batch.type,
      year: batch.year,
      limit: limitPerBatch,
    });
    if (!res.ok) {
      errors.push(`venue ${raId} ${batch.type}${batch.year ?? ""}: ${res.error}`);
      continue;
    }
    for (const ev of res.events) {
      if (ev.id) byId.set(ev.id, ev);
    }
    await sleep(80);
  }
  return { events: [...byId.values()], errors };
}

/**
 * Sneeuwbal stap 0→1: line-ups van seed/accepted venues → artiesten + gigs.
 * Trekt LATEST + ARCHIVE (historyYears) zodat momentum meteen iets betekent.
 */
export async function discoverArtistsFromSeedVenues(options?: {
  limitPerVenue?: number;
  historyYears?: number;
  scoreLimit?: number;
  snowballArtists?: number;
  /** Cap venues per run (cron-vriendelijk). */
  venueLimit?: number;
  /** Explicit venue id batch (rotation). */
  venueIds?: string[];
}): Promise<DiscoveryResult> {
  const settings = await loadRadarSettings();
  const allVenues = await listActiveSeedVenues();
  const venues = options?.venueIds?.length
    ? allVenues.filter((v) => options.venueIds!.includes(v.id))
    : allVenues.slice(0, options?.venueLimit ?? allVenues.length);
  const historyYears = options?.historyYears ?? 2;
  const limitPerVenue = options?.limitPerVenue ?? 40;
  const result: DiscoveryResult = {
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

  const artistCache = new Map<string, RadarArtistRow>();
  const raProfileLinked = new Set<string>();
  const touchedArtistIds = new Set<string>();
  const raArtistIdsForSnowball: Array<{ artistId: string; raId: string }> = [];
  const seenGigKeys = new Set<string>();

  for (const venue of venues) {
    const raId = venue.raExternalId || parseRaVenueId(venue.raUrl);
    if (!raId) {
      result.skippedNoRaId += 1;
      continue;
    }
    if (!venue.raExternalId) {
      await updateRadarVenue(venue.id, {
        raUrl: venue.raUrl || `https://ra.co/clubs/${raId}`,
        raExternalId: raId,
      });
    }

    result.venuesScanned += 1;
    const collected = await collectVenueEvents(raId, historyYears, limitPerVenue);
    result.errors.push(...collected.errors.map((e) => `${venue.name}: ${e}`));
    result.eventsSeen += collected.events.length;

    const hops = Math.min(venue.discoveryHops, settings.discovery.maxHops);

    for (const event of collected.events) {
      const startsAt = eventStart(event);
      const lineup = event.lineup?.length
        ? event.lineup
        : event.artists.map((name, billingIndex) => ({
            id: null as string | null,
            name,
            contentUrl: null as string | null,
            billingIndex,
          }));

      for (const act of lineup) {
        const key = normalizeArtistName(act.name);
        if (!key) continue;

        let artist = artistCache.get(key);
        let created = false;
        if (!artist) {
          const up = await upsertRadarArtist({
            name: act.name,
            discoverySource: "lineup",
            discoveryHops: hops,
            discoveredViaVenueId: venue.id,
            city: venue.city,
            country: venue.country,
          });
          if ("error" in up) {
            result.errors.push(up.error);
            continue;
          }
          artist = up.artist;
          created = up.created;
          artistCache.set(key, artist);
        }

        result.artistsUpserted += 1;
        if (created) result.artistsCreated += 1;
        touchedArtistIds.add(artist.id);

        if (act.id && !raProfileLinked.has(artist.id)) {
          raProfileLinked.add(artist.id);
          await upsertArtistProfile({
            artistId: artist.id,
            platform: "resident_advisor",
            externalId: act.id,
            url: raContentUrl(act.contentUrl) ?? `https://ra.co/dj/${act.id}`,
            handle: act.contentUrl?.replace(/^\/dj\//, "") ?? null,
            matchConfidence: "high",
            raw: { raArtistId: act.id, contentUrl: act.contentUrl },
          });
          if (
            raArtistIdsForSnowball.length < (options?.snowballArtists ?? 15) &&
            !raArtistIdsForSnowball.some((x) => x.raId === act.id)
          ) {
            raArtistIdsForSnowball.push({ artistId: artist.id, raId: act.id });
          }
        }

        const gigKey = `${artist.id}:${event.id}`;
        if (seenGigKeys.has(gigKey)) continue;
        seenGigKeys.add(gigKey);

        const gig = await upsertRadarGig({
          artistId: artist.id,
          venueId: venue.id,
          eventName: event.title,
          startsAt,
          city: venue.city,
          country: venue.country,
          sourceUrl: raContentUrl(event.contentUrl),
          externalEventId: event.id,
          billingIndex: act.billingIndex,
          isHeadliner: act.billingIndex === 0,
          attending: event.attending,
        });
        if ("error" in gig) {
          result.errors.push(gig.error);
        } else {
          result.gigsUpserted += 1;
        }
      }
    }
  }

  // Hop 2: artist pages → suggest unknown venues
  const knownRaIds = new Set(
    (await listRadarVenues())
      .map((v) => v.raExternalId || parseRaVenueId(v.raUrl))
      .filter((id): id is string => Boolean(id)),
  );

  for (const item of raArtistIdsForSnowball) {
    const res = await listRaArtistEvents({
      artistId: item.raId,
      type: "LATEST",
      limit: 20,
    });
    await sleep(80);
    if (!res.ok) {
      result.errors.push(`snowball ${item.raId}: ${res.error}`);
      continue;
    }
    for (const ev of res.events) {
      const v = ev.venue;
      if (!v?.id || knownRaIds.has(v.id)) continue;
      knownRaIds.add(v.id);
      const created = await createRadarVenue({
        name: v.name,
        status: "suggested",
        kind: "club",
        tier: "mid",
        raUrl: raContentUrl(v.contentUrl) ?? `https://ra.co/clubs/${v.id}`,
        raExternalId: v.id,
        notes: `Snowball via artiest ${item.raId}`,
        discoveryHops: 1,
      });
      if ("error" in created) continue;
      result.venuesSuggested += 1;
      await createRadarAlert({
        kind: "venue_suggestion",
        venueId: created.venue.id,
        artistId: item.artistId,
        title: `Venue-suggestie: ${v.name}`,
        body: "Gevonden via artiest-pagina (hop 2). Accepteer om toe te voegen aan de startlijst.",
      });
    }
  }

  const scoreLimit = options?.scoreLimit ?? 80;
  let scored = 0;
  for (const artistId of touchedArtistIds) {
    if (scored >= scoreLimit) break;
    const score = await recomputeArtistScoreV2(artistId);
    if (!score) continue;
    scored += 1;
    const artist = [...artistCache.values()].find((a) => a.id === artistId);
    await maybeAlertForScore({
      artistId,
      artistName: artist?.name ?? "Artiest",
      score: score.total,
      velocity: score.velocity,
      created: false,
      momentum: score.momentum,
      bookability: score.bookability,
      reasons: score.reasons,
    });
  }
  result.scored = scored;

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
