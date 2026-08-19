import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  emailCampaignMetrics,
  ticketInventory,
  ticketSaleReferrers,
  ticketSalesDaily,
} from "@/lib/db/schema";

/** Dagen ná verzending die we als “effect-window” meenemen. */
const AFTER_DAYS = 7;

export type MailAfterEffect = {
  campaignId: string;
  campaignName: string;
  sentAt: string;
  sent: number;
  opens: number;
  clicks: number;
  openRate: number | null;
  clickRate: number | null;
  /** Orders in de 7 dagen ná verzending (incl. verzenddag), uit dagcurve */
  ordersAfter: number | null;
  /** Aantal dagen in de curve binnen dat window */
  daysCovered: number;
  /** Of de dagcurve dit mail-moment überhaupt dekt */
  curveCoversSend: boolean;
  signal: "measured" | "no_curve";
};

export type EditionMailEffect = {
  editionId: string;
  editionName: string;
  startsAt: string;
  sold: number;
  capacity: number | null;
  sellThrough: number | null;
  curveDays: number;
  /** Orders via Brevo-trackingklik (Arenametrix routage) — dichtste attributie */
  brevoClickOrders: number;
  /** Andere kanalen (instagram, website, …) */
  referrerBreakdown: Array<{ channel: string; orders: number }>;
  campaigns: MailAfterEffect[];
  /** Som ordersAfter over gemeten campagnes */
  totalOrdersAfterMails: number;
};

function dayIso(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(isoDay: string, delta: number): string {
  const d = new Date(`${isoDay}T12:00:00+02:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return dayIso(d);
}

function normalizeDay(day: string | Date): string {
  if (typeof day === "string") return day.slice(0, 10);
  return dayIso(day);
}

function sumAfter(
  byDay: Map<string, number>,
  sendDay: string,
  afterDays: number,
): { sold: number; days: number } {
  const end = addDays(sendDay, afterDays - 1);
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

function curveTouchesWindow(
  byDay: Map<string, number>,
  sendDay: string,
  afterDays: number,
): boolean {
  const end = addDays(sendDay, afterDays - 1);
  for (const day of byDay.keys()) {
    if (day >= sendDay && day <= end) return true;
  }
  return false;
}

/**
 * Effect ná mail: orders in de dagen na verzending + Brevo-klikreferrers.
 * Geen “vóór vs na”-vergelijking — jullie kopen na de mail, dus we meten die window.
 */
export async function getMailLiftByEdition(options?: {
  limit?: number;
}): Promise<{
  editions: EditionMailEffect[];
  totals: {
    editionsWithMail: number;
    campaignsMeasured: number;
    ordersAfterMails: number;
    brevoClickOrders: number;
  };
  notes: string[];
}> {
  const notes: string[] = [
    "Focus: verkopen ná de mail (verzenddag + 6 dagen), niet ervoor.",
    "Orders/dag uit Weeztix timeToBank — dekt soms alleen de late fase vóór het event.",
    "‘Via Brevo-klik’ = orders waarvan de referrer Arenametrix/routage is (trackinglink in de mail). Dichtste attributie die Weeztix geeft.",
  ];

  if (!hasDatabase()) {
    return {
      editions: [],
      totals: {
        editionsWithMail: 0,
        campaignsMeasured: 0,
        ordersAfterMails: 0,
        brevoClickOrders: 0,
      },
      notes: ["Geen database."],
    };
  }

  const db = getDb();
  const camps = await db
    .select({
      campaignId: emailCampaignMetrics.id,
      campaignName: emailCampaignMetrics.name,
      editionId: emailCampaignMetrics.editionId,
      sentAt: emailCampaignMetrics.sentAt,
      sent: emailCampaignMetrics.sent,
      opens: emailCampaignMetrics.opens,
      clicks: emailCampaignMetrics.clicks,
    })
    .from(emailCampaignMetrics)
    .where(
      and(
        isNotNull(emailCampaignMetrics.editionId),
        isNotNull(emailCampaignMetrics.sentAt),
      ),
    );

  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      sold: ticketInventory.sold,
      capacity: ticketInventory.capacity,
    })
    .from(editions)
    .leftJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(isNotNull(editions.weeztixEventId));

  const edMap = new Map(eds.map((e) => [e.id, e]));

  const daily = await db
    .select({
      editionId: ticketSalesDaily.editionId,
      day: ticketSalesDaily.day,
      sold: ticketSalesDaily.sold,
    })
    .from(ticketSalesDaily)
    .where(eq(ticketSalesDaily.platform, "weeztix"));

  const dailyByEdition = new Map<string, Map<string, number>>();
  for (const row of daily) {
    const day = normalizeDay(row.day as string | Date);
    let m = dailyByEdition.get(row.editionId);
    if (!m) {
      m = new Map();
      dailyByEdition.set(row.editionId, m);
    }
    m.set(day, (m.get(day) ?? 0) + (row.sold ?? 0));
  }

  const refs = await db
    .select({
      editionId: ticketSaleReferrers.editionId,
      channel: ticketSaleReferrers.channel,
      orderCount: ticketSaleReferrers.orderCount,
    })
    .from(ticketSaleReferrers)
    .where(eq(ticketSaleReferrers.platform, "weeztix"));

  const refsByEdition = new Map<
    string,
    { brevo: number; byChannel: Map<string, number> }
  >();
  for (const r of refs) {
    let entry = refsByEdition.get(r.editionId);
    if (!entry) {
      entry = { brevo: 0, byChannel: new Map() };
      refsByEdition.set(r.editionId, entry);
    }
    entry.byChannel.set(
      r.channel,
      (entry.byChannel.get(r.channel) ?? 0) + r.orderCount,
    );
    if (r.channel === "brevo") entry.brevo += r.orderCount;
  }

  const byEdition = new Map<string, EditionMailEffect>();

  for (const c of camps) {
    const editionId = c.editionId!;
    const ed = edMap.get(editionId);
    if (!ed || /TEMPLATE/i.test(ed.name) || !c.sentAt) continue;

    const sendDay = dayIso(c.sentAt);
    const curve = dailyByEdition.get(editionId) ?? new Map();
    const covers = curveTouchesWindow(curve, sendDay, AFTER_DAYS);
    const after = sumAfter(curve, sendDay, AFTER_DAYS);

    const sent = c.sent ?? 0;
    const opens = c.opens ?? 0;
    const clicks = c.clicks ?? 0;
    const effect: MailAfterEffect = {
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      sentAt: c.sentAt.toISOString(),
      sent,
      opens,
      clicks,
      openRate: sent > 0 ? (opens / sent) * 100 : null,
      clickRate: sent > 0 ? (clicks / sent) * 100 : null,
      ordersAfter: covers ? after.sold : null,
      daysCovered: after.days,
      curveCoversSend: covers,
      signal: covers ? "measured" : "no_curve",
    };

    let row = byEdition.get(editionId);
    if (!row) {
      const sold = ed.sold ?? 0;
      const capacity = ed.capacity;
      const ref = refsByEdition.get(editionId);
      row = {
        editionId,
        editionName: ed.name,
        startsAt: ed.startsAt.toISOString(),
        sold,
        capacity,
        sellThrough:
          capacity != null && capacity > 0 ? (sold / capacity) * 100 : null,
        curveDays: curve.size,
        brevoClickOrders: ref?.brevo ?? 0,
        referrerBreakdown: [...(ref?.byChannel.entries() ?? [])]
          .map(([channel, orders]) => ({ channel, orders }))
          .sort((a, b) => b.orders - a.orders),
        campaigns: [],
        totalOrdersAfterMails: 0,
      };
      byEdition.set(editionId, row);
    }
    row.campaigns.push(effect);
  }

  // Ook edities met Brevo-referrers maar zonder gekoppelde mail tonen? Skip for now — focus mail.

  const editionsOut = [...byEdition.values()]
    .map((e) => {
      e.campaigns.sort(
        (a, b) =>
          new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
      );
      e.totalOrdersAfterMails = e.campaigns.reduce(
        (s, c) => s + (c.ordersAfter ?? 0),
        0,
      );
      return e;
    })
    .sort((a, b) => {
      const score = (e: EditionMailEffect) =>
        e.brevoClickOrders * 10 + e.totalOrdersAfterMails;
      return score(b) - score(a);
    });

  const limit = options?.limit ?? 40;
  const sliced = editionsOut.slice(0, limit);
  const measured = sliced.flatMap((e) =>
    e.campaigns.filter((c) => c.signal === "measured"),
  );

  return {
    editions: sliced,
    totals: {
      editionsWithMail: sliced.length,
      campaignsMeasured: measured.length,
      ordersAfterMails: measured.reduce((s, c) => s + (c.ordersAfter ?? 0), 0),
      brevoClickOrders: sliced.reduce((s, e) => s + e.brevoClickOrders, 0),
    },
    notes,
  };
}
