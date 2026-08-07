import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TicketSalesChart } from "@/components/dashboard/ticket-sales-chart";
import {
  editions,
  platformLabels,
  ticketInventory,
} from "@/lib/mock/dashboard";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Kaartverkoop" };

export default function TicketsPage() {
  const edition = editions.find((e) => e.status === "live") ?? editions[0];
  const inventory = ticketInventory.filter((t) => t.editionId === edition.id);
  const primarySoldOut = inventory.some(
    (i) => i.platform === "resident_advisor" && i.isSoldOut,
  );
  const secondaryActive = inventory.some(
    (i) => i.platform === "ticketswap" && i.available > 0,
  );

  return (
    <div>
      <SectionHeader
        eyebrow="Kaartverkoop"
        title="Live per platform"
        description="Near-real-time sync waar de API het toelaat — Weeztix, RA, Appic, TicketSwap en intern."
      />

      {primarySoldOut && secondaryActive && (
        <div className="mb-6 border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Officieel kanaal (RA) is sold-out terwijl TicketSwap nog tickets toont.
          Zie Alerts voor notificatie-status.
        </div>
      )}

      <div className="mb-6 overflow-x-auto border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Verkocht</th>
              <th className="px-4 py-3 font-medium">Beschikbaar</th>
              <th className="px-4 py-3 font-medium">Capaciteit</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((row) => (
              <tr
                key={row.platform}
                className="border-b border-border last:border-0 hover:bg-surface/60"
              >
                <td className="px-4 py-3 text-text">
                  {platformLabels[row.platform]}
                </td>
                <td className="px-4 py-3 font-mono">{formatNumber(row.sold)}</td>
                <td className="px-4 py-3 font-mono text-accent">
                  {formatNumber(row.available)}
                </td>
                <td className="px-4 py-3 font-mono text-text-muted">
                  {row.capacity != null ? formatNumber(row.capacity) : "—"}
                </td>
                <td className="px-4 py-3">
                  {row.isSoldOut ? (
                    <StatusBadge tone="danger">Sold out</StatusBadge>
                  ) : row.platform === "ticketswap" ? (
                    <StatusBadge tone="warn">Secundair</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Open</StatusBadge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Trend · afgelopen week
        </h2>
        <TicketSalesChart />
      </section>
    </div>
  );
}
