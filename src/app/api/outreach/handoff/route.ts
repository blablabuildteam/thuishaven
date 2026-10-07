import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  clearHandoffCookie,
  HANDOFF_MAX_IDS,
  setHandoffCookie,
} from "@/lib/outreach/handoff";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  await clearHandoffCookie();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = z
    .object({
      prospectIds: z.array(z.string()).min(1).max(HANDOFF_MAX_IDS),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Selecteer 1–${HANDOFF_MAX_IDS} bedrijven` },
      { status: 400 },
    );
  }

  const count = await setHandoffCookie(parsed.data.prospectIds);
  if (!count) {
    return NextResponse.json(
      { error: "Geen geldige bedrijfs-IDs" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    count,
    redirectTo: "/outreach/emails",
  });
}
