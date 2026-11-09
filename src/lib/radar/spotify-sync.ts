import {
  getSpotifyArtist,
  isSpotifyConfigured,
  searchSpotifyArtists,
  type SpotifyArtist,
} from "@/lib/integrations/spotify/client";
import {
  getRadarArtist,
  insertMetricSnapshot,
  listArtistIdsForSync,
  updateRadarArtist,
  upsertArtistProfile,
  upsertRadarArtist,
} from "@/lib/radar/artists";
import { maybeAlertForScore } from "@/lib/radar/alerts";
import { recomputeArtistGrowthScore } from "@/lib/radar/score";

function pickPrimaryGenre(genres: string[]): string | null {
  if (!genres.length) return null;
  // Prefer more specific electronic tags over bare "electronic"
  const preferred = genres.find((g) => !/^electronic$/i.test(g));
  return (preferred ?? genres[0] ?? null)?.toLowerCase() ?? null;
}

async function applySpotifyToArtist(
  artistId: string,
  spotify: SpotifyArtist,
  opts?: { created?: boolean; artistName?: string },
) {
  await upsertArtistProfile({
    artistId,
    platform: "spotify",
    externalId: spotify.id,
    url: spotify.url,
    handle: spotify.name,
    raw: {
      genres: spotify.genres,
      popularity: spotify.popularity,
      followers: spotify.followers,
    },
  });
  await insertMetricSnapshot({
    artistId,
    platform: "spotify",
    metrics: {
      followers: spotify.followers,
      popularity: spotify.popularity,
    },
  });

  const dossier = await getRadarArtist(artistId);
  if (dossier && !dossier.artist.genreManual) {
    await updateRadarArtist(artistId, {
      primaryGenre: pickPrimaryGenre(spotify.genres),
      secondaryGenres: spotify.genres.slice(0, 5).map((g) => g.toLowerCase()),
      genreManual: false,
    });
  }

  const score = await recomputeArtistGrowthScore(artistId);
  if (score) {
    await maybeAlertForScore({
      artistId,
      artistName: opts?.artistName ?? spotify.name,
      score: score.score,
      velocity: score.velocity,
      created: Boolean(opts?.created),
    });
  }
}

export async function linkArtistToSpotifyBySearch(
  artistId: string,
): Promise<{ ok: true; matched: boolean } | { error: string }> {
  if (!isSpotifyConfigured()) {
    return { error: "Spotify niet geconfigureerd" };
  }
  const dossier = await getRadarArtist(artistId);
  if (!dossier) return { error: "Artiest niet gevonden" };

  const existing = dossier.profiles.find((p) => p.platform === "spotify");
  if (existing?.externalId) {
    const fresh = await getSpotifyArtist(existing.externalId);
    if (!fresh.ok) return { error: fresh.error };
    await applySpotifyToArtist(artistId, fresh.artist, {
      artistName: dossier.artist.name,
    });
    return { ok: true, matched: true };
  }

  const search = await searchSpotifyArtists(dossier.artist.name, 3);
  if (!search.ok) return { error: search.error };
  const match =
    search.artists.find(
      (a) => a.name.toLowerCase() === dossier.artist.name.toLowerCase(),
    ) ?? search.artists[0];
  if (!match) return { ok: true, matched: false };

  await applySpotifyToArtist(artistId, match, {
    artistName: dossier.artist.name,
  });
  return { ok: true, matched: true };
}

export async function addArtistFromSpotifySearch(
  query: string,
): Promise<
  | { ok: true; artistId: string; created: boolean; spotify: SpotifyArtist }
  | { error: string }
> {
  if (!isSpotifyConfigured()) {
    return { error: "Spotify niet geconfigureerd" };
  }
  const search = await searchSpotifyArtists(query, 1);
  if (!search.ok) return { error: search.error };
  const spotify = search.artists[0];
  if (!spotify) return { error: "Geen Spotify-artiest gevonden" };

  const up = await upsertRadarArtist({
    name: spotify.name,
    discoverySource: "spotify",
    primaryGenre: pickPrimaryGenre(spotify.genres),
    secondaryGenres: spotify.genres.slice(0, 5).map((g) => g.toLowerCase()),
    imageUrl: spotify.imageUrl,
  });
  if ("error" in up) return up;

  await applySpotifyToArtist(up.artist.id, spotify, {
    created: up.created,
    artistName: up.artist.name,
  });
  return {
    ok: true,
    artistId: up.artist.id,
    created: up.created,
    spotify,
  };
}

export async function syncSpotifyForRadarArtists(options?: {
  limit?: number;
}): Promise<{
  attempted: number;
  matched: number;
  errors: string[];
}> {
  const ids = await listArtistIdsForSync(options?.limit ?? 80);
  const out = { attempted: 0, matched: 0, errors: [] as string[] };
  if (!isSpotifyConfigured()) {
    out.errors.push("Spotify niet geconfigureerd");
    return out;
  }
  for (const id of ids) {
    out.attempted += 1;
    const res = await linkArtistToSpotifyBySearch(id);
    if ("error" in res) {
      out.errors.push(`${id}: ${res.error}`);
      continue;
    }
    if (res.matched) out.matched += 1;
  }
  return out;
}
