import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOutreachResultsSnapshot } from "@/lib/outreach/results";
import { formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Resultaten" };
export const dynamic = "force-dynamic";

const STATUS_NL: Record<string, string> = {
  draft: "Concept",
  queued: "Wachtrij",
  sent: "Verzonden",
  opened: "Geopend",
  clicked: "Geklikt",
  replied: "Beantwoord",
  bounced: "Bounce",
  opted_out: "Uitgeschreven",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "d MMM · HH:mm", { locale: nl });
}

function statusLabel(status: string) {
  return STATUS_NL[status] ?? status;
}

export default async function OutreachAnalyticsPage() {
  const snap = await getOutreachResultsSnapshot();
  const happened = snap.rows.filter(
    (r) => r.status !== "draft" && Boolean(r.sentAt),
  );

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow="Stap 5"
        title="Resultaten"
        description="Wat er echt verstuurd is, en of het geopend, geklikt of beantwoord is. Antwoorden komen vanzelf binnen, net als opens en kliks."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/outreach/leads"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Warme leads →
            </Link>
            <Link
              href="/outreach/emails"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              ← Mailen
            </Link>
          </div>
        }
      />

      <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-4 text-sm">
        <p>
          <span className="text-text-dim">Verzonden</span>{" "}
          <strong className="font-display text-lg text-text">
            {snap.kpis.sent}
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Open</span>{" "}
          <strong className="text-text">
            {snap.kpis.opened} ({formatPercent(snap.kpis.openRate)})
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Reply</span>{" "}
          <strong className="text-text">
            {snap.kpis.replied} ({formatPercent(snap.kpis.replyRate)})
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Klik</span>{" "}
          <strong className="text-text">
            {snap.kpis.clicked} ({formatPercent(snap.kpis.clickRate)})
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Bounce</span>{" "}
          <strong className="text-text">{snap.kpis.bounced}</strong>
        </p>
        {snap.sendLocked ? (
          <StatusBadge tone="info">Live send uit · test ok</StatusBadge>
        ) : (
          <StatusBadge tone="success">Live send aan</StatusBadge>
        )}
      </div>

      <section className="mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Per invalshoek
        </h2>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Welke haak werkt: jubileum, seizoen, funding, recordjaar of
          algemeen. Reply-rate is de beste maatstaf — opens zijn onbetrouwbaar
          door privacy-instellingen van mailprogramma&apos;s.
        </p>
        {snap.byAngle.length === 0 ? (
          <p className="text-sm text-text-muted">Nog geen verzonden mails.</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-dim">
                <tr>
                  <th className="pb-2 font-medium">Invalshoek</th>
                  <th className="pb-2 font-medium">Verzonden</th>
                  <th className="pb-2 font-medium">Open</th>
                  <th className="pb-2 font-medium">Klik</th>
                  <th className="pb-2 font-medium">Reply</th>
                </tr>
              </thead>
              <tbody>
                {snap.byAngle.map((row, i) => (
                  <tr
                    key={row.variantKey}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2.5 pr-3 font-medium text-text">
                      {row.variantName}
                      {i === 0 && row.replied > 0 && snap.byAngle.length > 1 ? (
                        <span className="ml-2">
                          <StatusBadge tone="accent">Beste reply</StatusBadge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 font-mono">{row.sent}</td>
                    <td className="py-2.5 font-mono">
                      {row.opened} ({formatPercent(row.openRate)})
                    </td>
                    <td className="py-2.5 font-mono">
                      {row.clicked} ({formatPercent(row.clickRate)})
                    </td>
                    <td className="py-2.5 font-mono">
                      {row.replied} ({formatPercent(row.replyRate)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Per afzender
        </h2>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Evenementen, Reijner en Yoram naast elkaar — open- en reply-rate op
          echte verzendingen.
        </p>
        {snap.bySender.length === 0 ? (
          <p className="text-sm text-text-muted">Nog geen verzonden mails.</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-dim">
                <tr>
                  <th className="pb-2 font-medium">Afzender</th>
                  <th className="pb-2 font-medium">From</th>
                  <th className="pb-2 font-medium">Verzonden</th>
                  <th className="pb-2 font-medium">Open</th>
                  <th className="pb-2 font-medium">Klik</th>
                  <th className="pb-2 font-medium">Reply</th>
                  <th className="pb-2 font-medium">Bounce</th>
                </tr>
              </thead>
              <tbody>
                {snap.bySender.map((row) => (
                  <tr
                    key={row.senderKey}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2.5 pr-3 font-medium text-text">
                      {row.label}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-text-dim">
                      {row.senderEmail ?? "—"}
                    </td>
                    <td className="py-2.5 font-mono">{row.sent}</td>
                    <td className="py-2.5 font-mono">
                      {row.opened} ({formatPercent(row.openRate)})
                    </td>
                    <td className="py-2.5 font-mono">
                      {row.clicked} ({formatPercent(row.clickRate)})
                    </td>
                    <td className="py-2.5 font-mono">
                      {row.replied} ({formatPercent(row.replyRate)})
                    </td>
                    <td className="py-2.5 font-mono">{row.bounced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="order-3 mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Follow-up queue
        </h2>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Geopend, nog geen antwoord — na 3 dagen reminder-klaar. Geen
          auto-send; noem opens nooit in de mail.
        </p>
        {snap.followUpCandidates.length === 0 ? (
          <p className="text-sm text-text-muted">Niemand in de queue.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {snap.followUpCandidates.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{c.companyName}</p>
                  <p className="truncate text-xs text-text-dim">
                    {c.toEmail ?? "—"} · {c.subject}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <StatusBadge tone={c.ready ? "accent" : "neutral"}>
                    {c.ready ? "reminder klaar" : "wachten"}
                  </StatusBadge>
                  <p className="mt-1 text-text-dim">{c.daysSinceSent}d geleden</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="order-4 mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          A/B onderwerpen
        </h2>
        {snap.ab.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nog geen verzonden mails.</p>
        ) : (
          <div className="mt-3 max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-dim">
                <tr>
                  <th className="pb-2 font-medium">Variant</th>
                  <th className="pb-2 font-medium">Arm</th>
                  <th className="pb-2 font-medium">Onderwerp</th>
                  <th className="pb-2 font-medium">Verzonden</th>
                  <th className="pb-2 font-medium">Open</th>
                  <th className="pb-2 font-medium">Reply</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {snap.ab.map((row) => (
                  <tr
                    key={`${row.variantKey}-${row.subjectKey}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2.5 pr-3">{row.variantName}</td>
                    <td className="py-2.5 font-mono text-xs uppercase text-accent">
                      {row.subjectKey}
                    </td>
                    <td className="max-w-xs py-2.5 pr-3 text-text-muted">
                      {row.subject}
                    </td>
                    <td className="py-2.5 font-mono">{row.sent}</td>
                    <td className="py-2.5 font-mono">
                      {formatPercent(row.openRate)}
                    </td>
                    <td className="py-2.5 font-mono">
                      {formatPercent(row.replyRate)}
                    </td>
                    <td className="py-2.5">
                      {row.winner ? (
                        <StatusBadge tone="accent">Winner</StatusBadge>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="order-1 mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Wat er gebeurd is
        </h2>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Alleen echte verzendingen. Opens en kliks komen via Brevo.
          Antwoorden op evenement@ komen vanzelf op het dossier; een antwoord
          via telefoon of een andere inbox log je in het dossier van het
          bedrijf.
        </p>
        {happened.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            Nog geen mails.{" "}
            <Link href="/outreach/emails" className="text-accent underline">
              Genereer er een
            </Link>
            .
          </p>
        ) : (
          <div className="mt-3 max-w-full overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-dim">
                <tr>
                  <th className="pb-2 font-medium">Bedrijf</th>
                  <th className="pb-2 font-medium">Onderwerp</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Verzonden</th>
                  <th className="pb-2 font-medium">Open</th>
                  <th className="pb-2 font-medium">Klik</th>
                  <th className="pb-2 font-medium">Reply</th>
                </tr>
              </thead>
              <tbody>
                {happened.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="text-text">{row.companyName}</p>
                      <p className="font-mono text-xs text-text-dim">
                        {row.toEmail ?? "—"}
                      </p>
                    </td>
                    <td className="max-w-xs py-2.5 pr-3 text-text-muted">
                      {row.subject}
                      {row.variantName ? (
                        <p className="text-xs text-text-dim">{row.variantName}</p>
                      ) : null}
                    </td>
                    <td className="py-2.5">
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
                        {statusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="py-2.5 font-mono text-xs text-text-dim">
                      {fmt(row.sentAt)}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-text-dim">
                      {row.opened ? fmt(row.openedAt) : "—"}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-text-dim">
                      {row.clicked ? fmt(row.clickedAt) : "—"}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-text-dim">
                      {row.replied ? fmt(row.repliedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="order-2 border-t border-border pt-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg tracking-[0.06em]">
            Inbox · replies
          </h2>
          <Link
            href="/outreach/crm"
            className="text-xs text-accent hover:underline"
          >
            Bekijk in Bedrijven →
          </Link>
        </div>
        {snap.recentReplies.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nog geen antwoorden binnengekomen.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {snap.recentReplies.map((reply) => (
              <li key={reply.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={
                      reply.sentiment === "positive"
                        ? "accent"
                        : reply.sentiment === "negative" ||
                            reply.sentiment === "opt_out"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {reply.sentiment === "positive"
                      ? "positief"
                      : reply.sentiment === "negative"
                        ? "negatief"
                        : reply.sentiment === "opt_out"
                          ? "opt-out"
                          : reply.sentiment === "ooo"
                            ? "afwezig"
                            : "neutraal"}
                  </StatusBadge>
                  <span className="text-xs text-text-dim">
                    {fmt(reply.receivedAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text">
                  {reply.companyName ?? "Onbekend"}{" "}
                  <span className="text-text-dim">&lt;{reply.fromEmail}&gt;</span>
                </p>
                {reply.bodyPreview ? (
                  <p className="mt-1 text-sm text-text-muted">{reply.bodyPreview}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
