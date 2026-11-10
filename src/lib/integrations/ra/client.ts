import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const GRAPHQL_URL = "https://ra.co/graphql";
const DEFAULT_VENUE_ID = "109027";
/** RA area id for Amsterdam (https://ra.co/events/nl/amsterdam). */
const DEFAULT_AREA_ID = 29;

function areaId(): number {
  const raw = Number(process.env.RA_AREA_ID?.trim());
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AREA_ID;
}

export type RaVenue = {
  id: string;
  name: string;
  contentUrl?: string;
  address?: string;
};

export type RaLineupArtist = {
  id: string | null;
  name: string;
  contentUrl: string | null;
  /** 0 = first billed on the RA line-up. */
  billingIndex: number;
};

export type RaEvent = {
  id: string;
  title: string;
  date: string | null;
  startTime: string | null;
  attending: number;
  isTicketed: boolean;
  ticketsAvailable: boolean;
  contentUrl: string | null;
  /** Convenience: artist names in billing order. */
  artists: string[];
  lineup: RaLineupArtist[];
};

export type RaArtistEvent = {
  id: string;
  title: string;
  date: string | null;
  attending: number;
  contentUrl: string | null;
  venue: { id: string; name: string; contentUrl: string | null } | null;
};

export type RaArtistProfile = {
  id: string;
  name: string;
  contentUrl: string | null;
  instagram: string | null;
  soundcloud: string | null;
  facebook: string | null;
  twitter: string | null;
  website: string | null;
  bandcamp: string | null;
  discogs: string | null;
  followerCount: number | null;
  bookingDetails: string | null;
  residentCountry: string | null;
  areaName: string | null;
  countryName: string | null;
  firstEventDate: string | null;
  upcomingEventsCount: number | null;
  relatedArtists: Array<{
    id: string;
    name: string;
    contentUrl: string | null;
  }>;
  podcasts: Array<{ id: string; title: string }>;
  labels: Array<{ id: string; name: string }>;
};

function venueId(): string {
  return process.env.RA_VENUE_ID?.trim() || DEFAULT_VENUE_ID;
}

async function raGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  assertExternalReadOnly("POST", GRAPHQL_URL, { allowGraphqlReadPost: true });

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://ra.co",
        Referer: `https://ra.co/clubs/${venueId()}`,
        "User-Agent":
          "Mozilla/5.0 (compatible; ThuishavenDashboard/1.0; +https://thuishaven.nl)",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `RA HTTP ${res.status}`,
      };
    }
    if (json.errors?.length) {
      return {
        ok: false,
        status: res.status,
        error: json.errors[0]?.message ?? "RA GraphQL error",
      };
    }
    if (!json.data) {
      return { ok: false, status: res.status, error: "RA GraphQL: lege response" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "RA network error",
    };
  }
}

export async function getRaVenue(): Promise<
  { ok: true; venue: RaVenue } | { ok: false; error: string; status: number }
> {
  const res = await raGraphql<{ venue: RaVenue | null }>(
    `query Venue($id: ID!) {
      venue(id: $id) {
        id
        name
        contentUrl
        address
      }
    }`,
    { id: venueId() },
  );
  if (!res.ok) return res;
  if (!res.data.venue) {
    return { ok: false, error: "RA venue niet gevonden", status: 404 };
  }
  return { ok: true, venue: res.data.venue };
}

export async function listRaVenueEvents(options?: {
  /** Defaults to RA_VENUE_ID / Thuishaven. Radar passes seed venue ids. */
  venueId?: string;
  type?: "LATEST" | "ARCHIVE";
  year?: number;
  limit?: number;
}): Promise<
  { ok: true; events: RaEvent[] } | { ok: false; error: string; status: number }
> {
  const type = options?.type ?? "LATEST";
  const limit = options?.limit ?? 40;
  const year = options?.year;
  const id = options?.venueId?.trim() || venueId();
  const withYear = type === "ARCHIVE" && year != null;
  const eventFields = `id title date startTime attending isTicketed contentUrl
              artists { id name contentUrl }
              ticketing { isAnyTicketTierAvailable }`;
  type VenueEventRaw = {
    id: string;
    title: string;
    date: string | null;
    startTime: string | null;
    attending: number;
    isTicketed: boolean;
    contentUrl: string | null;
    artists?: Array<{
      id?: string | null;
      name?: string | null;
      contentUrl?: string | null;
    } | null> | null;
    ticketing?: { isAnyTicketTierAvailable?: boolean };
  };
  const res = withYear
    ? await raGraphql<{
        venue: { events: VenueEventRaw[] | null } | null;
      }>(
        `query VenueEvents($id: ID!, $type: EventQueryType!, $limit: Int, $year: Int) {
          venue(id: $id) {
            events(type: $type, limit: $limit, year: $year) {
              ${eventFields}
            }
          }
        }`,
        { id, type, limit, year },
      )
    : await raGraphql<{
        venue: { events: VenueEventRaw[] | null } | null;
      }>(
        `query VenueEvents($id: ID!, $type: EventQueryType!, $limit: Int) {
          venue(id: $id) {
            events(type: $type, limit: $limit) {
              ${eventFields}
            }
          }
        }`,
        { id, type, limit },
      );
  if (!res.ok) return res;
  const events: RaEvent[] = (res.data.venue?.events ?? []).map((ev) => {
    const lineup: RaLineupArtist[] = (ev.artists ?? [])
      .map((a, billingIndex) => {
        const name = a?.name?.trim();
        if (!name) return null;
        return {
          id: a?.id?.trim() || null,
          name,
          contentUrl: a?.contentUrl?.trim() || null,
          billingIndex,
        };
      })
      .filter((a): a is RaLineupArtist => Boolean(a));
    return {
      id: ev.id,
      title: ev.title,
      date: ev.date,
      startTime: ev.startTime,
      attending: ev.attending,
      isTicketed: ev.isTicketed,
      ticketsAvailable: Boolean(ev.ticketing?.isAnyTicketTierAvailable),
      contentUrl: ev.contentUrl,
      artists: lineup.map((a) => a.name),
      lineup,
    };
  });
  return { ok: true, events };
}

/** Full artist profile: socials, followers, agency, related. */
export async function getRaArtistProfile(
  artistId: string,
): Promise<
  | { ok: true; artist: RaArtistProfile }
  | { ok: false; error: string; status: number }
> {
  const res = await raGraphql<{
    artist: {
      id: string;
      name: string;
      contentUrl?: string | null;
      instagram?: string | null;
      soundcloud?: string | null;
      facebook?: string | null;
      twitter?: string | null;
      website?: string | null;
      bandcamp?: string | null;
      discogs?: string | null;
      followerCount?: number | null;
      bookingDetails?: string | null;
      residentCountry?: { id?: string | null; name?: string | null; isoCode?: string | null } | null;
      upcomingEventsCount?: number | null;
      area?: { name?: string | null; country?: { name?: string | null } | null } | null;
      firstEvent?: { date?: string | null } | null;
      relatedArtists?: Array<{
        id?: string | null;
        name?: string | null;
        contentUrl?: string | null;
      } | null> | null;
      podcasts?: Array<{ id?: string | null; title?: string | null } | null> | null;
      labels?: Array<{ id?: string | null; name?: string | null } | null> | null;
    } | null;
  }>(
    `query ArtistProfile($id: ID!) {
      artist(id: $id) {
        id
        name
        contentUrl
        instagram
        soundcloud
        facebook
        twitter
        website
        bandcamp
        discogs
        followerCount
        bookingDetails
        residentCountry { id name isoCode }
        upcomingEventsCount
        area { name country { name } }
        firstEvent { date }
        relatedArtists { id name contentUrl }
        podcasts { id title }
        labels { id name }
      }
    }`,
    { id: artistId },
  );
  if (!res.ok) return res;
  const a = res.data.artist;
  if (!a?.id || !a.name) {
    return { ok: false, error: "RA artist niet gevonden", status: 404 };
  }
  return {
    ok: true,
    artist: {
      id: a.id,
      name: a.name,
      contentUrl: a.contentUrl ?? null,
      instagram: a.instagram ?? null,
      soundcloud: a.soundcloud ?? null,
      facebook: a.facebook ?? null,
      twitter: a.twitter ?? null,
      website: a.website ?? null,
      bandcamp: a.bandcamp ?? null,
      discogs: a.discogs ?? null,
      followerCount:
        typeof a.followerCount === "number" ? a.followerCount : null,
      bookingDetails: a.bookingDetails ?? null,
      residentCountry: a.residentCountry?.name ?? null,
      areaName: a.area?.name ?? null,
      countryName: a.area?.country?.name ?? null,
      firstEventDate: a.firstEvent?.date ?? null,
      upcomingEventsCount:
        typeof a.upcomingEventsCount === "number"
          ? a.upcomingEventsCount
          : null,
      relatedArtists: (a.relatedArtists ?? [])
        .map((r) => {
          const id = r?.id?.trim();
          const name = r?.name?.trim();
          if (!id || !name) return null;
          return { id, name, contentUrl: r?.contentUrl ?? null };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r)),
      podcasts: (a.podcasts ?? [])
        .map((p) => {
          const id = p?.id?.trim();
          const title = p?.title?.trim();
          if (!id || !title) return null;
          return { id, title };
        })
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
      labels: (a.labels ?? [])
        .map((l) => {
          const id = l?.id?.trim();
          const name = l?.name?.trim();
          if (!id || !name) return null;
          return { id, name };
        })
        .filter((l): l is NonNullable<typeof l> => Boolean(l)),
    },
  };
}

/** Recent / archive gigs for one RA artist (snowball + scoring). */
export async function listRaArtistEvents(options: {
  artistId: string;
  type?: "LATEST" | "ARCHIVE";
  year?: number;
  limit?: number;
}): Promise<
  | { ok: true; events: RaArtistEvent[] }
  | { ok: false; error: string; status: number }
> {
  const type = options.type ?? "LATEST";
  const limit = options.limit ?? 40;
  const withYear = type === "ARCHIVE" && options.year != null;
  type ArtistEventRaw = {
    id: string;
    title: string;
    date: string | null;
    attending: number;
    contentUrl: string | null;
    venue?: {
      id?: string | null;
      name?: string | null;
      contentUrl?: string | null;
    } | null;
  };
  const fields = `id title date attending contentUrl
            venue { id name contentUrl }`;
  const res = withYear
    ? await raGraphql<{
        artist: { events: ArtistEventRaw[] | null } | null;
      }>(
        `query ArtistEvents($id: ID!, $type: EventQueryType!, $limit: Int, $year: Int) {
          artist(id: $id) {
            events(type: $type, limit: $limit, year: $year) { ${fields} }
          }
        }`,
        {
          id: options.artistId,
          type,
          limit,
          year: options.year,
        },
      )
    : await raGraphql<{
        artist: { events: ArtistEventRaw[] | null } | null;
      }>(
        `query ArtistEvents($id: ID!, $type: EventQueryType!, $limit: Int) {
          artist(id: $id) {
            events(type: $type, limit: $limit) { ${fields} }
          }
        }`,
        { id: options.artistId, type, limit },
      );
  if (!res.ok) return res;
  const events: RaArtistEvent[] = (res.data.artist?.events ?? []).map((ev) => ({
    id: ev.id,
    title: ev.title,
    date: ev.date,
    attending: ev.attending ?? 0,
    contentUrl: ev.contentUrl,
    venue: ev.venue?.id
      ? {
          id: ev.venue.id,
          name: ev.venue.name ?? "Unknown",
          contentUrl: ev.venue.contentUrl ?? null,
        }
      : null,
  }));
  return { ok: true, events };
}

export type RaAreaEvent = {
  id: string;
  title: string;
  date: string | null;
  startTime: string | null;
  attending: number;
  isFestival: boolean;
  contentUrl: string | null;
  venueId: string | null;
  venueName: string | null;
  genres: string[];
};

/**
 * Read-only: Amsterdam (or RA_AREA_ID) listings for a date window.
 * Same public GraphQL we already use for the Thuishaven venue.
 */
export async function listRaAreaEvents(options: {
  fromDay: string;
  toDay: string;
  pageSize?: number;
  page?: number;
}): Promise<
  { ok: true; events: RaAreaEvent[] } | { ok: false; error: string; status: number }
> {
  const pageSize = options.pageSize ?? 50;
  const page = options.page ?? 1;
  const res = await raGraphql<{
    eventListings?: {
      data?: Array<{
        listingDate?: string | null;
        event?: {
          id?: string;
          title?: string;
          date?: string | null;
          startTime?: string | null;
          attending?: number | null;
          contentUrl?: string | null;
          isFestival?: boolean | null;
          genres?: Array<{ name?: string | null } | null> | null;
          venue?: { id?: string; name?: string } | null;
        } | null;
      } | null>;
    } | null;
  }>(
    `query AreaEventListings($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
      eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
        data {
          listingDate
          event {
            id
            title
            date
            startTime
            attending
            contentUrl
            isFestival
            genres { name }
            venue { id name }
          }
        }
      }
    }`,
    {
      filters: {
        areas: { eq: areaId() },
        listingDate: { gte: options.fromDay, lte: options.toDay },
      },
      pageSize,
      page,
    },
  );
  if (!res.ok) return res;
  const events: RaAreaEvent[] = [];
  for (const row of res.data.eventListings?.data ?? []) {
    const ev = row?.event;
    if (!ev?.id || !ev.title) continue;
    events.push({
      id: ev.id,
      title: ev.title,
      date: ev.date ?? row?.listingDate ?? null,
      startTime: ev.startTime ?? null,
      attending: ev.attending ?? 0,
      isFestival: Boolean(ev.isFestival),
      contentUrl: ev.contentUrl ?? null,
      venueId: ev.venue?.id ?? null,
      venueName: ev.venue?.name ?? null,
      genres: (ev.genres ?? [])
        .map((g) => g?.name?.trim())
        .filter((n): n is string => Boolean(n)),
    });
  }
  return { ok: true, events };
}
