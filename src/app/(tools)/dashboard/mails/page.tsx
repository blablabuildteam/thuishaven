import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listRecentCampaigns } from "@/lib/insights/data";
import { loadMailLift } from "@/lib/cache/dashboard";
import type { EditionMailEffect } from "@/lib/editions/mail-lift";
import { amsterdamDay } from "@/lib/time/amsterdam";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Mailings" };
export const dynamic = "force-dynamic";

function coverageLabel(signal: "measured" | "no_curve", sentAt: string) {
  if (signal === "no_curve") return "Geen uurdata rond deze mail";
  const age = Date.now() - new Date(sentAt).getTime();
  if (age < 24 * 60 * 60 * 1000) return "24 uur loopt nog";
  return "24 uur gemeten";
}

export default async function MailsPage() {
  const [campaigns, mailLift] = await Promise.all([
    listRecentCampaigns(24),
    loadMailLift().catch(() => null),
  ]);
  const totalSent = campaigns.reduce((s, c) => s + (c.sent ?? 0), 0);
  const totalOpens = campaigns.reduce((s, c) => s + (c.opens ?? 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const openRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : null;
  const today = amsterdamDay(new Date());
  const editions = mailLift?.editions ?? [];
  const upcomingEditions = editions
    .filter((ed) => amsterdamDay(ed.startsAt) >= today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const pastEditions = editions
    .filter((ed) => amsterdamDay(ed.startsAt) < today)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return (
    <div>
      <SectionHeader
        eyebrow="Mailings"
        title="Mail & ticket-effect"
        description="Brevo-metrics plus tickets die in de 24 uur ná verzending verkocht werden (samenvallend, geen harde attributie)."
      />

      <div className="mb-8 flex flex-wrap gap-8">
        <p>
          <span className="font-display text-3xl">{formatNumber(campaigns.length)}</span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            campagnes
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">{formatNumber(totalSent)}</span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            sent
          </span>
        </p>
        <p>
          <span className="font-display text-3xl">
            {openRate != null ? formatPercent(openRate, 0) : "—"}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            open · {formatNumber(totalClicks)} clicks
          </span>
        </p>
        {mailLift && (
          <>
            <p>
              <span className="font-display text-3xl">
                {formatNumber(mailLift.totals.ordersAfterMails)}
              </span>
              <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
                tickets in de 24 uur na mail
              </span>
            </p>
            <p>
              <span className="font-display text-3xl">
                {formatNumber(mailLift.totals.brevoClickOrders)}
              </span>
              <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
                via Brevo-klik
              </span>
            </p>
          </>
        )}
      </div>

      <section className="mb-10">
        <h2 className="mb-1 font-display text-xl tracking-[0.03em]">
          Effect per editie
        </h2>
        <p className="mb-4 max-w-xl text-sm text-text-muted">
          Per editie: hoeveel tickets verkocht werden in de 24 uur ná elke mail,
          vanaf het uur van verzending. Dat uur telt helemaal mee. Dit is
          samenhang met de mail, geen harde toewijzing. “Via Brevo-klik” =
          koper kwam binnen via trackinglink in de mail.
        </p>

        {!mailLift?.editions.length ? (
          <p className="border border-border px-4 py-3 text-sm text-text-muted">
            Nog geen gekoppelde mailings. Sync Brevo + Weeztix via{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>
            .
          </p>
        ) : (
          <div>
            {upcomingEditions.length > 0 && (
              <div className="mb-8">
                <h3 className="mb-3 font-display text-lg tracking-[0.03em]">
                  Komende events
                  <span className="ml-2 text-sm text-text-dim">
                    {upcomingEditions.length}
                  </span>
                </h3>
                <EditionMailCards editions={upcomingEditions} />
              </div>
            )}
            {pastEditions.length > 0 && (
              <div
                className={cn(
                  upcomingEditions.length > 0 &&
                    "mt-10 border-t-2 border-border pt-8",
                )}
              >
                <h3 className="mb-3 font-display text-lg tracking-[0.03em]">
                  Afgelopen events
                  <span className="ml-2 text-sm text-text-dim">
                    {pastEditions.length}
                  </span>
                </h3>
                <EditionMailCards editions={pastEditions} />
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl tracking-[0.03em]">
          Alle campagnes
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-text-muted">Nog geen campagnes.</p>
        ) : (
          <div className="max-w-full overflow-x-auto border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Campagne</th>
                  <th className="px-4 py-3 font-medium">Verzonden</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Opens</th>
                  <th className="px-4 py-3 font-medium">Clicks</th>
                  <th className="px-4 py-3 font-medium">Open %</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const sent = c.sent ?? 0;
                  const opens = c.opens ?? 0;
                  const rate = sent > 0 ? (opens / sent) * 100 : null;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-3">{c.name}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {c.sentAt
                          ? format(new Date(c.sentAt), "d MMM yyyy", {
                              locale: nl,
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(sent)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(opens)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(c.clicks ?? 0)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {rate != null ? formatPercent(rate) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EditionMailCards({ editions }: { editions: EditionMailEffect[] }) {
  return (
    <div className="space-y-3">
      {editions.map((ed) => (
        <article
          key={ed.editionId}
          className="border border-border bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-medium">{ed.editionName}</h3>
              <p className="mt-0.5 text-xs text-text-dim">
                {new Date(ed.startsAt).toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {" · "}
                {formatNumber(ed.sold)} sold
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ed.brevoClickOrders > 0 && (
                <StatusBadge tone="success">
                  {formatNumber(ed.brevoClickOrders)} via Brevo-klik
                </StatusBadge>
              )}
              {ed.totalOrdersAfterMails > 0 && (
                <StatusBadge tone="accent">
                  {formatNumber(ed.totalOrdersAfterMails)} tickets in de 24 uur
                  na mail
                </StatusBadge>
              )}
            </div>
          </div>

          <div className="mt-3 max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] tracking-wider text-text-dim uppercase">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Mailing</th>
                  <th className="pb-2 pr-3 font-medium">Datum</th>
                  <th className="pb-2 pr-3 font-medium">Open</th>
                  <th className="pb-2 pr-3 font-medium">
                    Tickets in de 24 uur na mail
                  </th>
                  <th className="pb-2 font-medium">Meting</th>
                </tr>
              </thead>
              <tbody>
                {ed.campaigns.map((c) => (
                  <tr key={c.campaignId} className="border-t border-border/60">
                    <td className="max-w-[220px] truncate py-2 pr-3">
                      {c.campaignName}
                    </td>
                    <td className="py-2 pr-3 text-text-muted">
                      {new Date(c.sentAt).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td className="py-2 pr-3 font-mono text-text-muted">
                      {c.openRate != null ? formatPercent(c.openRate, 0) : "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {c.ordersAfter != null ? formatNumber(c.ordersAfter) : "—"}
                    </td>
                    <td className="py-2 text-xs text-text-muted">
                      {coverageLabel(c.signal, c.sentAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}
