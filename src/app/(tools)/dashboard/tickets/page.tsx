import {
  TicketsChannelsSearch,
  type TicketChannelRowInput,
} from "@/components/dashboard/tickets-channels-search";
import {
  type TicketChannelRow,
  type TicketPoolCell,
} from "@/components/dashboard/tickets-channels-table";
import { SectionHeader } from "@/components/ui/section-header";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, externalTicketEvents, ticketInventory } from "@/lib/db/schema";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";
import { amsterdamDay } from "@/lib/time/amsterdam";
import { desc, isNotNull, and, eq, inArray } from "drizzle-orm";

export const metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

type PoolInventory = {
  sold: number;
  scanned: number;
  capacity: number | null;
};

function poolCell(row: PoolInventory | undefined): TicketPoolCell {
  if (!row) return null;
  const reserved = row.capacity ?? row.sold;
  if (reserved <= 0 && row.scanned <= 0) return null;
  return {
    used: row.scanned,
    reserved,
    issued: row.sold,
  };
}

/**
 * Ticketsheet: verkoop per kanaal, totaal + scans, komend vs afgelopen.
 */
export default async function TicketsPage() {
  if (!hasDatabase()) {
    return (
      <div>
        <SectionHeader
          eyebrow="Tickets"
          title="Tickets"
          description="Geen DATABASE_URL."
        />
      </div>
    );
  }

  const db = getDb();
  const [editionRows, extraInv, externalRows] = await Promise.all([
    db
      .select({
        id: editions.id,
        name: editions.name,
        startsAt: editions.startsAt,
        sold: ticketInventory.sold,
        scanned: ticketInventory.scanned,
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
      .where(isNotNull(editions.weeztixEventId))
      .orderBy(desc(editions.startsAt)),
    db
      .select({
        editionId: ticketInventory.editionId,
        platform: ticketInventory.platform,
        sold: ticketInventory.sold,
        scanned: ticketInventory.scanned,
        capacity: ticketInventory.capacity,
      })
      .from(ticketInventory)
      .where(
        inArray(ticketInventory.platform, [
          "resident_advisor",
          "appic",
          "vrienden",
          "internal",
        ]),
      ),
    db
      .select({
        id: externalTicketEvents.id,
        name: externalTicketEvents.name,
        startsAt: externalTicketEvents.startsAt,
        expectedAttendees: externalTicketEvents.expectedAttendees,
        scanned: externalTicketEvents.scanned,
      })
      .from(externalTicketEvents)
      .orderBy(desc(externalTicketEvents.startsAt)),
  ]);

  const extraByEdition = new Map<
    string,
    {
      ra?: PoolInventory;
      appic?: PoolInventory;
      vrienden?: PoolInventory;
      internal?: number;
    }
  >();
  for (const row of extraInv) {
    const current = extraByEdition.get(row.editionId) ?? {};
    const pool: PoolInventory = {
      sold: row.sold ?? 0,
      scanned: row.scanned ?? 0,
      capacity: row.capacity,
    };
    if (row.platform === "resident_advisor") current.ra = pool;
    if (row.platform === "appic") current.appic = pool;
    if (row.platform === "vrienden") current.vrienden = pool;
    if (row.platform === "internal") current.internal = row.sold ?? 0;
    extraByEdition.set(row.editionId, current);
  }

  function splitChannelIssued(extra?: {
    ra?: PoolInventory;
    appic?: PoolInventory;
    vrienden?: PoolInventory;
  }): number {
    if (!extra) return 0;
    return (
      (extra.ra?.sold ?? 0) +
      (extra.appic?.sold ?? 0) +
      (extra.vrienden?.sold ?? 0)
    );
  }

  const today = amsterdamDay(new Date());

  const externalMapped: TicketChannelRow[] = externalRows.map((row) => ({
    id: row.id,
    name: row.name,
    startsAt: row.startsAt,
    day: amsterdamDay(row.startsAt),
    weeztix: null,
    deurverkoop: null,
    ra: null,
    appic: null,
    wingame: null,
    vrienden: null,
    scanned: row.scanned,
    isExternal: true,
    externalAttendees: row.expectedAttendees,
  }));

  const mapped: TicketChannelRow[] = [
    ...editionRows
      .filter((row) => !/TEMPLATE/i.test(row.name))
      .map((row) => {
        const extra = extraByEdition.get(row.id);
        const hasWeeztix = row.sold != null;
        const inv = normalizeWeeztixInventory({
          sold: row.sold,
          capacity: row.capacity,
          available: row.available,
        });
        const splitIssued = splitChannelIssued(extra);
        const shopSold = hasWeeztix ? Math.max(0, inv.sold - splitIssued) : null;
        return {
          id: row.id,
          name: row.name,
          startsAt: row.startsAt,
          day: amsterdamDay(row.startsAt),
          weeztix: shopSold,
          deurverkoop: extra?.internal ?? null,
          ra: poolCell(extra?.ra),
          appic: poolCell(extra?.appic),
          wingame: null,
          vrienden: poolCell(extra?.vrienden),
          scanned: hasWeeztix ? (row.scanned ?? 0) : null,
        };
      }),
    ...externalMapped,
  ];

  const upcoming = mapped
    .filter((row) => row.day >= today)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = mapped.filter((row) => row.day < today);

  const serialize = (rows: TicketChannelRow[]): TicketChannelRowInput[] =>
    rows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString() }));

  return (
    <div>
      <SectionHeader
        eyebrow="Tickets"
        title="Tickets"
        description="Verkoop per kanaal, zoals het ticketsheet. Totaal is de som van de kanalen; gescand is Weeztix check-in."
      />

      <TicketsChannelsSearch
        upcoming={serialize(upcoming)}
        past={serialize(past)}
      />

      <p className="mt-3 text-xs text-text-dim">
        Weeztix = shop (exclusief barcode-pools). Appic, RA en vriendentickets tonen
        gebruikt / gereserveerd uit Weeztix (check-ins vs poolgrootte). Deurverkoop
        is handmatig — typ het aantal van de deurlijst in de kolom. Game Appic
        volgt nog. Externe events zijn handmatig (verwachte bezoekers in Totaal).
        Totaal = som van de kanalen. Gescand = Weeztix check-in.
      </p>
    </div>
  );
}
