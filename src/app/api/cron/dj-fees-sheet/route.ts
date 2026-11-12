import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/integrations/cron";
import { runDjFeesSheetSync } from "@/lib/dashboard/dj-fees-sheet-sync";
import { cronCrashResponse } from "@/lib/system/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/dj-fees-sheet
 * Daily: DJ fees from the client's Google Sheet → dj_fee_artists.
 * Read-only towards Google (spreadsheets.readonly scope).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const run = await runDjFeesSheetSync("cron");
  if (!run.ok) return cronCrashResponse("dj-fees-sheet", run.outcome);

  if (run.result.ok) {
    const { invalidateEventInsightsCache } = await import(
      "@/lib/insights/event-insights"
    );
    await invalidateEventInsightsCache();
  }
  return NextResponse.json(
    { trigger: "vercel-cron", ...run.result },
    { status: run.result.ok ? 200 : 502 },
  );
}
