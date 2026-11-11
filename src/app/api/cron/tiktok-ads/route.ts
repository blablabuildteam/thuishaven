import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isCronAuthorized,
  isAmsterdamSyncSlot,
} from "@/lib/integrations/cron";
import { cronCrashResponse, runCron } from "@/lib/system/cron-run";
import { syncTikTokAdsReadOnly } from "@/lib/integrations/tiktok/ads-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/tiktok-ads
 * Same Amsterdam slots as organic TikTok (08/13/19/23).
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

  const run = await runCron("tiktok-ads", () => syncTikTokAdsReadOnly());
  if (!run.ok) return cronCrashResponse("tiktok-ads", run.outcome);
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
