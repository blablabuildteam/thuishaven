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
        description="Per mail: verzonden, geopend, geklikt, gereageerd. Opens komen binnen via Brevo-webhook zodra versturen aanstaat."
        action={
          <div className="flex flex-wrap gap-2">
            {snap.sendLocked ? (
              <StatusBadge tone="danger">Send locked</StatusBadge>
            ) : (
              <StatusBadge tone="success">Send unlocked</StatusBadge>
            )}
            <Link
              href="/outreach/planning"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Planning →
            </Link>
          </div>
        }
      />

      {snap.sendLocked && (
        <div className="mb-6 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">Nog geen live verzending</p>
          <p className="mt-1">
            Dit dashboard vult zich zodra mails via de geïsoleerde outreach-Brevo
            gaan en de webhook open/click events terugstuurt. Reply-to:{" "}
            <code className="text-accent">evenement@thuishaven.nl</code>.
          </p>
        </div>
      )}

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Drafts" value={String(snap.kpis.drafts)} />
        <MetricCard label="Verzonden" value={String(snap.kpis.sent)} />
        <MetricCard label="Geopend" value={String(snap.kpis.opened)} accent />
        <MetricCard
          label="Open rate"
          value={formatPercent(snap.kpis.openRate)}
        />
        <MetricCard label="Geklikt" value={String(snap.kpis.clicked)} />
        <MetricCard
          label="CTR"
          value={formatPercent(snap.kpis.clickRate)}
        />
        <MetricCard label="Replies" value={String(snap.kpis.replied)} />
        <MetricCard
          label="Reply rate"
          value={formatPercent(snap.kpis.replyRate)}
        />
      </div>

      <section className="mb-8 border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Mails · open-status
        </h2>
        {snap.rows.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nog geen mails in de database. Genereer drafts op{" "}
            <Link href="/outreach/emails" className="text-accent underline">
              E-mails
            </Link>{" "}
            — opens verschijnen hier na verzending.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="pb-3 font-medium">Bedrijf</th>
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
          <p className="text-sm text-text-muted">
            Nog geen replies. Replies op outbound komen hier binnen (en later
            als warme lead naar Reijner/Yoram).
          </p>
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
