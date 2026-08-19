import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncTicketSwapReadOnly } from "@/lib/integrations/ticketswap/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/integrations/ticketswap/sync — read-only listings voor venue Thuishaven. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await syncTicketSwapReadOnly();
  return NextResponse.json(
    { readOnly: true, ...result },
    { status: result.ok ? 200 : 502 },
  );
}
