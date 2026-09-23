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

const VARIANT_IDS = [
  "warm_tour",
  "open_dates",
  "jubileum",
  "seizoen",
  "funding",
  "recordjaar",
  "short_checkin",
  "brochure",
] as const;

const generateSchema = z
  .object({
    prospectId: z.string().uuid().optional(),
    prospectIds: z.array(z.string().uuid()).min(1).max(40).optional(),
    variantId: z.enum(VARIANT_IDS).optional(),
    subjectArm: z.enum(["a", "b"]).optional(),
  })
  .refine((d) => Boolean(d.prospectId || d.prospectIds?.length), {
    message: "prospectId of prospectIds verplicht",
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

  const ids =
    parsed.data.prospectIds ??
    (parsed.data.prospectId ? [parsed.data.prospectId] : []);

  if (ids.length === 1) {
    const result = await generateAndStoreDraft({
      prospectId: ids[0]!,
      variantId: parsed.data.variantId,
      subjectArm: parsed.data.subjectArm,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_draft",
      summary: `Draft gemaakt · prospect ${ids[0]}`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 201,
      tool: "outreach",
      meta: {
        prospectId: ids[0],
        variantId: parsed.data.variantId,
      },
    });
    return NextResponse.json(result, { status: 201 });
  }

  const results: Array<{
    prospectId: string;
    emailId?: string;
    subject?: string;
    error?: string;
  }> = [];
  for (const prospectId of ids) {
    const result = await generateAndStoreDraft({
      prospectId,
      variantId: parsed.data.variantId,
      subjectArm: parsed.data.subjectArm,
    });
    if ("error" in result) {
      results.push({ prospectId, error: result.error });
    } else {
      results.push({
        prospectId,
        emailId: result.emailId,
        subject: result.subject,
      });
    }
  }

  const ok = results.filter((r) => r.emailId).length;
  await logSessionActivity(session, {
    action: "email_draft_bulk",
    summary: `Bulk drafts · ${ok}/${ids.length} · ${parsed.data.variantId ?? "auto"}`,
    path: "/api/outreach/emails",
    method: "POST",
    status: 201,
    tool: "outreach",
    meta: {
      variantId: parsed.data.variantId,
      count: ids.length,
      ok,
    },
  });

  return NextResponse.json(
    {
      ok,
      failed: results.length - ok,
      results,
    },
    { status: 201 },
  );
}
