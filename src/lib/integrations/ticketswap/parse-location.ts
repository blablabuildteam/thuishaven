import type { TicketswapEvent } from "@/lib/integrations/ticketswap/client";

type ApolloEvent = {
  __typename?: string;
  id?: string;
  name?: string;
  startDate?: string | null;
  availableTicketsCount?: { value?: string | number | null } | null;
  availableEntranceTicketsCount?: { value?: string | number | null } | null;
  uri?: { url?: string | null; path?: string | null } | null;
};

function toCount(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function absoluteUrl(url?: string | null, path?: string | null): string | null {
  if (url) return url;
  if (path) return `https://www.ticketswap.com${path}`;
  return null;
}

function eventId(url: string | null, fallback: string): string {
  if (!url) return fallback;
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || fallback;
  } catch {
    return fallback;
  }
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function startsAtFromUrl(url: string | null, hour = 13, minute = 0): Date | null {
  const day = url?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!day) return null;
  return new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+02:00`,
  );
}

export function parseTicketswapDateText(
  text: string,
  url?: string | null,
  year = new Date().getFullYear(),
): Date | null {
  const clock = parseClock(text);
  const fromUrl = startsAtFromUrl(url ?? null, clock?.hour ?? 13, clock?.minute ?? 0);
  if (fromUrl) return fromUrl;
  const human = text.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)\b/i,
  );
  if (!human) return null;
  const month = MONTHS[human[1]!.slice(0, 3).toLowerCase()];
  if (month == null) return null;
  let hour = Number(human[3]) % 12;
  if (human[5]!.toUpperCase() === "PM") hour += 12;
  const monthNum = String(month + 1).padStart(2, "0");
  const dayNum = String(Number(human[2])).padStart(2, "0");
  return new Date(
    `${year}-${monthNum}-${dayNum}T${String(hour).padStart(2, "0")}:${human[4]}:00+02:00`,
  );
}

function parseClock(text: string): { hour: number; minute: number } | null {
  const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(m[2]) };
}

function eventsFromApollo(html: string): TicketswapEvent[] {
  const raw = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    const found: TicketswapEvent[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      const rec = node as Record<string, unknown> & ApolloEvent;
      if (rec.__typename === "Event" && rec.id && rec.name) {
        const contentUrl = absoluteUrl(rec.uri?.url, rec.uri?.path);
        found.push({
          id: rec.id,
          title: rec.name,
          startsAt: rec.startDate ? new Date(rec.startDate) : startsAtFromUrl(contentUrl),
          availableCount: toCount(
            rec.availableEntranceTicketsCount?.value ??
              rec.availableTicketsCount?.value,
          ),
          contentUrl,
        });
      }
      for (const value of Object.values(rec)) walk(value);
    };
    walk(data);
    return found;
  } catch {
    return [];
  }
}

function eventsFromCards(html: string): TicketswapEvent[] {
  const events: TicketswapEvent[] = [];
  const seen = new Set<string>();
  const hrefRe =
    /<a[^>]+href="(https:\/\/www\.ticketswap\.com\/(?:club|festival)-tickets\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(hrefRe)) {
    const url = match[1]!.split("?")[0]!;
    if (url.includes("/club-tickets/") && url.endsWith("/club-tickets")) continue;
    if (url.includes("/festival-tickets/") && url.endsWith("/festival-tickets")) {
      continue;
    }
    const inner = match[2] ?? "";
    const title =
      inner
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(/Thuishaven, Amsterdam|Amsterdam/)[0]
        ?.trim() ?? "";
    if (!title || title.length < 3) continue;
    const id = eventId(url, title);
    if (seen.has(id)) continue;
    seen.add(id);
    const countMatch = inner.match(/>\s*(\d{1,4})\s*</);
    events.push({
      id,
      title,
      startsAt: parseTicketswapDateText(inner, url),
      availableCount: countMatch ? Number(countMatch[1]) : 0,
      contentUrl: url,
    });
  }
  return events;
}

/** Parse TicketSwap location HTML (Apollo cache + rendered event cards). */
export function parseTicketswapLocationHtml(html: string): TicketswapEvent[] {
  const byKey = new Map<string, TicketswapEvent>();
  const add = (event: TicketswapEvent) => {
    const key = event.contentUrl
      ? eventId(event.contentUrl, event.id)
      : event.id;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, event);
      return;
    }
    byKey.set(key, {
      ...prev,
      id: prev.id.startsWith("RXZlbnQ") || prev.id.includes("Event:") ? prev.id : event.id,
      title: prev.title.length >= event.title.length ? prev.title : event.title,
      startsAt: prev.startsAt ?? event.startsAt,
      availableCount: Math.max(prev.availableCount, event.availableCount),
      contentUrl: prev.contentUrl ?? event.contentUrl,
    });
  };
  for (const event of eventsFromApollo(html)) add(event);
  for (const event of eventsFromCards(html)) add(event);
  return [...byKey.values()].sort((a, b) => {
    const aTime = a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}
