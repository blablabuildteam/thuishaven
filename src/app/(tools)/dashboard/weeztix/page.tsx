import Link from "next/link";
import { desc, isNotNull, sql, and, eq } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";

export const metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

/**
 * Weeztix-voorraad & sell-through. Mail-effect staat op /dashboard/marketing.
 */
export default async function WeeztixEventsPage() {
  if (!hasDatabase()) {
    return (
      <div>
        <SectionHeader
          eyebrow="Tickets"
          title="Weeztix"
          description="Geen DATABASE_URL."
        />
      </div>
    );
  }

  const db = getDb();
  const totals = await db.execute(sql`
    select
      (select count(*)::int from editions
        where weeztix_event_id is not null
          and name not ilike '%TEMPLATE%') as editions,
      (select count(*)::int from ticket_inventory
        where platform = 'weeztix' and sold > 0) as with_sales,
      (select coalesce(sum(sold),0)::int from ticket_inventory
        where platform = 'weeztix') as total_sold,
      (select coalesce(sum(scanned),0)::int from ticket_inventory
        where platform = 'weeztix') as total_scanned,
      (select coalesce(sum(paid_sold),0)::int from ticket_inventory
        where platform = 'weeztix') as total_paid,
      (select coalesce(sum(free_sold),0)::int from ticket_inventory
        where platform = 'weeztix') as total_free,
      (select coalesce(sum(revenue_cents),0)::bigint from ticket_inventory
        where platform = 'weeztix') as total_revenue_cents
  `);
  const t = (totals as unknown as Array<Record<string, number>>)[0] ?? {
    editions: 0,
    with_sales: 0,
    total_sold: 0,
    total_scanned: 0,
    total_paid: 0,
    total_free: 0,
    total_revenue_cents: 0,
  };

  const rows = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      sold: ticketInventory.sold,
      scanned: ticketInventory.scanned,
      paidSold: ticketInventory.paidSold,
      freeSold: ticketInventory.freeSold,
      revenueCents: ticketInventory.revenueCents,
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
    .orderBy(desc(editions.startsAt))
    .limit(80);

  return (
    <div>
      <SectionHeader
        eyebrow="Weeztix"
        title="Tickets"
        description="Sold, gescand, omzet, betaald/gratis en restcapaciteit per editie. Klik een naam voor demografie."
      />

      <div className="mb-6 flex flex-wrap gap-8">
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
            sold
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
            {formatNumber(Number(t.total_paid ?? 0))}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            betaald
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {formatNumber(Number(t.total_free ?? 0))}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            gratis
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

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Editie</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Sold</th>
              <th className="px-4 py-3 font-medium">Gescand</th>
              <th className="px-4 py-3 font-medium">Scan</th>
              <th className="px-4 py-3 font-medium">Betaald</th>
              <th className="px-4 py-3 font-medium">Gratis</th>
              <th className="px-4 py-3 font-medium">Omzet</th>
              <th className="px-4 py-3 font-medium">Cap</th>
              <th className="px-4 py-3 font-medium">Nog</th>
              <th className="px-4 py-3 font-medium">Fill</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => !/TEMPLATE/i.test(r.name))
              .map((row) => {
                const inv = normalizeWeeztixInventory({
                  sold: row.sold,
                  capacity: row.capacity,
                  available: row.available,
                });
                const sold = inv.sold;
                const scanned = row.scanned ?? 0;
                const scanRate = sold > 0 ? (scanned / sold) * 100 : null;
                const cap = inv.capacity;
                const nog = inv.available;
                const st =
                  cap != null && cap > 0 ? (sold / cap) * 100 : null;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="max-w-[320px] truncate px-4 py-3">
                      <Link
                        href={`/dashboard/weeztix/${row.id}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {row.startsAt.toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.sold != null ? formatNumber(sold) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.sold != null ? formatNumber(scanned) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.sold != null && scanRate != null
                        ? formatPercent(scanRate, 0)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.sold != null
                        ? formatNumber(row.paidSold ?? 0)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.sold != null
                        ? formatNumber(row.freeSold ?? 0)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.sold != null
                        ? formatCurrency((row.revenueCents ?? 0) / 100)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {cap != null ? formatNumber(cap) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {cap != null ? formatNumber(nog) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {st != null ? formatPercent(st, 0) : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-dim">
        Gescand = som van Weeztix scanned_count per tickettype (check-in).
        Scan = gescand / sold. Omzet = Weeztix ticketprijs × sold (geen
        servicekosten). Gratis = tickettypes met prijs 0. Cap = som van
        allotments. Nog = cap − sold.
      </p>
    </div>
  );
}
