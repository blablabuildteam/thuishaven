import Link from "next/link";
import { PaidAdsAutoSync } from "@/components/dashboard/paid-ads-auto-sync";
import { PaidAdsView } from "@/components/dashboard/paid-ads-view";
import { SectionHeader } from "@/components/ui/section-header";
import {
  cpcCents,
  ctrPercent,
  loadMarketingAdsBundle,
} from "@/lib/marketing/ads";
import { formatEuroFromCents, formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Marketing (paid) · Meta" };
export const dynamic = "force-dynamic";

export default async function PaidMetaPage() {
  const hasToken = Boolean(process.env.META_ACCESS_TOKEN?.trim());
  const bundle = await loadMarketingAdsBundle({ platform: "meta" }).catch(
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
        title="Meta ads"
        description={
          hasToken
            ? "Spend en ticket sales (Meta-pixel purchases) per campagne. Last-click van Meta, niet alle Weeztix-tickets."
            : "Wacht op META_ACCESS_TOKEN. Zodra ads_read op de system user staat, synct deze view."
        }
      />

      <PaidAdsAutoSync
        channel="meta"
        lastSyncedAt={data.lastSyncedAt}
        enabled={hasToken}
      />

      {!hasToken && data.ads.length === 0 ? (
        <div className="border border-border bg-surface p-5">
          <p className="text-sm font-medium">Meta ads nog niet gekoppeld</p>
          <p className="mt-2 max-w-xl text-sm text-text-muted">
            De huidige Instagram-token is een system user zonder{" "}
            <span className="font-mono">ads_read</span>. Voeg die scope toe in
            Meta Business Settings, wijs het advertentieaccount toe, en sync via{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <section className="mb-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              value={formatEuroFromCents(data.totals.spendCents, currency)}
              label="spend"
            />
            <Stat
              value={
                data.totals.purchases > 0
                  ? formatNumber(data.totals.purchases)
                  : "—"
              }
              label="aankopen"
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
              label="gekoppeld"
            />
          </section>

          <PaidAdsView
            bundle={data}
            emptyMessage="Nog geen Meta ads gevonden voor dit account."
          />
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <p className="min-w-0">
      <span className="block font-display text-3xl leading-none tabular-nums">
        {value}
      </span>
      <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
        {label}
      </span>
    </p>
  );
}
