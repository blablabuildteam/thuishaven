import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { logSessionActivity } from "@/lib/audit/session-log";
import {
  loadOutreachSettings,
  saveOutreachSettings,
} from "@/lib/outreach/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const settings = await loadOutreachSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Alleen admin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const schema = z.object({
    senderEmail: z.string().email(),
    senderName: z.string().min(1).max(120),
    replyToEmail: z.string().email(),
    replyToName: z.string().min(1).max(120),
    allowedSenderEmails: z.string().min(3).max(500),
    testRecipient: z.string().email(),
    sendWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    mailsPerDay: z.number().int().min(1).max(40),
    preferredHour: z.number().int().min(0).max(23),
    notes: z.string().max(2000).nullable().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const result = await saveOutreachSettings(parsed.data);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  await logSessionActivity(session, {
    action: "outreach_settings_update",
    summary: "Outreach-instellingen bijgewerkt",
    path: "/api/outreach/settings",
    method: "PUT",
    status: 200,
    tool: "outreach",
    meta: {
      sender: parsed.data.senderEmail,
      replyTo: parsed.data.replyToEmail,
    },
  });

  const settings = await loadOutreachSettings();
  return NextResponse.json({ ok: true, settings });
}
