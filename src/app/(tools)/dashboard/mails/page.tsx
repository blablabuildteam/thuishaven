import Link from "next/link";
import { MailsRefresh } from "@/components/dashboard/mails-refresh";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listRecentCampaigns } from "@/lib/insights/data";
import { loadMailLift } from "@/lib/cache/dashboard";
import { formatNumber, formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Mailings" };
export const dynamic = "force-dynamic";

function coverageLabel(
  signal: "measured" | "no_curve" | null,
  sentAt: string | null,
) {
  if (signal == null || sentAt == null) return "Niet aan een event gekoppeld";
  if (signal === "no_curve") return "Geen uurdata rond deze mail";
  const age = Date.now() - new Date(sentAt).getTime();
  if (age < 24 * 60 * 60 * 1000) return "24 uur loopt nog";
  return "24 uur gemeten";
}

type MailRow = {
  campaignId: string;
  campaignName: string;
  sentAt: string | null;
  sent: number;
  opens: number;
  clicks: number;
  openRate: number | null;
  editionName: string | null;
  editionStartsAt: string | null;
  ordersAfter: number | null;
  /** Orders via de trackinglink in de mail (Weeztix-referrer Arenametrix). */
  clickOrders: number | null;
  /** True als het event meerdere mails had en we op kliks hebben verdeeld. */
  clickOrdersEstimated: boolean;
  signal: "measured" | "no_curve" | null;
};

export default async function MailsPage() {
  const [campaigns, mailLift] = await Promise.all([
    listRecentCampaigns(60),
    loadMailLift().catch(() => null),
  ]);

  const totalSent = campaigns.reduce((s, c) => s + (c.sent ?? 0), 0);
  const totalOpens = campaigns.reduce((s, c) => s + (c.opens ?? 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const openRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : null;

  /** Effect per mail hangt aan een editie; hier plat getrokken op campagne. */
  const effectByCampaign = new Map<
    string,
    {
      editionName: string;
      startsAt: string;
      ordersAfter: number | null;
      clickOrders: number;
      clickOrdersEstimated: boolean;
      signal: "measured" | "no_curve";
    }
  >();
  for (const edition of mailLift?.editions ?? []) {
    /**
     * Weeztix geeft klik-orders per event, niet per mail. Eén mail voor het
     * event → exact. Meerdere → verdeeld naar aandeel in de kliks.
     */
    const editionClicks = edition.campaigns.reduce((s, c) => s + c.clicks, 0);
    const estimated = edition.campaigns.length > 1;
    for (const campaign of edition.campaigns) {
      const share = !estimated
        ? 1
        : editionClicks > 0
          ? campaign.clicks / editionClicks
          : 1 / edition.campaigns.length;
      effectByCampaign.set(campaign.campaignId, {
        editionName: edition.editionName,
        startsAt: edition.startsAt,
        ordersAfter: campaign.ordersAfter,
        clickOrders: Math.round(edition.brevoClickOrders * share),
        clickOrdersEstimated: estimated,
        signal: campaign.signal,
      });
    }
  }
  const refreshedAt = campaigns.reduce<string | null>((latest, c) => {
    const at = c.syncedAt ? new Date(c.syncedAt).toISOString() : null;
    return at && (!latest || at > latest) ? at : latest;
  }, null);

  const rows: MailRow[] = campaigns
    .map((c) => {
      const effect = effectByCampaign.get(c.id);
      const sent = c.sent ?? 0;
      const opens = c.opens ?? 0;
      return {
        campaignId: c.id,
        campaignName: c.name,
        sentAt: c.sentAt ? new Date(c.sentAt).toISOString() : null,
        sent,
        opens,
        clicks: c.clicks ?? 0,
        openRate: sent > 0 ? (opens / sent) * 100 : null,
        editionName: effect?.editionName ?? null,
        editionStartsAt: effect?.startsAt ?? null,
        ordersAfter: effect?.ordersAfter ?? null,
        clickOrders: effect?.clickOrders ?? null,
        clickOrdersEstimated: effect?.clickOrdersEstimated ?? false,
        signal: effect?.signal ?? null,
      };
    })
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  return (
    <div>
      <SectionHeader
        eyebrow="Mailings"
        title="Mail & ticket-effect"
        description="Elke mailing op verzenddatum, nieuwste bovenaan. Per mail de tickets via de link in de mail, en de tickets die in de 24 uur ná verzending verkocht werden."
      />

      <MailsRefresh refreshedAt={refreshedAt} />

      <div className="mb-8 flex flex-wrap gap-8">
        <p>
          <span className="font-display text-3xl">{formatNumber(campaigns.length)}</span>
          <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
            mailings
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

      {rows.length === 0 ? (
        <p className="border border-border px-4 py-3 text-sm text-text-muted">
          Nog geen mailings gesynct. Koppel Brevo + Weeztix via{" "}
          <Link href="/koppelingen" className="underline">
            Bronnen
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="max-w-full overflow-x-auto border border-border">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">
                    Verzonden
                  </th>
                  <th className="px-4 py-3 font-medium">Mailing</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium text-right">Sent</th>
                  <th className="px-4 py-3 font-medium text-right">Open %</th>
                  <th className="px-4 py-3 font-medium text-right">Clicks</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">
                    Via mail
                  </th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">
                    Tickets 24u
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.campaignId}
                    className="border-b border-border/70 last:border-0 align-top"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                      {row.sentAt
                        ? format(new Date(row.sentAt), "d MMM yyyy", {
                            locale: nl,
                          })
                        : "—"}
                      <span className="mt-0.5 block text-[10px] text-text-dim">
                        {coverageLabel(row.signal, row.sentAt)}
                      </span>
                    </td>
                    <td className="max-w-[22rem] px-4 py-3">
                      {row.campaignName}
                    </td>
                    <td className="max-w-[16rem] px-4 py-3 text-text-muted">
                      {row.editionName ? (
                        <>
                          {row.editionName}
                          {row.editionStartsAt && (
                            <span className="mt-0.5 block text-[10px] text-text-dim">
                              {format(
                                new Date(row.editionStartsAt),
                                "d MMM yyyy",
                                { locale: nl },
                              )}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatNumber(row.sent)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {row.openRate != null ? formatPercent(row.openRate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatNumber(row.clicks)}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap"
                      title={
                        row.clickOrdersEstimated
                          ? "Geschat: dit event had meerdere mails, verdeeld naar aandeel in de kliks"
                          : undefined
                      }
                    >
                      {row.clickOrders != null
                        ? `${row.clickOrdersEstimated ? "≈ " : ""}${formatNumber(row.clickOrders)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {row.ordersAfter != null ? (
                        <StatusBadge tone="accent">
                          {formatNumber(row.ordersAfter)}
                        </StatusBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-2xl text-xs text-text-dim">
            “Via mail” zijn orders die binnenkwamen via de trackinglink in de
            mail. Weeztix telt die per event; had een event meerdere mails, dan
            verdelen we ze naar aandeel in de kliks (≈).
          </p>
          <p className="mt-2 max-w-2xl text-xs text-text-dim">
            “Tickets 24u” is de verkoop in de 24 uur ná verzending, vanaf het uur
            van verzending. Dat is samenhang met de mail, geen harde toewijzing.
            Mailings zonder event zijn niet aan een editie gekoppeld, daar kunnen
            we geen ticketeffect bij meten.
          </p>
        </>
      )}
    </div>
  );
}
