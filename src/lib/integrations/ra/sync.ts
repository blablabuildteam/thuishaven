import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, raListings } from "@/lib/db/schema";
import { logIntegration } from "@/lib/integrations/log";
import { refreshDashboardAlerts } from "@/lib/integrations/alerts";
import {
  getRaVenue,
  listRaVenueEvents,
  type RaEvent,
} from "@/lib/integrations/ra/client";
import { syncRaAmsterdamAreaEvents } from "@/lib/integrations/ra/area-sync";

function amsterdamDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function soldOutFromTitle(title: string): boolean {
  return /sold\s*out/i.test(title);
}

function eventStart(ev: RaEvent): Date | null {
  const raw = ev.startTime || ev.date;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function nameOverlap(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w.length > 2 && !/^\d+$/.test(w)),
    );
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / Math.min(A.size, B.size);
}

export async function syncResidentAdvisorReadOnly(): Promise<{
  ok: boolean;
  venue?: string;
  fetched: number;
  upserted: number;
  linked: number;
  mismatches: number;
  areaFetched?: number;
  areaUpserted?: number;
  error?: string;
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      linked: 0,
      mismatches: 0,
      error: "DATABASE_URL ontbreekt",
    };
  }

  const venue = await getRaVenue();
  if (!venue.ok) {
    await logIntegration({
      source: "resident_advisor",
      level: "error",
      event: "sync.venue_failed",
      message: venue.error,
    });
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      linked: 0,
      mismatches: 0,
      error: venue.error,
    };
  }

  const year = new Date().getFullYear();
  const batches = await Promise.all([
    listRaVenueEvents({ type: "LATEST", limit: 50 }),
    ...[0, 1, 2, 3, 4, 5].map((ago) =>
      listRaVenueEvents({ type: "ARCHIVE", year: year - ago, limit: 80 }),
    ),
  ]);

  const byId = new Map<string, RaEvent>();
  for (const batch of batches) {
    if (!batch.ok) {
      await logIntegration({
        source: "resident_advisor",
        level: "error",
        event: "sync.events_failed",
        message: batch.error,
      });
      continue;
    }
    for (const ev of batch.events) {
      if (ev.id) byId.set(ev.id, ev);
    }
  }

  const events = [...byId.values()];
  const db = getDb();
  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
    })
    .from(editions);

  const editionsByDay = new Map<string, typeof eds>();
  for (const e of eds) {
    const day = amsterdamDay(e.startsAt);
    const list = editionsByDay.get(day) ?? [];
    list.push(e);
    editionsByDay.set(day, list);
  }

  let upserted = 0;
  let linked = 0;

  for (const ev of events) {
    const startsAt = eventStart(ev);
    const day = startsAt ? amsterdamDay(startsAt) : null;
    const candidates = day ? (editionsByDay.get(day) ?? []) : [];
    let editionId: string | null = null;
    if (candidates.length === 1) {
      editionId = candidates[0]!.id;
    } else if (candidates.length > 1) {
      const ranked = candidates
        .map((c) => ({ c, score: nameOverlap(ev.title, c.name) }))
        .sort((a, b) => b.score - a.score);
      if (ranked[0] && ranked[0].score >= 0.25) editionId = ranked[0].c.id;
    }

    const existing = await db
      .select({ id: raListings.id })
      .from(raListings)
      .where(eq(raListings.raEventId, ev.id))
      .limit(1);

    const values = {
      raEventId: ev.id,
      title: ev.title,
      startsAt,
      attending: ev.attending ?? 0,
      isTicketed: Boolean(ev.isTicketed),
      soldOut: soldOutFromTitle(ev.title),
      ticketsAvailable: Boolean(ev.ticketsAvailable),
      contentUrl: ev.contentUrl
        ? `https://ra.co${ev.contentUrl}`
        : `https://ra.co/events/${ev.id}`,
      editionId,
      syncedAt: new Date(),
    };

    if (existing[0]) {
      await db
        .update(raListings)
        .set(values)
        .where(eq(raListings.id, existing[0].id));
    } else {
      await db.insert(raListings).values(values);
    }
    upserted += 1;

    if (editionId) {
      await db
        .update(editions)
        .set({ raEventId: ev.id })
        .where(eq(editions.id, editionId));
      linked += 1;
    }
  }

  const alertCounts = await refreshDashboardAlerts().catch(() => ({
    ra: 0,
    ticketswap: 0,
  }));
  const mismatches = alertCounts.ra;

  const area = await syncRaAmsterdamAreaEvents().catch((e) => ({
    ok: false as const,
    fetched: 0,
    upserted: 0,
    error: e instanceof Error ? e.message : "area sync failed",
  }));

  await logIntegration({
    source: "resident_advisor",
    level: "info",
    event: "sync.ok",
    message: `RA listings: ${upserted} events, ${linked} gekoppeld, ${mismatches} Weeztix-uitverkocht/RA-open · AMS ${area.upserted} concurrenten`,
    detail: {
      fetched: events.length,
      upserted,
      linked,
      mismatches,
      areaFetched: area.fetched,
      areaUpserted: area.upserted,
      areaError: area.error,
    },
    throttleMs: 0,
  });

  return {
    ok: true,
    venue: venue.venue.name,
    fetched: events.length,
    upserted,
    linked,
    mismatches,
    areaFetched: area.fetched,
    areaUpserted: area.upserted,
  };
}
