import { NextResponse } from "next/server";
import {
  amsterdamHour,
  isAmsterdamSyncSlot,
  isCronAuthorized,
} from "@/lib/integrations/cron";
import { logIntegration } from "@/lib/integrations/log";
import { syncBrevoCampaignsReadOnly } from "@/lib/integrations/brevo/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/brevo
 * Vercel Cron: e-mailcampagnes + metrics uit Brevo → onze DB.
 * Read-only naar Brevo (alleen GET); draait op dezelfde Amsterdam-slots
 * als de overige dashboard-syncs. Zonder dit bleven de mail-cijfers
 * hangen op de laatste handmatige sync.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = amsterdamHour(now);
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isAmsterdamSyncSlot(now)) {
    console.info(`[brevo] cron.skip hour=${hour} (Amsterdam)`);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const result = await syncBrevoCampaignsReadOnly();

  await logIntegration({
    source: "brevo",
    level: result.ok ? "info" : "error",
    event: result.ok ? "cron.ok" : "cron.failed",
    message: result.ok
      ? `Cron Brevo: ${result.campaignsFetched} campagnes, ${result.metricsUpserted} metrics bijgewerkt`
      : result.error ?? "Brevo cron mislukt",
    detail: {
      trigger: "vercel-cron",
      amsterdamHour: hour,
      account: result.account,
      campaignsFetched: result.campaignsFetched,
      metricsUpserted: result.metricsUpserted,
    },
    throttleMs: 0,
  });

  if (!result.ok) {
    console.error(`[brevo] cron.failed: ${result.error}`);
  }

  return NextResponse.json(
    {
      trigger: "vercel-cron",
      amsterdamHour: hour,
      readOnly: true,
      ...result,
    },
    { status: result.ok ? 200 : 502 },
  );
}
