import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isCronAuthorized,
  isTicketswapCronSlot,
} from "@/lib/integrations/cron";
import { logIntegration } from "@/lib/integrations/log";
import { syncTicketSwapReadOnly } from "@/lib/integrations/ticketswap/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/ticketswap
 * Vercel Cron: 08:00, 13:00, 19:00, 23:00 Europe/Amsterdam.
 * UTC-slots dekken CET én CEST; buiten die lokale uren slaan we over.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = amsterdamHour(now);
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isTicketswapCronSlot(now)) {
    console.info(`[ticketswap] cron.skip hour=${hour} (Amsterdam)`);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const result = await syncTicketSwapReadOnly();
  await logIntegration({
    source: "ticketswap",
    level: result.ok ? "info" : "error",
    event: result.ok ? "cron.ok" : "cron.failed",
    message: result.ok
      ? `Cron TicketSwap: ${result.upserted} events, ${result.linked} gekoppeld, ${result.mismatches} alerts`
      : (result.error ?? "TicketSwap cron mislukt"),
    detail: {
      trigger: "vercel-cron",
      amsterdamHour: hour,
      fetched: result.fetched,
      upserted: result.upserted,
      linked: result.linked,
      mismatches: result.mismatches,
    },
    throttleMs: 0,
  });

  if (!result.ok) {
    console.error(`[ticketswap] cron.failed: ${result.error}`);
  }

  return NextResponse.json(
    { trigger: "vercel-cron", amsterdamHour: hour, readOnly: true, ...result },
    { status: result.ok ? 200 : 502 },
  );
}
