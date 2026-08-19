import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const GRAPHQL_URL = "https://api.ticketswap.com/graphql/public";
const DEFAULT_LOCATION_ID = "3517";
const DEFAULT_LOCATION_SLUG = "thuishaven";

export type TicketswapEvent = {
  id: string;
  title: string;
  startsAt: Date | null;
  availableCount: number;
  contentUrl: string | null;
};

function locationNumericId(): string {
  return process.env.TICKETSWAP_LOCATION_ID?.trim() || DEFAULT_LOCATION_ID;
}

function locationSlug(): string {
  return process.env.TICKETSWAP_LOCATION_SLUG?.trim() || DEFAULT_LOCATION_SLUG;
}

export function ticketswapVenueUrl(): string {
  return `https://www.ticketswap.com/location/${locationSlug()}/${locationNumericId()}`;
}

function globalId(type: string, id: string): string {
  return Buffer.from(`${type}:${id}`).toString("base64");
}

const EVENTS_QUERY = `query getActiveEventsForLocation($after: String, $filter: EventFilterInput, $orderBy: [EventSortingInput!]) {
  activeEvents(first: 20, after: $after, orderBy: $orderBy, filter: $filter) {
    edges {
      node {
        id
        name
        startDate
        slug
        availableTicketsCount { value }
        availableEntranceTicketsCount { value }
        uri { url path }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

type GqlEventNode = {
  id?: string;
  name?: string;
  startDate?: string | null;
  slug?: string;
  availableTicketsCount?: { value?: number | null } | null;
  availableEntranceTicketsCount?: { value?: number | null } | null;
  uri?: { url?: string | null; path?: string | null } | null;
};

async function ticketswapGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  assertExternalReadOnly("POST", GRAPHQL_URL, { allowGraphqlReadPost: true });
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://www.ticketswap.com",
    Referer: ticketswapVenueUrl(),
    "User-Agent":
      "Mozilla/5.0 (compatible; ThuishavenDashboard/1.0; +https://thuishaven.nl)",
  };
  const token = process.env.TICKETSWAP_API_KEY?.trim();
  if (token) headers["Developer-Token"] = token;

  try {
    const res = await fetch(`${GRAPHQL_URL}?version=7`, {
      method: "POST",
      headers,
      body: JSON.stringify({ operationName, query, variables }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: T;
      errors?: Array<{ message?: string }>;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: json.error || json.errors?.[0]?.message || `TicketSwap HTTP ${res.status}`,
      };
    }
    if (json.errors?.length) {
      return {
        ok: false,
        status: res.status,
        error: json.errors[0]?.message ?? "TicketSwap GraphQL error",
      };
    }
    if (!json.data) {
      return { ok: false, status: res.status, error: "TicketSwap: lege response" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "TicketSwap network error",
    };
  }
}

function mapEvent(node: GqlEventNode): TicketswapEvent | null {
  if (!node.id || !node.name) return null;
  const available =
    node.availableEntranceTicketsCount?.value ??
    node.availableTicketsCount?.value ??
    0;
  const path = node.uri?.path;
  const url = node.uri?.url;
  return {
    id: node.id,
    title: node.name,
    startsAt: node.startDate ? new Date(node.startDate) : null,
    availableCount: typeof available === "number" ? available : 0,
    contentUrl: url
      ? url
      : path
        ? `https://www.ticketswap.com${path}`
        : null,
  };
}

export async function listTicketswapLocationEvents(): Promise<
  | { ok: true; events: TicketswapEvent[] }
  | { ok: false; error: string; status: number }
> {
  const events: TicketswapEvent[] = [];
  let after: string | null = null;
  const locationId = globalId("Location", locationNumericId());

  for (let page = 0; page < 8; page += 1) {
    const res = await ticketswapGraphql<{
      activeEvents?: {
        edges?: Array<{ node?: GqlEventNode }>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    }>(
      EVENTS_QUERY,
      {
        after,
        filter: {
          locationId,
          minimumAvailableEntranceTickets: 0,
        },
        orderBy: [{ field: "EVENT_START", direction: "ASC" }],
      },
      "getActiveEventsForLocation",
    );
    if (!res.ok) return res;
    for (const edge of res.data.activeEvents?.edges ?? []) {
      const mapped = edge.node ? mapEvent(edge.node) : null;
      if (mapped) events.push(mapped);
    }
    if (!res.data.activeEvents?.pageInfo?.hasNextPage) break;
    after = res.data.activeEvents.pageInfo.endCursor ?? null;
    if (!after) break;
  }

  return { ok: true, events };
}
