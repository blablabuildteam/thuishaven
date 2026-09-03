import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOutreachResultsSnapshot } from "@/lib/outreach/results";
import { formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Resultaten" };
export const dynamic = "force-dynamic";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "d MMM · HH:mm", { locale: nl });
}

export default async function OutreachAnalyticsPage() {
  const snap = await getOutreachResultsSnapshot();

  return (
    <div>
      <SectionHeader
        eyebrow="Performance"
        title="Resultaten"
        description="Opens, clicks en A/B per onderwerpregel. Tracking via Brevo-webhook. Live prospect-send blijft uit; testsends naar team@ mogen."
        action={
          <div className="flex flex-wrap gap-2">
            {snap.sendLocked ? (
              <StatusBadge tone="danger">Live send locked</StatusBadge>
            ) : (
              <StatusBadge tone="success">Live unlocked</StatusBadge>
            )}
            {snap.testSendAllowed ? (
              <StatusBadge tone="success">Testsend aan</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Testsend uit</StatusBadge>
            )}
            <Link
              href="/outreach/emails"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Drafts / test →
            </Link>
          </div>
        }
      />

      <div className="mb-6 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        <p className="font-medium text-text">Zo werkt open-tracking</p>
        <p className="mt-1">
          1) Genereer draft met A/B-onderwerp · 2) Stuur test naar{" "}
          <code className="text-accent">team@blablabuild.com</code> · 3) Open de
          mail · 4) Open verschijnt hier (Brevo webhook). From:{" "}
          <code>zakelijk@</code> · reply-to: <code>evenement@</code>.
        </p>
      </div>

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Drafts" value={String(snap.kpis.drafts)} />
        <MetricCard label="Verzonden" value={String(snap.kpis.sent)} />
        <MetricCard label="Geopend" value={String(snap.kpis.opened)} accent />
        <MetricCard
          label="Open rate"
          value={formatPercent(snap.kpis.openRate)}
        />
        <MetricCard label="Geklikt" value={String(snap.kpis.clicked)} />
        <MetricCard label="CTR" value={formatPercent(snap.kpis.clickRate)} />
        <MetricCard label="Replies" value={String(snap.kpis.replied)} />
        <MetricCard
          label="Reply rate"
          value={formatPercent(snap.kpis.replyRate)}
        />
      </div>

      <section className="mb-8 border border-border bg-surface p-4">
        <h2 className="mb-2 font-display text-2xl tracking-[0.06em]">
          Uitstaande leads · follow-up
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          Geopend, nog geen reply. Na 3 dagen “klaar” voor een zachte reminder —
          alleen als queue, geen auto-send. Copy noemt nooit dat we een open zagen.
        </p>
        {snap.followUpCandidates.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nog geen uitstaande leads. Zodra iemand opent zonder te antwoorden,
            verschijnt die hier.
          </p>
        ) : (
          <ul className="space-y-3">
            {snap.followUpCandidates.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 border border-border bg-bg p-4"
              >
                <div>
                  <p className="text-sm font-medium text-text">{c.companyName}</p>
                  <p className="font-mono text-xs text-text-dim">
                    {c.toEmail ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">{c.subject}</p>
                </div>
                <div className="text-right">
                  <StatusBadge tone={c.ready ? "accent" : "info"}>
                    {c.ready ? "follow-up klaar" : "wacht nog"}
                  </StatusBadge>
                  <p className="mt-2 text-xs text-text-dim">
                    {c.daysSinceSent} dag{c.daysSinceSent === 1 ? "" : "en"} geleden
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8 border border-border bg-surface p-4">
        <h2 className="mb-2 font-display text-2xl tracking-[0.06em]">
          A/B · onderwerpregels
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          Per variant arm A vs B. Winner = hoogste open rate binnen dezelfde
          variant.
        </p>
        {snap.ab.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nog geen verzonden mails. Stuur een test vanaf E-mails om A/B te
            vullen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="pb-3 font-medium">Variant</th>
                  <th className="pb-3 font-medium">Arm</th>
                  <th className="pb-3 font-medium">Onderwerp</th>
                  <th className="pb-3 font-medium">Sent</th>
                  <th className="pb-3 font-medium">Open</th>
                  <th className="pb-3 font-medium">CTR</th>
                  <th className="pb-3 font-medium">Reply</th>
                  <th className="pb-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {snap.ab.map((row) => (
                  <tr
                    key={`${row.variantKey}-${row.subjectKey}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pr-3 text-text">{row.variantName}</td>
                    <td className="py-3 font-mono text-xs uppercase text-accent">
                      {row.subjectKey}
                    </td>
                    <td className="max-w-xs py-3 pr-3 text-text-muted">
                      {row.subject}
                    </td>
                    <td className="py-3 font-mono">{row.sent}</td>
                    <td className="py-3 font-mono">
                      {formatPercent(row.openRate)}
                      <span className="ml-1 text-xs text-text-dim">
                        ({row.opened})
                      </span>
                    </td>
                    <td className="py-3 font-mono">
                      {formatPercent(row.clickRate)}
                    </td>
                    <td className="py-3 font-mono">
                      {formatPercent(row.replyRate)}
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
        )}
      </section>

      <section className="mb-8 border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Mails · open-status
        </h2>
        {snap.rows.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nog geen mails. Genereer op{" "}
            <Link href="/outreach/emails" className="text-accent underline">
              E-mails
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="pb-3 font-medium">Bedrijf</th>
                  <th className="pb-3 font-medium">A/B</th>
                  <th className="pb-3 font-medium">Onderwerp</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Verzonden</th>
                  <th className="pb-3 font-medium">Geopend</th>
                  <th className="pb-3 font-medium">Klik</th>
                  <th className="pb-3 font-medium">Reply</th>
                </tr>
              </thead>
              <tbody>
                {snap.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pr-3">
                      <p className="text-text">{row.companyName}</p>
                      <p className="font-mono text-xs text-text-dim">
                        {row.toEmail ?? "—"}
                      </p>
                    </td>
                    <td className="py-3 font-mono text-xs text-text-muted">
                      {(row.variantKey ?? "—").replace("_", " ")}
                      {row.subjectKey ? ` · ${row.subjectKey}` : ""}
                    </td>
                    <td className="max-w-xs py-3 pr-3 text-text-muted">
                      {row.subject}
                    </td>
                    <td className="py-3">
                      <StatusBadge
                        tone={
                          row.replied
                            ? "accent"
                            : row.opened
                              ? "success"
                              : row.status === "bounced"
                                ? "danger"
                                : row.status === "sent"
                                  ? "info"
                                  : "neutral"
                        }
                      >
                        {row.status}
                      </StatusBadge>
                    </td>
                    <td className="py-3 font-mono text-xs text-text-muted">
                      {fmt(row.sentAt)}
                    </td>
                    <td className="py-3">
                      {row.opened ? (
                        <span className="text-accent">{fmt(row.openedAt)}</span>
                      ) : row.status === "sent" ? (
                        <span className="text-text-dim">nog niet</span>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </td>
                    <td className="py-3 font-mono text-xs text-text-muted">
                      {row.clicked ? fmt(row.clickedAt) : "—"}
                    </td>
                    <td className="py-3 font-mono text-xs text-text-muted">
                      {row.replied ? fmt(row.repliedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
        {snap.recentReplies.length === 0 ? (
          <p className="text-sm text-text-muted">Nog geen replies.</p>
        ) : (
          <ul className="space-y-3">
            {snap.recentReplies.map((reply) => (
              <li key={reply.id} className="border border-border bg-bg p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="accent">
                    {reply.sentiment ?? "reply"}
                  </StatusBadge>
                  <span className="text-xs text-text-dim">
                    {fmt(reply.receivedAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-text">
                  {reply.companyName ?? "Onbekend"}{" "}
                  <span className="font-normal text-text-dim">
                    &lt;{reply.fromEmail}&gt;
                  </span>
                </p>
                {reply.subject && (
                  <p className="mt-0.5 text-xs text-text-muted">{reply.subject}</p>
                )}
                {reply.bodyPreview && (
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    {reply.bodyPreview}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
