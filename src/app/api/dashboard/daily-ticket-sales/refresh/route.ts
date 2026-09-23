import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshDailyTicketSales } from "@/lib/dashboard/daily-ticket-sales";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/dashboard/daily-ticket-sales/refresh
 * Live Weeztix totals for events still on sale, then today's sales snapshot.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }

  const result = await refreshDailyTicketSales();
  return NextResponse.json(
    {
      ok: result.ok,
      refreshedAt: result.refreshedAt,
      error: result.error,
    },
    { status: result.ok ? 200 : 502 },
  );
}
