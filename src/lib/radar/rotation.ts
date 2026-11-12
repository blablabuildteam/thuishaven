import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarSettings } from "@/lib/radar/schema";
import { listActiveSeedVenues } from "@/lib/radar/venues";

const CURSOR_KEY = "discovery_cursor";

async function readOffset(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const [row] = await db
    .select()
    .from(radarSettings)
    .where(eq(radarSettings.key, CURSOR_KEY))
    .limit(1);
  const raw = row?.value as { offset?: number } | undefined;
  return Number.isFinite(raw?.offset) ? Number(raw?.offset) : 0;
}

async function writeOffset(offset: number): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  const value = { offset, updatedAt: new Date().toISOString() };
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
 * Round-robin over seed/accepted venues zodat cron alle clubs bereikt
 * zonder de 300s Vercel-limiet te knallen.
 */
export async function nextVenueBatch(limit: number): Promise<{
  venueIds: string[];
  offset: number;
  total: number;
}> {
  const venues = await listActiveSeedVenues();
  const total = venues.length;
  if (total === 0) return { venueIds: [], offset: 0, total: 0 };

  const offset = await readOffset();
  const start = ((offset % total) + total) % total;
  const batch: string[] = [];
  for (let i = 0; i < Math.min(limit, total); i += 1) {
    const v = venues[(start + i) % total];
    if (v) batch.push(v.id);
  }

  await writeOffset((start + batch.length) % Math.max(total, 1));
  return { venueIds: batch, offset: start, total };
}
