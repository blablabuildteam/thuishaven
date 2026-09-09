import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isCronAuthorized,
  isWeeztixCronSlot,
} from "@/lib/integrations/cron";
import { logIntegration } from "@/lib/integrations/log";
import {
  syncWeeztixDailySales,
  syncWeeztixSaleDays,
} from "@/lib/integrations/weeztix/daily";
import { syncWeeztixReadOnly } from "@/lib/integrations/weeztix/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/weeztix
 * Vercel Cron: 08:00, 13:00, 19:00, 23:00 Europe/Amsterdam.
 * Events + voorraad + inventory-snapshot elke slot; referrers/demo om 08:00.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = amsterdamHour(now);
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isWeeztixCronSlot(now)) {
    console.info(`[weeztix] cron.skip hour=${hour} (Amsterdam)`);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const events = await syncWeeztixReadOnly({ includeStats: true });
  const saleDays = await syncWeeztixSaleDays({ limit: 120 }).catch((e) => ({
    ok: false as const,
    attempted: 0,
    daysUpserted: 0,
    ticketsToday: 0,
    failed: 1,
    errors: [e instanceof Error ? e.message : "saleDays mislukt"],
  }));
  const runDaily = force || hour === 8;
  const daily = runDaily
    ? await syncWeeztixDailySales({ limit: 80, daysBack: 400 }).catch((e) => ({
        ok: false as const,
        attempted: 0,
        editionsWithCurve: 0,
        daysUpserted: 0,
        referrersUpserted: 0,
        demographicsUpserted: 0,
        brevoOrders: 0,
        failed: 1,
        errors: [e instanceof Error ? e.message : "dailySales mislukt"],
      }))
    : null;

  const ok = events.ok && (daily == null || daily.ok);
  if (ok) {
    const { invalidateEventInsightsCache } = await import(
      "@/lib/insights/event-insights"
    );
    await invalidateEventInsightsCache();
  }
  await logIntegration({
    source: "weeztix",
    level: ok ? "info" : "error",
    event: ok ? "cron.ok" : "cron.failed",
    message: ok
      ? `Cron Weeztix: ${events.eventsFetched} events, ${events.editionsUpserted} edities, ${events.inventoryUpserted} voorraad · ${saleDays.ticketsToday} tickets vandaag${
          daily
            ? ` · ${daily.editionsWithCurve} curves / ${daily.daysUpserted} dagen`
            : ""
        }`
      : [events.error, ...saleDays.errors, ...(daily?.errors ?? [])]
          .filter(Boolean)
          .join(" · ") || "Weeztix cron mislukt",
    detail: {
      trigger: "vercel-cron",
      amsterdamHour: hour,
      eventsFetched: events.eventsFetched,
      editionsUpserted: events.editionsUpserted,
      inventoryUpserted: events.inventoryUpserted,
      saleDays: {
        daysUpserted: saleDays.daysUpserted,
        ticketsToday: saleDays.ticketsToday,
        failed: saleDays.failed,
      },
      daily: daily
        ? {
            editionsWithCurve: daily.editionsWithCurve,
            daysUpserted: daily.daysUpserted,
            failed: daily.failed,
          }
        : null,
    },
    throttleMs: 0,
  });

  if (!ok) {
    console.error(
      `[weeztix] cron.failed: ${events.error ?? saleDays.errors.join("; ") ?? daily?.errors.join("; ")}`,
    );
  }

  return NextResponse.json(
    {
      trigger: "vercel-cron",
      amsterdamHour: hour,
      readOnly: true,
      ok,
      events,
      saleDays,
      daily,
    },
    { status: ok ? 200 : 502 },
  );
}
