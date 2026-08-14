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
    editionsWithSales: number;
  };
  weather: {
    days: number;
    avgFestivalScore: number | null;
    recent: Array<{
      day: string;
      score: number;
      label: string;
      tempMaxC: number | null;
      precipMm: number | null;
      reasons: string[];
    }>;
  };
  editions?: {
    lessons: Array<{ title: string; body: string; evidence: string }>;
    topArtists: Array<{ artist: string; avgSold: number; editions: number }>;
    campaignsLinked: number;
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
    weeztix: { editions: 0, inventoryRows: 0, sold: 0, editionsWithSales: 0 },
    weather: { days: 0, avgFestivalScore: null, recent: [] },
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
  const weeztixInv = inv.filter((r) => r.platform === "weeztix");
  const sold = weeztixInv.reduce((s, r) => s + (r.sold ?? 0), 0);
  const editionsWithSales = weeztixInv.filter((r) => (r.sold ?? 0) > 0).length;

  let weatherBlock: InsightsSnapshot["weather"] = {
    days: 0,
    avgFestivalScore: null,
    recent: [],
  };
  try {
    const { listWeatherDays } = await import("@/lib/weather/store");
    const { scoreFestivalWeather } = await import(
      "@/lib/weather/festival-score"
    );
    const end = new Date();
    const start = new Date();
    start.setUTCDate(end.getUTCDate() - 13);
    const days = await listWeatherDays({
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
    const recent = days.slice(-10).map((w) => {
      const scored = scoreFestivalWeather({
        day: w.day,
        tempMinC: w.tempMinC,
        tempMaxC: w.tempMaxC,
        precipMm: w.precipMm,
        windMaxMps: w.windMaxMps,
        weatherCode: w.weatherCode,
      });
      return {
        day: w.day,
        score: scored.score,
        label: scored.label,
        tempMaxC: w.tempMaxC,
        precipMm: w.precipMm,
        reasons: scored.reasons,
      };
    });
    const avg =
      recent.length > 0
        ? recent.reduce((s, d) => s + d.score, 0) / recent.length
        : null;
    weatherBlock = {
      days: days.length,
      avgFestivalScore: avg,
      recent,
    };
  } catch {
    notes.push("Weer-snapshot kon niet geladen worden.");
  }

  let editionsBlock: InsightsSnapshot["editions"];
  try {
    const { getEditionAnalysisBundle } = await import(
      "@/lib/editions/analysis"
    );
    const bundle = await getEditionAnalysisBundle({ limit: 80 });
    editionsBlock = {
      lessons: bundle.lessons.map((l) => ({
        title: l.title,
        body: l.body,
        evidence: l.evidence,
      })),
      topArtists: bundle.artistLeaderboard.slice(0, 8).map((a) => ({
        artist: a.artist,
        avgSold: a.avgSold,
        editions: a.editions,
      })),
      campaignsLinked: bundle.totals.campaignsLinked,
    };
  } catch {
    notes.push("Editie-analyse kon niet geladen worden.");
  }

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
      inventoryRows: weeztixInv.length,
      sold,
      editionsWithSales,
    },
    weather: weatherBlock,
    editions: editionsBlock,
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
    `Edities met sold>0: ${snap.weeztix.editionsWithSales}`,
    `Sold (Weeztix inventory som): ${snap.weeztix.sold}`,
    "",
    "=== Festival-weer score (1-10, outdoor comfort) ===",
    `Dagen in window: ${snap.weather.days}`,
    `Gemiddelde score: ${snap.weather.avgFestivalScore?.toFixed(1) ?? "n/a"}`,
    "Recente dagen:",
  );

  for (const d of snap.weather.recent) {
    lines.push(
      `- ${d.day} | score=${d.score}/10 (${d.label}) | max=${d.tempMaxC ?? "?"}°C precip=${d.precipMm ?? "?"}mm | ${d.reasons.join("; ")}`,
    );
  }

  if (snap.editions) {
    lines.push(
      "",
      "=== Editie-lessen ===",
      `Campagnes gekoppeld: ${snap.editions.campaignsLinked}`,
    );
    for (const l of snap.editions.lessons) {
      lines.push(`- ${l.title}: ${l.body} [${l.evidence}]`);
    }
    lines.push("", "Top artiesten (avg sold):");
    for (const a of snap.editions.topArtists) {
      lines.push(
        `- ${a.artist}: avg ${a.avgSold} over ${a.editions} edities`,
      );
    }
  }

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
