import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshEditionTicketSales } from "@/lib/dashboard/daily-ticket-sales";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/dashboard/editions/:editionId/weeztix-refresh
 * Pull live sold, scans and the daily curve for one event.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ editionId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }

  const { editionId } = await params;
  if (!UUID_RE.test(editionId)) {
    return NextResponse.json({ error: "Ongeldige editie" }, { status: 400 });
  }

  const result = await refreshEditionTicketSales(editionId);
  if (result.ok) {
    const { invalidateEventInsightsCache } = await import(
      "@/lib/insights/event-insights"
    );
    await invalidateEventInsightsCache();
  }
  return NextResponse.json(
    {
      ok: result.ok,
      refreshedAt: result.refreshedAt,
      error: result.error,
    },
    { status: result.ok ? 200 : 502 },
  );
}
