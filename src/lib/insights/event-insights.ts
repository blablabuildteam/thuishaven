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
import {
  fetchOpenMeteoHourlyForDays,
  type WeatherHourRow,
} from "@/lib/weather/open-meteo";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";
import {
  competeSizeFromAttending,
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
  dedupeOrganicCreativeVariants,
  scoreOrganicPost,
  summarizeOrganicImpact,
  type OrganicImpactLevel,
  type OrganicPostWeight,
} from "@/lib/marketing/organic-impact";
import {
  periodsForDay,
  weekdayKeyFromIso,
  type CalendarPeriod,
  type WeekdayKey,
  WEEKDAY_LABEL,
  CALENDAR_PERIOD_LABEL,
} from "@/lib/time/nl-calendar";
import {
  annotateAnomalies,
  type AnomalyInsight,
} from "@/lib/insights/anomaly-engine";
import {
  detectPostSpikes,
  summarizeByPost,
} from "@/lib/marketing/spike-detection";

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

export type {
  AnomalyInsight,
  AnomalyDimension,
  AnomalyFact,
} from "@/lib/insights/anomaly-engine";

export type EventInsightSocialVariant = {
  postId: string;
  title: string | null;
  engagement: number;
  impressions: number;
  reach: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  permalink: string | null;
  publishedAt: string | null;
};

export type EventInsightSocial = {
  postId: string;
  channel: string;
  title: string | null;
  engagement: number;
  impressions: number;
  reach: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  ticketLiftSold: number | null;
  /** promo | same_day | after — aftermovies never get ticket lift. */
  salesImpactRole: "promo" | "same_day" | "after";
  /** ±48u | eventdag | n.v.t. */
  liftWindowLabel: string;
  /** Per-post heaviness for the organic impact score. */
  impactWeight: OrganicPostWeight;
  impactPoints: number;
  permalink: string | null;
  publishedAt: string | null;
  format: string | null;
  offer: string | null;
  /**
   * Same-caption creative variants (esp. TikTok). Empty when this row is a
   * single upload; otherwise the individual posts behind the group totals.
   */
  variants: EventInsightSocialVariant[];
  /** Spike detection: did a sales spike occur within 4h of this post? */
  spikeDetected: boolean;
  /** Estimated tickets from detected spikes (spike amount - baseline) */
  spikeEstimatedLift: number | null;
  /** Hours after post when spike occurred */
  spikeHoursAfter: number | null;
  /** How much higher than baseline (e.g., 2.5x) */
  spikeMultiplier: number | null;
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
  | "vrienden"
  | "resident_advisor";

export type SalesSourceRow = {
  id: SalesSourceId;
  label: string;
  /** Sold (shop) or used/check-ins (barcode pools). */
  sold: number | null;
  /** Reserved pool size for barcode channels. */
  reserved: number | null;
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

  insights: AnomalyInsight[];

  tickets: {
    sold: number;
    capacity: number | null;
    fillPct: number | null;
    avgPriceEur: number | null;
    lastWeekSold: number | null;
    /** Tickets sold on the event day itself (Weeztix daily curve). */
    sameDaySold: number | null;
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
    /** Hourly AMS strip for the event day (Open-Meteo). */
    hourly: WeatherHourRow[];
  } | null;

  demographics: EventInsightDemographics | null;

  socialPosts: EventInsightSocial[];
  emailCampaigns: EventInsightMail[];
  referrers: Array<{ channel: string; orders: number }>;
  competingFestivals: CompetingEvent[];
  /** Overall same-day competition pressure (from listed competitors). */
  competitionLevel: CompetitionLevel | null;
  /** Combined organic promo impact (engagement + lift correlation). */
  organicImpactLevel: OrganicImpactLevel | null;
  organicImpactScore: number;
};

function weatherTone(kind: WeatherKind): "positive" | "neutral" | "caution" {
  if (kind === "ideal") return "positive";
  if (kind === "ok") return "neutral";
  return "caution";
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

  const [weatherRows, camps, festivals, dailyRows, posts, refs, appicRows, raInvRows, vriendenRows, raRows, demoRows] =
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
              scanned: ticketInventory.scanned,
              capacity: ticketInventory.capacity,
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
        "raInventory",
        () =>
          db
            .select({
              editionId: ticketInventory.editionId,
              sold: ticketInventory.sold,
              scanned: ticketInventory.scanned,
              capacity: ticketInventory.capacity,
              available: ticketInventory.available,
            })
            .from(ticketInventory)
            .where(
              and(
                eq(ticketInventory.platform, "resident_advisor"),
                inArray(ticketInventory.editionId, editionIds),
              ),
            ),
        [],
      ),
      safeQuery(
        "vrienden",
        () =>
          db
            .select({
              editionId: ticketInventory.editionId,
              sold: ticketInventory.sold,
              scanned: ticketInventory.scanned,
              capacity: ticketInventory.capacity,
              available: ticketInventory.available,
            })
            .from(ticketInventory)
            .where(
              and(
                eq(ticketInventory.platform, "vrienden"),
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

    const eventDays = [
      ...new Set(filtered.map((e) => amsterdamDay(e.startsAt))),
    ];
    let hourlyByDay = new Map<string, WeatherHourRow[]>();
    try {
      hourlyByDay = await fetchOpenMeteoHourlyForDays(eventDays);
    } catch (err) {
      console.error("[loadEventInsights] hourly weather", err);
    }

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
    const raInvByEdition = new Map(
      raInvRows.map((r) => [r.editionId, r]),
    );
    const vriendenByEdition = new Map(
      vriendenRows.map((r) => [r.editionId, r]),
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
      const raInv = raInvByEdition.get(e.id);
      const vrienden = vriendenByEdition.get(e.id);
      const raListing = raByEdition.get(e.id);
      const splitIssued =
        (appic?.sold ?? 0) +
        (raInv?.sold ?? 0) +
        (vrienden?.sold ?? 0);
      const shopSold = Math.max(0, sold - splitIssued);
      const sources: SalesSourceRow[] = [
        {
          id: "weeztix",
          label: "Weeztix",
          sold: shopSold,
          reserved: null,
          available: inv.available,
          status: "live",
        },
        {
          id: "appic",
          label: "Appic Game",
          sold: appic != null ? (appic.scanned ?? 0) : null,
          reserved:
            appic != null
              ? (appic.capacity ?? appic.sold ?? 0) || null
              : null,
          available: appic != null ? (appic.available ?? 0) : null,
          status: appic != null ? "live" : "empty",
          note: appic != null ? "Gebruikt / gereserveerd (Weeztix)" : undefined,
        },
        {
          id: "wingame",
          label: "Wingame Appic",
          sold: null,
          reserved: null,
          available: null,
          status: "shell",
          note: "Nog geen integratie",
        },
        {
          id: "vrienden",
          label: "Vriendentickets",
          sold: vrienden != null ? (vrienden.scanned ?? 0) : null,
          reserved:
            vrienden != null
              ? (vrienden.capacity ?? vrienden.sold ?? 0) || null
              : null,
          available: vrienden != null ? (vrienden.available ?? 0) : null,
          status: vrienden != null ? "live" : "empty",
          note:
            vrienden != null
              ? "Vrienden daytickets · gebruikt / gereserveerd"
              : undefined,
        },
        {
          id: "resident_advisor",
          label: "Resident Advisor",
          sold: raInv != null ? (raInv.scanned ?? 0) : null,
          reserved:
            raInv != null
              ? (raInv.capacity ?? raInv.sold ?? 0) || null
              : null,
          available: raInv != null ? (raInv.available ?? 0) : null,
          status: raInv != null ? "live" : raListing ? "empty" : "empty",
          note: raInv
            ? "RA daytickets · gebruikt / gereserveerd"
            : raListing
              ? "Geen dayticket-pool op deze editie"
              : "Geen RA-listing gekoppeld",
        },
      ];

      const windowStart = shiftIsoDay(day, -6);
      const curve = dailyByEdition.get(e.id) ?? new Map();
      let lastWeekSold = 0;
      for (const [d, n] of curve) {
        if (d >= windowStart && d <= day) lastWeekSold += n;
      }
      const sameDayRaw = curve.get(day);
      const sameDaySold =
        sameDayRaw != null && sameDayRaw > 0 ? sameDayRaw : null;

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
          hourly: hourlyByDay.get(day) ?? [],
        };
      } else {
        const hourly = hourlyByDay.get(day) ?? [];
        if (hourly.length > 0) {
          const temps = hourly
            .map((h) => h.tempC)
            .filter((t): t is number => t != null);
          const precip = hourly.reduce((s, h) => s + (h.precipMm ?? 0), 0);
          const classified = classifyEventWeather({
            day,
            tempMinC: temps.length ? Math.min(...temps) : null,
            tempMaxC: temps.length ? Math.max(...temps) : null,
            precipMm: precip,
            windMaxMps: null,
            weatherCode: hourly[12]?.weatherCode ?? hourly[0]?.weatherCode,
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
            hourly,
          };
        }
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
          const scored = scoreOrganicPost({
            channel: p.channel,
            salesImpactRole: role,
            impressions: p.impressions ?? 0,
            reach: p.reach ?? 0,
            likeCount: p.likeCount ?? 0,
            commentCount: p.commentCount ?? 0,
            shareCount: p.shareCount ?? 0,
            engagement: p.engagement ?? 0,
            ticketLiftSold: null,
          });
          return {
            postId: p.id,
            channel: p.channel,
            title: p.title,
            engagement: p.engagement ?? 0,
            impressions: p.impressions ?? 0,
            reach: p.reach ?? 0,
            likeCount: p.likeCount ?? 0,
            commentCount: p.commentCount ?? 0,
            shareCount: p.shareCount ?? 0,
            ticketLiftSold: null,
            salesImpactRole: role,
            liftWindowLabel: window?.label ?? "n.v.t.",
            impactWeight: scored.weight,
            impactPoints: scored.points,
            permalink: p.permalink,
            publishedAt: p.publishedAt?.toISOString() ?? null,
            format: p.visualFeatures?.format ?? null,
            offer: p.visualFeatures?.offer ?? null,
            variants: [],
            // Spike detection fields — populated later
            spikeDetected: false,
            spikeEstimatedLift: null,
            spikeHoursAfter: null,
            spikeMultiplier: null,
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

      const raArtists = (raListing?.artists ?? []).filter(Boolean);
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
        insights: [],
        tickets: {
          sold,
          capacity,
          fillPct,
          avgPriceEur:
            avgPriceEur != null && Number.isFinite(avgPriceEur)
              ? avgPriceEur
              : null,
          lastWeekSold: lastWeekSold > 0 ? lastWeekSold : null,
          sameDaySold,
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
        organicImpactLevel: null,
        organicImpactScore: 0,
      };

      const organic0 = summarizeOrganicImpact(socialPosts);
      insight.organicImpactLevel = organic0.level;
      insight.organicImpactScore = organic0.score;
      return insight;
    });

    // Ticket lift from already-loaded daily curves (role-aware windows)
    for (const event of insights) {
      const curve = dailyByEdition.get(event.editionId);
      if (event.socialPosts.length === 0) {
        event.organicImpactLevel = null;
        event.organicImpactScore = 0;
        continue;
      }
      if (curve) {
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
          }
        }
      }

      // TikTok often uploads several variants with the same caption — one row.
      event.socialPosts = dedupeOrganicCreativeVariants(event.socialPosts);

      for (const post of event.socialPosts) {
        const scored = scoreOrganicPost(post);
        post.impactPoints = scored.points;
        post.impactWeight = scored.weight;
      }
      event.socialPosts.sort((a, b) => {
        const rank = (r: EventInsightSocial["salesImpactRole"]) =>
          r === "promo" ? 0 : r === "same_day" ? 1 : 2;
        const rr = rank(a.salesImpactRole) - rank(b.salesImpactRole);
        if (rr !== 0) return rr;
        if (b.impactPoints !== a.impactPoints) {
          return b.impactPoints - a.impactPoints;
        }
        return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
      });

      const organic = summarizeOrganicImpact(event.socialPosts);
      event.organicImpactLevel = organic.level;
      event.organicImpactScore = organic.score;
    }

    // Spike detection for past events with promo posts
    const pastWithPosts = insights.filter(
      (e) =>
        e.status === "past" &&
        e.socialPosts.some((p) => p.salesImpactRole === "promo"),
    );
    await Promise.all(
      pastWithPosts.map(async (event) => {
        try {
          const { matches } = await detectPostSpikes(
            event.editionId,
            event.day,
            event.socialPosts.map((p) => ({
              postId: p.postId,
              publishedAt: p.publishedAt,
              salesImpactRole: p.salesImpactRole,
            })),
          );
          const byPost = summarizeByPost(matches);
          for (const post of event.socialPosts) {
            const attr = byPost.get(post.postId);
            if (attr && attr.hasSpike) {
              post.spikeDetected = true;
              post.spikeEstimatedLift = attr.totalEstimatedLift;
              // Use first (strongest) spike for display
              const first = attr.spikes[0];
              if (first) {
                post.spikeHoursAfter = first.hoursAfterPost;
                post.spikeMultiplier = first.spikeMultiplier;
              }
            }
          }
        } catch (err) {
          // Spike detection is optional — don't break insights if it fails
          console.warn(`Spike detection failed for ${event.editionId}:`, err);
        }
      }),
    );

  // Upcoming/past are cached separately — annotate after merge so cohorts
  // include the full set. Mode "all" (recovery path) annotates here.
  if (mode === "all") {
    applyAnomalies(insights);
  }
  if (mode === "upcoming") {
    return insights.filter((e) => e.status === "upcoming");
  }
  if (mode === "past") {
    return insights.filter((e) => e.status === "past");
  }
  return insights;
}

function applyAnomalies(events: EventInsight[]): void {
  const rows = annotateAnomalies(events);
  events.forEach((event, i) => {
    event.insights = rows[i] ?? [];
  });
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
  ["event-insights-upcoming-v19"],
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
  ["event-insights-past-v19"],
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

  const merged = [...upcoming, ...past];
  applyAnomalies(merged);
  return merged;
}

/** Bust Insights data cache after a Weeztix (or related) sync. */
export async function invalidateEventInsightsCache(): Promise<void> {
  revalidateTag("event-insights", "max");
}
