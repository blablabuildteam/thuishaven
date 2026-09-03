import { and, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { unstable_cache, revalidateTag } from "next/cache";
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
  competeSizeFromAttending,
  competitionLevelLabel,
  genreLabel,
  isElectronicUmbrella,
  parseRaImpactNote,
  summarizeCompetition,
  type CompeteSize,
  type CompetitionLevel,
} from "@/lib/integrations/ra/genres";
import {
  amsterdamDay,
  isOutdoorSeason,
  shiftIsoDay,
} from "@/lib/time/amsterdam";
import {
  classifySalesImpactRole,
  salesLiftWindow,
} from "@/lib/marketing/sales-impact";
import {
  periodsForDay,
  weekdayKeyFromIso,
  type CalendarPeriod,
  type WeekdayKey,
  WEEKDAY_LABEL,
  CALENDAR_PERIOD_LABEL,
} from "@/lib/time/nl-calendar";

/** How often we re-check Weeztix for *new* events (background, non-blocking). */
const EVENT_LIST_STALE_MS = 6 * 60 * 60 * 1000;

/** Process-local throttle so warm instances don't re-hit Weeztix every request. */
let lastEventListEnsureAt = 0;
let eventListEnsureInFlight: Promise<void> | null = null;

/** Bootstrap RA competitors if the DB has none yet (cron owns ongoing refresh). */
let lastRaEnsureAt = 0;
let raEnsureInFlight: Promise<void> | null = null;

/**
 * Keep editions in sync without blocking Insights.
 * - Empty DB → await full sync (only way to leave empty state).
 * - Otherwise → fire-and-forget events-list refresh (cron still owns stats).
 */
async function ensureWeeztixEvents(): Promise<void> {
  if (!hasDatabase()) return;

  try {
    const db = getDb();
    const editionCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(editions)
      .where(isNotNull(editions.weeztixEventId))
      .then((r) => Number(r[0]?.count ?? 0));

    const empty = editionCount === 0;
    const listStale = Date.now() - lastEventListEnsureAt > EVENT_LIST_STALE_MS;

    if (empty) {
      const { syncWeeztixReadOnly } = await import(
        "@/lib/integrations/weeztix/sync"
      );
      await syncWeeztixReadOnly({ includeStats: true });
      lastEventListEnsureAt = Date.now();
      return;
    }

    if (!listStale || eventListEnsureInFlight) return;

    // Non-blocking: do not use next/after here (breaks inside react.cache).
    eventListEnsureInFlight = (async () => {
      try {
        const { syncWeeztixReadOnly } = await import(
          "@/lib/integrations/weeztix/sync"
        );
        await syncWeeztixReadOnly({ includeStats: false });
        lastEventListEnsureAt = Date.now();
      } catch (err) {
        console.error("[ensureWeeztixEvents] background list sync", err);
      } finally {
        eventListEnsureInFlight = null;
      }
    })();
  } catch (err) {
    console.error("[ensureWeeztixEvents]", err);
  }
}

/**
 * If competition table has no RA rows yet, kick off one background sync.
 * Ongoing refresh is owned by /api/cron/ra — this only avoids an empty first visit.
 */
async function ensureRaCompetition(): Promise<void> {
  if (!hasDatabase()) return;
  if (raEnsureInFlight) return;
  if (Date.now() - lastRaEnsureAt < 60 * 60 * 1000) return;

  try {
    const db = getDb();
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(externalEvents)
      .where(eq(externalEvents.source, "resident_advisor"))
      .then((r) => Number(r[0]?.count ?? 0));
    if (count > 0) {
      lastRaEnsureAt = Date.now();
      return;
    }

    raEnsureInFlight = (async () => {
      try {
        const { syncResidentAdvisorReadOnly } = await import(
          "@/lib/integrations/ra/sync"
        );
        await syncResidentAdvisorReadOnly();
        lastRaEnsureAt = Date.now();
      } catch (err) {
        console.error("[ensureRaCompetition] background sync", err);
      } finally {
        raEnsureInFlight = null;
      }
    })();
  } catch (err) {
    console.error("[ensureRaCompetition]", err);
  }
}

async function safeQuery<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[loadEventInsights] ${label}`, err);
    return fallback;
  }
}

export type CompetingEvent = {
  name: string;
  venue: string | null;
  /** RA interest count — used for sorting / size band only, not shown raw. */
  attending: number | null;
  /** Relative size band (from RA attending). */
  size: CompeteSize | null;
  /** RA genre tags (electronic umbrella); null/empty when unknown. */
  genres: string[];
  /** Short display label, e.g. "House · Techno". */
  genreLabel: string | null;
  kind: "festival" | "holiday" | "party";
  source: string;
};

export type EventInsightHeadline = {
  text: string;
  tone: "positive" | "neutral" | "caution" | "cold";
  kind:
    | "tickets"
    | "scan"
    | "social"
    | "mail"
    | "weather"
    | "demo"
    | "compete"
    | "referrer";
  /** Short explanation shown as title/tooltip on the closed-row chip. */
  hint?: string;
  /** For compete chips — drives the bar visual. */
  competeLevel?: CompetitionLevel;
};

export type EventInsightSocial = {
  postId: string;
  channel: string;
  title: string | null;
  engagement: number;
  impressions: number;
  ticketLiftSold: number | null;
  /** promo | same_day | after — aftermovies never get ticket lift. */
  salesImpactRole: "promo" | "same_day" | "after";
  /** ±48u | eventdag | n.v.t. */
  liftWindowLabel: string;
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
  /** Where lineup names come from. */
  artistsSource: "resident_advisor" | "edition_name" | "none";
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
  /** Overall same-day competition pressure (from listed competitors). */
  competitionLevel: CompetitionLevel | null;
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
    socialPosts,
    emailCampaigns,
    referrers,
    competingFestivals,
    competitionLevel,
  } = e;

  if (tickets.fillPct != null) {
    const fillPct = Math.round(tickets.fillPct);
    const tone =
      fillPct >= 85 ? "positive" : fillPct >= 50 ? "neutral" : "caution";
    const soldOut =
      fillPct >= 98 ||
      (tickets.capacity != null &&
        tickets.capacity > 0 &&
        tickets.sold >= tickets.capacity);

    let text = `${fillPct}% bezetting`;
    let hint =
      "Verkochte tickets t.o.v. capaciteit (Weeztix).";

    if (soldOut) {
      if (tickets.soldOutDaysBefore != null && tickets.soldOutDaysBefore > 0) {
        text += ` · uitverkocht ${tickets.soldOutDaysBefore}d vóór`;
        hint +=
          " Uitverkocht X dagen vóór start (geschat op basis van Weeztix-voorraad).";
      } else if (tickets.soldOutDaysBefore === 0) {
        text += " · uitverkocht op de dag";
        hint += " Uitverkocht op de eventdag zelf.";
      } else {
        text += " · uitverkocht";
        hint += " Event is uitverkocht.";
      }
    } else {
      text += " · niet uitverkocht";
      hint += " Nog niet uitverkocht.";
    }

    out.push({
      text,
      tone: soldOut ? "positive" : tone,
      kind: "tickets",
      hint,
    });

    if (tickets.lastWeekSold != null && tickets.lastWeekSold > 0) {
      out.push({
        text: `+${tickets.lastWeekSold.toLocaleString("nl-NL")} in laatste 7 dagen`,
        tone: tickets.lastWeekSold > 200 ? "positive" : "neutral",
        kind: "tickets",
        hint: "Aantal Weeztix-tickets verkocht in de 7 dagen tot en met de eventdag.",
      });
    }
  } else if (tickets.sold > 0) {
    out.push({
      text: `${tickets.sold.toLocaleString("nl-NL")} tickets`,
      tone: "neutral",
      kind: "tickets",
      hint: "Verkochte tickets (geen capaciteit bekend).",
    });
  }

  if (tickets.scanned > 0 && tickets.scanRatePct != null) {
    out.push({
      text: `${Math.round(tickets.scanRatePct)}% gescand`,
      tone: tickets.scanRatePct >= 70 ? "positive" : "neutral",
      kind: "scan",
      hint: `Check-ins: ${tickets.scanned.toLocaleString("nl-NL")} van ${tickets.sold.toLocaleString("nl-NL")} verkochte tickets.`,
    });
  }

  const promoOrSameDay = socialPosts.filter(
    (p) => p.salesImpactRole === "promo" || p.salesImpactRole === "same_day",
  );
  const measured = promoOrSameDay.filter(
    (p) => p.ticketLiftSold != null && p.ticketLiftSold > 0,
  );
  if (measured.length > 0) {
    const totalLift = measured.reduce(
      (s, p) => s + (p.ticketLiftSold ?? 0),
      0,
    );
    const channels = [...new Set(measured.map((p) => p.channel))];
    const promoCount = socialPosts.filter(
      (p) => p.salesImpactRole === "promo",
    ).length;
    out.push({
      text: `${promoCount} promo · +${totalLift.toLocaleString("nl-NL")} tickets`,
      tone: totalLift > 50 ? "positive" : "neutral",
      kind: "social",
      hint: `Organische promo/eventdag-posts (${channels.join(", ")}). Lift = Weeztix-verkopen in het role-window (correlatie). Aftermovies uitgesloten.`,
    });
  } else if (promoOrSameDay.length > 0) {
    const channels = [...new Set(promoOrSameDay.map((p) => p.channel))];
    out.push({
      text: `${promoOrSameDay.length} promo (${channels.join(", ")})`,
      tone: "neutral",
      kind: "social",
      hint: "Organische promo-posts gekoppeld; nog geen meetbare ticketlift.",
    });
  } else if (socialPosts.length > 0) {
    out.push({
      text: `${socialPosts.length} organic (geen promo)`,
      tone: "neutral",
      kind: "social",
      hint: "Alleen aftermovies / posts ná het event — geen sales-impact.",
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
      text: `${mailsWithOrders.length} mail · ~${totalOrders} orders`,
      tone: totalOrders > 30 ? "positive" : "neutral",
      kind: "mail",
      hint: "Orders in de week ná mailverzending (correlatie, geen harde attributie).",
    });
  } else if (emailCampaigns.length > 0) {
    out.push({
      text: `${emailCampaigns.length} mail gekoppeld`,
      tone: "neutral",
      kind: "mail",
      hint: "Brevo-campagnes gekoppeld aan dit event.",
    });
  }

  const brevoRef = referrers.find((r) => r.channel === "brevo");
  if (brevoRef && brevoRef.orders > 0) {
    out.push({
      text: `${brevoRef.orders} via Brevo-klik`,
      tone: "positive",
      kind: "referrer",
      hint: "Orders met Brevo/mail als HTTP-referrer in Weeztix.",
    });
  }

  if (competitionLevel) {
    const tone =
      competitionLevel === "high"
        ? "caution"
        : competitionLevel === "medium"
          ? "neutral"
          : "positive";
    out.push({
      text: competitionLevelLabel(competitionLevel),
      tone,
      kind: "compete",
      competeLevel: competitionLevel,
      hint:
        competingFestivals.length > 0
          ? `Zelfde dag in Amsterdam: ${competingFestivals
              .slice(0, 3)
              .map((c) => c.name)
              .join(", ")}${competingFestivals.length > 3 ? "…" : ""}`
          : "Geen noemenswaardige RA-concurrenten op deze dag.",
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

export async function loadEventInsightsFresh(options?: {
  limit?: number;
  /** Skip Weeztix ensure (used after an explicit recovery sync). */
  skipEnsure?: boolean;
  /** Skip Open-Meteo fill (safe for past events — weather is historical). */
  skipWeather?: boolean;
  /** Only return upcoming or past relative to asOfDay. */
  mode?: "all" | "upcoming" | "past";
  /** YYYY-MM-DD; defaults to today (Amsterdam). Baked into cache keys. */
  asOfDay?: string;
}): Promise<EventInsight[]> {
  if (!hasDatabase()) return [];

  if (!options?.skipEnsure) {
    await ensureWeeztixEvents();
  }

  if (!options?.skipWeather) {
    try {
      const { ensureEditionWeather } = await import("@/lib/weather/store");
      await ensureEditionWeather({ fromYear: 2025, forecastDays: 16 });
    } catch {
      /* non-fatal */
    }
  }

  const db = getDb();
  const limit = options?.limit ?? 120;
  const today = options?.asOfDay ?? amsterdamDay(new Date());
  const mode = options?.mode ?? "all";
  const dayBoundary = new Date(`${today}T00:00:00+02:00`);

  const statusFilter =
    mode === "upcoming"
      ? gte(editions.startsAt, dayBoundary)
      : mode === "past"
        ? lt(editions.startsAt, dayBoundary)
        : undefined;

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
    .where(
      statusFilter
        ? and(isNotNull(editions.weeztixEventId), statusFilter)
        : isNotNull(editions.weeztixEventId),
    )
    .orderBy(desc(editions.startsAt))
    .limit(limit);

  const filtered = eds.filter((e) => !/TEMPLATE/i.test(e.name));
  if (!filtered.length) return [];

  const editionIds = filtered.map((e) => e.id);
  const minDay = filtered[filtered.length - 1]!.startsAt;
  const maxDay = filtered[0]!.startsAt;

  const [weatherRows, camps, festivals, dailyRows, posts, refs, appicRows, raRows, demoRows] =
    await Promise.all([
      safeQuery(
        "weather",
        () =>
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
        [],
      ),
      safeQuery(
        "campaigns",
        () =>
          db
            .select()
            .from(emailCampaignMetrics)
            .where(
              and(
                isNotNull(emailCampaignMetrics.editionId),
                inArray(emailCampaignMetrics.editionId, editionIds),
              ),
            ),
        [],
      ),
      safeQuery(
        "externalEvents",
        () => db.select().from(externalEvents),
        [],
      ),
      safeQuery(
        "ticketSalesDaily",
        () =>
          db
            .select({
              editionId: ticketSalesDaily.editionId,
              day: ticketSalesDaily.day,
              sold: ticketSalesDaily.sold,
            })
            .from(ticketSalesDaily)
            .where(
              and(
                eq(ticketSalesDaily.platform, "weeztix"),
                inArray(ticketSalesDaily.editionId, editionIds),
              ),
            ),
        [],
      ),
      safeQuery(
        "marketingPosts",
        () =>
          db
            .select()
            .from(marketingPosts)
            .where(inArray(marketingPosts.editionId, editionIds))
            .orderBy(desc(marketingPosts.publishedAt)),
        [],
      ),
      safeQuery(
        "referrers",
        () =>
          db
            .select()
            .from(ticketSaleReferrers)
            .where(
              and(
                eq(ticketSaleReferrers.platform, "weeztix"),
                inArray(ticketSaleReferrers.editionId, editionIds),
              ),
            ),
        [],
      ),
      safeQuery(
        "appic",
        () =>
          db
            .select({
              editionId: ticketInventory.editionId,
              sold: ticketInventory.sold,
              available: ticketInventory.available,
            })
            .from(ticketInventory)
            .where(
              and(
                eq(ticketInventory.platform, "appic"),
                inArray(ticketInventory.editionId, editionIds),
              ),
            ),
        [],
      ),
      safeQuery(
        "raListings",
        () =>
          db
            .select({
              editionId: raListings.editionId,
              attending: raListings.attending,
              ticketsAvailable: raListings.ticketsAvailable,
              soldOut: raListings.soldOut,
              artists: raListings.artists,
            })
            .from(raListings)
            .where(inArray(raListings.editionId, editionIds)),
        [],
      ),
      safeQuery(
        "demographics",
        () =>
          db
            .select()
            .from(ticketDemographics)
            .where(
              and(
                eq(ticketDemographics.platform, "weeztix"),
                inArray(ticketDemographics.editionId, editionIds),
              ),
            ),
        [],
      ),
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
      const day = dayIso.slice(0, 10);
      const startDay = amsterdamDay(start);
      if (!end) return day === startDay;
      const endDay = amsterdamDay(end);
      return day >= startDay && day <= endDay;
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
      const socialPosts: EventInsightSocial[] = edPosts
        .map((p) => {
          const text = [p.title, p.caption, p.visualFeatures?.offer]
            .filter(Boolean)
            .join(" ");
          const role = classifySalesImpactRole({
            publishedAt: p.publishedAt,
            eventStartsAt: e.startsAt,
            offer: p.visualFeatures?.offer,
            text,
          });
          const window = salesLiftWindow({
            role,
            publishedAt: p.publishedAt,
          });
          return {
            postId: p.id,
            channel: p.channel,
            title: p.title,
            engagement: p.engagement ?? 0,
            impressions: p.impressions ?? 0,
            ticketLiftSold: null,
            salesImpactRole: role,
            liftWindowLabel: window?.label ?? "n.v.t.",
            permalink: p.permalink,
            publishedAt: p.publishedAt?.toISOString() ?? null,
            format: p.visualFeatures?.format ?? null,
            offer: p.visualFeatures?.offer ?? null,
          };
        })
        .sort((a, b) => {
          const rank = (r: EventInsightSocial["salesImpactRole"]) =>
            r === "promo" ? 0 : r === "same_day" ? 1 : 2;
          const rr = rank(a.salesImpactRole) - rank(b.salesImpactRole);
          if (rr !== 0) return rr;
          return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
        });

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
        .map((f): CompetingEvent | null => {
          const meta = parseRaImpactNote(f.impactNote);
          const genres = meta.genres;
          // RA parties: drop clear non-electronic once genres are known.
          if (
            f.source === "resident_advisor" &&
            f.type !== "festival" &&
            f.type !== "holiday" &&
            !isElectronicUmbrella(genres)
          ) {
            return null;
          }
          const venue =
            f.region &&
            f.region !== "Amsterdam" &&
            f.region !== "Nederland"
              ? f.region
              : null;
          return {
            name: f.name,
            venue,
            attending: meta.attending,
            size: competeSizeFromAttending(
              meta.attending,
              f.type === "festival"
                ? "festival"
                : f.type === "holiday"
                  ? "holiday"
                  : "party",
            ),
            genres,
            genreLabel: genreLabel(genres),
            kind:
              f.type === "festival"
                ? "festival"
                : f.type === "holiday"
                  ? "holiday"
                  : "party",
            source: f.source,
          };
        })
        .filter((c): c is CompetingEvent => c != null)
        .sort((a, b) => {
          const rank = (k: CompetingEvent["kind"]) =>
            k === "holiday" ? 0 : k === "festival" ? 1 : 2;
          const r = rank(a.kind) - rank(b.kind);
          if (r !== 0) return r;
          return (b.attending ?? 0) - (a.attending ?? 0);
        })
        .slice(0, 10);

      const raArtists = (ra?.artists ?? []).filter(Boolean);
      const artists =
        raArtists.length > 0
          ? raArtists
          : lineup.artists;
      const artistsSource =
        raArtists.length > 0
          ? ("resident_advisor" as const)
          : lineup.artists.length > 0
            ? ("edition_name" as const)
            : ("none" as const);

      const insight: EventInsight = {
        editionId: e.id,
        name: e.name,
        day,
        startsAt: e.startsAt.toISOString(),
        headliner: artists[0] ?? lineup.headliner ?? null,
        artists,
        artistsSource,
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
        competitionLevel: summarizeCompetition(competing).level,
      };

      insight.headlines = buildHeadlines(insight);
      return insight;
    });

    // Ticket lift from already-loaded daily curves (role-aware windows)
    for (const event of insights) {
      const curve = dailyByEdition.get(event.editionId);
      if (!curve || event.socialPosts.length === 0) continue;
      let changed = false;
      for (const post of event.socialPosts) {
        if (post.salesImpactRole === "after") {
          post.ticketLiftSold = null;
          post.liftWindowLabel = "n.v.t.";
          continue;
        }
        if (!post.publishedAt) continue;
        const window = salesLiftWindow({
          role: post.salesImpactRole,
          publishedAt: post.publishedAt,
        });
        if (!window) {
          post.ticketLiftSold = null;
          post.liftWindowLabel = "n.v.t.";
          continue;
        }
        post.liftWindowLabel = window.label;
        let sold = 0;
        let daysCovered = 0;
        for (
          let d = window.dayFrom;
          d <= window.dayTo;
          d = shiftIsoDay(d, 1)
        ) {
          if (curve.has(d)) {
            daysCovered += 1;
            sold += curve.get(d) ?? 0;
          }
        }
        if (daysCovered > 0) {
          post.ticketLiftSold = sold;
          changed = true;
        }
      }
      if (changed) event.headlines = buildHeadlines(event);
    }

  if (mode === "upcoming") {
    return insights.filter((e) => e.status === "upcoming");
  }
  if (mode === "past") {
    return insights.filter((e) => e.status === "past");
  }
  return insights;
}

/** Upcoming events: refresh often (ticket velocity changes). */
const UPCOMING_REVALIDATE_SEC = 5 * 60;
/** Past events: almost static after the night — days is fine. */
const PAST_REVALIDATE_SEC = 24 * 60 * 60;

const loadUpcomingEventInsightsCached = unstable_cache(
  async (limit: number, asOfDay: string) =>
    loadEventInsightsFresh({
      limit,
      asOfDay,
      mode: "upcoming",
      skipEnsure: true,
      // Forecast still useful for near-term upcoming
      skipWeather: false,
    }),
  ["event-insights-upcoming-v9"],
  {
    revalidate: UPCOMING_REVALIDATE_SEC,
    tags: ["event-insights", "event-insights-upcoming"],
  },
);

const loadPastEventInsightsCached = unstable_cache(
  async (limit: number, asOfDay: string) =>
    loadEventInsightsFresh({
      limit,
      asOfDay,
      mode: "past",
      skipEnsure: true,
      skipWeather: true,
    }),
  ["event-insights-past-v9"],
  {
    revalidate: PAST_REVALIDATE_SEC,
    tags: ["event-insights", "event-insights-past"],
  },
);

/**
 * Cross-request cached Insights payload.
 * - Upcoming: ~5 min
 * - Past: ~24 h
 * Weeztix list ensure runs outside the cache (non-blocking when DB has events).
 */
export async function loadEventInsights(options?: {
  limit?: number;
}): Promise<EventInsight[]> {
  if (!hasDatabase()) return [];

  const limit = options?.limit ?? 120;
  const asOfDay = amsterdamDay(new Date());

  // Outside cache: recover empty DB / schedule list refresh
  await ensureWeeztixEvents();
  await ensureRaCompetition();

  const [upcoming, past] = await Promise.all([
    loadUpcomingEventInsightsCached(limit, asOfDay),
    loadPastEventInsightsCached(limit, asOfDay),
  ]);

  return [...upcoming, ...past];
}

/** Bust Insights data cache after a Weeztix (or related) sync. */
export async function invalidateEventInsightsCache(): Promise<void> {
  revalidateTag("event-insights", "max");
}
