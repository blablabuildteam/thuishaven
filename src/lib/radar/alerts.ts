import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarAlerts } from "@/lib/radar/schema";
import { loadRadarSettings } from "@/lib/radar/settings";

export type RadarAlertRow = typeof radarAlerts.$inferSelect;

export async function listRadarAlerts(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<RadarAlertRow[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const limit = Math.min(options?.limit ?? 50, 200);
  if (options?.unreadOnly) {
    return db
      .select()
      .from(radarAlerts)
      .where(isNull(radarAlerts.readAt))
      .orderBy(desc(radarAlerts.triggeredAt))
      .limit(limit);
  }
  return db
    .select()
    .from(radarAlerts)
    .orderBy(desc(radarAlerts.triggeredAt))
    .limit(limit);
}

export async function markRadarAlertRead(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [row] = await db
    .update(radarAlerts)
    .set({ readAt: new Date() })
    .where(eq(radarAlerts.id, id))
    .returning({ id: radarAlerts.id });
  if (!row) return { error: "Alert niet gevonden" };
  return { ok: true };
}

export async function createRadarAlert(input: {
  kind:
    | "velocity"
    | "new_on_radar"
    | "venue_suggestion"
    | "lineup"
    | "digest"
    | "breakthrough"
    | "window_closing";
  title: string;
  body?: string | null;
  artistId?: string | null;
  venueId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  await db.insert(radarAlerts).values({
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    artistId: input.artistId ?? null,
    venueId: input.venueId ?? null,
    payload: input.payload ?? null,
    triggeredAt: new Date(),
  });
}

/** Deduped velocity / new-on-radar alerts based on latest score. */
export async function maybeAlertForScore(input: {
  artistId: string;
  artistName: string;
  score: number;
  velocity: number;
  created: boolean;
}): Promise<void> {
  const settings = await loadRadarSettings();
  if (input.created && input.score >= settings.alerts.newOnRadarMinScore) {
    await createRadarAlert({
      kind: "new_on_radar",
      artistId: input.artistId,
      title: `Nieuw op de radar: ${input.artistName}`,
      body: `Groeiscore ${input.score}. Relatief onbekend + genoeg signaal om te volgen.`,
      payload: { score: input.score, velocity: input.velocity },
    });
  }
  if (input.velocity >= settings.alerts.velocityThreshold) {
    // Avoid spamming: only if no unread velocity alert for this artist.
    if (!hasDatabase()) return;
    const db = getDb();
    const [existing] = await db
      .select({ id: radarAlerts.id })
      .from(radarAlerts)
      .where(
        and(
          eq(radarAlerts.artistId, input.artistId),
          eq(radarAlerts.kind, "velocity"),
          isNull(radarAlerts.readAt),
        ),
      )
      .limit(1);
    if (existing) return;
    await createRadarAlert({
      kind: "velocity",
      artistId: input.artistId,
      title: `Snelle groei: ${input.artistName}`,
      body: `Velocity ${input.velocity} (drempel ${settings.alerts.velocityThreshold}). Score nu ${input.score}.`,
      payload: { score: input.score, velocity: input.velocity },
    });
  }
}

export async function unreadAlertCount(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(radarAlerts)
    .where(isNull(radarAlerts.readAt));
  return row?.n ?? 0;
}
