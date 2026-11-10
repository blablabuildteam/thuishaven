import { NextResponse } from "next/server";
import { amsterdamHour, isCronAuthorized } from "@/lib/integrations/cron";
import { runRadarPipeline } from "@/lib/radar/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 2×/dag: ochtend discovery+enrich+score, avond enrich+score+social. */
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
  const forceDigest =
    new URL(request.url).searchParams.get("digest") === "1";
  if (!force && !isRadarCronSlot(now)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const eveningOnly = hour === 20 && !force;
  const result = await runRadarPipeline({
    skipDiscovery: eveningOnly,
    skipSocial: !eveningOnly && !force,
    enrichLimit: eveningOnly ? 250 : 150,
    rescoreLimit: eveningOnly ? 2000 : 1500,
    spotifyLimit: eveningOnly ? 120 : 60,
    historyYears: 2,
    venueLimit: 12,
    forceDigest: forceDigest || force,
    skipDigest: eveningOnly && !forceDigest,
    deadlineMs: Date.now() + 240_000,
  });

  return NextResponse.json({ ok: true, amsterdamHour: hour, result });
}
