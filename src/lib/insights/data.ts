import { desc, isNotNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  emailCampaignMetrics,
  editions,
  ticketInventory,
} from "@/lib/db/schema";

export type InsightsSnapshot = {
  generatedAt: string;
  brevo: {
    campaigns: number;
    totalSent: number;
    totalOpens: number;
    totalClicks: number;
    top: Array<{
      name: string;
      sent: number;
      opens: number;
      clicks: number;
      openRate: number | null;
      sentAt: string | null;
    }>;
  };
  weeztix: {
    editions: number;
    inventoryRows: number;
    sold: number;
  };
  notes: string[];
};

export async function getInsightsSnapshot(): Promise<InsightsSnapshot> {
  const notes: string[] = [];
  const empty: InsightsSnapshot = {
    generatedAt: new Date().toISOString(),
    brevo: {
      campaigns: 0,
      totalSent: 0,
      totalOpens: 0,
      totalClicks: 0,
      top: [],
    },
    weeztix: { editions: 0, inventoryRows: 0, sold: 0 },
    notes: ["Geen database — zet DATABASE_URL."],
  };

  if (!hasDatabase()) return empty;

  const db = getDb();

  const campaigns = await db
    .select()
    .from(emailCampaignMetrics)
    .orderBy(desc(emailCampaignMetrics.sentAt), desc(emailCampaignMetrics.sent))
    .limit(40);

  const totalSent = campaigns.reduce((s, c) => s + (c.sent ?? 0), 0);
  const totalOpens = campaigns.reduce((s, c) => s + (c.opens ?? 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);

  const top = [...campaigns]
    .filter((c) => (c.sent ?? 0) > 0)
    .map((c) => {
      const sent = c.sent ?? 0;
      const opens = c.opens ?? 0;
      return {
        name: c.name,
        sent,
        opens,
        clicks: c.clicks ?? 0,
        openRate: sent > 0 ? (opens / sent) * 100 : null,
        sentAt: c.sentAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (b.openRate ?? 0) - (a.openRate ?? 0))
    .slice(0, 8);

  if (campaigns.length === 0) {
    notes.push("Nog geen Brevo-campagnes in DB — sync via Koppelingen / API.");
  }

  const weeztixEditions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));

  const inv = await db.select().from(ticketInventory);
  const sold = inv
    .filter((r) => r.platform === "weeztix")
    .reduce((s, r) => s + (r.sold ?? 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    brevo: {
      campaigns: campaigns.length,
      totalSent,
      totalOpens,
      totalClicks,
      top,
    },
    weeztix: {
      editions: weeztixEditions[0]?.count ?? 0,
      inventoryRows: inv.length,
      sold,
    },
    notes,
  };
}

export function snapshotToPromptContext(snap: InsightsSnapshot): string {
  const lines: string[] = [
    `Snapshot gegenereerd: ${snap.generatedAt}`,
    "",
    "=== Brevo e-mailcampagnes (read-only sync) ===",
    `Campagnes in DB: ${snap.brevo.campaigns}`,
    `Totaal sent: ${snap.brevo.totalSent}`,
    `Totaal opens (viewed/unique): ${snap.brevo.totalOpens}`,
    `Totaal clicks: ${snap.brevo.totalClicks}`,
    "",
    "Top campagnes op open rate:",
  ];

  for (const c of snap.brevo.top) {
    lines.push(
      `- ${c.name} | sent=${c.sent} opens=${c.opens} clicks=${c.clicks} openRate=${c.openRate?.toFixed(1) ?? "n/a"}% sentAt=${c.sentAt ?? "n/a"}`,
    );
  }

  lines.push(
    "",
    "=== Weeztix ===",
    `Edities met Weeztix-id: ${snap.weeztix.editions}`,
    `Inventory rijen: ${snap.weeztix.inventoryRows}`,
    `Sold (Weeztix inventory som): ${snap.weeztix.sold}`,
  );

  if (snap.notes.length) {
    lines.push("", "Notities:", ...snap.notes.map((n) => `- ${n}`));
  }

  lines.push(
    "",
    "Regels: antwoord in het Nederlands, kort en feitelijk. Baseer je alleen op bovenstaande data. Geen causaliteit claimen zonder disclaimer. Geen acties voorstellen die data in Brevo/Weeztix wijzigen.",
  );

  return lines.join("\n");
}

export async function listRecentCampaigns(limit = 24) {
  if (!hasDatabase()) return [];
  const db = getDb();
  return db
    .select()
    .from(emailCampaignMetrics)
    .orderBy(desc(emailCampaignMetrics.sentAt), desc(emailCampaignMetrics.sent))
    .limit(limit);
}
