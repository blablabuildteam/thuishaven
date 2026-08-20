import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { InsightsChatPanel } from "@/components/dashboard/insights-chat-panel";
import {
  loadEditionBundle,
  loadWeatherImpact,
} from "@/lib/cache/dashboard";
import {
  periodClaims,
  weekdayClaims,
} from "@/lib/editions/cohort-claims";
import { formatNumber } from "@/lib/utils";
import { WEATHER_DEFS } from "@/lib/weather/classify";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

type InsightCard = {
  kicker: string;
  title: string;
  body: string;
  evidence?: string;
  href?: string;
  linkLabel?: string;
};

export default async function InsightsPage() {
  const [impact, bundle] = await Promise.all([
    loadWeatherImpact(),
    loadEditionBundle(),
  ]);

  const cards: InsightCard[] = [];

  const weekdays = weekdayClaims(bundle.rows);
  for (const wd of weekdays.slice(0, 2)) {
    cards.push({
      kicker: "Weekdag",
      title: wd.title,
      body: wd.body,
      evidence: wd.evidence,
    });
  }

  const periods = periodClaims(bundle.rows);
  for (const period of periods.slice(0, 2)) {
    cards.push({
      kicker: "Periode",
      title: period.title,
      body: period.body,
      evidence: period.evidence,
    });
  }

  if (impact.verdict.title) {
    cards.push({
      kicker: "Weer",
      title: impact.verdict.title,
      body: impact.verdict.body,
      evidence: impact.verdict.evidence,
      href: "/dashboard/weer",
      linkLabel: "Weerdetail",
    });
  }

  for (const b of impact.outdoor.buckets
    .filter((x) => x.n >= 3 && x.vsComfortPct != null)
    .sort(
      (a, b) =>
        Math.abs(b.vsComfortPct ?? 0) - Math.abs(a.vsComfortPct ?? 0),
    )
    .slice(0, 3)) {
    const pct = Math.round(b.vsComfortPct!);
    cards.push({
      kicker: "Weer · cohort",
      title: `${b.label} ${pct >= 0 ? "+" : ""}${pct}% vs comfort`,
      body: `Gem. ~${formatNumber(b.avgSold)} sold · fill ${b.avgFill != null ? `${Math.round(b.avgFill)}%` : "n/a"}`,
      evidence: `n=${b.n} · ${WEATHER_DEFS.find((d) => d.kind === b.kind)?.definition ?? ""}`,
      href: "/dashboard/weer",
      linkLabel: "Weer",
    });
  }

  for (const lesson of bundle.lessons.slice(0, 2)) {
    cards.push({
      kicker: "Format",
      title: lesson.title,
      body: lesson.body,
      evidence: lesson.evidence,
    });
  }

  const topArtists = bundle.artistLeaderboard.slice(0, 5);

  return (
    <div>
      <SectionHeader
        eyebrow="Insights"
        title="Wat telt"
        description="Claims uit weekdag, periode, weer en format — in blokken. Mail-effect staat bij Mailings."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Events
            </Link>
            <Link
              href="/dashboard/marketing"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Mailings
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

      <div className="mb-10 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <article
            key={`${c.kicker}-${c.title}`}
            className="flex flex-col border border-border bg-surface p-5"
          >
            <p className="text-[11px] tracking-[0.16em] text-text-dim uppercase">
              {c.kicker}
            </p>
            <h2 className="mt-3 font-display text-2xl leading-tight tracking-[0.02em] sm:text-3xl">
              {c.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              {c.body}
            </p>
            {c.evidence && (
              <p className="mt-2 text-xs text-text-dim">{c.evidence}</p>
            )}
            {c.href && (
              <Link
                href={c.href}
                className="mt-4 text-sm text-text underline underline-offset-2"
              >
                {c.linkLabel ?? "Meer"} →
              </Link>
            )}
          </article>
        ))}
        {!cards.length && (
          <p className="text-sm text-text-muted sm:col-span-2">
            Nog te weinig data voor claims.
          </p>
        )}
      </div>

      {topArtists.length > 0 && (
        <section className="mb-10 border border-border bg-surface p-5">
          <p className="text-[11px] tracking-[0.14em] text-text-dim uppercase">
            Top draw
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topArtists.map((a, i) => (
              <li key={a.artist} className="min-w-0">
                <p className="text-[11px] text-text-dim">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="truncate font-display text-xl tracking-[0.02em]">
                  {a.artist}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  ~{formatNumber(a.avgSold)} sold gem. · {a.editions} edities
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border border-border bg-surface p-5">
        <p className="mb-3 text-[11px] tracking-[0.14em] text-text-dim uppercase">
          Vraag de data
        </p>
        <InsightsChatPanel />
      </section>
    </div>
  );
}
