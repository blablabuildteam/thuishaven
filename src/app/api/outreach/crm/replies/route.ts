import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachEmails, prospects } from "@/lib/db/schema";
import { recordInboundReply } from "@/lib/outreach/inbound-reply";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const schema = z.object({
  outreachEmailId: z.string().uuid(),
  sentiment: z.enum(["positive", "neutral", "negative", "opt_out"]),
  note: z.string().max(2000).optional(),
});

/** Handmatig een antwoord loggen (telefoon, eigen inbox, LinkedIn…). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Geen database" }, { status: 503 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const { outreachEmailId, sentiment, note } = parsed.data;

  const [mail] = await getDb()
    .select({
      sentAt: outreachEmails.sentAt,
      subject: outreachEmails.subject,
      email: prospects.email,
      companyName: prospects.companyName,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .where(eq(outreachEmails.id, outreachEmailId))
    .limit(1);
  if (!mail) {
    return NextResponse.json({ error: "Mail niet gevonden" }, { status: 404 });
  }
  if (!mail.sentAt) {
    return NextResponse.json(
      { error: "Deze mail is nog niet verstuurd" },
      { status: 400 },
    );
  }
  if (!mail.email) {
    return NextResponse.json(
      { error: "Bedrijf heeft geen e-mailadres" },
      { status: 400 },
    );
  }

  const result = await recordInboundReply({
    outreachEmailId,
    fromEmail: mail.email,
    subject: `Re: ${mail.subject}`,
    bodyPreview: note?.trim() || "Handmatig gelogd antwoord",
    sentiment,
    notifySales: false,
  });
  if (!result.ok || !result.matched) {
    return NextResponse.json(
      { error: "Antwoord kon niet worden opgeslagen" },
      { status: 400 },
    );
  }

  await logSessionActivity(session, {
    action: "crm_reply_logged",
    summary: `Antwoord gelogd voor ${mail.companyName} (${sentiment})`,
    path: "/api/outreach/crm/replies",
    method: "POST",
    status: 201,
    tool: "outreach",
    meta: { outreachEmailId, sentiment },
  });
  return NextResponse.json(
    { ok: true, leadCreated: result.leadCreated },
    { status: 201 },
  );
}
