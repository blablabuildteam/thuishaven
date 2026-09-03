import Link from "next/link";
import { displayEditionName } from "@/lib/editions/lineup";
import {
  type TicketChannelRow,
  type TicketPoolCell,
  TicketsChannelsList,
  totalTicketsSold,
} from "@/components/dashboard/tickets-channels-table";
import { SectionHeader } from "@/components/ui/section-header";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";
import { amsterdamDay } from "@/lib/time/amsterdam";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { desc, isNotNull, sql, and, eq, inArray } from "drizzle-orm";

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
export default async function WeeztixEventsPage() {
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
  const [totals, editionRows, extraInv] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from editions
          where weeztix_event_id is not null
            and name not ilike '%TEMPLATE%') as editions,
        (select coalesce(sum(sold),0)::int from ticket_inventory
          where platform = 'weeztix') as total_sold,
        (select coalesce(sum(scanned),0)::int from ticket_inventory
          where platform = 'weeztix') as total_scanned,
        (select coalesce(sum(revenue_cents),0)::bigint from ticket_inventory
          where platform = 'weeztix') as total_revenue_cents
    `),
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
          "internal",
        ]),
      ),
  ]);

  const t = (totals as unknown as Array<Record<string, number>>)[0] ?? {
    editions: 0,
    total_sold: 0,
    total_scanned: 0,
    total_revenue_cents: 0,
  };

  const extraByEdition = new Map<
    string,
    {
      ra?: PoolInventory;
      appic?: PoolInventory;
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
    if (row.platform === "internal") current.internal = row.sold ?? 0;
    extraByEdition.set(row.editionId, current);
  }

  function splitChannelIssued(extra?: {
    ra?: PoolInventory;
    appic?: PoolInventory;
  }): number {
    if (!extra) return 0;
    return (extra.ra?.sold ?? 0) + (extra.appic?.sold ?? 0);
  }

  const today = amsterdamDay(new Date());
  const mapped: TicketChannelRow[] = editionRows
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
        vrienden: null,
        scanned: hasWeeztix ? (row.scanned ?? 0) : null,
      };
    });

  const upcoming = mapped
    .filter((row) => row.day >= today)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = mapped.filter((row) => row.day < today);

  const channelTotal = mapped.reduce(
    (sum, row) => sum + (totalTicketsSold(row) ?? 0),
    0,
  );

  return (
    <div>
      <SectionHeader
        eyebrow="Tickets"
        title="Tickets"
        description="Verkoop per kanaal, zoals het ticketsheet. Totaal is de som van de kanalen; gescand is Weeztix check-in."
      />

      <div className="mb-8 flex flex-wrap gap-8">
        <p>
          <span className="font-display text-3xl">
            {formatNumber(Number(t.editions ?? 0))}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            edities
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatNumber(Number(t.total_sold ?? 0))}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            Weeztix
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatNumber(channelTotal)}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            totaal verkocht
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatNumber(Number(t.total_scanned ?? 0))}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            gescand
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatCurrency(Number(t.total_revenue_cents ?? 0) / 100)}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            omzet
          </span>
        </p>
      </div>

      <TicketsChannelsList upcoming={upcoming} past={past} />

      <p className="mt-3 text-xs text-text-dim">
        Weeztix = shop (exclusief barcode-pools). Appic en Resident Advisor tonen
        gebruikt / gereserveerd uit Weeztix (check-ins vs poolgrootte). Deurverkoop
        volgt zodra die cijfers in de voorraad staan. Wingame Appic en
        vriendentickets volgen nog. Totaal = som van de kanalen. Gescand = Weeztix
        check-in.
      </p>
    </div>
  );
}
