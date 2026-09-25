import Link from "next/link";
import { PaidAdsAutoSync } from "@/components/dashboard/paid-ads-auto-sync";
import { PaidAdsView } from "@/components/dashboard/paid-ads-view";
import { SectionHeader } from "@/components/ui/section-header";
import { googleAdsConfigured } from "@/lib/integrations/google-ads/client";
import {
  cpcCents,
  ctrPercent,
  loadMarketingAdsBundle,
} from "@/lib/marketing/ads";
import { formatEuroFromCents, formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Marketing (paid) · Google Ads" };
export const dynamic = "force-dynamic";

export default async function PaidGoogleAdsPage() {
  const hasCreds = googleAdsConfigured();
  const bundle = await loadMarketingAdsBundle({ platform: "google" }).catch(
    () => null,
  );
  const data = bundle ?? {
    ads: [],
    campaigns: [],
    totals: {
      ads: 0,
      campaigns: 0,
      spendCents: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      purchases: 0,
      linked: 0,
    },
    lastSyncedAt: null,
    accountCurrency: "EUR",
  };

  const currency = data.accountCurrency || "EUR";
  const ctr = ctrPercent(data.totals.clicks, data.totals.impressions);
  const cpc = cpcCents(data.totals.spendCents, data.totals.clicks);

  return (
    <div className="animate-fade-up">
      <SectionHeader
        eyebrow="Marketing · paid"
        title="Google Ads"
        description={
          hasCreds
            ? "Search, Performance Max, Display & Smart campagnes uit Google Ads · spend, clicks en conversions."
            : "Wacht op Google Ads OAuth (client, refresh token, customer ID)."
        }
      />

      <PaidAdsAutoSync
        channel="google"
        lastSyncedAt={data.lastSyncedAt}
        enabled={hasCreds}
      />

      {!hasCreds && data.ads.length === 0 ? (
        <div className="border border-border bg-surface p-5">
          <p className="text-sm font-medium">Google Ads nog niet gekoppeld</p>
          <p className="mt-2 max-w-xl text-sm text-text-muted">
            Search/Performance Max/Display campagnes komen uit{" "}
            <span className="font-medium">Google Ads API</span>. Check OAuth +
            Explorer access via{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <section className="mb-10 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-6 lg:grid-cols-6">
            <Stat
              value={formatEuroFromCents(data.totals.spendCents, currency)}
              label="spend"
            />
            <Stat
              value={formatNumber(data.totals.impressions)}
              label="impressions"
            />
            <Stat value={formatNumber(data.totals.clicks)} label="clicks" />
            <Stat
              value={ctr != null ? formatPercent(ctr, 2) : "—"}
              label="CTR"
            />
            <Stat
              value={cpc != null ? formatEuroFromCents(cpc, currency) : "—"}
              label="CPC"
            />
            <Stat
              value={`${data.totals.linked}/${data.totals.ads}`}
              label="gekoppeld aan event"
            />
          </section>

          <PaidAdsView
            bundle={data}
            emptyMessage="Nog geen Google Ads (Search/PMax/Display) in deze periode."
          />
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <p className="min-w-0">
      <span className="block break-words font-display text-2xl leading-none tabular-nums sm:text-3xl">
        {value}
      </span>
      <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
        {label}
      </span>
    </p>
  );
}
