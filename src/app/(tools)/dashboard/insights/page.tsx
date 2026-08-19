import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { InsightsChatPanel } from "@/components/dashboard/insights-chat-panel";
import {
  loadEditionBundle,
  loadMailLift,
  loadWeatherImpact,
} from "@/lib/cache/dashboard";
import {
  periodClaims,
  weekdayClaims,
} from "@/lib/editions/cohort-claims";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const [impact, bundle, mailLift] = await Promise.all([
    loadWeatherImpact(),
    loadEditionBundle(),
    loadMailLift().catch(() => null),
  ]);

  const claims: Array<{ kicker: string; title: string; body: string }> = [];

  const wd = weekdayClaims(bundle.rows)[0];
  if (wd) {
    claims.push({
      kicker: "Weekdag",
      title: wd.title,
      body: `${wd.body} · ${wd.evidence}`,
    });
  }

  const period = periodClaims(bundle.rows)[0];
  if (period) {
    claims.push({
      kicker: "Periode",
      title: period.title,
      body: `${period.body} · ${period.evidence}`,
    });
  }

  if (impact.verdict.title) {
    claims.push({
      kicker: "Weer",
      title: impact.verdict.title,
      body: `${impact.verdict.body} · ${impact.verdict.evidence}`,
    });
  }

  const after = mailLift?.totals.ordersAfterMails ?? 0;
  const brevo = mailLift?.totals.brevoClickOrders ?? 0;
  if (after > 0 || brevo > 0) {
    claims.push({
      kicker: "Mail",
      title:
        after > 0
          ? `+${formatNumber(after)} orders in week ná mail`
          : `${formatNumber(brevo)} via Brevo-klik`,
      body:
        after > 0
          ? `${mailLift?.totals.campaignsMeasured ?? 0} mails gemeten${brevo > 0 ? ` · ${formatNumber(brevo)} via klik` : ""}`
          : "Trackinglink in de mail → Weeztix-referrer.",
    });
  }

  if (bundle.lessons[0] && claims.length < 4) {
    claims.push({
      kicker: "Format",
      title: bundle.lessons[0].title,
      body: bundle.lessons[0].body,
    });
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Insights"
        title="Wat telt"
        description="Korte claims uit weekdag, periode, weer en mail."
        action={
          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Events
            </Link>
            <Link
              href="/dashboard/weer"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Weer
            </Link>
          </div>
        }
      />

      <ol className="mb-12 space-y-8">
        {claims.slice(0, 4).map((c, i) => (
          <li key={`${c.kicker}-${c.title}`} className="max-w-2xl">
            <p className="text-[11px] tracking-[0.16em] text-text-dim uppercase">
              {String(i + 1).padStart(2, "0")} · {c.kicker}
            </p>
            <p className="mt-2 font-display text-3xl tracking-[0.02em] sm:text-4xl">
              {c.title}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {c.body}
            </p>
          </li>
        ))}
        {!claims.length && (
          <li className="text-sm text-text-muted">Nog te weinig data.</li>
        )}
      </ol>

      {bundle.artistLeaderboard[0] && (
        <section className="mb-10 border-t border-border pt-6">
          <p className="text-[11px] tracking-[0.14em] text-text-dim uppercase">
            Top draw
          </p>
          <p className="mt-2 font-display text-2xl">
            {bundle.artistLeaderboard[0].artist}
            <span className="ml-3 text-lg text-text-muted">
              ~{formatNumber(bundle.artistLeaderboard[0].avgSold)}
            </span>
          </p>
        </section>
      )}

      <section className="border-t border-border pt-6">
        <p className="mb-3 text-[11px] tracking-[0.14em] text-text-dim uppercase">
          Vraag de data
        </p>
        <InsightsChatPanel />
      </section>
    </div>
  );
}
