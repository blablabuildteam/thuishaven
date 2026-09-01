import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { externalEvents } from "@/lib/db/schema";
import {
  listRaAreaEvents,
  type RaAreaEvent,
} from "@/lib/integrations/ra/client";
import { amsterdamDay, shiftIsoDay } from "@/lib/time/amsterdam";

const MIN_PARTY_ATTENDING = 200;
const HOME_VENUE_ID = process.env.RA_VENUE_ID?.trim() || "109027";

function eventStart(ev: { date: string | null; startTime: string | null }): Date | null {
  const raw = ev.startTime || ev.date;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function isHomeVenue(venueId: string | null, venueName: string | null): boolean {
  if (venueId && venueId === HOME_VENUE_ID) return true;
  return Boolean(venueName && /thuishaven/i.test(venueName));
}

function keepListing(ev: {
  attending: number;
  isFestival: boolean;
  venueId: string | null;
  venueName: string | null;
}): boolean {
  if (isHomeVenue(ev.venueId, ev.venueName)) return false;
  return ev.isFestival || ev.attending >= MIN_PARTY_ATTENDING;
}

function rowKey(name: string, day: string): string {
  return `${name.toLowerCase()}|${day}`;
}

/**
 * Pull Amsterdam-area RA listings into external_events (not Thuishaven itself).
 * Festivals always; club nights only from 200 attending up.
 */
export async function syncRaAmsterdamAreaEvents(): Promise<{
  ok: boolean;
  fetched: number;
  upserted: number;
  error?: string;
}> {
  if (!hasDatabase()) {
    return { ok: false, fetched: 0, upserted: 0, error: "DATABASE_URL ontbreekt" };
  }

  const today = amsterdamDay(new Date());
  const fromDay = shiftIsoDay(today, -45);
  const toDay = shiftIsoDay(today, 75);

  const seenIds = new Set<string>();
  const fetched: RaAreaEvent[] = [];

  for (const page of [1, 2, 3, 4]) {
    const batch = await listRaAreaEvents({
      fromDay,
      toDay,
      pageSize: 50,
      page,
    });
    if (!batch.ok) {
      if (fetched.length === 0) {
        return { ok: false, fetched: 0, upserted: 0, error: batch.error };
      }
      break;
    }
    if (batch.events.length === 0) break;
    for (const ev of batch.events) {
      if (seenIds.has(ev.id)) continue;
      seenIds.add(ev.id);
      fetched.push(ev);
    }
    if (batch.events.length < 50) break;
  }

  const keep = fetched.filter(keepListing);
  const db = getDb();
  const existing = await db
    .select()
    .from(externalEvents)
    .where(eq(externalEvents.source, "resident_advisor"));

  const byKey = new Map(
    existing.map((e) => [rowKey(e.name, amsterdamDay(e.startsAt)), e.id]),
  );

  let upserted = 0;
  for (const ev of keep) {
    const startsAt = eventStart(ev);
    if (!startsAt) continue;
    const day = amsterdamDay(startsAt);
    const key = rowKey(ev.title, day);
    const values = {
      name: ev.title,
      type: ev.isFestival ? ("festival" as const) : ("other" as const),
      startsAt,
      endsAt: null,
      region: ev.venueName?.trim() || "Amsterdam",
      impactNote: `attending:${ev.attending}`,
      source: "resident_advisor",
    };
    const prevId = byKey.get(key);
    if (prevId) {
      await db
        .update(externalEvents)
        .set(values)
        .where(eq(externalEvents.id, prevId));
    } else {
      await db.insert(externalEvents).values(values);
      byKey.set(key, "inserted");
    }
    upserted += 1;
  }

  return { ok: true, fetched: fetched.length, upserted };
}
