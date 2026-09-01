import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isCronAuthorized,
  isRaCronSlot,
} from "@/lib/integrations/cron";
import { logIntegration } from "@/lib/integrations/log";
import { syncResidentAdvisorReadOnly } from "@/lib/integrations/ra/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/ra
 * Vercel Cron: 08:00, 13:00, 19:00, 23:00 Europe/Amsterdam.
 * Venue listings + Amsterdam-area competitors (genres / electronic umbrella).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = amsterdamHour(now);
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isRaCronSlot(now)) {
    console.info(`[ra] cron.skip hour=${hour} (Amsterdam)`);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const result = await syncResidentAdvisorReadOnly();
  if (result.ok) {
    const { invalidateEventInsightsCache } = await import(
      "@/lib/insights/event-insights"
    );
    await invalidateEventInsightsCache();
  }

  await logIntegration({
    source: "resident_advisor",
    level: result.ok ? "info" : "error",
    event: result.ok ? "cron.ok" : "cron.failed",
    message: result.ok
      ? `Cron RA: ${result.upserted} venue listings, ${result.linked} gekoppeld · area ${result.areaUpserted ?? 0}/${result.areaFetched ?? 0}`
      : (result.error ?? "RA cron mislukt"),
    detail: {
      trigger: "vercel-cron",
      amsterdamHour: hour,
      fetched: result.fetched,
      upserted: result.upserted,
      linked: result.linked,
      areaFetched: result.areaFetched,
      areaUpserted: result.areaUpserted,
    },
    throttleMs: 0,
  });

  if (!result.ok) {
    console.error(`[ra] cron.failed: ${result.error}`);
  }

  return NextResponse.json(
    { trigger: "vercel-cron", amsterdamHour: hour, readOnly: true, ...result },
    { status: result.ok ? 200 : 502 },
  );
}
