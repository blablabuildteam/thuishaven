import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  emailCampaignMetrics,
  ticketInventory,
  ticketSaleReferrers,
} from "@/lib/db/schema";
import { loadMailHourCurves, ticketsSoldIn24h } from "@/lib/editions/mail-window";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";

export type MailAfterEffect = {
  campaignId: string;
  campaignName: string;
  sentAt: string;
  sent: number;
  opens: number;
  clicks: number;
  openRate: number | null;
  clickRate: number | null;
  /** Tickets in de 24 uur ná verzending (uur van verzending telt mee). */
  ordersAfter: number | null;
  /** Uren in het venster met verkoop. */
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

/**
 * Effect ná mail: tickets in de 24 uur na verzending + Brevo-klikreferrers.
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
    "Focus: tickets in de 24 uur ná de mail, niet de week erna.",
    "Weeztix-uurcurve. Het uur waarin de mail vertrok telt helemaal mee.",
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
      guid: editions.weeztixEventId,
      sold: ticketInventory.sold,
      capacity: ticketInventory.capacity,
      available: ticketInventory.available,
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

  const hourRequests: Array<{
    editionId: string;
    guid: string;
    from: Date;
    to: Date;
  }> = [];
  const sentByEdition = new Map<string, Date[]>();
  for (const c of camps) {
    const editionId = c.editionId;
    const ed = editionId ? edMap.get(editionId) : undefined;
    if (!editionId || !ed?.guid || /TEMPLATE/i.test(ed.name) || !c.sentAt) {
      continue;
    }
    const list = sentByEdition.get(editionId) ?? [];
    list.push(c.sentAt);
    sentByEdition.set(editionId, list);
  }
  for (const [editionId, sent] of sentByEdition) {
    const guid = edMap.get(editionId)?.guid;
    if (!guid) continue;
    const fromMs = Math.min(...sent.map((d) => d.getTime())) - 60 * 60 * 1000;
    const toMs = Math.max(...sent.map((d) => d.getTime())) + 25 * 60 * 60 * 1000;
    hourRequests.push({
      editionId,
      guid,
      from: new Date(fromMs),
      to: new Date(toMs),
    });
  }
  const hourlyByEdition = await loadMailHourCurves(hourRequests);

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

    const curve = hourlyByEdition.get(editionId);
    const covers = curve != null;
    const afterSold = covers ? ticketsSoldIn24h(curve, c.sentAt) : null;

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
      ordersAfter: afterSold,
      daysCovered:
        curve == null
          ? 0
          : curve.filter((point) => {
              const start = c.sentAt.getTime();
              const end = start + 24 * 60 * 60 * 1000;
              return point.at + 60 * 60 * 1000 > start && point.at < end;
            }).length,
      curveCoversSend: covers,
      signal: covers ? "measured" : "no_curve",
    };

    let row = byEdition.get(editionId);
    if (!row) {
      const inv = normalizeWeeztixInventory({
        sold: ed.sold,
        capacity: ed.capacity,
        available: ed.available,
      });
      const sold = inv.sold;
      const capacity = inv.capacity;
      const ref = refsByEdition.get(editionId);
      row = {
        editionId,
        editionName: ed.name,
        startsAt: ed.startsAt.toISOString(),
        sold,
        capacity,
        sellThrough:
          capacity != null && capacity > 0 ? (sold / capacity) * 100 : null,
        curveDays: curve?.length ?? 0,
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
      const byEvent = b.startsAt.localeCompare(a.startsAt);
      if (byEvent !== 0) return byEvent;
      const aMail = a.campaigns[0]?.sentAt ?? "";
      const bMail = b.campaigns[0]?.sentAt ?? "";
      return bMail.localeCompare(aMail);
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
