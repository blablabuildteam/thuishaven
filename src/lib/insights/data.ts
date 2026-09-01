import { desc, isNotNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  emailCampaignMetrics,
  editions,
  raListings,
  ticketInventory,
  ticketSalesDaily,
  ticketswapListings,
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
    dailyDays: number;
    dailyEditions: number;
    recentCurves: Array<{
      name: string;
      startsAt: string;
      total: number;
      peak?: { day: string; sold: number };
    }>;
  };
  ra: {
    listings: number;
    linked: number;
    soldOut: number;
    ticketsAvailable: number;
    mismatches: Array<{
      editionName: string;
      raTitle: string;
      raUrl: string | null;
      startsAt: string;
    }>;
    topAttending: Array<{ title: string; attending: number; soldOut: boolean }>;
  };
  ticketswap: {
    listings: number;
    linked: number;
    withStock: number;
    mismatches: Array<{
      editionName: string;
      availableCount: number | null;
      startsAt: string;
    }>;
  };
  weather: {
    days: number;
    avgFestivalScore: number | null;
    fromYear: number;
    coverage: { editions: number; withWeather: number };
    verdict: { title: string; body: string; evidence: string } | null;
    buckets: Array<{
      kind: string;
      label: string;
      n: number;
      avgSold: number;
      vsComfortPct: number | null;
    }>;
    extremes: Array<{
      name: string;
      day: string;
      label: string;
      summary: string;
      sold: number;
    }>;
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
    recommendations: Array<{ title: string; body: string; evidence: string }>;
    topArtists: Array<{ artist: string; avgSold: number; editions: number }>;
    campaignsLinked: number;
  };
  creatives?: {
    posts: number;
    analyzed: number;
    top: Array<{
      title: string;
      channel: string;
      offer: string | null;
      artists: string[];
      hasTextOverlay: boolean | null;
      ticketsAroundPublish: number | null;
      engagement: number;
      publishedAt: string | null;
    }>;
    aggregates: Array<{
      label: string;
      n: number;
      avgLift: number;
    }>;
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
    weeztix: {
      editions: 0,
      inventoryRows: 0,
      sold: 0,
      editionsWithSales: 0,
      dailyDays: 0,
      dailyEditions: 0,
      recentCurves: [],
    },
    ra: {
      listings: 0,
      linked: 0,
      soldOut: 0,
      ticketsAvailable: 0,
      mismatches: [],
      topAttending: [],
    },
    ticketswap: { listings: 0, linked: 0, withStock: 0, mismatches: [] },
    weather: {
      days: 0,
      avgFestivalScore: null,
      fromYear: 2025,
      coverage: { editions: 0, withWeather: 0 },
      verdict: null,
      buckets: [],
      extremes: [],
      recent: [],
    },
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

  const raRows = await db
    .select({
      title: raListings.title,
      attending: raListings.attending,
      soldOut: raListings.soldOut,
      ticketsAvailable: raListings.ticketsAvailable,
      editionId: raListings.editionId,
    })
    .from(raListings);
  const { listOpenSoldOutRaAlerts } = await import(
    "@/lib/integrations/ra/alerts"
  );
  const raMismatches = await listOpenSoldOutRaAlerts().catch(() => []);
  const raBlock = {
    listings: raRows.length,
    linked: raRows.filter((r) => r.editionId).length,
    soldOut: raRows.filter((r) => r.soldOut).length,
    ticketsAvailable: raRows.filter((r) => r.ticketsAvailable).length,
    mismatches: raMismatches.map((m) => ({
      editionName: m.editionName,
      raTitle: m.raTitle,
      raUrl: m.raUrl,
      startsAt: m.startsAt.toISOString(),
    })),
    topAttending: [...raRows]
      .sort((a, b) => (b.attending ?? 0) - (a.attending ?? 0))
      .slice(0, 5)
      .map((r) => ({
        title: r.title,
        attending: r.attending ?? 0,
        soldOut: Boolean(r.soldOut),
      })),
  };
  if (raMismatches.length > 0) {
    notes.push(
      `${raMismatches.length} editie(s) Weeztix-uitverkocht terwijl RA nog tickets verkoopt.`,
    );
  }

  const tsRows = await db
    .select({
      title: ticketswapListings.title,
      availableCount: ticketswapListings.availableCount,
      editionId: ticketswapListings.editionId,
    })
    .from(ticketswapListings);
  const { listOpenDashboardAlerts } = await import(
    "@/lib/integrations/alerts"
  );
  const dashAlerts = await listOpenDashboardAlerts().catch(() => ({
    ra: [],
    ticketswap: [],
    conflicts: [],
  }));
  const tsMismatches = dashAlerts.ticketswap;
  const tsBlock = {
    listings: tsRows.length,
    linked: tsRows.filter((r) => r.editionId).length,
    withStock: tsRows.filter((r) => (r.availableCount ?? 0) > 0).length,
    mismatches: tsMismatches.map((m) => ({
      editionName: m.editionName,
      availableCount: m.availableCount,
      startsAt: m.startsAt.toISOString(),
    })),
  };
  if (tsMismatches.length > 0) {
    notes.push(
      `${tsMismatches.length} editie(s) Weeztix-uitverkocht met TicketSwap-check (omzetlek).`,
    );
  }

  const weeztixEditions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));

  const inv = await db.select().from(ticketInventory);
  const weeztixInv = inv.filter((r) => r.platform === "weeztix");
  const sold = weeztixInv.reduce((s, r) => s + (r.sold ?? 0), 0);
  const editionsWithSales = weeztixInv.filter((r) => (r.sold ?? 0) > 0).length;

  const dailyCount = await db
    .select({
      days: sql<number>`count(*)::int`,
      editions: sql<number>`count(distinct ${ticketSalesDaily.editionId})::int`,
    })
    .from(ticketSalesDaily);

  let recentCurves: InsightsSnapshot["weeztix"]["recentCurves"] = [];
  try {
    const { recentDailyCurves } = await import(
      "@/lib/integrations/weeztix/daily"
    );
    const curves = await recentDailyCurves(3);
    recentCurves = curves.map((c) => {
      const peak = c.points.reduce<{ day: string; sold: number } | undefined>(
        (best, p) => (!best || p.sold > best.sold ? p : best),
        undefined,
      );
      return {
        name: c.name,
        startsAt: c.startsAt,
        total: c.total,
        peak,
      };
    });
  } catch {
    notes.push("Dagelijkse Weeztix-curves konden niet geladen worden.");
  }

  let weatherBlock: InsightsSnapshot["weather"] = {
    days: 0,
    avgFestivalScore: null,
    fromYear: 2025,
    coverage: { editions: 0, withWeather: 0 },
    verdict: null,
    buckets: [],
    extremes: [],
    recent: [],
  };
  try {
    const { getWeatherImpact } = await import("@/lib/weather/impact");
    const impact = await getWeatherImpact({ fromYear: 2025, sync: false });
    weatherBlock = {
      days: impact.coverage.withWeather,
      avgFestivalScore: null,
      fromYear: impact.fromYear,
      coverage: impact.coverage,
      verdict: impact.verdict,
      buckets: impact.outdoor.buckets.map((b) => ({
        kind: b.kind,
        label: b.label,
        n: b.n,
        avgSold: b.avgSold,
        vsComfortPct: b.vsComfortPct,
      })),
      extremes: impact.extremes.slice(0, 8).map((e) => ({
        name: e.headliner ?? e.name,
        day: e.day,
        label: e.weather.label,
        summary: e.weather.summary,
        sold: e.sold,
      })),
      recent: impact.extremes.slice(0, 8).map((e) => ({
        day: e.day,
        score: e.weather.score.score,
        label: e.weather.label,
        tempMaxC: e.weather.tempMaxC,
        precipMm: e.weather.precipMm,
        reasons: e.weather.score.reasons,
      })),
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
      recommendations: bundle.recommendations.map((l) => ({
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

  let creativesBlock: InsightsSnapshot["creatives"];
  try {
    const { loadMarketingPostsBundle } = await import(
      "@/lib/marketing/posts"
    );
    const creatives = await loadMarketingPostsBundle({
      limit: 16,
      withLift: true,
    });
    creativesBlock = {
      posts: creatives.posts.length,
      analyzed: creatives.analyzedCount,
      top: creatives.posts.slice(0, 10).map((p) => ({
        title: p.title || "(zonder caption)",
        channel: p.channel,
        offer: p.visualFeatures?.offer ?? null,
        artists: p.visualFeatures?.artists ?? [],
        hasTextOverlay: p.visualFeatures?.hasTextOverlay ?? null,
        ticketsAroundPublish: p.ticketLift?.sold ?? null,
        engagement: p.engagement,
        publishedAt: p.publishedAt,
      })),
      aggregates: creatives.aggregates.slice(0, 6).map((a) => ({
        label: a.label,
        n: a.measured,
        avgLift: Math.round(a.avgLift),
      })),
    };
  } catch {
    notes.push("Creatives/vision kon niet geladen worden.");
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
      dailyDays: dailyCount[0]?.days ?? 0,
      dailyEditions: dailyCount[0]?.editions ?? 0,
      recentCurves,
    },
    ra: raBlock,
    ticketswap: tsBlock,
    weather: weatherBlock,
    editions: editionsBlock,
    creatives: creativesBlock,
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
    `Dagelijkse curves: ${snap.weeztix.dailyEditions} edities · ${snap.weeztix.dailyDays} dagen (orders/dag via timeToBank, proxy)`,
    "Recente curves (piekdag):",
  );
  for (const c of snap.weeztix.recentCurves) {
    lines.push(
      `- ${c.name} | orders≈${c.total} piek=${c.peak ? `${c.peak.day} (${c.peak.sold})` : "n/a"} start=${c.startsAt.slice(0, 10)}`,
    );
  }

  lines.push(
    "",
    "=== Resident Advisor ===",
    "Doel: alert als Weeztix uitverkocht is terwijl de RA-shop nog open is.",
    `Listings: ${snap.ra.listings} · gekoppeld: ${snap.ra.linked} · titel SOLD OUT: ${snap.ra.soldOut} · RA-shop open: ${snap.ra.ticketsAvailable}`,
    `Mismatches Weeztix-uitverkocht / RA-open: ${snap.ra.mismatches.length}`,
  );
  for (const m of snap.ra.mismatches) {
    lines.push(
      `- MISMATCH ${m.editionName} | RA=${m.raTitle} | start=${m.startsAt.slice(0, 10)} | ${m.raUrl ?? ""}`,
    );
  }
  for (const r of snap.ra.topAttending) {
    lines.push(
      `- ${r.title} | attending=${r.attending}${r.soldOut ? " · SOLD OUT (titel)" : ""}`,
    );
  }

  lines.push(
    "",
    "=== TicketSwap (secundaire markt) ===",
    "Doel: alert als Weeztix (primair) uitverkocht is terwijl TicketSwap nog aanbod heeft (omzetlek).",
    `Listings: ${snap.ticketswap.listings} · gekoppeld: ${snap.ticketswap.linked} · met aanbod: ${snap.ticketswap.withStock}`,
    `Mismatches sold-out / TicketSwap: ${snap.ticketswap.mismatches.length}`,
  );
  for (const m of snap.ticketswap.mismatches) {
    lines.push(
      `- MISMATCH ${m.editionName} | available=${m.availableCount ?? "onbekend"} | start=${m.startsAt.slice(0, 10)}`,
    );
  }

  lines.push(
    "",
    `=== Festivalweer op eventdagen vanaf ${snap.weather.fromYear} ===`,
    `Edities met weer: ${snap.weather.coverage.withWeather} / ${snap.weather.coverage.editions}`,
    snap.weather.verdict
      ? `Verdict: ${snap.weather.verdict.title} — ${snap.weather.verdict.body} [${snap.weather.verdict.evidence}]`
      : "Geen verdict.",
    "Buckets (outdoor mei–sept, gem. sold vs comfortabele dagen):",
  );
  for (const b of snap.weather.buckets) {
    lines.push(
      `- ${b.label} n=${b.n} avgSold=${b.avgSold} vsComfort=${b.vsComfortPct != null ? `${b.vsComfortPct.toFixed(0)}%` : "n/a"}`,
    );
  }
  lines.push("Extreme eventdagen (koud/nat of te heet):");
  for (const d of snap.weather.extremes) {
    lines.push(
      `- ${d.day} ${d.name} | ${d.label} ${d.summary} | sold=${d.sold}`,
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
    lines.push("", "Recommendations:");
    for (const l of snap.editions.recommendations) {
      lines.push(`- ${l.title}: ${l.body} [${l.evidence}]`);
    }
    lines.push("", "Top artiesten (avg sold):");
    for (const a of snap.editions.topArtists) {
      lines.push(
        `- ${a.artist}: avg ${a.avgSold} over ${a.editions} edities`,
      );
    }
  }

  if (snap.creatives) {
    lines.push(
      "",
      "=== Creatives / social posts (visual recognition) ===",
      `Posts: ${snap.creatives.posts} · geanalyseerd: ${snap.creatives.analyzed}`,
      "ticketsAroundPublish = Weeztix-orders in ±1 kalenderdag rond publicatie (±48u met dagdata). Geen harde causaliteit.",
      "Recente posts:",
    );
    for (const p of snap.creatives.top) {
      lines.push(
        `- ${p.title} | ${p.channel} | offer=${p.offer ?? "n/a"} | artists=${p.artists.join(", ") || "n/a"} | overlay=${p.hasTextOverlay == null ? "n/a" : p.hasTextOverlay} | tickets±48u=${p.ticketsAroundPublish ?? "geen curve"} | eng=${p.engagement} | published=${p.publishedAt?.slice(0, 10) ?? "n/a"}`,
      );
    }
    if (snap.creatives.aggregates.length) {
      lines.push("Aggregates (gem. ticketlift, n≥2):");
      for (const a of snap.creatives.aggregates) {
        lines.push(`- ${a.label}: avgLift=${a.avgLift} n=${a.n}`);
      }
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
