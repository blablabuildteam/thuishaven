import { NextResponse } from "next/server";
import { amsterdamHour, isCronAuthorized } from "@/lib/integrations/cron";
import { runRadarPipeline } from "@/lib/radar/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 2×/dag: ochtend discovery+spotify, avond spotify refresh. */
function isRadarCronSlot(now: Date) {
  const hour = amsterdamHour(now);
  return hour === 8 || hour === 20;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = amsterdamHour(now);
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isRadarCronSlot(now)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const eveningOnly = hour === 20 && !force;
  // Ochtend: max ~20 venues + 2y history (Vercel 300s). Force = zelfde pad.
  const result = await runRadarPipeline({
    skipDiscovery: eveningOnly,
    spotifyLimit: eveningOnly ? 120 : 60,
    historyYears: 2,
  });

  return NextResponse.json({ ok: true, amsterdamHour: hour, result });
}
