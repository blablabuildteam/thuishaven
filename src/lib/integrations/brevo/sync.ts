import { getDb, hasDatabase } from "@/lib/db/client";
import { emailCampaignMetrics } from "@/lib/db/schema";
import {
  getBrevoAccount,
  listBrevoEmailCampaigns,
} from "@/lib/integrations/brevo/client";
import { eq } from "drizzle-orm";

/**
 * Read-only Brevo sync: campagnes + metrics → onze DB.
 * Geen send/create/update in Brevo.
 */
export async function syncBrevoCampaignsReadOnly(): Promise<{
  ok: boolean;
  source: string;
  account?: string;
  campaignsFetched: number;
  metricsUpserted: number;
  error?: string;
  preview?: Array<{ id: number; name: string; sent: number; opens: number }>;
}> {
  const account = await getBrevoAccount();
  if (!account.ok) {
    return {
      ok: false,
      source: "brevo",
      campaignsFetched: 0,
      metricsUpserted: 0,
      error: account.error,
    };
  }

  const listed = await listBrevoEmailCampaigns({ limit: 50 });
  if (!listed.ok) {
    return {
      ok: false,
      source: "brevo",
      account: account.data.email ?? account.data.companyName,
      campaignsFetched: 0,
      metricsUpserted: 0,
      error: listed.error,
    };
  }

  const campaigns = listed.data.campaigns ?? [];
  const preview = campaigns.slice(0, 15).map((c) => {
    const g = c.statistics?.globalStats;
    return {
      id: Number(c.id ?? 0),
      name: String(c.name ?? "Campagne"),
      sent: Number(g?.sent ?? g?.delivered ?? 0),
      opens: Number(g?.uniqueOpens ?? g?.viewed ?? 0),
    };
  });

  if (!hasDatabase()) {
    return {
      ok: true,
      source: "brevo",
      account: account.data.email ?? account.data.companyName,
      campaignsFetched: campaigns.length,
      metricsUpserted: 0,
      error: "DATABASE_URL ontbreekt — campagnes wel gelezen",
      preview,
    };
  }

  const db = getDb();
  let metricsUpserted = 0;

  for (const c of campaigns) {
    if (c.id == null) continue;
    const g = c.statistics?.globalStats;
    const sent = Number(g?.sent ?? g?.delivered ?? 0);
    const opens = Number(g?.uniqueOpens ?? g?.viewed ?? 0);
    const clicks = Number(g?.uniqueClicks ?? g?.clickers ?? 0);
    const brevoId = String(c.id);
    const sentAt = c.sentDate ? new Date(c.sentDate) : null;

    const existing = await db
      .select()
      .from(emailCampaignMetrics)
      .where(eq(emailCampaignMetrics.brevoCampaignId, brevoId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(emailCampaignMetrics)
        .set({
          name: c.name ?? existing[0].name,
          sent,
          opens,
          clicks,
          sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : existing[0].sentAt,
          syncedAt: new Date(),
        })
        .where(eq(emailCampaignMetrics.id, existing[0].id));
    } else {
      await db.insert(emailCampaignMetrics).values({
        brevoCampaignId: brevoId,
        name: c.name ?? `Campagne ${brevoId}`,
        sent,
        opens,
        clicks,
        sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : null,
      });
    }
    metricsUpserted += 1;
  }

  return {
    ok: true,
    source: "brevo",
    account: account.data.email ?? account.data.companyName,
    campaignsFetched: campaigns.length,
    metricsUpserted,
    preview,
  };
}
