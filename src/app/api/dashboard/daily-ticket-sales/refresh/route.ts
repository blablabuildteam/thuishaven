import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  refreshDailyTicketSales,
  type DailyTicketSalesRefreshProgress,
} from "@/lib/dashboard/daily-ticket-sales";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/dashboard/daily-ticket-sales/refresh
 * Live Weeztix totals for events still on sale, then today's sales snapshot.
 *
 * With `Accept: application/x-ndjson` the response streams one JSON line per
 * progress step (`{type:"progress",...}`) and ends with `{type:"done",...}`,
 * so the dashboard can show a real progress bar. Without it, one JSON answer.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }

  const wantsStream = (request.headers.get("accept") ?? "").includes(
    "application/x-ndjson",
  );
  if (!wantsStream) {
    const result = await runRefresh();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // Client went away; keep syncing so the data still lands.
        }
      };
      try {
        const result = await runRefresh((progress) =>
          send({ type: "progress", ...progress }),
        );
        send({ type: "done", ...result });
      } catch (err) {
        send({
          type: "done",
          ok: false,
          refreshedAt: null,
          error: err instanceof Error ? err.message : "Verversen mislukt",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runRefresh(
  onProgress?: (progress: DailyTicketSalesRefreshProgress) => void,
) {
  const result = await refreshDailyTicketSales({ onProgress });
  if (result.ok) {
    const { invalidateEventInsightsCache } = await import(
      "@/lib/insights/event-insights"
    );
    await invalidateEventInsightsCache();
  }
  return {
    ok: result.ok,
    refreshedAt: result.refreshedAt,
    error: result.error,
  };
}
