import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarSettings } from "@/lib/radar/schema";
import { listActiveSeedVenues } from "@/lib/radar/venues";

const CURSOR_KEY = "discovery_cursor";

async function readCursor(): Promise<{ club: number; festival: number }> {
  if (!hasDatabase()) return { club: 0, festival: 0 };
  const db = getDb();
  const [row] = await db
    .select()
    .from(radarSettings)
    .where(eq(radarSettings.key, CURSOR_KEY))
    .limit(1);
  const raw = row?.value as { offset?: number; club?: number; festival?: number } | undefined;
  // Migrate old single-offset cursor
  if (raw && typeof raw.club === "number") {
    return {
      club: Number.isFinite(raw.club) ? raw.club : 0,
      festival: Number.isFinite(raw.festival) ? Number(raw.festival) : 0,
    };
  }
  const offset = Number.isFinite(raw?.offset) ? Number(raw?.offset) : 0;
  return { club: offset, festival: 0 };
}

async function writeCursor(cursor: { club: number; festival: number }): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  const value = { ...cursor, updatedAt: new Date().toISOString() };
  await db
    .insert(radarSettings)
    .values({
      key: CURSOR_KEY,
      value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: radarSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Round-robin over seed/accepted venues.
 * Always interleaves festivals so promoter line-ups don't starve behind clubs.
 */
export async function nextVenueBatch(limit: number): Promise<{
  venueIds: string[];
  offset: number;
  total: number;
  festivalCount: number;
  clubCount: number;
}> {
  const venues = await listActiveSeedVenues();
  const festivals = venues.filter((v) => v.kind === "festival");
  const clubs = venues.filter((v) => v.kind !== "festival");
  const total = venues.length;
  if (total === 0) {
    return { venueIds: [], offset: 0, total: 0, festivalCount: 0, clubCount: 0 };
  }

  const cursor = await readCursor();
  const festivalSlots = Math.min(
    festivals.length,
    Math.max(2, Math.ceil(limit * 0.35)),
  );
  const clubSlots = Math.max(0, limit - festivalSlots);

  const batch: string[] = [];
  let festCursor = ((cursor.festival % Math.max(festivals.length, 1)) + Math.max(festivals.length, 1)) % Math.max(festivals.length, 1);
  let clubCursor = ((cursor.club % Math.max(clubs.length, 1)) + Math.max(clubs.length, 1)) % Math.max(clubs.length, 1);

  for (let i = 0; i < festivalSlots && festivals.length > 0; i += 1) {
    const v = festivals[festCursor % festivals.length];
    if (v) batch.push(v.id);
    festCursor = (festCursor + 1) % festivals.length;
  }
  for (let i = 0; i < clubSlots && clubs.length > 0; i += 1) {
    const v = clubs[clubCursor % clubs.length];
    if (v) batch.push(v.id);
    clubCursor = (clubCursor + 1) % clubs.length;
  }

  await writeCursor({ club: clubCursor, festival: festCursor });
  return {
    venueIds: batch,
    offset: cursor.club,
    total,
    festivalCount: Math.min(festivalSlots, festivals.length),
    clubCount: batch.length - Math.min(festivalSlots, festivals.length),
  };
}
