import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/integrations/cron";
import { processDueOutreachSends } from "@/lib/outreach/auto-send";
import { cronCrashResponse, runCron } from "@/lib/system/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/outreach-send
 * Every ~10 minutes: send queued mails whose scheduled_at is due and that
 * are armed (per-mail armed_at OR bakje auto_send).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const run = await runCron("outreach-send", () => processDueOutreachSends(10), {
    logSource: "outreach",
    logFailure: true,
    outcome: (r) => {
      const errors = r.results
        .filter((x) => !x.ok && x.error)
        .map((x) => x.error)
        .slice(0, 3)
        .join(" · ");
      if (!r.ok) return { status: "failed", error: errors || "Verzenden mislukt" };
      // Some mails failed: the job ran, but needs a look.
      if (r.failed > 0 && r.sent === 0) {
        return { status: "failed", error: `${r.failed} mails mislukt: ${errors}` };
      }
      if (r.failed > 0) {
        return { status: "partial", error: `${r.failed} van ${r.attempted} mails mislukt: ${errors}` };
      }
      return { status: "ok", meta: { sent: r.sent, skipped: r.skipped } };
    },
  });
  if (!run.ok) return cronCrashResponse("outreach-send", run.outcome);
  const result = run.result;
  if (result.sent > 0 || result.failed > 0) {
    console.info(
      `[outreach-send] attempted=${result.attempted} sent=${result.sent} failed=${result.failed} skipped=${result.skipped ?? "-"}`,
    );
  }
  return NextResponse.json(result);
}
