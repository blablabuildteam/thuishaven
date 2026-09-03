import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOutreachPlanningSnapshot } from "@/lib/outreach/planning";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Planning" };
export const dynamic = "force-dynamic";

export default async function OutreachPlanningPage() {
  const plan = await getOutreachPlanningSnapshot();

  return (
    <div>
      <SectionHeader
        eyebrow="Review eerst"
        title="Planning & wachtrij"
        description="Alles wat klaarstaat om later te mailen — zonder dat er iets de deur uit gaat. Versturen staat hard uit tot jij dat expliciet aanzet."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="danger">Send locked</StatusBadge>
            <Link
              href="/outreach/emails"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Drafts →
            </Link>
          </div>
        }
      />

      <div className="mb-6 border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-text-muted">
        <p className="font-medium text-text">Niets wordt verstuurd.</p>
        <p className="mt-1">
          {plan.sendBlockReason ??
            "Versturen geblokkeerd. Marketing/visitor-Brevo blijft onaangeroerd."}
        </p>
        <p className="mt-2 text-xs text-text-dim">
          Afzender later: <code>zakelijk@thuishaven.nl</code> · reply-to{" "}
          <code>evenement@thuishaven.nl</code> · bestaande Brevo-API (geen nieuw
          account nodig). Visitor-mailings via <code>postduif@</code> blijven
          gescheiden.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Klaar om te mailen" value={formatNumber(plan.readyCount)} accent />
        <MetricCard label="Uitgesloten bureaus" value={formatNumber(plan.excludedAgencyCount)} />
        <MetricCard label="Zonder e-mail" value={formatNumber(plan.noEmailCount)} />
        <MetricCard label="Uitsluitingen totaal" value={formatNumber(plan.exclusionCount)} />
        <MetricCard label="Drafts" value={formatNumber(plan.draftCount)} />
        <MetricCard label="Open agenda-slots" value={formatNumber(plan.openSlotCount)} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <section className="border border-border bg-surface p-4">
          <h2 className="font-display text-2xl tracking-[0.06em]">Ritme</h2>
          <p className="mt-2 text-sm text-text-muted">{plan.cadence.batchLabel}</p>
          <ul className="mt-4 space-y-2 text-sm text-text-muted">
            <li>
              Dagen:{" "}
              <span className="text-text">
                {plan.cadence.sendWeekdays
                  .map((d) => ["", "ma", "di", "wo", "do", "vr", "za", "zo"][d])
                  .join(" · ")}
              </span>
            </li>
            <li>
              Volume:{" "}
              <span className="text-text">
                max {plan.cadence.mailsPerDay} mails/dag (~
                {plan.cadence.sendWeekdays.length * plan.cadence.mailsPerDay}
                /week)
              </span>
            </li>
            <li>
              Doorlooptijd huidige queue:{" "}
              <span className="text-accent">
                ~{plan.weeksToClear} week{plan.weeksToClear === 1 ? "" : "en"}
              </span>
            </li>
          </ul>
          <ul className="mt-4 space-y-1.5 text-xs text-text-dim">
            {plan.cadence.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </section>

        <section className="border border-border bg-surface p-4">
          <h2 className="font-display text-2xl tracking-[0.06em]">
            Mailvarianten
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Op basis van Reijners tone of voice — nog niet verstuurd, wel klaar om te
            A/B-testen zodra jij groen licht geeft.
          </p>
          <ul className="mt-4 space-y-3">
            {plan.variants.map((v) => (
              <li key={v.id} className="border border-border bg-bg p-3">
                <p className="text-sm font-medium text-text">{v.name}</p>
                <p className="mt-1 text-xs text-text-muted">{v.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-2xl tracking-[0.06em]">
          Voorgesteld schema
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          Conceptplanning voor de klaarstaande bureaus. Dit is een voorstel — geen
          cron, geen auto-send.
        </p>
        {plan.schedule.length === 0 ? (
          <p className="text-sm text-text-muted">Nog niemand in de queue.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.schedule.map((slot) => (
              <article
                key={slot.dateLabel}
                className="border border-border bg-surface p-4"
              >
                <p className="font-display text-sm tracking-[0.12em] text-text-muted">
                  {slot.weekdayLabel} · {slot.dateLabel}
                </p>
                <ul className="mt-3 space-y-2">
                  {slot.prospects.map((p) => (
                    <li key={p.id} className="text-sm">
                      <p className="text-text">{p.companyName}</p>
                      <p className="font-mono text-xs text-text-dim">{p.email}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl tracking-[0.06em]">
          Volledige wachtrij
        </h2>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Bureau</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Contacten</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Blokker</th>
              </tr>
            </thead>
            <tbody>
              {plan.queue.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50"
                >
                  <td className="px-4 py-3 text-text">{row.companyName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {row.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {row.contacts.length}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      tone={row.blockedReason ? "danger" : "success"}
                    >
                      {row.status}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {row.blockedReason ?? "—"}
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
