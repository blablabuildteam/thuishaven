import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { addCrmNote } from "@/lib/outreach/crm";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const schema = z.object({
  prospectId: z.string().uuid(),
  kind: z.enum(["note", "call", "linkedin"]),
  body: z.string().min(2).max(2000),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige notitie" }, { status: 400 });
  }

  const result = await addCrmNote(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await logSessionActivity(session, {
    action: "crm_note",
    summary: `CRM-notitie (${parsed.data.kind})`,
    path: "/api/outreach/crm/notes",
    method: "POST",
    status: 201,
    tool: "outreach",
    meta: { prospectId: parsed.data.prospectId, kind: parsed.data.kind },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
