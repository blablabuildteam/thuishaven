import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  fillDecisionMakers,
  fillHunterEmailsForDecisionMakers,
} from "@/lib/outreach/decision-makers";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const schema = z.object({
  limit: z.number().int().min(1).max(15).optional(),
  /** Alleen Hunter-mail voor bestaande Event Managers zonder e-mail. */
  hunterEmails: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const limit = parsed.data.limit ?? 8;
  const result = parsed.data.hunterEmails
    ? await fillHunterEmailsForDecisionMakers(limit)
    : await fillDecisionMakers(limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await logSessionActivity(session, {
    action: parsed.data.hunterEmails ? "hunter_emails" : "apollo_people",
    summary: parsed.data.hunterEmails
      ? `Hunter-mails: ${result.filled}/${result.processed}`
      : `Event Managers: ${result.filled}/${result.processed}`,
    path: "/api/outreach/people",
    method: "POST",
    status: 200,
    tool: "outreach",
    meta: {
      hunterEmails: Boolean(parsed.data.hunterEmails),
      filled: result.filled,
      processed: result.processed,
    },
  });
  return NextResponse.json(result);
}
