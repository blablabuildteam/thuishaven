import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  countAutoFillPending,
  runOutreachAutoFill,
} from "@/lib/outreach/auto-fill";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";
/** Auto-fill can run many Apollo/KvK calls. */
export const maxDuration = 300;

const schema = z.object({
  discover: z.boolean().optional(),
  fillHeadcounts: z.boolean().optional(),
  criteria: z
    .object({
      employeeRanges: z.array(z.string()).max(8).optional(),
      placePreset: z.enum(["ring", "kern", "amsterdam"]).optional(),
      keywordTags: z.array(z.string()).max(8).optional(),
    })
    .optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const pending = await countAutoFillPending();
  return NextResponse.json({ pending });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const result = await runOutreachAutoFill({
    discover: parsed.data.discover === true,
    fillHeadcounts: parsed.data.fillHeadcounts !== false,
    criteria: parsed.data.criteria,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const pending = await countAutoFillPending();

  await logSessionActivity(session, {
    action: "outreach_auto_fill",
    summary: [
      result.discover
        ? `Apollo +${result.discover.created}`
        : null,
      result.headcountFilled
        ? `mdw ${result.headcountFilled}`
        : null,
      `KvK ${result.kvkOk}/${result.kvkProcessed}`,
      `contacten ${result.peopleFilled}`,
      `Hunter ${result.hunterFilled}`,
      `website ${result.websiteFilled}`,
    ]
      .filter(Boolean)
      .join(" · "),
    path: "/api/outreach/auto-fill",
    method: "POST",
    status: 200,
    tool: "outreach",
    meta: { ...result, pendingAfter: pending },
  });

  return NextResponse.json({ ...result, pending });
}
