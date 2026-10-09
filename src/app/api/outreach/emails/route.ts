import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  generateAndStoreDraft,
  sendStoredDraft,
} from "@/lib/integrations/outreach";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";
import { logSessionActivity } from "@/lib/audit/session-log";
import { resolveOutreachTestRecipientsAsync } from "@/lib/outreach/send-policy";
import {
  armBatchAutoSend,
  disarmBatchAutoSend,
  scheduleBatchEmails,
} from "@/lib/outreach/auto-send";
import {
  dequeueEmails,
  enqueueEmails,
  listOpenBatches,
  sendBatch,
  updateBatchMeta,
  updateQueuedOrDraft,
} from "@/lib/outreach/batches";
import {
  armQueueEmails,
  clearQueueSchedule,
  disarmQueueEmails,
  promoteToQueue,
  scheduleQueueEmails,
  updateQueueItem,
} from "@/lib/outreach/queue";

export const dynamic = "force-dynamic";
/** Bulk draft generation calls Gemini per company. */
export const maxDuration = 300;

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

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("openBatches") === "1") {
    const batches = await listOpenBatches();
    return NextResponse.json({ batches });
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
    const result = await updateQueuedOrDraft({
      emailId: parsed.data.emailId,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
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

  if (action === "update-queue-item") {
    const schema = z.object({
      action: z.literal("update-queue-item"),
      emailId: z.string().uuid(),
      subject: z.string().min(1).max(200).optional(),
      body: z.string().min(1).max(20000).optional(),
      senderProfileId: z
        .enum(["evenementen", "reiner", "yoram"])
        .optional(),
      variantKey: z.enum(VARIANT_IDS).optional().nullable(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await updateQueueItem({
      emailId: parsed.data.emailId,
      subject: parsed.data.subject,
      body: parsed.data.body,
      senderProfileId: parsed.data.senderProfileId,
      variantKey: parsed.data.variantKey,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "promote-queue") {
    const schema = z.object({
      action: z.literal("promote-queue"),
      emailIds: z.array(z.string().uuid()).min(1).max(80),
      senderProfileId: z
        .enum(["evenementen", "reiner", "yoram"])
        .optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await promoteToQueue({
      emailIds: parsed.data.emailIds,
      senderProfileId: parsed.data.senderProfileId,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "schedule-queue") {
    const schema = z.object({
      action: z.literal("schedule-queue"),
      emailIds: z.array(z.string().uuid()).min(1).max(80),
      fromDay: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await scheduleQueueEmails({
      emailIds: parsed.data.emailIds,
      fromDay: parsed.data.fromDay,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_schedule_queue",
      summary: `Wachtrij ingepland · ${result.scheduled} mails`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { scheduled: result.scheduled },
    });
    return NextResponse.json(result);
  }

  if (action === "clear-queue-schedule") {
    const schema = z.object({
      action: z.literal("clear-queue-schedule"),
      emailIds: z.array(z.string().uuid()).min(1).max(80),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await clearQueueSchedule({
      emailIds: parsed.data.emailIds,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "arm-queue") {
    const schema = z.object({
      action: z.literal("arm-queue"),
      emailIds: z.array(z.string().uuid()).min(1).max(80),
      confirmText: z.string().min(1).max(200),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bevestiging verplicht" },
        { status: 400 },
      );
    }
    const result = await armQueueEmails({
      emailIds: parsed.data.emailIds,
      confirmText: parsed.data.confirmText,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_arm_queue",
      summary: `Wachtrij auto-send · ${result.armed} mails`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { armed: result.armed },
    });
    return NextResponse.json(result);
  }

  if (action === "disarm-queue") {
    const schema = z.object({
      action: z.literal("disarm-queue"),
      emailIds: z.array(z.string().uuid()).min(1).max(80),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await disarmQueueEmails({
      emailIds: parsed.data.emailIds,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "enqueue") {
    const schema = z.object({
      action: z.literal("enqueue"),
      emailIds: z.array(z.string().uuid()).min(1).max(50),
      batchId: z.string().uuid().optional(),
      batchName: z.string().max(120).optional(),
      senderProfileId: z
        .enum(["evenementen", "reiner", "yoram"])
        .optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await enqueueEmails({
      emailIds: parsed.data.emailIds,
      batchId: parsed.data.batchId,
      batchName: parsed.data.batchName?.trim() || undefined,
      senderProfileId: parsed.data.senderProfileId,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_enqueue",
      summary: `${result.enqueued} mails in bakje · ${result.batchName} · ${result.senderEmail}`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: {
        batchId: result.batchId,
        enqueued: result.enqueued,
        senderProfileId: result.senderProfileId,
        senderEmail: result.senderEmail,
      },
    });
    return NextResponse.json(result);
  }

  if (action === "dequeue") {
    const schema = z.object({
      action: z.literal("dequeue"),
      emailIds: z.array(z.string().uuid()).min(1).max(50),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await dequeueEmails({ emailIds: parsed.data.emailIds });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_dequeue",
      summary: `${result.dequeued} mails uit bakje gehaald`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { dequeued: result.dequeued },
    });
    return NextResponse.json(result);
  }

  if (action === "update-batch") {
    const schema = z.object({
      action: z.literal("update-batch"),
      batchId: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      notes: z.string().max(2000).nullable().optional(),
      plannedStartDay: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      senderProfileId: z
        .enum(["evenementen", "reiner", "yoram"])
        .optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await updateBatchMeta({
      batchId: parsed.data.batchId,
      name: parsed.data.name,
      notes: parsed.data.notes,
      plannedStartDay: parsed.data.plannedStartDay,
      senderProfileId: parsed.data.senderProfileId,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "schedule-batch") {
    const schema = z.object({
      action: z.literal("schedule-batch"),
      batchId: z.string().uuid(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await scheduleBatchEmails({ batchId: parsed.data.batchId });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_schedule_batch",
      summary: `Bakje ingepland · ${result.scheduled} mails`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: parsed.data,
    });
    return NextResponse.json(result);
  }

  if (action === "arm-batch") {
    const schema = z.object({
      action: z.literal("arm-batch"),
      batchId: z.string().uuid(),
      confirmText: z.string().min(1).max(200),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bevestiging verplicht" },
        { status: 400 },
      );
    }
    const result = await armBatchAutoSend({
      batchId: parsed.data.batchId,
      confirmText: parsed.data.confirmText,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_arm_batch",
      summary: `Auto-send aan · ${result.armed} mails`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { batchId: parsed.data.batchId, armed: result.armed },
    });
    return NextResponse.json(result);
  }

  if (action === "disarm-batch") {
    const schema = z.object({
      action: z.literal("disarm-batch"),
      batchId: z.string().uuid(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await disarmBatchAutoSend({
      batchId: parsed.data.batchId,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "send-batch") {
    const schema = z.object({
      action: z.literal("send-batch"),
      batchId: z.string().uuid(),
      confirmText: z.string().min(1).max(200),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bevestiging verplicht (bakjenaam of VERSTUUR LIVE)" },
        { status: 400 },
      );
    }
    const result = await sendBatch({
      batchId: parsed.data.batchId,
      confirmText: parsed.data.confirmText,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "email_send_batch",
      summary: `Bakje verstuurd · ${result.ok} ok · ${result.failed} mislukt · cap skip ${result.skippedCap}`,
      path: "/api/outreach/emails",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: {
        batchId: parsed.data.batchId,
        ok: result.ok,
        failed: result.failed,
        skippedCap: result.skippedCap,
        sentToday: result.sentToday,
        dailyCap: result.dailyCap,
      },
    });
    return NextResponse.json(result);
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
    const testTo = await resolveOutreachTestRecipientsAsync(parsed.data.testTo);

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
    body?: string;
    variantId?: string;
    source?: string;
    fallbackReason?: string;
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
        body: result.body,
        variantId: result.variantId,
        source: result.source,
        fallbackReason: result.fallbackReason,
      });
    }
  }

  const ok = results.filter((r) => r.emailId).length;
  const templateFallback = results.filter(
    (r) => r.source === "template_fallback",
  ).length;
  await logSessionActivity(session, {
    action: "email_draft_bulk",
    summary: `Bulk drafts · ${ok}/${jobs.length}${
      templateFallback ? ` · ${templateFallback} template-fallback` : ""
    }`,
    path: "/api/outreach/emails",
    method: "POST",
    status: 201,
    tool: "outreach",
    meta: { count: jobs.length, ok, templateFallback },
  });

  return NextResponse.json(
    {
      ok,
      failed: results.length - ok,
      templateFallback,
      results,
    },
    { status: 201 },
  );
}
