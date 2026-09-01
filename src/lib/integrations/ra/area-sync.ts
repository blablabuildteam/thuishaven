import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { externalEvents } from "@/lib/db/schema";
import {
  listRaAreaEvents,
  type RaAreaEvent,
} from "@/lib/integrations/ra/client";
import {
  encodeRaImpactNote,
  isElectronicUmbrella,
} from "@/lib/integrations/ra/genres";
import { amsterdamDay, shiftIsoDay } from "@/lib/time/amsterdam";

const MIN_PARTY_ATTENDING = 200;
const HOME_VENUE_ID = process.env.RA_VENUE_ID?.trim() || "109027";
/** RA paginates within a date filter — wide windows only return early pages. */
const CHUNK_DAYS = 14;
const PAGES_PER_CHUNK = 3;
/** Parallel date-window fetches (keeps total sync under ~1 min typically). */
const CHUNK_CONCURRENCY = 4;

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
  genres: string[];
}): boolean {
  if (isHomeVenue(ev.venueId, ev.venueName)) return false;
  // Festivals always (city-wide pull); parties need size + electronic umbrella.
  if (ev.isFestival) return true;
  if (ev.attending < MIN_PARTY_ATTENDING) return false;
  return isElectronicUmbrella(ev.genres);
}

function rowKey(name: string, day: string): string {
  return `${name.toLowerCase()}|${day}`;
}

function dateChunks(fromDay: string, toDay: string): Array<[string, string]> {
  const chunks: Array<[string, string]> = [];
  let start = fromDay;
  while (start <= toDay) {
    const end = shiftIsoDay(start, CHUNK_DAYS - 1);
    chunks.push([start, end > toDay ? toDay : end]);
    start = shiftIsoDay(end, 1);
  }
  return chunks;
}

/**
 * Pull Amsterdam-area RA listings into external_events (not Thuishaven itself).
 * Festivals always; club nights from 200 attending up under a broad electronic
 * genre umbrella (RA genres; empty tags still kept).
 * Fetches in short date chunks so pagination covers the full horizon.
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
  const toDay = shiftIsoDay(today, 90);

  const seenIds = new Set<string>();
  const fetched: RaAreaEvent[] = [];
  let lastError: string | undefined;

  async function fetchChunk(
    chunkFrom: string,
    chunkTo: string,
  ): Promise<RaAreaEvent[]> {
    const out: RaAreaEvent[] = [];
    for (let page = 1; page <= PAGES_PER_CHUNK; page += 1) {
      const batch = await listRaAreaEvents({
        fromDay: chunkFrom,
        toDay: chunkTo,
        pageSize: 50,
        page,
      });
      if (!batch.ok) {
        lastError = batch.error;
        break;
      }
      if (batch.events.length === 0) break;
      out.push(...batch.events);
      if (batch.events.length < 50) break;
    }
    return out;
  }

  const chunks = dateChunks(fromDay, toDay);
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const slice = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const batches = await Promise.all(
      slice.map(([from, to]) => fetchChunk(from, to)),
    );
    for (const batch of batches) {
      for (const ev of batch) {
        if (seenIds.has(ev.id)) continue;
        seenIds.add(ev.id);
        fetched.push(ev);
      }
    }
  }

  if (fetched.length === 0 && lastError) {
    return { ok: false, fetched: 0, upserted: 0, error: lastError };
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

  const toInsert: Array<{
    name: string;
    type: "festival" | "other";
    startsAt: Date;
    endsAt: null;
    region: string;
    impactNote: string;
    source: string;
  }> = [];
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
      endsAt: null as null,
      region: ev.venueName?.trim() || "Amsterdam",
      impactNote: encodeRaImpactNote(ev.attending, ev.genres),
      source: "resident_advisor",
    };
    const prevId = byKey.get(key);
    if (prevId && prevId !== "inserted") {
      await db
        .update(externalEvents)
        .set(values)
        .where(eq(externalEvents.id, prevId));
      upserted += 1;
    } else if (!prevId) {
      toInsert.push(values);
      byKey.set(key, "inserted");
    }
  }

  const INSERT_BATCH = 40;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
    const batch = toInsert.slice(i, i + INSERT_BATCH);
    await db.insert(externalEvents).values(batch);
    upserted += batch.length;
  }

  return { ok: true, fetched: fetched.length, upserted };
}
