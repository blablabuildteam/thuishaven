import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  generateAndStoreDraft,
  sendStoredDraft,
} from "@/lib/integrations/outreach";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  prospectId: z.string().uuid(),
  variantId: z
    .enum(["warm_tour", "open_dates", "jubileum", "short_checkin"])
    .optional(),
  subjectArm: z.enum(["a", "b"]).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  return NextResponse.json({ variants: OUTREACH_VARIANTS });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action as string | undefined;

  if (action === "send" || action === "send-test") {
    const sendSchema = z.object({
      action: z.enum(["send", "send-test"]),
      emailId: z.string().uuid(),
    });
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    // Only test sends for now (team@). Live requires separate unlock.
    const result = await sendStoredDraft({
      emailId: parsed.data.emailId,
      forceTest: true,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_send_test",
      summary: `Testmail verstuurd · ${parsed.data.emailId}`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { emailId: parsed.data.emailId, action: parsed.data.action },
    });
    return NextResponse.json(result);
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const result = await generateAndStoreDraft(parsed.data);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  await logSessionActivity(session, {
    action: "email_draft",
    summary: `Draft gemaakt · prospect ${parsed.data.prospectId}`,
    path: "/api/outreach/emails",
    method: "POST",
    status: 201,
    tool: "outreach",
    meta: {
      prospectId: parsed.data.prospectId,
      variantId: parsed.data.variantId,
    },
  });
  return NextResponse.json(result, { status: 201 });
}
