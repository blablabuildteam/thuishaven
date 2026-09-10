import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/integrations/cron";
import { createDueFollowUpDrafts } from "@/lib/outreach/follow-up";

export const dynamic = "force-dynamic";

/** Creates follow-up drafts only. Never sends. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await createDueFollowUpDrafts(10);
  return NextResponse.json(result);
}
