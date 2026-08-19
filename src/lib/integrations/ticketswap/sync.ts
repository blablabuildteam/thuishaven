import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory, ticketswapListings } from "@/lib/db/schema";
import { logIntegration } from "@/lib/integrations/log";
import { refreshDashboardAlerts } from "@/lib/integrations/alerts";
import {
  listTicketswapLocationEvents,
  ticketswapVenueUrl,
} from "@/lib/integrations/ticketswap/client";

function amsterdamDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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

export async function syncTicketSwapReadOnly(): Promise<{
  ok: boolean;
  fetched: number;
  upserted: number;
  linked: number;
  mismatches: number;
  venueUrl: string;
  error?: string;
}> {
  const venueUrl = ticketswapVenueUrl();
  if (!hasDatabase()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      linked: 0,
      mismatches: 0,
      venueUrl,
      error: "DATABASE_URL ontbreekt",
    };
  }

  const listed = await listTicketswapLocationEvents();
  if (!listed.ok) {
    await logIntegration({
      source: "ticketswap",
      level: "error",
      event: "sync.events_failed",
      message: listed.error,
    });
    const mismatches = await refreshDashboardAlerts({
      ticketswapLive: false,
    }).catch(() => ({ ra: 0, ticketswap: 0 }));
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      linked: 0,
      mismatches: mismatches.ticketswap,
      venueUrl,
      error: listed.error,
    };
  }

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
  const availableByEdition = new Map<string, number>();

  for (const ev of listed.events) {
    const day = ev.startsAt ? amsterdamDay(ev.startsAt) : null;
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
      .select({ id: ticketswapListings.id })
      .from(ticketswapListings)
      .where(eq(ticketswapListings.tsEventId, ev.id))
      .limit(1);

    const values = {
      tsEventId: ev.id,
      title: ev.title,
      startsAt: ev.startsAt,
      availableCount: ev.availableCount,
      contentUrl: ev.contentUrl,
      editionId,
      syncedAt: new Date(),
    };

    if (existing[0]) {
      await db
        .update(ticketswapListings)
        .set(values)
        .where(eq(ticketswapListings.id, existing[0].id));
    } else {
      await db.insert(ticketswapListings).values(values);
    }
    upserted += 1;

    if (editionId) {
      await db
        .update(editions)
        .set({ ticketswapEventId: ev.id })
        .where(eq(editions.id, editionId));
      linked += 1;
      availableByEdition.set(
        editionId,
        (availableByEdition.get(editionId) ?? 0) + ev.availableCount,
      );
    }
  }

  for (const [editionId, available] of availableByEdition) {
    const inv = await db
      .select()
      .from(ticketInventory)
      .where(eq(ticketInventory.editionId, editionId))
      .limit(20);
    const tsRow = inv.find((r) => r.platform === "ticketswap");
    if (tsRow) {
      await db
        .update(ticketInventory)
        .set({
          available,
          isSoldOut: available <= 0,
          syncedAt: new Date(),
        })
        .where(eq(ticketInventory.id, tsRow.id));
    } else {
      await db.insert(ticketInventory).values({
        editionId,
        platform: "ticketswap",
        available,
        sold: 0,
        isSoldOut: available <= 0,
      });
    }
  }

  const alertCounts = await refreshDashboardAlerts({
    ticketswapLive: true,
  }).catch(() => ({ ra: 0, ticketswap: 0 }));
  const mismatches = alertCounts.ticketswap;

  await logIntegration({
    source: "ticketswap",
    level: "info",
    event: "sync.ok",
    message: `TicketSwap listings: ${upserted} events, ${linked} gekoppeld, ${mismatches} sold-out alerts`,
    detail: { fetched: listed.events.length, upserted, linked, mismatches },
    throttleMs: 0,
  });

  return {
    ok: true,
    fetched: listed.events.length,
    upserted,
    linked,
    mismatches,
    venueUrl,
  };
}
