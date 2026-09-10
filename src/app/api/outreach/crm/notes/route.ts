import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { addCrmNote } from "@/lib/outreach/crm";

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
  return NextResponse.json({ ok: true }, { status: 201 });
}
