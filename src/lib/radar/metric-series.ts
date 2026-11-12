/**
 * Server-only metric series loaders. Pure chart helpers live in
 * `metric-series-client.ts` so client components never import the DB.
 */
import { and, asc, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarMetricSnapshots } from "@/lib/radar/schema";

export {
  buildFollowerSeries,
  type FollowerSeriesPoint,
} from "@/lib/radar/metric-series-client";

function followersOf(metrics: Record<string, unknown> | null): number | null {
  if (!metrics) return null;
  const v = metrics.followers ?? metrics.followerCount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
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
