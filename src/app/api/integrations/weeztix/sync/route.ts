import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  syncWeeztixReadOnly,
  syncWeeztixTicketStatsFromEditions,
} from "@/lib/integrations/weeztix/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/integrations/weeztix/sync
 * { mode: "events" } — events + optionele stats
 * { mode: "ticketStats", onlyMissing?: boolean } — historische sold_count voor edities
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    onlyMissing?: boolean;
    statsLimit?: number;
    includeStats?: boolean;
  };

  const mode = body.mode ?? "events";

  if (mode === "ticketStats") {
    const result = await syncWeeztixTicketStatsFromEditions({
      onlyMissing: body.onlyMissing ?? false,
      concurrency: 4,
    });
    return NextResponse.json(
      {
        readOnly: true,
        mode,
        ...result,
      },
      { status: result.ok ? 200 : 502 },
    );
  }

  const result = await syncWeeztixReadOnly({
    includeStats: body.includeStats ?? true,
    statsLimit: body.statsLimit ?? 40,
  });

  return NextResponse.json(
    {
      readOnly: true,
      mode: "events",
      ...result,
    },
    { status: result.ok ? 200 : 502 },
  );
}
