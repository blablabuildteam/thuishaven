import Link from "next/link";
import { desc, isNotNull, sql, and, eq } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import { formatNumber, formatPercent } from "@/lib/utils";

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
    .limit(80);

  return (
    <div>
      <SectionHeader
        eyebrow="Weeztix"
        title="Tickets"
        description="Sold, cap en fill per editie. Mail-effect → Mailings."
        action={
          <Link
            href="/dashboard/marketing"
            className="bg-accent px-3 py-2 text-sm text-accent-contrast"
          >
            Mail-effect
          </Link>
        }
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
            {formatNumber(Number(t.with_sales ?? 0))}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            met sales
          </span>
        </p>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Editie</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Sold</th>
              <th className="px-4 py-3 font-medium">Cap</th>
              <th className="px-4 py-3 font-medium">Fill</th>
              <th className="px-4 py-3 font-medium">Nog</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => !/TEMPLATE/i.test(r.name))
              .map((row) => {
                const sold = row.sold ?? 0;
                const cap = row.capacity;
                const st =
                  cap != null && cap > 0 ? (sold / cap) * 100 : null;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="max-w-[320px] truncate px-4 py-3">
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
                      {cap != null ? formatNumber(cap) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {st != null ? formatPercent(st, 0) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.available != null
                        ? formatNumber(row.available)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-dim">
        Cap = sold + available uit Weeztix-stock (geen zaalcapaciteit).
      </p>
    </div>
  );
}
