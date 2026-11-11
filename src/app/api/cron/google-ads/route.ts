import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isCronAuthorized,
  isAmsterdamSyncSlot,
} from "@/lib/integrations/cron";
import { cronCrashResponse, runCron } from "@/lib/system/cron-run";
import { syncGoogleSearchAdsReadOnly } from "@/lib/integrations/google-ads/ads-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/google-ads
 * Google Ads Search/PMax/Display — same Amsterdam slots as other ad syncs.
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

  const run = await runCron("google-ads", () => syncGoogleSearchAdsReadOnly());
  if (!run.ok) return cronCrashResponse("google-ads", run.outcome);
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
