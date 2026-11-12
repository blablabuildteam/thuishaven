import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarAlerts, radarArtists, radarVenues } from "@/lib/radar/schema";
import { loadRadarSettings } from "@/lib/radar/settings";

export type RadarAlertRow = typeof radarAlerts.$inferSelect;

export async function listRadarAlerts(options?: {
  unreadOnly?: boolean;
  kinds?: RadarAlertRow["kind"][];
  limit?: number;
}): Promise<
  Array<
    RadarAlertRow & {
      artistName: string | null;
      artistHomeGigCount: number | null;
      venueName: string | null;
    }
  >
> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const limit = Math.min(options?.limit ?? 50, 200);
  const conditions = [];
  if (options?.unreadOnly) conditions.push(isNull(radarAlerts.readAt));
  if (options?.kinds?.length) conditions.push(inArray(radarAlerts.kind, options.kinds));
  const rows = await db
    .select({
      alert: radarAlerts,
      artistName: radarArtists.name,
      artistHomeGigCount: radarArtists.homeGigCount,
      venueName: radarVenues.name,
    })
    .from(radarAlerts)
    .leftJoin(radarArtists, eq(radarAlerts.artistId, radarArtists.id))
    .leftJoin(radarVenues, eq(radarAlerts.venueId, radarVenues.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(radarAlerts.triggeredAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.alert,
    artistName: r.artistName,
    artistHomeGigCount: r.artistHomeGigCount,
    venueName: r.venueName,
  }));
}

/** Unread + total per kind, for the filter tabs. */
export async function radarAlertCounts(): Promise<
  Record<string, { unread: number; total: number }>
> {
  if (!hasDatabase()) return {};
  const rows = await getDb()
    .select({
      kind: radarAlerts.kind,
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where ${radarAlerts.readAt} is null)::int`,
    })
    .from(radarAlerts)
    .groupBy(radarAlerts.kind);
  return Object.fromEntries(
    rows.map((r) => [r.kind, { unread: r.unread, total: r.total }]),
  );
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

export async function markAllRadarAlertsRead(
  kinds?: RadarAlertRow["kind"][],
): Promise<{ ok: true; n: number }> {
  if (!hasDatabase()) return { ok: true, n: 0 };
  const db = getDb();
  const rows = await db
    .update(radarAlerts)
    .set({ readAt: new Date() })
    .where(
      kinds?.length
        ? and(isNull(radarAlerts.readAt), inArray(radarAlerts.kind, kinds))
        : isNull(radarAlerts.readAt),
    )
    .returning({ id: radarAlerts.id });
  return { ok: true, n: rows.length };
}

export async function createRadarAlert(input: {
  kind:
    | "velocity"
    | "new_on_radar"
    | "venue_suggestion"
    | "lineup"
    | "digest"
    | "breakthrough"
    | "window_closing"
    | "mixseries";
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

async function hasUnread(
  artistId: string,
  kind: RadarAlertRow["kind"],
): Promise<boolean> {
  if (!hasDatabase()) return false;
  const db = getDb();
  const [existing] = await db
    .select({ id: radarAlerts.id })
    .from(radarAlerts)
    .where(
      and(
        eq(radarAlerts.artistId, artistId),
        eq(radarAlerts.kind, kind),
        isNull(radarAlerts.readAt),
      ),
    )
    .limit(1);
  return Boolean(existing);
}

/** Deduped alerts based on latest score v2. Quiet for home artists / closed statuses. */
export async function maybeAlertForScore(input: {
  artistId: string;
  artistName: string;
  score: number;
  velocity: number;
  created: boolean;
  momentum?: number;
  bookability?: number;
  reasons?: string[];
  homeGigCount?: number;
  status?: string;
}): Promise<void> {
  if ((input.homeGigCount ?? 0) > 0) return;
  if (
    input.status === "passed" ||
    input.status === "not_relevant" ||
    input.status === "booked"
  ) {
    return;
  }

  const settings = await loadRadarSettings();
  const reasons = input.reasons ?? [];
  let createdThisCall = 0;
  const maxPerCall = 2;

  if (
    input.created &&
    input.score >= settings.alerts.newOnRadarMinScore &&
    createdThisCall < maxPerCall
  ) {
    await createRadarAlert({
      kind: "new_on_radar",
      artistId: input.artistId,
      title: `Nieuw op de radar: ${input.artistName}`,
      body: `Score ${input.score}. ${reasons[0] ?? "Genoeg signaal om te volgen."}`,
      payload: { score: input.score, velocity: input.velocity, reasons },
    });
    createdThisCall += 1;
  }

  if (
    input.velocity >= settings.alerts.velocityThreshold &&
    input.score >= settings.alerts.newOnRadarMinScore
  ) {
    if (!(await hasUnread(input.artistId, "velocity"))) {
      await createRadarAlert({
        kind: "velocity",
        artistId: input.artistId,
        title: `Snelle groei: ${input.artistName}`,
        body: `Velocity ${input.velocity} (drempel ${settings.alerts.velocityThreshold}). Score nu ${input.score}.`,
        payload: { score: input.score, velocity: input.velocity, reasons },
      });
      createdThisCall += 1;
    }
  }

  if (
    (input.momentum ?? 0) >= 70 &&
    input.velocity >= 25 &&
    createdThisCall < maxPerCall
  ) {
    if (!(await hasUnread(input.artistId, "breakthrough"))) {
      await createRadarAlert({
        kind: "breakthrough",
        artistId: input.artistId,
        title: `Doorbraak-signaal: ${input.artistName}`,
        body:
          reasons[0] ??
          `Momentum ${input.momentum}, velocity ${input.velocity}.`,
        payload: {
          score: input.score,
          momentum: input.momentum,
          velocity: input.velocity,
          reasons,
        },
      });
    }
  }

  const closingReason = reasons.find((r) => /venster sluit/i.test(r));
  if (
    closingReason ||
    ((input.bookability ?? 100) < 40 &&
      input.score >= 45 &&
      (input.momentum ?? 0) >= 55)
  ) {
    if (!(await hasUnread(input.artistId, "window_closing"))) {
      await createRadarAlert({
        kind: "window_closing",
        artistId: input.artistId,
        title: `Venster sluit: ${input.artistName}`,
        body:
          closingReason ??
          `Bookability ${input.bookability}. Prijs/beschikbaarheid dreigt te stijgen.`,
        payload: {
          score: input.score,
          bookability: input.bookability,
          momentum: input.momentum,
          reasons,
        },
      });
    }
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
