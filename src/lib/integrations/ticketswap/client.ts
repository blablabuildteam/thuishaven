import { assertExternalReadOnly } from "@/lib/integrations/read-only";
import { parseTicketswapLocationHtml } from "@/lib/integrations/ticketswap/parse-location";

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

type ActiveEventsPage = {
  activeEvents?: {
    edges?: Array<{ node?: GqlEventNode }>;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  };
};

type TicketswapGraphqlResult =
  | { ok: true; data: ActiveEventsPage }
  | { ok: false; error: string; status: number };

async function listViaGraphql(): Promise<
  | { ok: true; events: TicketswapEvent[] }
  | { ok: false; error: string; status: number }
> {
  const events: TicketswapEvent[] = [];
  let after: string | null = null;
  const locationId = globalId("Location", locationNumericId());

  for (let page = 0; page < 8; page += 1) {
    const res: TicketswapGraphqlResult = await ticketswapGraphql<ActiveEventsPage>(
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

async function fetchLocationHtml(): Promise<
  { ok: true; html: string } | { ok: false; error: string; status: number }
> {
  const url = ticketswapVenueUrl();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; ThuishavenDashboard/1.0; +https://thuishaven.nl)",
        Referer: "https://www.ticketswap.com/",
      },
      cache: "no-store",
    });
    const html = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `TicketSwap HTML HTTP ${res.status}`,
      };
    }
    if (html.length < 4000 || /__NEXT_DATA__|club-tickets/.test(html) === false) {
      return {
        ok: false,
        status: res.status,
        error: "TicketSwap pagina geblokkeerd of leeg (geen event-listings)",
      };
    }
    return { ok: true, html };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "TicketSwap HTML network error",
    };
  }
}

async function listViaFirecrawl(): Promise<
  | { ok: true; events: TicketswapEvent[] }
  | { ok: false; error: string; status: number }
> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) {
    return { ok: false, status: 0, error: "FIRECRAWL_API_KEY ontbreekt" };
  }
  const url = "https://api.firecrawl.dev/v1/scrape";
  assertExternalReadOnly("POST", url, { allowFirecrawlReadPost: true });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        url: ticketswapVenueUrl(),
        formats: ["html"],
        waitFor: 8000,
        timeout: 30000,
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { html?: string };
      error?: string;
    };
    const html = json.data?.html;
    if (!res.ok || !html) {
      return {
        ok: false,
        status: res.status,
        error: json.error || `Firecrawl HTTP ${res.status}`,
      };
    }
    const events = parseTicketswapLocationHtml(html);
    if (!events.length) {
      return { ok: false, status: res.status, error: "Firecrawl: geen events geparsed" };
    }
    return { ok: true, events };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Firecrawl network error",
    };
  }
}

export async function listTicketswapLocationEvents(): Promise<
  | { ok: true; events: TicketswapEvent[] }
  | { ok: false; error: string; status: number }
> {
  const graphql = await listViaGraphql();
  if (graphql.ok && graphql.events.length > 0) return graphql;

  const page = await fetchLocationHtml();
  if (page.ok) {
    const events = parseTicketswapLocationHtml(page.html);
    if (events.length > 0) return { ok: true, events };
  }

  const scraped = await listViaFirecrawl();
  if (scraped.ok) return scraped;

  return {
    ok: false,
    status: graphql.ok ? page.status : graphql.status,
    error:
      graphql.ok
        ? page.ok
          ? scraped.error
          : `${page.error}${scraped.error && !scraped.error.includes("ontbreekt") ? ` · ${scraped.error}` : ""}`
        : `${graphql.error}${page.ok ? "" : ` · ${page.error}`}`,
  };
}
