"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  cpcCents,
  ctrPercent,
  type MarketingAdsBundle,
} from "@/lib/marketing/ad-metrics";
import { cn, formatEuroFromCents, formatNumber, formatPercent } from "@/lib/utils";

export function PaidAdsView({
  bundle,
  emptyMessage = "Nog geen paid ads voor dit kanaal.",
}: {
  bundle: MarketingAdsBundle;
  emptyMessage?: string;
}) {
  if (bundle.ads.length === 0) {
    return (
      <p className="border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
        {emptyMessage}
      </p>
    );
  }

  const currency = bundle.accountCurrency || "EUR";

  return (
    <div className="space-y-6">
      {bundle.campaigns.map((campaign) => (
        <section key={campaign.campaignId ?? campaign.campaignName}>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium text-text">
                {campaign.campaignName}
              </h2>
              <p className="text-[11px] text-text-dim">
                {campaign.ads} {campaign.ads === 1 ? "ad" : "ads"}
              </p>
            </div>
            <p className="font-mono text-sm tabular-nums text-text">
              {formatEuroFromCents(campaign.spendCents, currency)}
            </p>
          </div>
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-surface text-[10px] tracking-[0.12em] text-text-dim uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Ad</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="px-3 py-2 text-right font-medium">Impr.</th>
                  <th className="px-3 py-2 text-right font-medium">Clicks</th>
                  <th className="px-3 py-2 text-right font-medium">CTR</th>
                  <th className="px-3 py-2 text-right font-medium">CPC</th>
                </tr>
              </thead>
              <tbody>
                {campaign.rows.map((ad) => {
                  const ctr = ctrPercent(ad.clicks, ad.impressions);
                  const cpc = cpcCents(ad.spendCents, ad.clicks);
                  return (
                    <tr
                      key={ad.id}
                      className="border-t border-border/70 text-text-muted"
                    >
                      <td className="max-w-[280px] px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          {ad.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ad.thumbnailUrl}
                              alt=""
                              className="size-8 shrink-0 object-cover"
                            />
                          ) : null}
                          <span className="min-w-0">
                            <span className="block truncate text-text">
                              {ad.adName || "Zonder naam"}
                            </span>
                            {ad.permalink ? (
                              <a
                                href={ad.permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 text-[10px] underline underline-offset-2"
                              >
                                Post
                                <ExternalLink
                                  className="size-2.5"
                                  aria-hidden
                                />
                              </a>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {ad.editionId ? (
                          <Link
                            href={`/dashboard/tickets/${ad.editionId}`}
                            className={cn(
                              "underline underline-offset-2 hover:text-text",
                            )}
                          >
                            {ad.editionName ?? "Gekoppeld"}
                          </Link>
                        ) : (
                          <span className="text-text-dim">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatEuroFromCents(ad.spendCents, currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatNumber(ad.impressions)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatNumber(ad.clicks)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {ctr != null ? formatPercent(ctr, 2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {cpc != null
                          ? formatEuroFromCents(cpc, currency)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-surface text-text">
                  <td className="px-3 py-2 text-xs uppercase tracking-[0.12em] text-text-dim">
                    Totaal
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatEuroFromCents(campaign.spendCents, currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatNumber(campaign.impressions)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatNumber(campaign.clicks)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {ctrPercent(campaign.clicks, campaign.impressions) != null
                      ? formatPercent(
                          ctrPercent(campaign.clicks, campaign.impressions)!,
                          2,
                        )
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {cpcCents(campaign.spendCents, campaign.clicks) != null
                      ? formatEuroFromCents(
                          cpcCents(campaign.spendCents, campaign.clicks)!,
                          currency,
                        )
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
