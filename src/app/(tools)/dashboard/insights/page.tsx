import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { InsightsChatPanel } from "@/components/dashboard/insights-chat-panel";
import { getInsightsSnapshot } from "@/lib/insights/data";
import { getWeatherImpact } from "@/lib/weather/impact";
import { getEditionAnalysisBundle } from "@/lib/editions/analysis";
import { getMailLiftByEdition } from "@/lib/editions/mail-lift";
import {
  periodClaims,
  weekdayClaims,
} from "@/lib/editions/cohort-claims";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const [snap, impact, bundle, mailLift] = await Promise.all([
    getInsightsSnapshot(),
    getWeatherImpact({ fromYear: 2025, sync: false }),
    getEditionAnalysisBundle({ limit: 150 }),
    getMailLiftByEdition({ limit: 40 }).catch(() => null),
  ]);

  const claims: Array<{ title: string; body: string }> = [];

  const wd = weekdayClaims(bundle.rows)[0];
  if (wd) claims.push({ title: wd.title, body: `${wd.body} · ${wd.evidence}` });

  const period = periodClaims(bundle.rows)[0];
  if (period) {
    claims.push({
      title: period.title,
      body: `${period.body} · ${period.evidence}`,
    });
  }

  if (impact.verdict.title && claims.length < 3) {
    claims.push({
      title: impact.verdict.title,
      body: `${impact.verdict.body} · ${impact.verdict.evidence}`,
    });
  }

  const measured = mailLift?.totals.campaignsMeasured ?? 0;
  const after = mailLift?.totals.ordersAfterMails ?? 0;
  const brevo = mailLift?.totals.brevoClickOrders ?? 0;
  if (claims.length < 3 && (measured > 0 || brevo > 0)) {
    claims.push({
      title:
        after > 0
          ? `Mail-window: +${formatNumber(after)} orders`
          : `Brevo-klik: ${formatNumber(brevo)} orders`,
      body:
        after > 0
          ? `${measured} campagnes · 7 dagen ná send`
          : "Curve dekt send vaak niet — klik-referrer is de harde attributie.",
    });
  }

  if (claims.length < 3 && bundle.lessons[0]) {
    claims.push({
      title: bundle.lessons[0].title,
      body: bundle.lessons[0].body,
    });
  }

  const avgOpen =
    snap.brevo.totalSent > 0
      ? (snap.brevo.totalOpens / snap.brevo.totalSent) * 100
      : null;

  return (
    <div>
      <SectionHeader
        eyebrow="Insights"
        title="Claims"
        description="Weekdag, periode, weer, mail — kort."
        action={
          <Link
            href="/dashboard/weer"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Weer →
          </Link>
        }
      />

      <ul className="stagger mb-10 space-y-6">
        {claims.slice(0, 4).map((c, i) => (
          <li key={c.title} className="max-w-2xl border-l-2 border-highlight pl-4">
            <p className="text-[11px] tracking-[0.14em] text-text-dim uppercase">
              {i + 1}
            </p>
            <p className="mt-1 font-display text-2xl tracking-[0.03em]">
              {c.title}
            </p>
            <p className="mt-1.5 text-sm text-text-muted">{c.body}</p>
          </li>
        ))}
        {!claims.length && (
          <li className="text-sm text-text-muted">Nog te weinig data.</li>
        )}
      </ul>

      <div className="mb-8 flex flex-wrap gap-8">
        <p>
          <span className="font-display text-2xl">
            {formatNumber(snap.weeztix.sold)}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.1em] text-text-dim uppercase">
            sold
          </span>
        </p>
        <p>
          <span className="font-display text-2xl">
            {formatNumber(snap.brevo.campaigns)}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.1em] text-text-dim uppercase">
            mails
          </span>
        </p>
        <p>
          <span className="font-display text-2xl">
            {avgOpen != null ? formatPercent(avgOpen, 0) : "—"}
          </span>
          <span className="mt-1 block text-[11px] tracking-[0.1em] text-text-dim uppercase">
            open
          </span>
        </p>
        {bundle.artistLeaderboard[0] && (
          <p>
            <span className="font-display text-2xl">
              {bundle.artistLeaderboard[0].artist}
            </span>
            <span className="mt-1 block text-[11px] tracking-[0.1em] text-text-dim uppercase">
              top draw ~{formatNumber(bundle.artistLeaderboard[0].avgSold)}
            </span>
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
          Vraag
        </h2>
        <InsightsChatPanel />
      </section>
    </div>
  );
}
