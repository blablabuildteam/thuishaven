import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { alerts, editions, raListings, ticketInventory } from "@/lib/db/schema";

const ALERT_TYPE = "weeztix_soldout_ra_open" as const;

export type SoldOutRaMismatch = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  raEventId: string;
  raUrl: string | null;
  raTitle: string;
};

export type StoredRaAlert = {
  id: string;
  editionId: string | null;
  title: string;
  message: string;
  isActive: boolean;
  createdAt: Date;
  resolvedAt: Date | null;
};

/** Weeztix uitverkocht, RA-shop nog open — alleen komende / lopende edities. */
export async function listOpenSoldOutRaAlerts(): Promise<SoldOutRaMismatch[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const rows = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      startsAt: editions.startsAt,
      raEventId: raListings.raEventId,
      raUrl: raListings.contentUrl,
      raTitle: raListings.title,
    })
    .from(editions)
    .innerJoin(raListings, eq(raListings.editionId, editions.id))
    .innerJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(
      and(
        gte(editions.startsAt, since),
        eq(ticketInventory.isSoldOut, true),
        eq(raListings.ticketsAvailable, true),
      ),
    );

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.editionId)) return false;
    seen.add(row.editionId);
    return true;
  });
}

export async function listStoredRaAlerts(): Promise<StoredRaAlert[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: alerts.id,
      editionId: alerts.editionId,
      title: alerts.title,
      message: alerts.message,
      isActive: alerts.isActive,
      createdAt: alerts.createdAt,
      resolvedAt: alerts.resolvedAt,
    })
    .from(alerts)
    .where(eq(alerts.type, ALERT_TYPE))
    .orderBy(desc(alerts.createdAt))
    .limit(40);
  return rows;
}

export async function refreshSoldOutRaAlerts(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const mismatches = await listOpenSoldOutRaAlerts();
  const mismatchIds = new Set(mismatches.map((m) => m.editionId));

  const open = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.type, ALERT_TYPE), eq(alerts.isActive, true)));

  for (const row of open) {
    if (!row.editionId || !mismatchIds.has(row.editionId)) {
      await db
        .update(alerts)
        .set({ isActive: false, resolvedAt: new Date() })
        .where(eq(alerts.id, row.id));
    }
  }

  const openEditionIds = new Set(
    open.filter((a) => a.editionId).map((a) => a.editionId as string),
  );

  for (const m of mismatches) {
    if (openEditionIds.has(m.editionId)) continue;
    await db.insert(alerts).values({
      type: ALERT_TYPE,
      isActive: true,
      title: `${m.editionName} is uitverkocht, maar staat nog te koop op RA`,
      message: `Weeztix is uitverkocht. Op Resident Advisor (${m.raTitle}) zijn nog tickets beschikbaar. Zet de RA-verkoop uit om overboeking te voorkomen.`,
      editionId: m.editionId,
    });
  }

  return mismatches.length;
}
