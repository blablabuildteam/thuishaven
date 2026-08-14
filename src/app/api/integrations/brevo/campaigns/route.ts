import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncBrevoCampaignsReadOnly } from "@/lib/integrations/brevo/sync";
import {
  getBrevoAccount,
  listBrevoEmailCampaigns,
} from "@/lib/integrations/brevo/client";

export const dynamic = "force-dynamic";

/** Read-only preview van Brevo-campagnes. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const account = await getBrevoAccount();
  const campaigns = await listBrevoEmailCampaigns({ limit: 25 });

  return NextResponse.json({
    readOnly: true,
    account: account.ok
      ? { email: account.data.email, company: account.data.companyName }
      : { error: account.error, status: account.status },
    campaigns: campaigns.ok
      ? {
          count: campaigns.data.campaigns?.length ?? 0,
          items: (campaigns.data.campaigns ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            sent: c.statistics?.globalStats?.sent ?? null,
            opens: c.statistics?.globalStats?.uniqueOpens ?? null,
            clicks: c.statistics?.globalStats?.uniqueClicks ?? null,
          })),
        }
      : { error: campaigns.error, status: campaigns.status },
  });
}

/** Sync campagnes → onze DB (alleen GET naar Brevo). */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await syncBrevoCampaignsReadOnly();
  return NextResponse.json(
    {
      readOnly: true,
      policy: "Alleen GET naar Brevo; persistence alleen in onze database",
      ...result,
    },
    { status: result.ok ? 200 : 502 },
  );
}
