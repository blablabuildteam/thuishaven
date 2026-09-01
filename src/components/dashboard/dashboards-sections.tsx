import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { InsightsChatPanel } from "@/components/dashboard/insights-chat-panel";
import { MarketingTimelineChart } from "@/components/dashboard/marketing-timeline-chart";
import { EventInsightsList } from "@/components/dashboard/event-insights-list";
import { WeatherStory } from "@/components/dashboard/weather-story";
import { LoadedSection } from "@/components/dashboard/dashboards-skeletons";
import {
  loadChannelImpact,
  loadEditionBundle,
  loadMailLift,
  loadMarketingPostsBundle,
  loadMarketingTimeline,
  loadWeatherImpact,
  getReferrerChannelTotals,
} from "@/lib/cache/dashboard";
import { loadEventInsights } from "@/lib/insights/event-insights";
import type { MarketingPostsBundle } from "@/lib/marketing/posts";
import type { TimelineDay, TimelineMarker } from "@/lib/marketing/timeline";
import {
  periodClaims,
  weekdayClaims,
} from "@/lib/editions/cohort-claims";
import { referrerChannelLabel } from "@/lib/insights/referrers";
import { listOpenDashboardAlerts } from "@/lib/integrations/alerts";
import { hasDatabase } from "@/lib/db/client";
import { amsterdamDay } from "@/lib/time/amsterdam";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { WEEKDAY_LABEL } from "@/lib/time/nl-calendar";

export type DashboardsScope = "live" | "recent" | "all";

export const DASHBOARD_SCOPES: Array<{ id: DashboardsScope; label: string }> = [
  { id: "live", label: "Live / komend" },
  { id: "recent", label: "Recent" },
  { id: "all", label: "Alles" },
];

export function parseDashboardsScope(
  raw: string | string[] | undefined,
): DashboardsScope {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "recent" || v === "all" || v === "live") return v;
  return "live";
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

export async function ConflictsBanner() {
  const openAlerts = hasDatabase()
    ? await listOpenDashboardAlerts().catch(() => null)
    : null;

  const conflicts = openAlerts?.conflicts ?? [];
  if (!conflicts.length) return null;

  return (
    <LoadedSection>
      <Link
        href="/dashboard/alerts"
        className={cn(
          "mb-6 flex flex-col gap-1 border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between",
          conflicts.some((c) => c.kind === "overbooking")
            ? "border-danger/50 bg-danger/5"
            : "border-warn/50 bg-warn/10",
        )}
      >
        <span>
          <span className="font-medium">
            {conflicts.length === 1
              ? "1 event is uitverkocht op Weeztix, maar nog te koop elders"
              : `${conflicts.length} events zijn uitverkocht op Weeztix, maar nog te koop elders`}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted sm:mt-0 sm:ml-0 sm:inline sm:before:content-['_·_']">
            RA / TicketSwap / Appic verkopen nog — risico op overboeking of
            omzetlek
          </span>
        </span>
        <span className="shrink-0 text-text-muted">Naar alerts →</span>
      </Link>
    </LoadedSection>
  );
}

export async function EventInsightsSection() {
  const eventInsights = await loadEventInsights({ limit: 80 }).catch(() => []);
  const upcomingInsights = eventInsights
    .filter((e) => e.status === "upcoming")
    .sort((a, b) => a.day.localeCompare(b.day));
  const pastInsights = eventInsights
    .filter((e) => e.status === "past")
    .sort((a, b) => b.day.localeCompare(a.day));

  return (
    <LoadedSection className="mb-12">
      <EventInsightsList upcoming={upcomingInsights} past={pastInsights} />
    </LoadedSection>
  );
}

export async function SalesSection({ scope }: { scope: DashboardsScope }) {
  const today = amsterdamDay(new Date());
  const [bundle, openAlerts] = await Promise.all([
    loadEditionBundle(),
    hasDatabase()
      ? listOpenDashboardAlerts().catch(() => null)
      : Promise.resolve(null),
  ]);

  const conflicts = openAlerts?.conflicts ?? [];
  const withFill = bundle.rows.filter((r) => r.sellThrough != null);
  const avgFill =
    withFill.length > 0
      ? withFill.reduce((s, r) => s + (r.sellThrough ?? 0), 0) / withFill.length
      : null;

  const upcoming = bundle.rows
    .filter((r) => r.day >= today)
    .sort((a, b) => a.day.localeCompare(b.day));
  const recentPast = bundle.rows
    .filter((r) => r.day < today && r.sold > 0)
    .sort((a, b) => b.day.localeCompare(a.day));

  const scopeRows =
    scope === "live"
      ? upcoming.slice(0, 12)
      : scope === "recent"
        ? recentPast.slice(0, 12)
        : [...upcoming, ...recentPast].slice(0, 16);

  return (
    <LoadedSection className="mb-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
            Kaartverkoop
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-[0.02em]">
            Live stand
          </h2>
        </div>
        <nav className="flex gap-1 border border-border p-1">
          {DASHBOARD_SCOPES.map((s) => (
            <Link
              key={s.id}
              href={
                s.id === "live"
                  ? "/dashboard/dashboards"
                  : `/dashboard/dashboards?scope=${s.id}`
              }
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                scope === s.id
                  ? "bg-accent text-accent-contrast"
                  : "text-text-muted hover:text-text",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mb-6 flex flex-wrap gap-8">
        <Stat value={formatNumber(bundle.totals.editions)} label="edities" />
        <Stat
          value={formatNumber(bundle.totals.totalSold)}
          label="tickets sold"
        />
        <Stat
          value={avgFill != null ? formatPercent(avgFill, 0) : "—"}
          label="gem. fill"
        />
        <Stat value={formatNumber(upcoming.length)} label="komend" />
        <Stat value={formatNumber(conflicts.length)} label="lek-alerts" />
      </div>

      {!scopeRows.length ? (
        <p className="border border-border px-4 py-3 text-sm text-text-muted">
          Geen edities in dit filter. Sync Weeztix via{" "}
          <Link href="/koppelingen" className="underline">
            Bronnen
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Editie</th>
                <th className="px-4 py-3 font-medium">Dag</th>
                <th className="px-4 py-3 font-medium">Sold</th>
                <th className="px-4 py-3 font-medium">Fill</th>
                <th className="px-4 py-3 font-medium">Laatste week</th>
                <th className="px-4 py-3 font-medium">Weer</th>
              </tr>
            </thead>
            <tbody>
              {scopeRows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/70 last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/weeztix/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.headliner && (
                      <p className="mt-0.5 text-xs text-text-dim">
                        {r.headliner}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {WEEKDAY_LABEL[r.weekday]}{" "}
                    {new Date(`${r.day}T12:00:00`).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatNumber(r.sold)}
                    {r.capacity != null && (
                      <span className="text-text-dim">
                        {" "}
                        / {formatNumber(r.capacity)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {r.sellThrough != null
                      ? formatPercent(r.sellThrough, 0)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-text-muted">
                    {r.lastWeekSold != null
                      ? `+${formatNumber(r.lastWeekSold)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {r.weatherClass?.label ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LoadedSection>
  );
}

export async function MarketingSection() {
  const [bundle, mailLift, referrers] = await Promise.all([
    loadEditionBundle(),
    loadMailLift().catch(() => null),
    getReferrerChannelTotals({ limit: 8 }).catch(() => ({
      channels: [],
      totalOrders: 0,
    })),
  ]);

  const topMail = (mailLift?.editions ?? [])
    .filter((e) => e.brevoClickOrders > 0 || e.totalOrdersAfterMails > 0)
    .slice(0, 6);

  return (
    <LoadedSection className="mb-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
            Marketing
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-[0.02em]">
            Kanalen & mail → tickets
          </h2>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            Weeztix-referrers (waar kwam de order vandaan) plus mail-effect in
            de week ná verzending.
          </p>
        </div>
        <Link
          href="/dashboard/marketing"
          className="text-sm underline underline-offset-2"
        >
          Alle mailings →
        </Link>
      </div>

      {referrers.channels.length > 0 && (
        <div className="mb-8">
          <p className="mb-3 text-[11px] tracking-[0.12em] text-text-dim uppercase">
            Orders per kanaal · {formatNumber(referrers.totalOrders)} totaal
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {referrers.channels.map((c) => {
              const share =
                referrers.totalOrders > 0
                  ? (c.orders / referrers.totalOrders) * 100
                  : 0;
              return (
                <li
                  key={c.channel}
                  className="border border-border bg-surface px-4 py-3"
                >
                  <p className="text-sm font-medium">
                    {referrerChannelLabel(c.channel)}
                  </p>
                  <p className="mt-1 font-display text-2xl tracking-[0.02em]">
                    {formatNumber(c.orders)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-dim">
                    {formatPercent(share, 0)} van attributie
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-8">
        <Stat
          value={formatNumber(mailLift?.totals.ordersAfterMails ?? 0)}
          label="orders week ná mail"
        />
        <Stat
          value={formatNumber(mailLift?.totals.brevoClickOrders ?? 0)}
          label="via Brevo-klik"
        />
        <Stat
          value={formatNumber(mailLift?.totals.campaignsMeasured ?? 0)}
          label="campagnes gemeten"
        />
        <Stat
          value={formatNumber(bundle.totals.campaignsLinked)}
          label="gekoppeld aan edities"
        />
      </div>

      {topMail.length > 0 ? (
        <ul className="space-y-2">
          {topMail.map((ed) => (
            <li
              key={ed.editionId}
              className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{ed.editionName}</p>
                <p className="mt-0.5 text-xs text-text-dim">
                  {new Date(ed.startsAt).toLocaleDateString("nl-NL", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · "}
                  {formatNumber(ed.sold)} sold
                  {ed.referrerBreakdown[0] && (
                    <>
                      {" · top referrer "}
                      {referrerChannelLabel(ed.referrerBreakdown[0].channel)}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ed.brevoClickOrders > 0 && (
                  <StatusBadge tone="success">
                    {formatNumber(ed.brevoClickOrders)} via Brevo-klik
                  </StatusBadge>
                )}
                {ed.totalOrdersAfterMails > 0 && (
                  <StatusBadge tone="accent">
                    {formatNumber(ed.totalOrdersAfterMails)} week ná mail
                  </StatusBadge>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border border-border px-4 py-3 text-sm text-text-muted">
          Nog geen gemeten mail-effect. Sync Brevo + Weeztix via Bronnen.
        </p>
      )}
    </LoadedSection>
  );
}

export async function CorrelationSection() {
  const [timeline, channelImpact] = await Promise.all([
    loadMarketingTimeline({ days: 60 }).catch(
      (): { days: TimelineDay[]; markers: TimelineMarker[] } => ({
        days: [],
        markers: [],
      }),
    ),
    loadChannelImpact().catch(() => []),
  ]);

  return (
    <LoadedSection className="mb-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
            Correlatie
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-[0.02em]">
            Marketing vs. ticketverkoop
          </h2>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            Dagelijkse Weeztix-verkopen naast social posts en mails (laatste 60
            dagen). Lift is correlatie, geen causaliteit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/dashboard/meta" className="underline underline-offset-2">
            Meta
          </Link>
          <Link
            href="/dashboard/tiktok"
            className="underline underline-offset-2"
          >
            TikTok
          </Link>
          <Link
            href="/dashboard/youtube"
            className="underline underline-offset-2"
          >
            YouTube
          </Link>
        </div>
      </div>

      <MarketingTimelineChart days={timeline.days} />

      {channelImpact.length > 0 && (
        <ul className="mt-6 grid gap-2 sm:grid-cols-3">
          {channelImpact.map((c) => (
            <li
              key={c.channel}
              className="border border-border bg-surface px-4 py-3"
            >
              <p className="text-sm font-medium capitalize">{c.channel}</p>
              <p className="mt-1 font-display text-2xl tracking-[0.02em]">
                {c.measured > 0
                  ? `~${formatNumber(Math.round(c.avgLift))}`
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-text-dim">
                gem. tickets ±48u · {formatNumber(c.posts)} posts
                {c.topTitle ? ` · top: ${c.topTitle.slice(0, 28)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {timeline.markers.length > 0 && (
        <p className="mt-4 text-xs text-text-dim">
          {formatNumber(timeline.markers.length)} marketing-momenten in deze
          periode (posts + mails).
        </p>
      )}
    </LoadedSection>
  );
}

export async function CreativesSection() {
  const creatives = await loadMarketingPostsBundle({
    limit: 8,
    withLift: true,
  }).catch(
    (): MarketingPostsBundle => ({
      posts: [],
      aggregates: [],
      analyzedCount: 0,
      lastSyncedAt: null,
    }),
  );
  const socialPosts = creatives.posts;

  return (
    <LoadedSection className="mb-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
            Creatives
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-[0.02em]">
            Social posts
          </h2>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            {creatives.analyzedCount}/{socialPosts.length || 0} geanalyseerd ·
            tickets ±48u rond publicatie.
          </p>
        </div>
        <Link
          href="/dashboard/assets"
          className="text-sm underline underline-offset-2"
        >
          Alle creatives →
        </Link>
      </div>

      {creatives.aggregates.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {creatives.aggregates.slice(0, 3).map((a) => (
            <li key={a.key}>
              <span className="font-medium">{a.label}</span>
              <span className="ml-2 text-text-muted">
                ~{formatNumber(Math.round(a.avgLift))} tickets ±48u
              </span>
            </li>
          ))}
        </ul>
      )}

      {socialPosts.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {socialPosts.map((post) => {
            const img =
              post.storedMediaUrl || post.thumbnailUrl || post.mediaUrl;
            const vf = post.visualFeatures;
            return (
              <li
                key={post.id}
                className="overflow-hidden border border-border bg-surface"
              >
                <div
                  className="aspect-[4/3] bg-bg-elevated bg-cover bg-center"
                  style={img ? { backgroundImage: `url(${img})` } : undefined}
                />
                <div className="p-3">
                  <p className="text-[10px] tracking-wider text-text-dim uppercase">
                    {post.channel}
                    {vf?.format ? ` · ${vf.format}` : ""}
                    {vf?.offer ? ` · ${vf.offer}` : ""}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm font-medium">
                    {post.title || "Zonder caption"}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    {post.ticketLift?.signal === "measured"
                      ? `+${formatNumber(post.ticketLift.sold ?? 0)} tickets ±48u`
                      : "geen ticketcurve"}
                    {post.engagement > 0
                      ? ` · ${formatNumber(post.engagement)} eng.`
                      : ""}
                  </p>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs underline underline-offset-2"
                    >
                      Open post
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border border-border bg-surface p-5">
          <p className="text-sm text-text-muted">
            Nog geen social posts in de database. Sync via{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>{" "}
            (YouTube / TikTok / Instagram).
          </p>
        </div>
      )}
    </LoadedSection>
  );
}

export async function ClaimsSection() {
  const [bundle, impact] = await Promise.all([
    loadEditionBundle(),
    loadWeatherImpact(),
  ]);

  const claimCards = [
    ...weekdayClaims(bundle.rows).slice(0, 2),
    ...periodClaims(bundle.rows).slice(0, 2),
  ];

  return (
    <LoadedSection className="mb-12">
      <p className="mb-1 text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
        Wat telt
      </p>
      <h2 className="mb-4 font-display text-2xl tracking-[0.02em]">
        Inzichten uit de data
      </h2>

      <WeatherStory impact={impact} compact />

      {claimCards.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {claimCards.map((c) => (
            <article
              key={c.title}
              className="border border-border bg-surface p-5"
            >
              <h3 className="font-display text-xl leading-tight tracking-[0.02em]">
                {c.title}
              </h3>
              <p className="mt-2 text-sm text-text-muted">{c.body}</p>
              <p className="mt-2 text-xs text-text-dim">{c.evidence}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          Nog te weinig data voor cohort-claims.
        </p>
      )}
    </LoadedSection>
  );
}

export function AiSection() {
  return (
    <LoadedSection className="border border-border bg-surface p-5">
      <p className="mb-1 text-[11px] tracking-[0.14em] text-text-dim uppercase">
        AI
      </p>
      <h2 className="mb-3 font-display text-xl tracking-[0.02em]">
        Vraag de data
      </h2>
      <InsightsChatPanel />
    </LoadedSection>
  );
}
