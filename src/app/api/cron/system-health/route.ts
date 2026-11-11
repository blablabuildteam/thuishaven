import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { isCronAuthorized } from "@/lib/integrations/cron";
import { getSystemHealth } from "@/lib/system/health";
import { notifySystemHealthChanges } from "@/lib/system/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/system-health
 * Hourly: re-check every integration (live probes, cron runs, token expiry)
 * and mail once when something breaks or recovers. Runs even when nobody has
 * the dashboard open, so a dead sync is noticed within the hour.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await getSystemHealth({ fresh: true });
  const notify = await notifySystemHealthChanges(health).catch((e) => ({
    ok: false as const,
    error: e instanceof Error ? e.message : String(e),
  }));

  if (hasDatabase()) {
    await getDb()
      .execute(sql`delete from sync_jobs where started_at < now() - interval '30 days'`)
      .catch((e) => console.error("[system-health] prune failed", e));
  }

  if (!notify.ok) console.error(`[system-health] notify failed: ${notify.error}`);

  return NextResponse.json({
    ok: true,
    severity: health.severity,
    issues: health.issues.map((i) => `${i.id}:${i.severity}:${i.kind}`),
    notify,
  });
}
