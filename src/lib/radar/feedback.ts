import { desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarFeedback } from "@/lib/radar/schema";
import type {
  RadarArtistStatus,
  RadarFeedbackReason,
} from "@/lib/radar/types";

export type { RadarFeedbackReason };

export async function recordRadarFeedback(input: {
  artistId: string;
  userId?: string | null;
  fromStatus?: RadarArtistStatus | null;
  toStatus: RadarArtistStatus;
  reason?: RadarFeedbackReason | null;
  note?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  await db.insert(radarFeedback).values({
    artistId: input.artistId,
    userId: input.userId ?? null,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus,
    reason: input.reason ?? null,
    note: input.note?.trim() || null,
  });
  return { ok: true };
}

export async function listRadarFeedbackForArtist(artistId: string, limit = 20) {
  if (!hasDatabase()) return [];
  const db = getDb();
  return db
    .select()
    .from(radarFeedback)
    .where(eq(radarFeedback.artistId, artistId))
    .orderBy(desc(radarFeedback.createdAt))
    .limit(limit);
}
