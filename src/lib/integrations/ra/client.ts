import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const GRAPHQL_URL = "https://ra.co/graphql";
const DEFAULT_VENUE_ID = "109027";

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
  contentUrl: string | null;
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
  const res = withYear
    ? await raGraphql<{
        venue: { events: RaEvent[] | null } | null;
      }>(
        `query VenueEvents($id: ID!, $type: EventQueryType!, $limit: Int, $year: Int) {
          venue(id: $id) {
            events(type: $type, limit: $limit, year: $year) {
              id title date startTime attending isTicketed contentUrl
            }
          }
        }`,
        { id: venueId(), type, limit, year },
      )
    : await raGraphql<{
        venue: { events: RaEvent[] | null } | null;
      }>(
        `query VenueEvents($id: ID!, $type: EventQueryType!, $limit: Int) {
          venue(id: $id) {
            events(type: $type, limit: $limit) {
              id title date startTime attending isTicketed contentUrl
            }
          }
        }`,
        { id: venueId(), type, limit },
      );
  if (!res.ok) return res;
  return { ok: true, events: res.data.venue?.events ?? [] };
}
