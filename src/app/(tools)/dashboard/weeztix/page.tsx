import { desc, isNotNull, sql } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import { formatNumber } from "@/lib/utils";
import { and, eq } from "drizzle-orm";

export const metadata = { title: "Weeztix events" };
export const dynamic = "force-dynamic";

export default async function WeeztixEventsPage() {
  if (!hasDatabase()) {
    return (
      <div>
        <SectionHeader
          eyebrow="Weeztix"
          title="Events"
          description="Geen DATABASE_URL — sync kan niet worden getoond."
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
        where platform = 'weeztix') as total_sold
  `);
  const t = (totals as unknown as Array<Record<string, number>>)[0] ?? {
    editions: 0,
    with_sales: 0,
    total_sold: 0,
  };

  const rows = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
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
    .where(isNotNull(editions.weeztixEventId))
    .orderBy(desc(editions.startsAt))
    .limit(60);

  return (
    <div>
      <SectionHeader
        eyebrow="Weeztix · read-only"
        title="Events & ticketstats"
        description="Historische sold_count per editie uit Weeztix tickettypes. Alleen GET — niets terugschrijven."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Edities"
          value={formatNumber(Number(t.editions ?? 0))}
          accent
        />
        <MetricCard
          label="Met ticketverkoop"
          value={formatNumber(Number(t.with_sales ?? 0))}
        />
        <MetricCard
          label="Totaal sold"
          value={formatNumber(Number(t.total_sold ?? 0))}
          hint="som over alle edities"
        />
      </div>

      <section className="border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Editie</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Sold</th>
                <th className="px-4 py-3 font-medium">Cap</th>
                <th className="px-4 py-3 font-medium">Nog</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => !/TEMPLATE/i.test(r.name))
                .map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="max-w-[320px] truncate px-4 py-3 text-text">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {row.startsAt.toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.sold != null ? formatNumber(row.sold) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.capacity != null ? formatNumber(row.capacity) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.available != null
                        ? formatNumber(row.available)
                        : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
