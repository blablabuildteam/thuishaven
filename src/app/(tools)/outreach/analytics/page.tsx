import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  analyticsKpis,
  inboxReplies,
  subjectPerformance,
} from "@/lib/mock/mail-performance";
import { formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import Link from "next/link";

export const metadata = { title: "Mail analytics" };

export default function OutreachAnalyticsPage() {
  const subjects = subjectPerformance();

  return (
    <div>
      <SectionHeader
        eyebrow="Performance"
        title="Wat werkt"
        description="Open rates, CTR op onderwerpregels en availability-link, replies en leads — zodat we A/B kunnen sturen per groep."
        action={
          <Link
            href="/outreach/varianten"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] text-text transition-colors hover:border-accent"
          >
            Mailvarianten →
          </Link>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Verzonden" value={String(analyticsKpis.sent)} />
        <MetricCard
          label="Open rate"
          value={formatPercent(analyticsKpis.openRate)}
        />
        <MetricCard
          label="CTR"
          value={formatPercent(analyticsKpis.ctr)}
          accent
        />
        <MetricCard
          label="Reply rate"
          value={formatPercent(analyticsKpis.replyRate)}
        />
        <MetricCard
          label="Agenda-link clicks"
          value={String(analyticsKpis.availabilityLinkClicks)}
          hint="live beschikbaarheids-URL"
        />
      </div>

      <div className="mb-6 border border-highlight bg-highlight/20 px-4 py-3 dark:bg-accent-soft">
        <p className="font-display text-sm tracking-[0.12em] text-text">
          Best presterend
        </p>
        <p className="mt-1 text-sm text-text-muted">
          Groep <span className="text-text">{analyticsKpis.bestGroup}</span>
          {" · "}
          onderwerp{" "}
          <span className="text-text">&ldquo;{analyticsKpis.bestSubject}&rdquo;</span>
        </p>
      </div>

      <section className="mb-8 border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Onderwerpregels · A/B
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-3 font-medium">Onderwerp</th>
                <th className="pb-3 font-medium">Groep</th>
                <th className="pb-3 font-medium">Sent</th>
                <th className="pb-3 font-medium">Open</th>
                <th className="pb-3 font-medium">CTR</th>
                <th className="pb-3 font-medium">Reply</th>
                <th className="pb-3 font-medium">Lead</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {subjects.map((row) => (
                <tr
                  key={row.subjectId}
                  className="border-b border-border last:border-0"
                >
                  <td className="max-w-xs py-3 pr-3 text-text">{row.subject}</td>
                  <td className="py-3 text-text-muted">{row.groupLabel}</td>
                  <td className="py-3 font-mono">{row.sent}</td>
                  <td className="py-3 font-mono">
                    {formatPercent(row.openRate)}
                  </td>
                  <td className="py-3 font-mono text-accent">
                    {formatPercent(row.ctr)}
                  </td>
                  <td className="py-3 font-mono">
                    {formatPercent(row.replyRate)}
                  </td>
                  <td className="py-3 font-mono">
                    {formatPercent(row.leadRate)}
                  </td>
                  <td className="py-3">
                    {row.winner && (
                      <StatusBadge tone="accent">Winner</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-border bg-surface p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl tracking-[0.06em]">
            Inbox · replies
          </h2>
          <Link
            href="/outreach/leads"
            className="text-xs text-accent hover:underline"
          >
            Leads →
          </Link>
        </div>
        <ul className="space-y-3">
          {inboxReplies.map((reply) => (
            <li
              key={reply.id}
              className="border border-border bg-bg p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={
                    reply.sentiment === "positive"
                      ? "accent"
                      : reply.sentiment === "neutral"
                        ? "neutral"
                        : "danger"
                  }
                >
                  {reply.sentiment}
                </StatusBadge>
                <span className="text-xs text-text-dim">
                  {reply.linkedVariant}
                </span>
                <span className="text-xs text-text-dim">
                  {format(new Date(reply.receivedAt), "d MMM · HH:mm", {
                    locale: nl,
                  })}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-text">
                {reply.company}{" "}
                <span className="font-normal text-text-dim">
                  &lt;{reply.from}&gt;
                </span>
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{reply.subject}</p>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {reply.preview}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
