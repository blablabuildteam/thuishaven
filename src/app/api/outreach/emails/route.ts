import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  generateAndStoreDraft,
  sendStoredDraft,
} from "@/lib/integrations/outreach";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";
import { logSessionActivity } from "@/lib/audit/session-log";
import { resolveOutreachTestRecipients } from "@/lib/outreach/send-policy";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachEmails } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const VARIANT_IDS = [
  "warm_tour",
  "open_dates",
  "jubileum",
  "seizoen",
  "zomer",
  "kerst",
  "nieuwjaar",
  "funding",
  "recordjaar",
  "short_checkin",
  "brochure",
] as const;

const generateSchema = z
  .object({
    prospectId: z.string().uuid().optional(),
    prospectIds: z.array(z.string().uuid()).min(1).max(40).optional(),
    /** Per-company template (overrides global variantId when present) */
    items: z
      .array(
        z.object({
          prospectId: z.string().uuid(),
          variantId: z.enum(VARIANT_IDS),
        }),
      )
      .min(1)
      .max(40)
      .optional(),
    variantId: z.enum(VARIANT_IDS).optional(),
    subjectArm: z.enum(["a", "b"]).optional(),
  })
  .refine(
    (d) =>
      Boolean(d.prospectId || d.prospectIds?.length || d.items?.length),
    { message: "prospectId, prospectIds of items verplicht" },
  );

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

  if (action === "update-draft") {
    const updateSchema = z.object({
      action: z.literal("update-draft"),
      emailId: z.string().uuid(),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(20000),
    });
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Geen database" }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db
      .select({
        id: outreachEmails.id,
        status: outreachEmails.status,
      })
      .from(outreachEmails)
      .where(eq(outreachEmails.id, parsed.data.emailId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Draft niet gevonden" }, { status: 404 });
    }
    if (row.status !== "draft") {
      return NextResponse.json(
        { error: "Alleen drafts kun je nog aanpassen" },
        { status: 400 },
      );
    }
    await db
      .update(outreachEmails)
      .set({
        subject: parsed.data.subject.trim(),
        body: parsed.data.body.trim(),
      })
      .where(eq(outreachEmails.id, parsed.data.emailId));
    await logSessionActivity(session, {
      action: "email_draft_update",
      summary: `Draft aangepast · ${parsed.data.emailId}`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { emailId: parsed.data.emailId },
    });
    return NextResponse.json({
      ok: true,
      emailId: parsed.data.emailId,
      subject: parsed.data.subject.trim(),
      body: parsed.data.body.trim(),
    });
  }

  if (action === "send" || action === "send-test") {
    const sendSchema = z.object({
      action: z.enum(["send", "send-test"]),
      emailId: z.string().uuid().optional(),
      emailIds: z.array(z.string().uuid()).min(1).max(40).optional(),
      testTo: z.union([z.string(), z.array(z.string())]).optional(),
    });
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const ids =
      parsed.data.emailIds ??
      (parsed.data.emailId ? [parsed.data.emailId] : []);
    if (!ids.length) {
      return NextResponse.json({ error: "emailId verplicht" }, { status: 400 });
    }
    const testTo = resolveOutreachTestRecipients(parsed.data.testTo);

    if (ids.length === 1) {
      const result = await sendStoredDraft({
        emailId: ids[0]!,
        forceTest: true,
        testTo,
      });
      if ("error" in result) {
        return NextResponse.json(result, { status: 400 });
      }
      await logSessionActivity(session, {
        action: "email_send_test",
        summary: `Testmail verstuurd · ${ids[0]}`,
        path: "/api/outreach/emails",
        method: "POST",
        status: 200,
        tool: "outreach",
        meta: { emailId: ids[0], action: parsed.data.action },
      });
      return NextResponse.json(result);
    }

    const results: Array<{
      emailId: string;
      ok: boolean;
      error?: string;
      deliveredTo?: string[];
    }> = [];
    for (const emailId of ids) {
      const result = await sendStoredDraft({
        emailId,
        forceTest: true,
        testTo,
      });
      if ("error" in result) {
        results.push({ emailId, ok: false, error: result.error });
      } else {
        results.push({
          emailId,
          ok: true,
          deliveredTo: result.deliveredTo,
        });
      }
    }
    const ok = results.filter((r) => r.ok).length;
    await logSessionActivity(session, {
      action: "email_send_test_bulk",
      summary: `Bulk test · ${ok}/${ids.length}`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { count: ids.length, ok },
    });
    return NextResponse.json({
      ok,
      failed: results.length - ok,
      deliveredTo: testTo,
      results,
    });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const jobs: Array<{
    prospectId: string;
    variantId?: (typeof VARIANT_IDS)[number];
  }> = parsed.data.items
    ? parsed.data.items.map((i) => ({
        prospectId: i.prospectId,
        variantId: i.variantId,
      }))
    : (
        parsed.data.prospectIds ??
        (parsed.data.prospectId ? [parsed.data.prospectId] : [])
      ).map((prospectId) => ({
        prospectId,
        variantId: parsed.data.variantId,
      }));

  if (jobs.length === 1) {
    const job = jobs[0]!;
    const result = await generateAndStoreDraft({
      prospectId: job.prospectId,
      variantId: job.variantId,
      subjectArm: parsed.data.subjectArm,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_draft",
      summary: `Draft gemaakt · prospect ${job.prospectId}`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 201,
      tool: "outreach",
      meta: {
        prospectId: job.prospectId,
        variantId: job.variantId,
      },
    });
    return NextResponse.json(result, { status: 201 });
  }

  const results: Array<{
    prospectId: string;
    emailId?: string;
    subject?: string;
    variantId?: string;
    error?: string;
  }> = [];
  for (const job of jobs) {
    const result = await generateAndStoreDraft({
      prospectId: job.prospectId,
      variantId: job.variantId,
      subjectArm: parsed.data.subjectArm,
    });
    if ("error" in result) {
      results.push({
        prospectId: job.prospectId,
        variantId: job.variantId,
        error: result.error,
      });
    } else {
      results.push({
        prospectId: job.prospectId,
        emailId: result.emailId,
        subject: result.subject,
        variantId: result.variantId,
      });
    }
  }

  const ok = results.filter((r) => r.emailId).length;
  await logSessionActivity(session, {
    action: "email_draft_bulk",
    summary: `Bulk drafts · ${ok}/${jobs.length}`,
    path: "/api/outreach/emails",
    method: "POST",
    status: 201,
    tool: "outreach",
    meta: { count: jobs.length, ok },
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
