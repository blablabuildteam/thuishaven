import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { recordInboundReply } from "@/lib/outreach/inbound-reply";

export const dynamic = "force-dynamic";

/**
 * Log a reply that landed in evenement@ (manual UI or future mailbox forward).
 * Auth: logged-in session, or OUTREACH_BREVO_WEBHOOK_SECRET for automation.
 */
const bodySchema = z.object({
  fromEmail: z.string().email(),
  subject: z.string().max(500).optional().nullable(),
  bodyPreview: z.string().max(4000).optional().nullable(),
  outreachEmailId: z.string().uuid().optional().nullable(),
  receivedAt: z.string().datetime().optional().nullable(),
  skipLead: z.boolean().optional(),
});

async function authorize(request: Request): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;

  const secret = process.env.OUTREACH_BREVO_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const { searchParams } = new URL(request.url);
  const provided =
    searchParams.get("secret") ||
    request.headers.get("x-outreach-webhook-secret");
  return provided === secret;
}

export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  json = normalizeInboundPayload(json);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const result = await recordInboundReply({
    fromEmail: parsed.data.fromEmail,
    subject: parsed.data.subject,
    bodyPreview: parsed.data.bodyPreview,
    outreachEmailId: parsed.data.outreachEmailId,
    receivedAt: parsed.data.receivedAt
      ? new Date(parsed.data.receivedAt)
      : undefined,
    skipLead: parsed.data.skipLead,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  if (!result.matched) {
    return NextResponse.json(
      {
        ok: true,
        matched: false,
        reason: result.reason,
        hint: "Geen verzonden outreach-mail gevonden voor dit afzenderadres.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json(result, { status: 201 });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Brevo inbound parse + generic mailbox-forward payloads. */
function normalizeInboundPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  const item =
    Array.isArray(o.items) && o.items[0] && typeof o.items[0] === "object"
      ? (o.items[0] as Record<string, unknown>)
      : o;
  const from =
    firstString(
      o.fromEmail,
      o.from,
      o.From,
      o.sender,
      o.Sender,
      item.From,
      item.from,
    ) ?? "";
  const emailMatch = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return {
    fromEmail: emailMatch?.[0] ?? from,
    subject: firstString(o.subject, o.Subject, item.Subject, item.subject),
    bodyPreview: firstString(
      o.bodyPreview,
      o.text,
      o.TextBody,
      o.ExtractedMarkdown,
      item.TextBody,
      item.text,
    ),
    outreachEmailId: o.outreachEmailId,
    receivedAt: o.receivedAt,
    skipLead: o.skipLead,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "outreach-inbound-reply",
    hint: "POST JSON (fromEmail/subject/body) of Brevo inbound-parse. Forward evenement@ hierheen.",
  });
}
