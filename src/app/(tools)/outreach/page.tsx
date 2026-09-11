import Link from "next/link";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOutreachOverview } from "@/lib/outreach/data";
import {
  getPublicAvailabilityUrl,
  openAvailabilityDaysLive,
} from "@/lib/outreach/availability";
import { outreachLiveSendBlockReason } from "@/lib/outreach/send-policy";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "1",
    title: "Lijst bijwerken",
    body: "Haal nieuwe bedrijven op en vul e-mailadressen aan.",
    href: "/outreach/lijst-bijwerken",
    cta: "Lijst bijwerken",
  },
  {
    n: "2",
    title: "Bedrijven bekijken",
    body: "Labels: Jubileum, Cold mail, Onvolledig, Past niet, of Niet mailen.",
    href: "/outreach/crm",
    cta: "Naar bedrijven",
  },
  {
    n: "3",
    title: "Mailen & volgen",
    body: "Maak mails, verstuur, en zie opens en replies onder Resultaten.",
    href: "/outreach/emails",
    cta: "Naar mailen",
  },
] as const;

function slotLine(dateIso: string, label?: string) {
  let dateBit = dateIso;
  try {
    dateBit = format(parseISO(dateIso), "EEE d MMM yyyy", { locale: nl });
  } catch {
    /* keep iso */
  }
  return label ? `${dateBit} · ${label}` : dateBit;
}

export default async function OutreachPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const overview = await getOutreachOverview();
  const openSlots = await openAvailabilityDaysLive();
  const liveUrl = getPublicAvailabilityUrl();
  const sendBlock = outreachLiveSendBlockReason();
  const openRate =
    overview.kpis.sent > 0
      ? (overview.kpis.opened / overview.kpis.sent) * 100
      : 0;

  return (
    <div>
      <SectionHeader
        eyebrow="Bedrijfsevent Outreach"
        title="Overzicht"
        description="Lijst bijwerken → bedrijven kiezen → mailen → resultaten. Agenda is optioneel."
        action={
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <StatusBadge tone={sendBlock ? "danger" : "success"}>
                {sendBlock ? "Live send uit" : "Live send aan"}
              </StatusBadge>
            ) : null}
            <StatusBadge tone={overview.source === "db" ? "success" : "neutral"}>
              {formatNumber(overview.prospectCount)} bedrijven
            </StatusBadge>
          </div>
        }
      />

      {sendBlock && isAdmin ? (
        <div className="mb-8 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">Testmodus</p>
          <p className="mt-1">{sendBlock}</p>
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
        <p className="mt-3 text-sm text-text-dim">
          Agenda bijwerken is optioneel — alleen als je open dagen in een mail
          wilt delen.
        </p>
      </section>

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Bedrijven"
          value={formatNumber(overview.kpis.prospectsTotal)}
        />
        <MetricCard
          label="Verzonden"
          value={formatNumber(overview.kpis.sent)}
          accent
        />
        <MetricCard label="Geopend" value={formatPercent(openRate)} />
        <MetricCard
          label="Replies"
          value={formatNumber(overview.kpis.replied)}
        />
        <MetricCard label="Leads" value={formatNumber(overview.kpis.leads)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl tracking-[0.06em]">Agenda</h2>
            <Link
              href="/outreach/beschikbaarheid"
              className="text-xs text-accent hover:underline"
            >
              Beheren →
            </Link>
          </div>
          <p className="mb-4 text-sm text-text-muted">
            Optioneel · {openSlots.length} open dagen om in mails te delen
          </p>
          <ul className="mb-4 space-y-1.5">
            {openSlots.slice(0, 6).map((slot) => (
              <li
                key={slot.id}
                className="flex items-center gap-2 text-sm text-text-muted"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                {slotLine(slot.date, slot.label)}
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
              href="/outreach/analytics"
              className="text-xs text-accent hover:underline"
            >
              Resultaten →
            </Link>
          </div>
          {overview.leads.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nog geen warme leads. Positieve replies verschijnen hier.
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
        </section>
      </div>
    </div>
  );
}
