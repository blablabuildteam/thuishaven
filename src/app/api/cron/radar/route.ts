import { NextResponse } from "next/server";
import { amsterdamHour, isCronAuthorized } from "@/lib/integrations/cron";
import { runRadarPipeline } from "@/lib/radar/pipeline";
import { cronCrashResponse, runCron } from "@/lib/system/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 2×/dag: ochtend discovery+enrich+score, avond enrich+score+social (Apify). */
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
  const withSpotify =
    new URL(request.url).searchParams.get("spotify") === "1";
  if (!force && !isRadarCronSlot(now)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const eveningOnly = hour === 20 && !force;
  const run = await runCron(
    "radar",
    () =>
      runRadarPipeline({
        skipDiscovery: eveningOnly,
        skipWebsite: eveningOnly,
        skipSocial: !eveningOnly && !force,
        skipInstagramVenues: !eveningOnly && !force,
        // Mixseries + SC + NL: evening priority (more time); morning light pass OK
        skipMixseries: false,
        skipSoundcloud: !eveningOnly && !force,
        skipNlAudience: false,
        skipSpotify: !withSpotify,
        enrichLimit: eveningOnly ? 250 : 150,
        rescoreLimit: eveningOnly ? 2000 : 1500,
        spotifyLimit: 40,
        historyYears: 2,
        venueLimit: 12,
        forceDigest: forceDigest || force,
        skipDigest: eveningOnly && !forceDigest,
        deadlineMs: Date.now() + 240_000,
      }),
    {
      outcome: (result) =>
        result.ok
          ? { status: "ok", meta: { notes: result.notes.slice(0, 8) } }
          : {
              status: "partial",
              error: result.notes.slice(0, 3).join(" · ") || "Radar partial",
              meta: { notes: result.notes.slice(0, 8) },
            },
    },
  );

  if (!run.ok) return cronCrashResponse("radar", run.outcome);
  return NextResponse.json({
    ok: true,
    amsterdamHour: hour,
    result: run.result,
  });
}
