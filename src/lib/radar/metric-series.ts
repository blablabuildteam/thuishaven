/**
 * Build time series from metric snapshots for charts / sparklines.
 */
import { and, asc, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarMetricSnapshots } from "@/lib/radar/schema";

export type FollowerSeriesPoint = {
  date: string; // YYYY-MM-DD
  label: string;
  ra: number | null;
  ig: number | null;
  sc: number | null;
};

function followersOf(metrics: Record<string, unknown> | null): number | null {
  if (!metrics) return null;
  const v = metrics.followers ?? metrics.followerCount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

const PLATFORM_KEY = {
  resident_advisor: "ra",
  instagram: "ig",
  soundcloud: "sc",
} as const;

/** One row per day, last value wins per platform. */
export function buildFollowerSeries(
  points: Array<{
    platform: string;
    capturedAt: string | Date;
    metrics: Record<string, number | string | null>;
  }>,
): FollowerSeriesPoint[] {
  const byDay = new Map<
    string,
    { ra: number | null; ig: number | null; sc: number | null }
  >();

  const sorted = [...points].sort(
    (a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );

  for (const p of sorted) {
    const key = PLATFORM_KEY[p.platform as keyof typeof PLATFORM_KEY];
    if (!key) continue;
    const f = followersOf(p.metrics as Record<string, unknown>);
    if (f == null) continue;
    const day = dayKey(new Date(p.capturedAt));
    const row = byDay.get(day) ?? { ra: null, ig: null, sc: null };
    row[key] = f;
    byDay.set(day, row);
  }

  const days = [...byDay.keys()].sort();
  let last = { ra: null as number | null, ig: null as number | null, sc: null as number | null };
  return days.map((date) => {
    const cur = byDay.get(date)!;
    last = {
      ra: cur.ra ?? last.ra,
      ig: cur.ig ?? last.ig,
      sc: cur.sc ?? last.sc,
    };
    return { date, label: dayLabel(date), ...last };
  });
}

/** Sparkline values (RA followers) for many artists — last N points each. */
export async function loadRaFollowerSparklines(
  artistIds: string[],
  options?: { days?: number },
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!hasDatabase() || artistIds.length === 0) return out;
  const db = getDb();
  const since = new Date(
    Date.now() - (options?.days ?? 60) * 24 * 60 * 60 * 1000,
  );
  const rows = await db
    .select({
      artistId: radarMetricSnapshots.artistId,
      capturedAt: radarMetricSnapshots.capturedAt,
      metrics: radarMetricSnapshots.metrics,
    })
    .from(radarMetricSnapshots)
    .where(
      and(
        inArray(radarMetricSnapshots.artistId, artistIds),
        sql`${radarMetricSnapshots.platform} = 'resident_advisor'`,
        sql`${radarMetricSnapshots.capturedAt} >= ${since}`,
      ),
    )
    .orderBy(asc(radarMetricSnapshots.capturedAt));

  for (const r of rows) {
    const f = followersOf(r.metrics as Record<string, unknown>);
    if (f == null) continue;
    const list = out.get(r.artistId) ?? [];
    list.push(f);
    out.set(r.artistId, list);
  }
  return out;
}
