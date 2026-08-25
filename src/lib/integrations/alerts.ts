import { and, desc, eq, gte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  alerts,
  editions,
  ticketInventory,
  ticketswapListings,
} from "@/lib/db/schema";

const weeztixInv = alias(ticketInventory, "alert_weeztix_inv");
const appicInv = alias(ticketInventory, "alert_appic_inv");
import { ticketswapVenueUrl } from "@/lib/integrations/ticketswap/client";
import {
  listOpenSoldOutRaAlerts,
  refreshSoldOutRaAlerts,
  type SoldOutRaMismatch,
} from "@/lib/integrations/ra/alerts";

const TS_ALERT = "ticketswap_after_soldout" as const;
const RA_ALERT = "weeztix_soldout_ra_open" as const;

/** Primair = Weeztix. Secundair = RA / TicketSwap / Appic. */
export type SecondaryChannel = "resident_advisor" | "ticketswap" | "appic";

export type TicketswapSoldOutAlert = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  availableCount: number | null;
  tsUrl: string | null;
  tsTitle: string | null;
};

export type SecondarySoldOutConflict = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  channel: SecondaryChannel;
  channelLabel: string;
  /** RA: overboekingsrisico. TicketSwap/Appic: omzetlek. */
  kind: "overbooking" | "revenue_leak";
  title: string;
  message: string;
  availableCount: number | null;
  url: string | null;
};

export type StoredAlert = {
  id: string;
  type: string;
  editionId: string | null;
  title: string;
  message: string;
  isActive: boolean;
  createdAt: Date;
  resolvedAt: Date | null;
};

function since(): Date {
  return new Date(Date.now() - 12 * 60 * 60 * 1000);
}

/**
 * Weeztix uitverkocht + TicketSwap nog aanbod (of check als listings niet live zijn).
 * Alleen Weeztix telt als primaire sold-out — niet RA.
 */
export async function listOpenTicketswapAlerts(options?: {
  requireLiveListings?: boolean;
}): Promise<TicketswapSoldOutAlert[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      startsAt: editions.startsAt,
      tsAvailable: ticketswapListings.availableCount,
      tsUrl: ticketswapListings.contentUrl,
      tsTitle: ticketswapListings.title,
    })
    .from(editions)
    .innerJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
        eq(ticketInventory.isSoldOut, true),
      ),
    )
    .leftJoin(ticketswapListings, eq(ticketswapListings.editionId, editions.id))
    .where(gte(editions.startsAt, since()));

  const live = options?.requireLiveListings !== false;
  const byEdition = new Map<string, TicketswapSoldOutAlert>();

  for (const row of rows) {
    if (live) {
      if (row.tsAvailable == null || row.tsAvailable <= 0) continue;
    }

    const prev = byEdition.get(row.editionId);
    const available = row.tsAvailable ?? prev?.availableCount ?? null;
    byEdition.set(row.editionId, {
      editionId: row.editionId,
      editionName: row.editionName,
      startsAt: row.startsAt,
      availableCount:
        available != null
          ? Math.max(available, prev?.availableCount ?? 0)
          : prev?.availableCount ?? null,
      tsUrl: row.tsUrl ?? prev?.tsUrl ?? ticketswapVenueUrl(),
      tsTitle: row.tsTitle ?? prev?.tsTitle ?? null,
    });
  }

  return [...byEdition.values()];
}

async function ticketswapListingsAreLive(): Promise<boolean> {
  if (!hasDatabase()) return false;
  const db = getDb();
  const recent = await db
    .select({ id: ticketswapListings.id })
    .from(ticketswapListings)
    .where(gte(ticketswapListings.syncedAt, new Date(Date.now() - 48 * 60 * 60 * 1000)))
    .limit(1);
  return recent.length > 0;
}

export type AppicSoldOutAlert = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  availableCount: number | null;
};

/** Weeztix uitverkocht + Appic-inventory nog aanbod (zodra die sync live is). */
export async function listOpenAppicAlerts(): Promise<AppicSoldOutAlert[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      startsAt: editions.startsAt,
      available: appicInv.available,
    })
    .from(editions)
    .innerJoin(
      weeztixInv,
      and(
        eq(weeztixInv.editionId, editions.id),
        eq(weeztixInv.platform, "weeztix"),
        eq(weeztixInv.isSoldOut, true),
      ),
    )
    .innerJoin(
      appicInv,
      and(
        eq(appicInv.editionId, editions.id),
        eq(appicInv.platform, "appic"),
      ),
    )
    .where(
      and(gte(editions.startsAt, since()), gte(appicInv.available, 1)),
    );

  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (seen.has(row.editionId)) return [];
    seen.add(row.editionId);
    return [
      {
        editionId: row.editionId,
        editionName: row.editionName,
        startsAt: row.startsAt,
        availableCount: row.available,
      },
    ];
  });
}

export async function listOpenDashboardAlerts(): Promise<{
  ra: SoldOutRaMismatch[];
  ticketswap: TicketswapSoldOutAlert[];
  appic: AppicSoldOutAlert[];
  /** Flat list voor UI: Weeztix sold-out vs secundair kanaal. */
  conflicts: SecondarySoldOutConflict[];
}> {
  const live = await ticketswapListingsAreLive();
  const [ra, ticketswap, appic] = await Promise.all([
    listOpenSoldOutRaAlerts().catch(() => []),
    listOpenTicketswapAlerts({ requireLiveListings: live }).catch(() => []),
    listOpenAppicAlerts().catch(() => []),
  ]);

  const conflicts: SecondarySoldOutConflict[] = [
    ...ra.map(
      (m): SecondarySoldOutConflict => ({
        editionId: m.editionId,
        editionName: m.editionName,
        startsAt: m.startsAt,
        channel: "resident_advisor",
        channelLabel: "Resident Advisor",
        kind: "overbooking",
        title: `${m.editionName} is bij Weeztix uitverkocht, maar staat nog te koop op RA`,
        message: `Weeztix is uitverkocht. Op Resident Advisor (${m.raTitle}) zijn nog tickets beschikbaar. Zet de RA-verkoop uit om overboeking te voorkomen.`,
        availableCount: null,
        url: m.raUrl,
      }),
    ),
    ...ticketswap.map((m): SecondarySoldOutConflict => {
      const hasCount = m.availableCount != null && m.availableCount > 0;
      return {
        editionId: m.editionId,
        editionName: m.editionName,
        startsAt: m.startsAt,
        channel: "ticketswap",
        channelLabel: "TicketSwap",
        kind: "revenue_leak",
        title: hasCount
          ? `${m.editionName}: TicketSwap actief na Weeztix sold-out`
          : `${m.editionName}: check TicketSwap na Weeztix sold-out`,
        message: hasCount
          ? `Weeztix is uitverkocht, maar er ${m.availableCount === 1 ? "staat nog 1 ticket" : `staan nog ${m.availableCount} tickets`} op TicketSwap. Mogelijke omzetlek.`
          : "Weeztix is uitverkocht. Controleer TicketSwap of er nog aanbod is — omzetlek op de secundaire markt.",
        availableCount: m.availableCount,
        url: m.tsUrl ?? ticketswapVenueUrl(),
      };
    }),
    ...appic.map(
      (m): SecondarySoldOutConflict => ({
        editionId: m.editionId,
        editionName: m.editionName,
        startsAt: m.startsAt,
        channel: "appic",
        channelLabel: "Appic",
        kind: "revenue_leak",
        title: `${m.editionName}: Appic actief na Weeztix sold-out`,
        message: `Weeztix is uitverkocht, maar Appic toont nog ${m.availableCount === 1 ? "1 ticket" : `${m.availableCount ?? "tickets"}`}. Mogelijke omzetlek.`,
        availableCount: m.availableCount,
        url: null,
      }),
    ),
  ];

  conflicts.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { ra, ticketswap, appic, conflicts };
}

export async function listStoredDashboardAlerts(): Promise<StoredAlert[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  return db
    .select({
      id: alerts.id,
      type: alerts.type,
      editionId: alerts.editionId,
      title: alerts.title,
      message: alerts.message,
      isActive: alerts.isActive,
      createdAt: alerts.createdAt,
      resolvedAt: alerts.resolvedAt,
    })
    .from(alerts)
    .where(or(eq(alerts.type, TS_ALERT), eq(alerts.type, RA_ALERT)))
    .orderBy(desc(alerts.createdAt))
    .limit(50);
}

async function upsertTypedAlerts(
  type: typeof TS_ALERT | typeof RA_ALERT,
  editionIds: string[],
  create: (editionId: string) => { title: string; message: string },
) {
  const db = getDb();
  const open = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.type, type), eq(alerts.isActive, true)));
  const wanted = new Set(editionIds);

  for (const row of open) {
    if (!row.editionId || !wanted.has(row.editionId)) {
      await db
        .update(alerts)
        .set({ isActive: false, resolvedAt: new Date() })
        .where(eq(alerts.id, row.id));
    }
  }

  const openIds = new Set(open.filter((a) => a.editionId).map((a) => a.editionId as string));
  for (const editionId of editionIds) {
    if (openIds.has(editionId)) continue;
    const payload = create(editionId);
    await db.insert(alerts).values({
      type,
      isActive: true,
      editionId,
      title: payload.title,
      message: payload.message,
    });
  }
}

export async function refreshTicketswapAlerts(options?: {
  liveListings?: boolean;
}): Promise<number> {
  if (!hasDatabase()) return 0;
  const live =
    options?.liveListings ?? (await ticketswapListingsAreLive());
  const mismatches = await listOpenTicketswapAlerts({
    requireLiveListings: live,
  });
  const byId = new Map(mismatches.map((m) => [m.editionId, m]));
  await upsertTypedAlerts(TS_ALERT, mismatches.map((m) => m.editionId), (id) => {
    const m = byId.get(id)!;
    if (m.availableCount != null && m.availableCount > 0) {
      return {
        title: `${m.editionName}: TicketSwap actief na Weeztix sold-out`,
        message: `Weeztix is uitverkocht, maar er ${m.availableCount === 1 ? "staat nog 1 ticket" : `staan nog ${m.availableCount} tickets`} op TicketSwap. Mogelijke omzetlek.`,
      };
    }
    return {
      title: `${m.editionName}: check TicketSwap na Weeztix sold-out`,
      message:
        "Weeztix is uitverkocht. Controleer TicketSwap of er nog aanbod is (omzetlek op de secundaire markt).",
    };
  });
  return mismatches.length;
}

export async function refreshDashboardAlerts(options?: {
  ticketswapLive?: boolean;
}): Promise<{ ra: number; ticketswap: number; appic: number; notified: number }> {
  const ra = await refreshSoldOutRaAlerts().catch(() => 0);
  const ticketswap = await refreshTicketswapAlerts({
    liveListings: options?.ticketswapLive,
  }).catch(() => 0);
  const appic = await listOpenAppicAlerts()
    .then((rows) => rows.length)
    .catch(() => 0);
  const { notifyUnsentDashboardAlerts } = await import(
    "@/lib/integrations/alerts/notify"
  );
  const notify = await notifyUnsentDashboardAlerts().catch((e) => ({
    sent: 0,
    skipped: null,
    error: e instanceof Error ? e.message : "notify failed",
  }));
  return { ra, ticketswap, appic, notified: notify.sent };
}
