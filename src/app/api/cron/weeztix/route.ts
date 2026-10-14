import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isCronAuthorized,
  isWeeztixCronSlot,
  isWeeztixFullSlot,
} from "@/lib/integrations/cron";
import { refreshDailyTicketSales } from "@/lib/dashboard/daily-ticket-sales";
import { logIntegration } from "@/lib/integrations/log";
import {
  syncWeeztixDailySales,
  syncWeeztixOnSaleCurves,
  syncWeeztixSaleDays,
} from "@/lib/integrations/weeztix/daily";
import { syncWeeztixReadOnly } from "@/lib/integrations/weeztix/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/weeztix
 * Vercel Cron draait elk uur (06–23 UTC); de route filtert op WEEZTIX_SYNC_HOURS
 * (~elke 2 uur van 08:00 t/m 00:00 Europe/Amsterdam), DST-proof.
 * De vier WEEZTIX_FULL_SYNC_HOURS (08/13/19/23) draaien de volledige all-event
 * sync (voorraad + referrers/demo-backfill om 08:00). De tussenliggende slots
 * verversen alleen de events die nog in verkoop staan, zodat de live
 * verkoop-per-dag-grafiek bijblijft zonder alle events elk uur op te halen.
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

  // In-between slots: refresh only the events still on sale (stats + sale-days
  // + order curve), the same light pull the dashboard's manual refresh runs.
  if (!force && !isWeeztixFullSlot(now)) {
    const light = await refreshDailyTicketSales().catch((e) => ({
      ok: false as const,
      refreshedAt: null,
      error: e instanceof Error ? e.message : "Weeztix light sync mislukt",
    }));
    await logIntegration({
      source: "weeztix",
      level: light.ok ? "info" : "error",
      event: light.ok ? "cron.light.ok" : "cron.light.failed",
      message: light.ok
        ? `Cron Weeztix (licht): events in verkoop ververst · ${hour}:00`
        : light.error ?? "Weeztix light sync mislukt",
      detail: { trigger: "vercel-cron", amsterdamHour: hour, light: true },
      throttleMs: 0,
    });
    if (light.ok) {
      const { invalidateEventInsightsCache } = await import(
        "@/lib/insights/event-insights"
      );
      await invalidateEventInsightsCache();
    } else {
      console.error(`[weeztix] cron.light.failed: ${light.error}`);
    }
    return NextResponse.json(
      {
        trigger: "vercel-cron",
        amsterdamHour: hour,
        light: true,
        ok: light.ok,
        refreshedAt: light.refreshedAt,
        error: light.ok ? undefined : light.error,
      },
      { status: light.ok ? 200 : 502 },
    );
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
  const curveFailure = (e: unknown) => ({
    ok: false as const,
    attempted: 0,
    editionsWithCurve: 0,
    daysUpserted: 0,
    referrersUpserted: 0,
    demographicsUpserted: 0,
    brevoOrders: 0,
    failed: 1,
    errors: [e instanceof Error ? e.message : "dailySales mislukt"],
  });
  /**
   * The full backfill (all editions, referrers, demographics) stays on the
   * morning slot. Every other slot still needs the order curve of events in
   * sale, otherwise today's sales stay frozen on the 08:00 figure.
   */
  const runDaily = force || hour === 8;
  const daily = runDaily
    ? await syncWeeztixDailySales({ limit: 150, daysBack: 900 }).catch(
        curveFailure,
      )
    : await syncWeeztixOnSaleCurves().catch(curveFailure);

  const ok = events.ok && daily.ok;
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
      ? `Cron Weeztix: ${events.eventsFetched} events, ${events.editionsUpserted} edities, ${events.inventoryUpserted} voorraad · ${saleDays.ticketsToday} tickets vandaag · ${daily.editionsWithCurve} curves / ${daily.daysUpserted} dagen`
      : [events.error, ...saleDays.errors, ...daily.errors]
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
      daily: {
        full: runDaily,
        editionsWithCurve: daily.editionsWithCurve,
        daysUpserted: daily.daysUpserted,
        failed: daily.failed,
      },
    },
    throttleMs: 0,
  });

  if (!ok) {
    console.error(
      `[weeztix] cron.failed: ${events.error ?? saleDays.errors.join("; ") ?? daily.errors.join("; ")}`,
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
