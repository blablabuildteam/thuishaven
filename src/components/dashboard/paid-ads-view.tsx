"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  cpcCents,
  ctrPercent,
  type MarketingAdsBundle,
  type MarketingAdsCampaignGroup,
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
    <div className="max-w-full overflow-x-auto border border-border">
      <table className="w-full min-w-[980px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[20%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead className="border-b border-border bg-surface text-[10px] tracking-[0.12em] text-text-dim uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Ad</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 text-right font-medium">Spend</th>
            <th
              className="px-3 py-2 text-right font-medium"
              title="Meta-pixel purchases of TikTok complete payment. Geen Weeztix-telling."
            >
              Aankopen
            </th>
            <th className="px-3 py-2 text-right font-medium">Impr.</th>
            <th className="px-3 py-2 text-right font-medium">Clicks</th>
            <th className="px-3 py-2 text-right font-medium">CTR</th>
            <th className="px-3 py-2 text-right font-medium">CPC</th>
          </tr>
        </thead>
        <tbody>
          {bundle.campaigns.map((campaign) => (
            <CampaignRows
              key={campaign.campaignId ?? campaign.campaignName}
              campaign={campaign}
              currency={currency}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignRows({
  campaign,
  currency,
}: {
  campaign: MarketingAdsCampaignGroup;
  currency: string;
}) {
  const campaignCtr = ctrPercent(campaign.clicks, campaign.impressions);
  const campaignCpc = cpcCents(campaign.spendCents, campaign.clicks);

  return (
    <>
      <tr className="border-t border-border bg-surface">
        <td className="px-3 py-2.5" colSpan={2}>
          <p className="truncate text-sm font-medium text-text">
            {campaign.campaignName}
          </p>
          <p className="text-[11px] text-text-dim">
            {campaign.startsAt ? `${formatCampaignDay(campaign.startsAt)} · ` : ""}
            {campaign.ads} {campaign.ads === 1 ? "ad" : "ads"}
          </p>
        </td>
        <MetricCell>
          {formatEuroFromCents(campaign.spendCents, currency)}
        </MetricCell>
        <MetricCell>
          {campaign.purchases > 0 ? formatNumber(campaign.purchases) : "—"}
        </MetricCell>
        <MetricCell>{formatNumber(campaign.impressions)}</MetricCell>
        <MetricCell>{formatNumber(campaign.clicks)}</MetricCell>
        <MetricCell>
          {campaignCtr != null ? formatPercent(campaignCtr, 2) : "—"}
        </MetricCell>
        <MetricCell>
          {campaignCpc != null
            ? formatEuroFromCents(campaignCpc, currency)
            : "—"}
        </MetricCell>
      </tr>
      {campaign.rows.map((ad) => {
        const ctr = ctrPercent(ad.clicks, ad.impressions);
        const cpc = cpcCents(ad.spendCents, ad.clicks);
        return (
          <tr key={ad.id} className="border-t border-border/70 text-text-muted">
            <td className="px-3 py-2">
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
                      <ExternalLink className="size-2.5" aria-hidden />
                    </a>
                  ) : null}
                </span>
              </span>
            </td>
            <td className="truncate px-3 py-2 text-xs">
              {ad.editionId ? (
                <Link
                  href={`/dashboard/tickets/${ad.editionId}`}
                  className={cn(
                    "underline underline-offset-2 hover:text-text",
                  )}
                  title={ad.editionName ?? "Gekoppeld"}
                >
                  {ad.editionName ?? "Gekoppeld"}
                </Link>
              ) : (
                <span className="text-text-dim">—</span>
              )}
            </td>
            <MetricCell>
              {formatEuroFromCents(ad.spendCents, currency)}
            </MetricCell>
            <MetricCell>
              {ad.purchases > 0 ? formatNumber(ad.purchases) : "—"}
            </MetricCell>
            <MetricCell>{formatNumber(ad.impressions)}</MetricCell>
            <MetricCell>{formatNumber(ad.clicks)}</MetricCell>
            <MetricCell>
              {ctr != null ? formatPercent(ctr, 2) : "—"}
            </MetricCell>
            <MetricCell>
              {cpc != null ? formatEuroFromCents(cpc, currency) : "—"}
            </MetricCell>
          </tr>
        );
      })}
    </>
  );
}

function formatCampaignDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MetricCell({ children }: { children: ReactNode }) {
  return (
    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
      {children}
    </td>
  );
}
