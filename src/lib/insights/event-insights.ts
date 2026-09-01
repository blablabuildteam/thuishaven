import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  emailCampaignMetrics,
  marketingPosts,
  ticketInventory,
  ticketSaleReferrers,
  ticketSalesDaily,
  ticketDemographics,
  weatherDaily,
  externalEvents,
  raListings,
  type DemographicBucket,
} from "@/lib/db/schema";
import {
  parseEditionLineup,
  editionFormat,
  type EditionFormat,
} from "@/lib/editions/lineup";
import {
  classifyEventWeather,
  type WeatherKind,
} from "@/lib/weather/classify";
import { weatherLocationMatch } from "@/lib/weather/store";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";
import {
  amsterdamDay,
  isOutdoorSeason,
  shiftIsoDay,
} from "@/lib/time/amsterdam";
import {
  periodsForDay,
  weekdayKeyFromIso,
  type CalendarPeriod,
  type WeekdayKey,
  WEEKDAY_LABEL,
  CALENDAR_PERIOD_LABEL,
} from "@/lib/time/nl-calendar";

const STALE_HOURS = 6;

async function ensureWeeztixEvents(): Promise<void> {
  if (!hasDatabase()) return;

  const db = getDb();

  const [editionCount, lastSync] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(editions)
      .where(isNotNull(editions.weeztixEventId))
      .then((r) => Number(r[0]?.count ?? 0)),
    db
      .select({ syncedAt: ticketInventory.syncedAt })
      .from(ticketInventory)
      .where(eq(ticketInventory.platform, "weeztix"))
      .orderBy(desc(ticketInventory.syncedAt))
      .limit(1)
      .then((r) => r[0]?.syncedAt ?? null),
  ]);

  const staleMs = STALE_HOURS * 60 * 60 * 1000;
  const isStale =
    editionCount === 0 ||
    !lastSync ||
    Date.now() - lastSync.getTime() > staleMs;

  if (!isStale) return;

  try {
    const { syncWeeztixReadOnly } = await import(
      "@/lib/integrations/weeztix/sync"
    );
    await syncWeeztixReadOnly({ includeStats: true });
  } catch {
    /* non-fatal — page still renders with existing data */
  }
}

export type CompetingEvent = {
  name: string;
  venue: string | null;
  attending: number | null;
  kind: "festival" | "holiday" | "party";
  source: string;
};

export type EventInsightHeadline = {
  text: string;
  tone: "positive" | "neutral" | "caution";
};

export type EventInsightSocial = {
  postId: string;
  channel: string;
  title: string | null;
  engagement: number;
  impressions: number;
  ticketLiftSold: number | null;
  permalink: string | null;
  publishedAt: string | null;
  format: string | null;
  offer: string | null;
};

export type EventInsightMail = {
  campaignId: string;
  name: string;
  sent: number;
  opens: number;
  openRate: number | null;
  ordersAfter: number | null;
  sentAt: string | null;
};

export type SalesSourceId =
  | "weeztix"
  | "appic"
  | "wingame"
  | "resident_advisor";

export type SalesSourceRow = {
  id: SalesSourceId;
  label: string;
  sold: number | null;
  available: number | null;
  /** live | shell | empty */
  status: "live" | "shell" | "empty";
  note?: string;
};

export type EventInsightDemographics = {
  gender: DemographicBucket[];
  age: DemographicBucket[];
  city: DemographicBucket[];
  answered: number;
  total: number;
  coveragePct: number | null;
  ageReady: boolean;
  /** Aantal tickets waarvan we een leeftijdsbucket konden afleiden (API top-N). */
  ageSampleSize: number;
};

export type EventInsight = {
  editionId: string;
  name: string;
  day: string;
  startsAt: string;
  headliner: string | null;
  artists: string[];
  kind: string;
  format: EditionFormat;
  weekday: WeekdayKey;
  weekdayLabel: string;
  periods: CalendarPeriod[];
  periodLabels: string[];
  isOutdoor: boolean;
  status: "upcoming" | "past";

  headlines: EventInsightHeadline[];

  tickets: {
    sold: number;
    capacity: number | null;
    fillPct: number | null;
    avgPriceEur: number | null;
    lastWeekSold: number | null;
    soldOutDaysBefore: number | null;
    scanned: number;
    scanRatePct: number | null;
    sources: SalesSourceRow[];
  };

  weather: {
    label: string;
    kind: WeatherKind;
    summary: string;
    sky: string;
    tempMaxC: number | null;
    tempMinC: number | null;
    precipMm: number | null;
    tone: "positive" | "neutral" | "caution";
  } | null;

  demographics: EventInsightDemographics | null;

  socialPosts: EventInsightSocial[];
  emailCampaigns: EventInsightMail[];
  referrers: Array<{ channel: string; orders: number }>;
  competingFestivals: CompetingEvent[];
};

function weatherTone(kind: WeatherKind): "positive" | "neutral" | "caution" {
  if (kind === "ideal") return "positive";
  if (kind === "ok") return "neutral";
  return "caution";
}

function buildHeadlines(e: EventInsight): EventInsightHeadline[] {
  const out: EventInsightHeadline[] = [];
  const {
    tickets,
    weather,
    socialPosts,
    emailCampaigns,
    referrers,
    competingFestivals,
    demographics,
  } = e;

  if (tickets.fillPct != null) {
    const tone =
      tickets.fillPct >= 85
        ? "positive"
        : tickets.fillPct >= 50
          ? "neutral"
          : "caution";
    const fill = `${Math.round(tickets.fillPct)}% bezetting`;
    const extra =
      tickets.soldOutDaysBefore != null
        ? ` · uitverkocht ${tickets.soldOutDaysBefore}d vóór start`
        : tickets.lastWeekSold
          ? ` · +${tickets.lastWeekSold} laatste week`
          : "";
    out.push({ text: `${fill}${extra}`, tone });
  } else if (tickets.sold > 0) {
    out.push({
      text: `${tickets.sold.toLocaleString("nl-NL")} tickets sold`,
      tone: "neutral",
    });
  }

  if (tickets.scanned > 0 && tickets.scanRatePct != null) {
    out.push({
      text: `${Math.round(tickets.scanRatePct)}% gescand (${tickets.scanned.toLocaleString("nl-NL")})`,
      tone: tickets.scanRatePct >= 70 ? "positive" : "neutral",
    });
  }

  const measured = socialPosts.filter(
    (p) => p.ticketLiftSold != null && p.ticketLiftSold > 0,
  );
  if (measured.length > 0) {
    const totalLift = measured.reduce(
      (s, p) => s + (p.ticketLiftSold ?? 0),
      0,
    );
    const channels = [...new Set(measured.map((p) => p.channel))];
    out.push({
      text: `${measured.length} social post${measured.length > 1 ? "s" : ""} (${channels.join(", ")}) +${totalLift.toLocaleString("nl-NL")} tickets ±48u`,
      tone: totalLift > 50 ? "positive" : "neutral",
    });
  } else if (socialPosts.length > 0) {
    const channels = [...new Set(socialPosts.map((p) => p.channel))];
    out.push({
      text: `${socialPosts.length} social post${socialPosts.length > 1 ? "s" : ""} (${channels.join(", ")})`,
      tone: "neutral",
    });
  }

  const mailsWithOrders = emailCampaigns.filter(
    (m) => (m.ordersAfter ?? 0) > 0,
  );
  if (mailsWithOrders.length > 0) {
    const totalOrders = mailsWithOrders.reduce(
      (s, m) => s + (m.ordersAfter ?? 0),
      0,
    );
    out.push({
      text: `${mailsWithOrders.length} mail${mailsWithOrders.length > 1 ? "s" : ""} → ~${totalOrders} orders week ná`,
      tone: totalOrders > 30 ? "positive" : "neutral",
    });
  } else if (emailCampaigns.length > 0) {
    const totalSent = emailCampaigns.reduce((s, m) => s + m.sent, 0);
    out.push({
      text: `${emailCampaigns.length} mail${emailCampaigns.length > 1 ? "s" : ""} gekoppeld${totalSent > 0 ? ` · ${totalSent.toLocaleString("nl-NL")} sent` : ""}`,
      tone: "neutral",
    });
  }

  const brevoRef = referrers.find((r) => r.channel === "brevo");
  if (brevoRef && brevoRef.orders > 0) {
    out.push({
      text: `${brevoRef.orders} orders via Brevo-klik`,
      tone: "positive",
    });
  }

  if (weather) {
    out.push({
      text: `Weer: ${weather.label}${weather.tempMaxC != null ? ` (${Math.round(weather.tempMaxC)}°C)` : ""}`,
      tone: weather.tone,
    });
  }

  if (demographics && demographics.coveragePct != null) {
    out.push({
      text: `Demografie ${Math.round(demographics.coveragePct)}% ingevuld`,
      tone: demographics.coveragePct >= 50 ? "neutral" : "caution",
    });
  }

  if (competingFestivals.length > 0) {
    out.push({
      text: `${competingFestivals.length} concurrent${competingFestivals.length > 1 ? "en" : ""}: ${competingFestivals
        .slice(0, 2)
        .map((c) => c.name)
        .join(", ")}`,
      tone: "caution",
    });
  }

  return out;
}

const AFTER_DAYS = 7;

function sumAfterWindow(
  byDay: Map<string, number>,
  sendDay: string,
): { sold: number; days: number } {
  const end = shiftIsoDay(sendDay, AFTER_DAYS - 1);
  let sold = 0;
  let days = 0;
  for (const [day, n] of byDay) {
    if (day >= sendDay && day <= end) {
      sold += n;
      days += 1;
    }
  }
  return { sold, days };
}

export const loadEventInsights = cache(
  async (options?: { limit?: number }): Promise<EventInsight[]> => {
    if (!hasDatabase()) return [];

    // Sync Weeztix events als ze stale zijn of ontbreken
    await ensureWeeztixEvents();

    // Vul ontbrekende weerdagen (incl. forecast voor aankomende events)
    try {
      const { ensureEditionWeather } = await import("@/lib/weather/store");
      await ensureEditionWeather({ fromYear: 2025, forecastDays: 16 });
    } catch {
      /* non-fatal */
    }

    const db = getDb();
    const limit = options?.limit ?? 120;
    const today = amsterdamDay(new Date());

    const eds = await db
      .select({
        id: editions.id,
        name: editions.name,
        startsAt: editions.startsAt,
        sold: ticketInventory.sold,
        capacity: ticketInventory.capacity,
        available: ticketInventory.available,
        avgPriceEur: ticketInventory.avgPriceEur,
        soldOutDaysBefore: ticketInventory.soldOutDaysBefore,
        scanned: ticketInventory.scanned,
      })
      .from(editions)
      .leftJoin(
        ticketInventory,
        and(
          eq(ticketInventory.editionId, editions.id),
          eq(ticketInventory.platform, "weeztix"),
        ),
      )
      .where(isNotNull(editions.weeztixEventId))
      .orderBy(desc(editions.startsAt))
      .limit(limit);

    const filtered = eds.filter((e) => !/TEMPLATE/i.test(e.name));
    if (!filtered.length) return [];

    const minDay = filtered[filtered.length - 1]!.startsAt;
    const maxDay = filtered[0]!.startsAt;

    const [weatherRows, camps, festivals, dailyRows, posts, refs, appicRows, raRows, demoRows] =
      await Promise.all([
        db
          .select()
          .from(weatherDaily)
          .where(
            and(
              weatherLocationMatch(),
              gte(weatherDaily.day, minDay),
              lte(weatherDaily.day, maxDay),
            ),
          ),
        db
          .select()
          .from(emailCampaignMetrics)
          .where(isNotNull(emailCampaignMetrics.editionId)),
        db.select().from(externalEvents),
        db
          .select({
            editionId: ticketSalesDaily.editionId,
            day: ticketSalesDaily.day,
            sold: ticketSalesDaily.sold,
          })
          .from(ticketSalesDaily)
          .where(eq(ticketSalesDaily.platform, "weeztix")),
        db
          .select()
          .from(marketingPosts)
          .where(isNotNull(marketingPosts.editionId))
          .orderBy(desc(marketingPosts.publishedAt)),
        db
          .select()
          .from(ticketSaleReferrers)
          .where(eq(ticketSaleReferrers.platform, "weeztix")),
        db
          .select({
            editionId: ticketInventory.editionId,
            sold: ticketInventory.sold,
            available: ticketInventory.available,
          })
          .from(ticketInventory)
          .where(eq(ticketInventory.platform, "appic")),
        db
          .select({
            editionId: raListings.editionId,
            attending: raListings.attending,
            ticketsAvailable: raListings.ticketsAvailable,
            soldOut: raListings.soldOut,
          })
          .from(raListings)
          .where(isNotNull(raListings.editionId)),
        db
          .select()
          .from(ticketDemographics)
          .where(eq(ticketDemographics.platform, "weeztix")),
      ]);

    const weatherByDay = new Map(
      weatherRows.map((w) => [amsterdamDay(w.day), w]),
    );

    const campsByEdition = new Map<string, typeof camps>();
    for (const c of camps) {
      if (!c.editionId) continue;
      const list = campsByEdition.get(c.editionId) ?? [];
      list.push(c);
      campsByEdition.set(c.editionId, list);
    }

    const postsByEdition = new Map<string, (typeof posts)>();
    for (const p of posts) {
      if (!p.editionId) continue;
      const list = postsByEdition.get(p.editionId) ?? [];
      list.push(p);
      postsByEdition.set(p.editionId, list);
    }

    const dailyByEdition = new Map<string, Map<string, number>>();
    for (const r of dailyRows) {
      const day =
        typeof r.day === "string"
          ? r.day.slice(0, 10)
          : amsterdamDay(r.day);
      let m = dailyByEdition.get(r.editionId);
      if (!m) {
        m = new Map();
        dailyByEdition.set(r.editionId, m);
      }
      m.set(day, (m.get(day) ?? 0) + (r.sold ?? 0));
    }

    const refsByEdition = new Map<string, Array<{ channel: string; orders: number }>>();
    for (const r of refs) {
      const list = refsByEdition.get(r.editionId) ?? [];
      const existing = list.find((x) => x.channel === r.channel);
      if (existing) {
        existing.orders += r.orderCount;
      } else {
        list.push({ channel: r.channel, orders: r.orderCount });
      }
      refsByEdition.set(r.editionId, list);
    }

    const appicByEdition = new Map(
      appicRows.map((r) => [r.editionId, r]),
    );
    const raByEdition = new Map(
      raRows
        .filter((r): r is typeof r & { editionId: string } => r.editionId != null)
        .map((r) => [r.editionId, r]),
    );
    const demoByEdition = new Map(
      demoRows.map((r) => [r.editionId, r]),
    );

    function overlapsDay(dayIso: string, start: Date, end: Date | null): boolean {
      const t = new Date(`${dayIso}T12:00:00`).getTime();
      const s = start.getTime();
      const e = end ? end.getTime() : s + 86400000;
      return t >= s && t <= e;
    }

    const insights: EventInsight[] = filtered.map((e) => {
      const day = amsterdamDay(e.startsAt);
      const lineup = parseEditionLineup(e.name);
      const format = editionFormat(e.name, lineup.kind, lineup.isNachtshow);
      const weekday = weekdayKeyFromIso(day);
      const periods = periodsForDay(day);
      const outdoor = isOutdoorSeason(day);
      const status = day >= today ? "upcoming" : "past";

      const inv = normalizeWeeztixInventory({
        sold: e.sold,
        capacity: e.capacity,
        available: e.available,
      });
      const sold = inv.sold;
      const capacity = inv.capacity;
      const fillPct =
        capacity != null && capacity > 0 ? (sold / capacity) * 100 : null;
      const avgPriceEur =
        e.avgPriceEur != null ? Number(e.avgPriceEur) : null;
      const scanned = e.scanned ?? 0;
      const scanRatePct = sold > 0 ? (scanned / sold) * 100 : null;

      const appic = appicByEdition.get(e.id);
      const ra = raByEdition.get(e.id);
      const sources: SalesSourceRow[] = [
        {
          id: "weeztix",
          label: "Weeztix",
          sold,
          available: inv.available,
          status: "live",
        },
        {
          id: "appic",
          label: "Appic",
          sold: appic ? (appic.sold ?? 0) : null,
          available: appic ? (appic.available ?? 0) : null,
          status: appic ? "live" : "shell",
          note: appic ? undefined : "API nog niet gekoppeld",
        },
        {
          id: "wingame",
          label: "Wingame Appic",
          sold: null,
          available: null,
          status: "shell",
          note: "Nog geen integratie",
        },
        {
          id: "resident_advisor",
          label: "Resident Advisor",
          sold: ra ? (ra.attending ?? 0) : null,
          available: ra
            ? ra.soldOut
              ? 0
              : ra.ticketsAvailable
                ? null
                : 0
            : null,
          status: ra ? "live" : "empty",
          note: ra
            ? "RA ‘attending’ (geen harde sold)"
            : "Geen RA-listing gekoppeld",
        },
      ];

      const windowStart = shiftIsoDay(day, -6);
      const curve = dailyByEdition.get(e.id) ?? new Map();
      let lastWeekSold = 0;
      for (const [d, n] of curve) {
        if (d >= windowStart && d <= day) lastWeekSold += n;
      }

      const w = weatherByDay.get(day);
      let weather: EventInsight["weather"] = null;
      if (w) {
        const classified = classifyEventWeather({
          day,
          tempMinC: w.tempMinC != null ? Number(w.tempMinC) : null,
          tempMaxC: w.tempMaxC != null ? Number(w.tempMaxC) : null,
          precipMm: w.precipMm != null ? Number(w.precipMm) : null,
          windMaxMps: w.windMaxMps != null ? Number(w.windMaxMps) : null,
          weatherCode: w.weatherCode,
        });
        weather = {
          label: classified.label,
          kind: classified.kind,
          summary: classified.summary,
          sky: classified.sky,
          tempMaxC: classified.tempMaxC,
          tempMinC: classified.tempMinC,
          precipMm: classified.precipMm,
          tone: weatherTone(classified.kind),
        };
      }

      const demoRow = demoByEdition.get(e.id);
      let demographics: EventInsightDemographics | null = null;
      if (demoRow) {
        const answered = demoRow.answered ?? 0;
        const total = demoRow.total ?? 0;
        const ageKnown = (demoRow.age ?? [])
          .filter((r) => r.key !== "onbekend")
          .reduce((s, r) => s + r.count, 0);
        demographics = {
          gender: demoRow.gender ?? [],
          age: demoRow.age ?? [],
          city: demoRow.city ?? [],
          answered,
          total,
          coveragePct: total > 0 ? (answered / total) * 100 : null,
          /** Weeztix statistics geeft DOB als top-N keys (niet alle geboortedata). */
          ageReady: ageKnown > 0,
          ageSampleSize: ageKnown,
        };
      }

      const edPosts = postsByEdition.get(e.id) ?? [];
      const socialPosts: EventInsightSocial[] = edPosts.map((p) => ({
        postId: p.id,
        channel: p.channel,
        title: p.title,
        engagement: p.engagement ?? 0,
        impressions: p.impressions ?? 0,
        ticketLiftSold: null,
        permalink: p.permalink,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        format: p.visualFeatures?.format ?? null,
        offer: p.visualFeatures?.offer ?? null,
      }));

      const linked = campsByEdition.get(e.id) ?? [];
      const emailCampaigns: EventInsightMail[] = linked.map((c) => {
        const sent = c.sent ?? 0;
        const opens = c.opens ?? 0;
        const sendDay = c.sentAt ? amsterdamDay(c.sentAt) : null;
        const after =
          sendDay ? sumAfterWindow(curve, sendDay) : { sold: 0, days: 0 };
        return {
          campaignId: c.id,
          name: c.name,
          sent,
          opens,
          openRate: sent > 0 ? (opens / sent) * 100 : null,
          ordersAfter: after.days > 0 ? after.sold : null,
          sentAt: c.sentAt?.toISOString() ?? null,
        };
      });

      const referrers = (refsByEdition.get(e.id) ?? []).sort(
        (a, b) => b.orders - a.orders,
      );

      const competing = festivals
        .filter((f) => overlapsDay(day, f.startsAt, f.endsAt))
        .map((f): CompetingEvent => {
          const attendingMatch = /^attending:(\d+)/.exec(f.impactNote ?? "");
          const attending = attendingMatch
            ? Number(attendingMatch[1])
            : null;
          const venue =
            f.region &&
            f.region !== "Amsterdam" &&
            f.region !== "Nederland"
              ? f.region
              : null;
          return {
            name: f.name,
            venue,
            attending,
            kind:
              f.type === "festival"
                ? "festival"
                : f.type === "holiday"
                  ? "holiday"
                  : "party",
            source: f.source,
          };
        })
        .sort((a, b) => {
          const rank = (k: CompetingEvent["kind"]) =>
            k === "holiday" ? 0 : k === "festival" ? 1 : 2;
          const r = rank(a.kind) - rank(b.kind);
          if (r !== 0) return r;
          return (b.attending ?? 0) - (a.attending ?? 0);
        })
        .slice(0, 10);

      const insight: EventInsight = {
        editionId: e.id,
        name: e.name,
        day,
        startsAt: e.startsAt.toISOString(),
        headliner: lineup.headliner ?? lineup.artists[0] ?? null,
        artists: lineup.artists,
        kind: lineup.kind,
        format,
        weekday,
        weekdayLabel: WEEKDAY_LABEL[weekday],
        periods,
        periodLabels: periods.map((p) => CALENDAR_PERIOD_LABEL[p]),
        isOutdoor: outdoor,
        status,
        headlines: [],
        tickets: {
          sold,
          capacity,
          fillPct,
          avgPriceEur:
            avgPriceEur != null && Number.isFinite(avgPriceEur)
              ? avgPriceEur
              : null,
          lastWeekSold: lastWeekSold > 0 ? lastWeekSold : null,
          soldOutDaysBefore: e.soldOutDaysBefore ?? null,
          scanned,
          scanRatePct,
          sources,
        },
        weather,
        demographics,
        socialPosts,
        emailCampaigns,
        referrers,
        competingFestivals: competing,
      };

      insight.headlines = buildHeadlines(insight);
      return insight;
    });

    // Ticket lift for linked social posts (batch)
    const postsNeedingLift = insights.flatMap((e) =>
      e.socialPosts.map((p) => ({
        id: p.postId,
        publishedAt: p.publishedAt,
        editionId: e.editionId,
      })),
    );
    if (postsNeedingLift.length > 0) {
      try {
        const { ticketLiftByPostIds } = await import(
          "@/lib/marketing/ticket-lift"
        );
        const lifts = await ticketLiftByPostIds(postsNeedingLift);
        for (const event of insights) {
          for (const post of event.socialPosts) {
            const lift = lifts.get(post.postId);
            if (lift?.signal === "measured") {
              post.ticketLiftSold = lift.sold;
            }
          }
          event.headlines = buildHeadlines(event);
        }
      } catch {
        /* non-fatal — lifts stay null */
      }
    }

    return insights;
  },
);
