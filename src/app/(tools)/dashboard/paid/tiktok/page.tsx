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

export const metadata = { title: "Marketing (paid) · TikTok" };
export const dynamic = "force-dynamic";

export default async function PaidTikTokPage() {
  const hasToken = Boolean(process.env.TIKTOK_ADS_ACCESS_TOKEN?.trim());
  const bundle = await loadMarketingAdsBundle({ platform: "tiktok" }).catch(
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
        title="TikTok ads"
        description={
          hasToken
            ? "Spend, impressions en clicks per campagne · ads koppelen aan edities zoals organic posts."
            : "Wacht op TIKTOK_ADS_ACCESS_TOKEN (Marketing API, niet Login Kit)."
        }
      />

      <PaidAdsAutoSync
        channel="tiktok"
        lastSyncedAt={data.lastSyncedAt}
        enabled={hasToken}
      />

      {!hasToken && data.ads.length === 0 ? (
        <div className="border border-border bg-surface p-5">
          <p className="text-sm font-medium">TikTok ads nog niet gekoppeld</p>
          <p className="mt-2 max-w-xl text-sm text-text-muted">
            Organic TikTok gebruikt Login Kit. Paid data komt uit de TikTok{" "}
            <span className="font-medium">Marketing API</span>. Maak een app in
            Ads Manager, autoriseer de advertiser, en zet{" "}
            <span className="font-mono">TIKTOK_ADS_ACCESS_TOKEN</span> (en
            optioneel <span className="font-mono">TIKTOK_ADVERTISER_ID</span>)
            via{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <section className="mb-10 flex flex-wrap gap-8">
            <Stat
              value={formatEuroFromCents(data.totals.spendCents, currency)}
              label="spend"
            />
            <Stat value={formatNumber(data.totals.impressions)} label="impr." />
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
            emptyMessage="Nog geen TikTok ads. Sync start zodra het Marketing API-token live is."
          />
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <p>
      <span className="font-display text-3xl">{value}</span>
      <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
        {label}
      </span>
    </p>
  );
}
