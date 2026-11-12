/**
 * Spotify Web API — client-credentials (app-only).
 * Geen user OAuth nodig voor artiest-zoeken / populariteit / followers.
 * Let op: monthly listeners staan niet in de officiële API; we gebruiken
 * followers + popularity (+ genres).
 */

type TokenCache = { accessToken: string; expiresAt: number };
const globalForSpotify = globalThis as unknown as {
  thuishavenSpotifyToken?: TokenCache;
};

function creds() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isSpotifyConfigured(): boolean {
  return Boolean(creds());
}

async function getAccessToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const c = creds();
  if (!c) return { ok: false, error: "SPOTIFY_CLIENT_ID/SECRET ontbreekt" };

  const cached = globalForSpotify.thuishavenSpotifyToken;
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return { ok: true, token: cached.accessToken };
  }

  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString(
    "base64",
  );
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      return {
        ok: false,
        error:
          json.error_description ||
          json.error ||
          `Spotify token HTTP ${res.status}`,
      };
    }
    globalForSpotify.thuishavenSpotifyToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return { ok: true, token: json.access_token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Spotify token network error",
    };
  }
}

export type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: number;
  imageUrl: string | null;
  url: string;
};

async function spotifyGet<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const token = await getAccessToken();
  if (!token.ok) return { ok: false, error: token.error, status: 0 };
  try {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token.token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: json.error?.message || `Spotify HTTP ${res.status}`,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Spotify network error",
    };
  }
}

function mapArtist(raw: {
  id?: string;
  name?: string;
  genres?: string[];
  popularity?: number;
  followers?: { total?: number };
  images?: Array<{ url?: string }>;
  external_urls?: { spotify?: string };
}): SpotifyArtist | null {
  if (!raw.id || !raw.name) return null;
  return {
    id: raw.id,
    name: raw.name,
    genres: raw.genres ?? [],
    popularity: raw.popularity ?? 0,
    followers: raw.followers?.total ?? 0,
    imageUrl: raw.images?.[0]?.url ?? null,
    url: raw.external_urls?.spotify ?? `https://open.spotify.com/artist/${raw.id}`,
  };
}

export async function searchSpotifyArtists(
  q: string,
  limit = 5,
): Promise<
  { ok: true; artists: SpotifyArtist[] } | { ok: false; error: string }
> {
  const query = q.trim();
  if (!query) return { ok: true, artists: [] };
  const res = await spotifyGet<{
    artists?: { items?: Array<Parameters<typeof mapArtist>[0]> };
  }>(
    `/search?type=artist&limit=${Math.min(limit, 10)}&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return { ok: false, error: res.error };
  const artists = (res.data.artists?.items ?? [])
    .map(mapArtist)
    .filter((a): a is SpotifyArtist => Boolean(a));
  return { ok: true, artists };
}

export async function getSpotifyArtist(
  id: string,
): Promise<{ ok: true; artist: SpotifyArtist } | { ok: false; error: string }> {
  const res = await spotifyGet<Parameters<typeof mapArtist>[0]>(
    `/artists/${encodeURIComponent(id)}`,
  );
  if (!res.ok) return { ok: false, error: res.error };
  const artist = mapArtist(res.data);
  if (!artist) return { ok: false, error: "Artiest niet gevonden" };
  return { ok: true, artist };
}

export async function verifySpotify(): Promise<{
  ok: boolean;
  detail: string;
}> {
  if (!isSpotifyConfigured()) {
    return { ok: false, detail: "SPOTIFY_CLIENT_ID/SECRET ontbreekt" };
  }
  const token = await getAccessToken();
  if (!token.ok) return { ok: false, detail: token.error };
  const probe = await searchSpotifyArtists("Amelie Lens", 1);
  if (!probe.ok) return { ok: false, detail: probe.error };
  return {
    ok: true,
    detail: `OK · ${probe.artists[0]?.name ?? "search werkt"}`,
  };
}
