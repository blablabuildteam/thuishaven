import { NextResponse } from "next/server";
import {
  applyBrevoOutreachEvent,
  type BrevoWebhookEvent,
} from "@/lib/outreach/brevo-webhook";

export const dynamic = "force-dynamic";

/**
 * Brevo transactional webhook → outreach open/click/bounce/reply.
 * Configure in Brevo → Transactional → Webhooks:
 *   URL: https://<app>/api/outreach/webhooks/brevo?secret=<OUTREACH_BREVO_WEBHOOK_SECRET>
 *   Events: delivered, opened, click, hardBounce, softBounce, unsubscribed
 */
export async function POST(request: Request) {
  const secret = process.env.OUTREACH_BREVO_WEBHOOK_SECRET?.trim();
  if (secret) {
    const { searchParams } = new URL(request.url);
    const provided =
      searchParams.get("secret") ||
      request.headers.get("x-outreach-webhook-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events: BrevoWebhookEvent[] = Array.isArray(payload)
    ? (payload as BrevoWebhookEvent[])
    : [payload as BrevoWebhookEvent];

  const results = [];
  for (const event of events) {
    results.push(await applyBrevoOutreachEvent(event));
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    matched: results.filter((r) => r.matched).length,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "outreach-brevo-webhook",
    hint: "POST Brevo transactional events here",
  });
}
