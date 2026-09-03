import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOutreachOverview } from "@/lib/outreach/data";
import { openAvailabilityDaysLive } from "@/lib/outreach/availability";
import { getUsageSummary } from "@/lib/usage/store";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

function eurFromCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function OutreachPage() {
  const overview = await getOutreachOverview();
  const openSlots = await openAvailabilityDaysLive();
  const openRate =
    overview.kpis.sent > 0
      ? (overview.kpis.opened / overview.kpis.sent) * 100
      : 0;
  let usage: Awaited<ReturnType<typeof getUsageSummary>> | null = null;
  try {
    usage = await getUsageSummary({ sinceDays: 30, tool: "outreach" });
  } catch (e) {
    console.error("outreach usage", e);
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Bedrijfsevent Outreach"
        title="Outbound overzicht"
        description="Mailvarianten per groep, A/B onderwerpregels, live beschikbaarheidsagenda en lead routing."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="danger">Send locked</StatusBadge>
            <StatusBadge tone={overview.source === "db" ? "success" : "neutral"}>
              {overview.source === "db"
                ? `${overview.prospectCount} prospects · ${overview.exclusionCount} uitsluitingen`
                : "Mockdata"}
            </StatusBadge>
            <Link
              href="/outreach/planning"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Planning
            </Link>
            <Link
              href="/outreach/kosten"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Kostmeter →
            </Link>
            <Link
              href="/outreach/emails"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Drafts →
            </Link>
            <Link
              href="/outreach/beschikbaarheid"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Agenda
            </Link>
          </div>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Prospects"
          value={formatNumber(overview.kpis.prospectsTotal)}
        />
        <MetricCard
          label="Verzonden"
          value={formatNumber(overview.kpis.sent)}
          accent
        />
        <MetricCard label="Geopend" value={formatPercent(openRate)} />
        <MetricCard
          label="Gereageerd"
          value={formatNumber(overview.kpis.replied)}
        />
        <MetricCard label="Leads" value={formatNumber(overview.kpis.leads)} />
        <MetricCard
          label="Kosten · 30d"
          value={usage ? eurFromCents(usage.totalEurCents) : "—"}
          hint={
            usage
              ? `${eurFromCents(usage.clientBilledEurCents)} op hun KvK`
              : "Kostmeter tijdelijk niet geladen"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl tracking-[0.06em]">Campagnes</h2>
            <Link
              href="/outreach/campaigns"
              className="text-xs text-accent hover:underline"
            >
              Alles →
            </Link>
          </div>
          <ul className="space-y-3">
            {overview.campaigns.map((c) => (
              <li key={c.id} className="border border-border bg-bg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text">{c.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {c.description}
                    </p>
                  </div>
                  <StatusBadge tone="success">{c.status}</StatusBadge>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-text-muted">
                  <span>{c.sentCount} sent</span>
                  <span>{c.openCount} open</span>
                  <span className="text-accent">{c.leadCount} leads</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl tracking-[0.06em]">
              Warme leads
            </h2>
            <Link
              href="/outreach/leads"
              className="text-xs text-accent hover:underline"
            >
              Inbox →
            </Link>
          </div>
          {overview.leads.length === 0 ? (
            <p className="text-sm text-text-muted">Nog geen warme leads.</p>
          ) : (
            <ul className="space-y-3">
              {overview.leads.map((lead) => (
                <li
                  key={lead.id}
                  className="border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <p className="text-sm text-text">{lead.companyName}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    {lead.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 mt-6 text-[11px] uppercase tracking-wider text-text-dim">
            Open slots (bureau-campagne)
          </h3>
          <ul className="space-y-1.5">
            {openSlots.slice(0, 5).map((slot) => (
              <li
                key={slot.id}
                className="flex items-center gap-2 text-xs text-text-muted"
              >
                <span className="size-1.5 rounded-full bg-accent" />
                {slot.label ?? slot.date}
              </li>
            ))}
          </ul>
          <Link
            href="/beschikbaar"
            className="mt-4 inline-block font-display text-sm tracking-[0.1em] text-accent hover:underline"
          >
            Live agenda voor prospects →
          </Link>
        </section>
      </div>
    </div>
  );
}
