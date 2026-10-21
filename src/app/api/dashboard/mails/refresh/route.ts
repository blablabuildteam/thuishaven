import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearTtl } from "@/lib/cache/ttl";
import { syncBrevoCampaignsReadOnly } from "@/lib/integrations/brevo/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/dashboard/mails/refresh
 * Brevo-campagnes opnieuw ophalen (alleen GET naar Brevo) en de mail-effect
 * cache legen, zodat Weeztix-uurcurves en klik-referrers vers worden geteld.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await syncBrevoCampaignsReadOnly();
  clearTtl("mail-lift");
  clearTtl("mail-hours");

  return NextResponse.json(
    {
      ok: result.ok,
      campaignsFetched: result.campaignsFetched,
      refreshedAt: result.ok ? new Date().toISOString() : null,
      error: result.error,
    },
    { status: result.ok ? 200 : 502 },
  );
}
