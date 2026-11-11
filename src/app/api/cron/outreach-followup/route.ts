import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/integrations/cron";
import { createDueFollowUpDrafts } from "@/lib/outreach/follow-up";
import { cronCrashResponse, runCron } from "@/lib/system/cron-run";

export const dynamic = "force-dynamic";

/** Creates follow-up drafts only. Never sends. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const run = await runCron("outreach-followup", () => createDueFollowUpDrafts(10), {
    logSource: "outreach",
    logFailure: true,
  });
  if (!run.ok) return cronCrashResponse("outreach-followup", run.outcome);
  return NextResponse.json(run.result, { status: run.result.ok ? 200 : 502 });
}
