import Link from "next/link";
import { desc, isNotNull, sql, and, eq } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import { getMailLiftByEdition } from "@/lib/editions/mail-lift";
import { linkCampaignsToEditions } from "@/lib/editions/link-campaigns";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Weeztix events" };
export const dynamic = "force-dynamic";

export default async function WeeztixEventsPage() {
  if (!hasDatabase()) {
    return (
      <div>
        <SectionHeader
          eyebrow="Weeztix"
          title="Events"
          description="Geen DATABASE_URL — sync kan niet worden getoond."
        />
      </div>
    );
  }

  try {
    await linkCampaignsToEditions({ persist: true, minConfidence: 0.55 });
  } catch {
    /* best-effort */
  }

  const db = getDb();
  const mailLift = await getMailLiftByEdition({ limit: 30 });

  const totals = await db.execute(sql`
    select
      (select count(*)::int from editions
        where weeztix_event_id is not null
          and name not ilike '%TEMPLATE%') as editions,
      (select count(*)::int from ticket_inventory
        where platform = 'weeztix' and sold > 0) as with_sales,
      (select coalesce(sum(sold),0)::int from ticket_inventory
        where platform = 'weeztix') as total_sold
  `);
  const t = (totals as unknown as Array<Record<string, number>>)[0] ?? {
    editions: 0,
    with_sales: 0,
    total_sold: 0,
  };

  const rows = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      sold: ticketInventory.sold,
      capacity: ticketInventory.capacity,
      available: ticketInventory.available,
    })
    .from(editions)
    .leftJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(isNotNull(editions.weeztixEventId))
    .orderBy(desc(editions.startsAt))
    .limit(60);

  const liftByEdition = new Map(
    mailLift.editions.map((e) => [e.editionId, e]),
  );

  return (
    <div>
      <SectionHeader
        eyebrow="Weeztix · read-only"
        title="Verkoop ná mail"
        description="Wat gebeurt er nadat een mailing binnenkomt: orders in de week erna, plus orders via Brevo-trackingklik."
        action={
          <Link
            href="/dashboard/marketing"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Mailings
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Edities"
          value={formatNumber(Number(t.editions ?? 0))}
          accent
        />
        <MetricCard
          label="Totaal sold"
          value={formatNumber(Number(t.total_sold ?? 0))}
        />
        <MetricCard
          label="Orders in week ná mail"
          value={formatNumber(mailLift.totals.ordersAfterMails)}
          hint={`${mailLift.totals.campaignsMeasured} mails met curve`}
        />
        <MetricCard
          label="Via Brevo-klik"
          value={formatNumber(mailLift.totals.brevoClickOrders)}
          hint="referrer Arenametrix/routage"
        />
      </div>

      <section className="mb-8 border border-border bg-surface px-4 py-4 text-sm">
        <h2 className="font-display text-lg tracking-[0.04em] text-text">
          Hoe we dit meten
        </h2>
        <p className="mt-2 max-w-3xl leading-relaxed text-text-muted">
          <span className="text-text">Week ná mail:</span> Weeztix-orders op
          verzenddag + 6 dagen (dagcurve). Alleen zichtbaar als die dagen in de
          curve zitten — vroege mails missen die soms.
        </p>
        <p className="mt-2 max-w-3xl leading-relaxed text-text-muted">
          <span className="text-text">Via Brevo-klik:</span> orders waarvan de
          referrer een Brevo-trackinglink is (
          <span className="font-mono text-xs">r.routage*.arenametrix.fr</span>
          ). Dat is de dichtste “uit de mail gekocht”-proxy die Weeztix geeft —
          niet per mailing uitgesplitst, wel per editie.
        </p>
        <p className="mt-2 max-w-3xl leading-relaxed text-text-muted">
          <span className="text-text">Cap:</span> niet door ons gezet. Weeztix
          stock per tier → Cap = sold + available. Geen zaalcapaciteit.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-display text-2xl tracking-[0.04em] text-text">
          Effect per editie
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-text-muted">
          Gesorteerd op Brevo-klikorders + gemeten verkopen ná mail.
        </p>

        {mailLift.editions.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            Nog geen gekoppelde mailings. Sync Brevo + Weeztix daily sales
            (inclusief referrers).
          </p>
        ) : (
          <div className="space-y-3">
            {mailLift.editions.map((ed) => (
              <article
                key={ed.editionId}
                className="border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl tracking-tight text-text">
                      {ed.editionName}
                    </h3>
                    <p className="mt-1 text-xs text-text-dim">
                      {new Date(ed.startsAt).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      {" · "}
                      {formatNumber(ed.sold)} sold
                      {ed.capacity != null
                        ? ` / ${formatNumber(ed.capacity)} cap`
                        : ""}
                      {ed.sellThrough != null
                        ? ` · ${formatPercent(ed.sellThrough)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      tone={ed.brevoClickOrders > 0 ? "success" : "neutral"}
                    >
                      {ed.brevoClickOrders > 0
                        ? `${formatNumber(ed.brevoClickOrders)} via Brevo-klik`
                        : "Geen Brevo-referrer"}
                    </StatusBadge>
                    {ed.totalOrdersAfterMails > 0 && (
                      <StatusBadge tone="accent">
                        {formatNumber(ed.totalOrdersAfterMails)} in week ná mail
                      </StatusBadge>
                    )}
                  </div>
                </div>

                {ed.referrerBreakdown.length > 0 && (
                  <p className="mt-3 text-xs text-text-muted">
                    Referrers:{" "}
                    {ed.referrerBreakdown
                      .slice(0, 5)
                      .map((r) => `${r.channel} ${r.orders}`)
                      .join(" · ")}
                  </p>
                )}

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-[11px] tracking-wider text-text-dim uppercase">
                      <tr>
                        <th className="pb-2 pr-3 font-medium">Mailing</th>
                        <th className="pb-2 pr-3 font-medium">Verzonden</th>
                        <th className="pb-2 pr-3 font-medium">Open</th>
                        <th className="pb-2 pr-3 font-medium">Clicks</th>
                        <th className="pb-2 pr-3 font-medium">
                          Orders week erna
                        </th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ed.campaigns.map((c) => (
                        <tr
                          key={c.campaignId}
                          className="border-t border-border/60"
                        >
                          <td className="max-w-[240px] truncate py-2.5 pr-3 text-text">
                            {c.campaignName}
                          </td>
                          <td className="py-2.5 pr-3 text-text-muted">
                            {new Date(c.sentAt).toLocaleDateString("nl-NL", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-text-muted">
                            {c.openRate != null
                              ? formatPercent(c.openRate)
                              : "—"}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-text-muted">
                            {formatNumber(c.clicks)}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-text">
                            {c.ordersAfter != null
                              ? formatNumber(c.ordersAfter)
                              : "—"}
                          </td>
                          <td className="py-2.5">
                            <StatusBadge
                              tone={
                                c.signal === "measured" ? "success" : "neutral"
                              }
                            >
                              {c.signal === "measured"
                                ? `${c.daysCovered}d in curve`
                                : "Curve dekt mail niet"}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}

        <ul className="mt-4 space-y-1 text-xs text-text-dim">
          {mailLift.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      </section>

      <section className="border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-display text-lg tracking-[0.04em] text-text">
            Alle Weeztix-edities
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Editie</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Sold</th>
                <th className="px-4 py-3 font-medium">Cap</th>
                <th className="px-4 py-3 font-medium">Sell-through</th>
                <th className="px-4 py-3 font-medium">Via Brevo</th>
                <th className="px-4 py-3 font-medium">Week ná mail</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => !/TEMPLATE/i.test(r.name))
                .map((row) => {
                  const sold = row.sold ?? 0;
                  const cap = row.capacity;
                  const st =
                    cap != null && cap > 0 ? (sold / cap) * 100 : null;
                  const lift = liftByEdition.get(row.id);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="max-w-[320px] truncate px-4 py-3 text-text">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {row.startsAt.toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {row.sold != null ? formatNumber(row.sold) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-muted">
                        {cap != null ? formatNumber(cap) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-muted">
                        {st != null ? formatPercent(st) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {lift && lift.brevoClickOrders > 0
                          ? formatNumber(lift.brevoClickOrders)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-muted">
                        {lift && lift.totalOrdersAfterMails > 0
                          ? formatNumber(lift.totalOrdersAfterMails)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
