import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TicketSalesChart } from "@/components/dashboard/ticket-sales-chart";
import {
  activeAlerts,
  dashboardKpis,
  editions,
  marketingPosts,
  platformLabels,
  ticketInventory,
} from "@/lib/mock/dashboard";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  const edition = editions.find((e) => e.status === "live") ?? editions[0];
  const inventory = ticketInventory.filter((t) => t.editionId === edition.id);

  return (
    <div>
      <SectionHeader
        eyebrow="Marketing & Kaartverkoop"
        title={edition.name}
        description="Unified view — ticketverkoop en marketing naast elkaar, gekoppeld per editie."
        action={
          <StatusBadge tone="accent" pulse>
            Live editie
          </StatusBadge>
        }
      />

      {activeAlerts.map((alert) => (
        <Link
          key={alert.id}
          href="/dashboard/alerts"
          className="mb-6 flex items-start gap-3 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 transition-colors hover:bg-danger/15"
        >
          <StatusBadge tone="danger" pulse>
            Alert
          </StatusBadge>
          <div>
            <p className="text-sm font-medium text-text">{alert.title}</p>
            <p className="mt-0.5 text-xs text-text-muted">{alert.message}</p>
          </div>
        </Link>
      ))}

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Tickets verkocht"
          value={formatNumber(dashboardKpis.totalSold)}
          trend={`+${dashboardKpis.ticketsLast24h} / 24u`}
          accent
        />
        <MetricCard
          label="Omzet (indicatief)"
          value={formatCurrency(dashboardKpis.revenueEstimate)}
          hint="excl. fees · mock"
        />
        <MetricCard
          label="E-mail open rate"
          value={formatPercent(dashboardKpis.openRate)}
          hint="Brevo campagnes"
        />
        <MetricCard
          label="Beste kanaal"
          value={dashboardKpis.bestChannel}
          hint="op tickets rond publicatie"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-sm border border-border bg-surface p-4 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg tracking-tight">Verkoop per dag</h2>
            <Link
              href="/dashboard/tickets"
              className="text-xs text-accent hover:underline"
            >
              Alle platforms →
            </Link>
          </div>
          <TicketSalesChart />
        </section>

        <section className="rounded-sm border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="mb-4 font-display text-lg tracking-tight">
            Voorraad per platform
          </h2>
          <ul className="space-y-3">
            {inventory.map((row) => (
              <li
                key={row.platform}
                className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm text-text">
                    {platformLabels[row.platform]}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatNumber(row.sold)} verkocht
                    {row.capacity != null && ` · ${formatNumber(row.capacity)} cap`}
                  </p>
                </div>
                {row.isSoldOut ? (
                  <StatusBadge tone="danger">Sold out</StatusBadge>
                ) : (
                  <span className="font-mono text-sm text-accent">
                    {formatNumber(row.available)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-sm border border-border bg-surface p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight">
            Top creatives → tickets
          </h2>
          <Link
            href="/dashboard/assets"
            className="text-xs text-accent hover:underline"
          >
            Visual recognition →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {marketingPosts.map((post) => (
            <div
              key={post.id}
              className="rounded-sm border border-border bg-bg p-3 transition-colors hover:border-border-strong"
            >
              <p className="text-[10px] uppercase tracking-wider text-text-dim">
                {post.channel}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-text">{post.title}</p>
              <p className="mt-3 font-display text-xl text-accent">
                +{post.ticketsAroundPublish}
              </p>
              <p className="text-[11px] text-text-muted">tickets ±48u</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
