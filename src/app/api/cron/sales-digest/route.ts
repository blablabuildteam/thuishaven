import { NextResponse } from "next/server";
import { amsterdamHour, isCronAuthorized } from "@/lib/integrations/cron";
import {
  salesDigestRecipients,
  sendSalesDigest,
} from "@/lib/dashboard/sales-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Verstuurtijd in Europe/Amsterdam. */
const SEND_HOUR_AMSTERDAM = 18;

/**
 * GET /api/cron/sales-digest
 * Dagelijkse kassa-mail: tickets + omzet van de afgelopen 24 uur per event.
 * Vercel Cron draait om 16 én 17 UTC; de route stuurt alleen als het in
 * Amsterdam 18:00 is (DST-proof). `?force=1` slaat die check over,
 * `?to=` stuurt naar een testadres i.p.v. de vaste ontvangers.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = amsterdamHour(now);
  const params = new URL(request.url).searchParams;
  if (params.get("force") !== "1" && hour !== SEND_HOUR_AMSTERDAM) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      amsterdamHour: hour,
    });
  }

  const testTo = params.get("to");
  const to = testTo
    ? testTo.split(",").map((s) => s.trim()).filter(Boolean)
    : salesDigestRecipients();
  const result = await sendSalesDigest({ to, now });
  if (!result.ok) {
    console.error(`[sales-digest] failed: ${result.error}`);
    return NextResponse.json(result, { status: 502 });
  }
  console.info(
    `[sales-digest] sent to=${result.to.join(",")} sold=${result.sold} revenueCents=${result.revenueCents}`,
  );
  return NextResponse.json(result);
}
