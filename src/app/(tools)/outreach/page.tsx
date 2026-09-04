import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOutreachOverview } from "@/lib/outreach/data";
import { openAvailabilityDaysLive } from "@/lib/outreach/availability";
import { getPublicAvailabilityUrl } from "@/lib/outreach/availability";
import { outreachLiveSendBlockReason } from "@/lib/outreach/send-policy";
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

const STEPS = [
  {
    n: "1",
    title: "Agenda bijwerken",
    body: "Zet open wo/do/vr-dagen klaar. Dezelfde agenda deel je met prospects.",
    href: "/outreach/beschikbaarheid",
    cta: "Open agenda",
  },
  {
    n: "2",
    title: "Mail schrijven & testen",
    body: "Kies een prospect, genereer een draft, stuur een test naar team@.",
    href: "/outreach/emails",
    cta: "Naar e-mails",
  },
  {
    n: "3",
    title: "Resultaten bekijken",
    body: "Zie opens, A/B-onderwerpen en uitstaande leads.",
    href: "/outreach/analytics",
    cta: "Naar resultaten",
  },
] as const;

export default async function OutreachPage() {
  const overview = await getOutreachOverview();
  const openSlots = await openAvailabilityDaysLive();
  const liveUrl = getPublicAvailabilityUrl();
  const sendBlock = outreachLiveSendBlockReason();
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
        title="Overzicht"
        description="Hier regel je uitgaande mails voor bedrijfsevents: agenda, drafts, en wat er terugkomt. Live versturen staat uit tot jullie groen licht geven."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="danger">Live send uit</StatusBadge>
            <StatusBadge tone={overview.source === "db" ? "success" : "neutral"}>
              {overview.source === "db"
                ? `${overview.prospectCount} prospects`
                : "Mockdata"}
            </StatusBadge>
          </div>
        }
      />

      {sendBlock ? (
        <div className="mb-8 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">Nu veilig in testmodus</p>
          <p className="mt-1">{sendBlock}</p>
          <p className="mt-1 text-xs text-text-dim">
            Testsends gaan naar team@ · From zakelijk@ · reply-to evenement@
          </p>
        </div>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xl tracking-[0.06em] text-text">
          Zo werkt het
        </h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex flex-col border border-border bg-surface p-4"
            >
              <p className="font-display text-sm tracking-[0.16em] text-text-dim">
                Stap {step.n}
              </p>
              <h3 className="mt-2 text-sm font-medium text-text">{step.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
                {step.body}
              </p>
              <Link
                href={step.href}
                className="mt-4 inline-flex w-fit bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
              >
                {step.cta} →
              </Link>
            </li>
          ))}
        </ol>
      </section>

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
        <MetricCard label="Open rate" value={formatPercent(openRate)} />
        <MetricCard
          label="Replies"
          value={formatNumber(overview.kpis.replied)}
        />
        <MetricCard label="Leads" value={formatNumber(overview.kpis.leads)} />
        <MetricCard
          label="Kosten · 30d"
          value={usage ? eurFromCents(usage.totalEurCents) : "—"}
          hint={
            usage
              ? `${eurFromCents(usage.clientBilledEurCents)} KvK (hun account)`
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl tracking-[0.06em]">
              Agenda
            </h2>
            <Link
              href="/outreach/beschikbaarheid"
              className="text-xs text-accent hover:underline"
            >
              Beheren →
            </Link>
          </div>
          <p className="mb-4 text-sm text-text-muted">
            {openSlots.length} open slots · deelbaar met prospects
          </p>
          <ul className="mb-4 space-y-1.5">
            {openSlots.slice(0, 6).map((slot) => (
              <li
                key={slot.id}
                className="flex items-center gap-2 text-sm text-text-muted"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                {slot.label ?? slot.date}
              </li>
            ))}
            {openSlots.length === 0 ? (
              <li className="text-sm text-text-muted">
                Nog geen open dagen — vul de agenda.
              </li>
            ) : null}
          </ul>
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-xs text-accent underline-offset-2 hover:underline"
          >
            {liveUrl}
          </a>
        </section>

        <section className="border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl tracking-[0.06em]">
              Warme leads
            </h2>
            <Link
              href="/outreach/leads"
              className="text-xs text-accent hover:underline"
            >
              Alle leads →
            </Link>
          </div>
          {overview.leads.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nog geen warme leads. Replies landen eerst in evenement@; daarna
              zetten we ze hier zichtbaar.
            </p>
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

          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-text-dim">
              Campagnes
            </p>
            <ul className="space-y-2">
              {overview.campaigns.slice(0, 3).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-text">{c.name}</span>
                  <StatusBadge tone="neutral">{c.status}</StatusBadge>
                </li>
              ))}
            </ul>
            <Link
              href="/outreach/campaigns"
              className="mt-3 inline-block text-xs text-accent hover:underline"
            >
              Alle campagnes →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
