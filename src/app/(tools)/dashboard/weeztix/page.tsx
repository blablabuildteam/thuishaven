import { desc, isNotNull, sql, and, eq, inArray } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import {
  TicketsChannelsList,
  totalTicketsSold,
  type TicketChannelRow,
} from "@/components/dashboard/tickets-channels-table";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";
import { amsterdamDay } from "@/lib/time/amsterdam";

export const metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

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

  const extraByEdition = new Map<string, { ra?: number; appic?: number; internal?: number }>();
  for (const row of extraInv) {
    const current = extraByEdition.get(row.editionId) ?? {};
    if (row.platform === "resident_advisor") current.ra = row.sold;
    if (row.platform === "appic") current.appic = row.sold;
    if (row.platform === "internal") current.internal = row.sold;
    extraByEdition.set(row.editionId, current);
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
      return {
        id: row.id,
        name: row.name,
        startsAt: row.startsAt,
        day: amsterdamDay(row.startsAt),
        weeztix: hasWeeztix ? inv.sold : null,
        deurverkoop: extra?.internal ?? null,
        ra: extra?.ra ?? null,
        appic: extra?.appic ?? null,
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
        Weeztix en scans komen live binnen. Deurverkoop en Resident Advisor
        vullen mee zodra die cijfers in de voorraad staan. Appic, Wingame Appic
        en vriendentickets volgen nog. Totaal = som van de kanalen. Gescand =
        Weeztix check-in.
      </p>
    </div>
  );
}
