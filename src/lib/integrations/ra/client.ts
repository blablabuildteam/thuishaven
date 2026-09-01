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

export type RaEvent = {
  id: string;
  title: string;
  date: string | null;
  startTime: string | null;
  attending: number;
  isTicketed: boolean;
  ticketsAvailable: boolean;
  contentUrl: string | null;
  artists: string[];
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
  type?: "LATEST" | "ARCHIVE";
  year?: number;
  limit?: number;
}): Promise<
  { ok: true; events: RaEvent[] } | { ok: false; error: string; status: number }
> {
  const type = options?.type ?? "LATEST";
  const limit = options?.limit ?? 40;
  const year = options?.year;
  const withYear = type === "ARCHIVE" && year != null;
  const eventFields = `id title date startTime attending isTicketed contentUrl
              artists { name }
              ticketing { isAnyTicketTierAvailable }`;
  type VenueEventRaw = {
    id: string;
    title: string;
    date: string | null;
    startTime: string | null;
    attending: number;
    isTicketed: boolean;
    contentUrl: string | null;
    artists?: Array<{ name?: string | null } | null> | null;
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
        { id: venueId(), type, limit, year },
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
        { id: venueId(), type, limit },
      );
  if (!res.ok) return res;
  const events: RaEvent[] = (res.data.venue?.events ?? []).map((ev) => ({
    id: ev.id,
    title: ev.title,
    date: ev.date,
    startTime: ev.startTime,
    attending: ev.attending,
    isTicketed: ev.isTicketed,
    ticketsAvailable: Boolean(ev.ticketing?.isAnyTicketTierAvailable),
    contentUrl: ev.contentUrl,
    artists: (ev.artists ?? [])
      .map((a) => a?.name?.trim())
      .filter((n): n is string => Boolean(n)),
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
