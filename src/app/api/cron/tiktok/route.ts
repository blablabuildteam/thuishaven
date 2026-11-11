import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isCronAuthorized,
  isAmsterdamSyncSlot,
} from "@/lib/integrations/cron";
import { cronCrashResponse, runCron } from "@/lib/system/cron-run";
import { syncTikTokReadOnly } from "@/lib/integrations/tiktok/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/tiktok
 * Same Amsterdam slots as Weeztix (08/13/19/23).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = amsterdamHour(now);
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isAmsterdamSyncSlot(now)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const run = await runCron("tiktok", () => syncTikTokReadOnly({ withAnalyze: true }));
  if (!run.ok) return cronCrashResponse("tiktok", run.outcome);
  const result = run.result;
  return NextResponse.json(
    {
      trigger: "vercel-cron",
      amsterdamHour: hour,
      readOnly: true,
      ...result,
    },
    { status: result.ok ? 200 : 502 },
  );
}
