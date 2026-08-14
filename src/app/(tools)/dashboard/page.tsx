import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { getInsightsSnapshot } from "@/lib/insights/data";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const snap = await getInsightsSnapshot();
  const openRate =
    snap.brevo.totalSent > 0
      ? (snap.brevo.totalOpens / snap.brevo.totalSent) * 100
      : null;

  return (
    <div>
      <SectionHeader
        eyebrow="Dashboard"
        title="Overzicht"
        description="Live sync-data. Chat en diepere cijfers staan bij Insights."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/insights"
              className="bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              Insights
            </Link>
            <Link
              href="/koppelingen"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Koppelingen
            </Link>
          </div>
        }
      />

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Brevo campagnes"
          value={formatNumber(snap.brevo.campaigns)}
          accent
        />
        <MetricCard
          label="E-mails sent"
          value={formatNumber(snap.brevo.totalSent)}
        />
        <MetricCard
          label="Open rate"
          value={openRate != null ? formatPercent(openRate) : "—"}
        />
        <MetricCard
          label="Weeztix edities"
          value={formatNumber(snap.weeztix.editions)}
          hint={`${formatNumber(snap.weeztix.sold)} sold`}
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
          Sterkste open rates
        </h2>
        <ul className="divide-y divide-border border border-border bg-surface">
          {snap.brevo.top.slice(0, 5).map((c) => (
            <li
              key={c.name + String(c.sent)}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <p className="min-w-0 truncate text-sm text-text">{c.name}</p>
              <p className="shrink-0 font-mono text-sm text-text-muted">
                {c.openRate != null ? formatPercent(c.openRate) : "—"} ·{" "}
                {formatNumber(c.sent)}
              </p>
            </li>
          ))}
          {snap.brevo.top.length === 0 && (
            <li className="px-4 py-6 text-sm text-text-muted">
              Nog geen Brevo-data. Check{" "}
              <Link href="/koppelingen" className="underline">
                Koppelingen
              </Link>
              .
            </li>
          )}
        </ul>
      </section>

      <p className="text-sm text-text-muted">
        Kaartverkoop-grafieken volgen op live Weeztix-dailies.{" "}
        <Link href="/dashboard/weeztix" className="underline hover:text-text">
          Weeztix →
        </Link>
      </p>
    </div>
  );
}
