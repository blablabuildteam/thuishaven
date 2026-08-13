import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import {
  getWeeztixEventStatistics,
  listWeeztixEvents,
  type WeeztixEvent,
} from "@/lib/integrations/weeztix/client";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "event"
  );
}

function pickSold(stats: unknown): { sold: number; capacity: number | null } {
  if (!stats || typeof stats !== "object") return { sold: 0, capacity: null };
  const s = stats as Record<string, unknown>;
  const candidates = [
    s.sold,
    s.tickets_sold,
    s.ticket_sold,
    s.total_sold,
    s.quantity_sold,
  ];
  let sold = 0;
  for (const c of candidates) {
    if (typeof c === "number") {
      sold = c;
      break;
    }
  }
  const capRaw = s.capacity ?? s.total ?? s.available_total;
  const capacity = typeof capRaw === "number" ? capRaw : null;
  return { sold, capacity };
}

/**
 * Haalt Weeztix-events op (GET) en schrijft alleen naar onze DB.
 * Geen create/update op Weeztix.
 */
export async function syncWeeztixReadOnly(): Promise<{
  ok: boolean;
  source: string;
  eventsFetched: number;
  editionsUpserted: number;
  inventoryUpserted: number;
  error?: string;
  preview?: Array<{ guid: string; name: string }>;
}> {
  const listed = await listWeeztixEvents();
  if (!listed.ok) {
    return {
      ok: false,
      source: "weeztix",
      eventsFetched: 0,
      editionsUpserted: 0,
      inventoryUpserted: 0,
      error: listed.error,
    };
  }

  const events = listed.events.filter((e) => e.guid && e.name);
  const preview = events.slice(0, 20).map((e) => ({
    guid: String(e.guid),
    name: String(e.name),
  }));

  if (!hasDatabase()) {
    return {
      ok: true,
      source: "weeztix",
      eventsFetched: events.length,
      editionsUpserted: 0,
      inventoryUpserted: 0,
      error: "DATABASE_URL ontbreekt — events wel opgehaald, niet opgeslagen",
      preview,
    };
  }

  const db = getDb();
  let editionsUpserted = 0;
  let inventoryUpserted = 0;

  for (const event of events) {
    const guid = String(event.guid);
    const name = String(event.name);
    const startsAt = event.start ? new Date(String(event.start)) : new Date();
    const endsAt = event.end ? new Date(String(event.end)) : null;

    const existing = await db
      .select()
      .from(editions)
      .where(eq(editions.weeztixEventId, guid))
      .limit(1);

    let editionId = "";
    if (existing[0]) {
      await db
        .update(editions)
        .set({
          name,
          startsAt: Number.isNaN(startsAt.getTime()) ? existing[0].startsAt : startsAt,
          endsAt:
            endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : existing[0].endsAt,
        })
        .where(eq(editions.id, existing[0].id));
      editionId = existing[0].id;
    } else {
      const baseSlug = slugify(name);
      for (let i = 0; i < 5; i++) {
        try {
          const inserted = await db
            .insert(editions)
            .values({
              name,
              slug: i === 0 ? baseSlug : `${baseSlug}-${guid.slice(0, 8)}`,
              startsAt: Number.isNaN(startsAt.getTime()) ? new Date() : startsAt,
              endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
              status: "upcoming",
              weeztixEventId: guid,
            })
            .returning({ id: editions.id });
          editionId = inserted[0].id;
          break;
        } catch {
          if (i === 4) throw new Error(`Kon editie niet inserten: ${name}`);
        }
      }
    }
    if (!editionId) continue;
    editionsUpserted += 1;

    // Best-effort stats (sommige accounts hebben dit endpoint niet)
    const stats = await getWeeztixEventStatistics(guid);
    if (stats.ok) {
      const { sold, capacity } = pickSold(stats.data);
      const inv = await db
        .select()
        .from(ticketInventory)
        .where(eq(ticketInventory.editionId, editionId))
        .limit(20);
      const weeztixRow = inv.find((r) => r.platform === "weeztix");
      const available =
        capacity != null ? Math.max(capacity - sold, 0) : Math.max(0, sold === 0 ? 0 : 0);
      if (weeztixRow) {
        await db
          .update(ticketInventory)
          .set({
            sold,
            capacity,
            available: capacity != null ? available : weeztixRow.available,
            isSoldOut: capacity != null ? available <= 0 : false,
            syncedAt: new Date(),
          })
          .where(eq(ticketInventory.id, weeztixRow.id));
      } else {
        await db.insert(ticketInventory).values({
          editionId,
          platform: "weeztix",
          capacity,
          sold,
          available: capacity != null ? available : 0,
          isSoldOut: capacity != null && available <= 0,
        });
      }
      inventoryUpserted += 1;
    }
  }

  return {
    ok: true,
    source: "weeztix",
    eventsFetched: events.length,
    editionsUpserted,
    inventoryUpserted,
    preview,
  };
}

export function summarizeWeeztixEvent(event: WeeztixEvent) {
  return {
    guid: event.guid,
    name: event.name,
    start: event.start,
    end: event.end,
  };
}
