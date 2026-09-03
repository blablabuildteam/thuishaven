import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/** Lead notify is locked — nothing is emailed. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  return NextResponse.json(
    {
      ok: false,
      error:
        "Lead-notificaties staan uit tot OUTREACH_SEND_ENABLED=true + BREVO_OUTREACH_API_KEY. Review /outreach/planning.",
    },
    { status: 403 },
  );
}
