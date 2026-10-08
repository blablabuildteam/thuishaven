import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/integrations/cron";
import { processDueOutreachSends } from "@/lib/outreach/auto-send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/outreach-send
 * Every ~10 minutes: send queued bakje mails whose scheduled_at is due
 * and whose bakje has auto_send armed.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processDueOutreachSends(10);
  if (result.sent > 0 || result.failed > 0) {
    console.info(
      `[outreach-send] attempted=${result.attempted} sent=${result.sent} failed=${result.failed} skipped=${result.skipped ?? "-"}`,
    );
  }
  return NextResponse.json(result);
}
