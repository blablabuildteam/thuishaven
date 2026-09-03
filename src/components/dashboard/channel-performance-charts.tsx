"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LoaderCircle } from "lucide-react";
import type {
  MarketingPostRow,
  MarketingPostsPage,
  SocialFeedChannel,
} from "@/lib/marketing/post-types";
import {
  DEFAULT_SOCIAL_RANGE,
  SOCIAL_RANGE_LABEL,
  SOCIAL_RANGES,
  socialRangeSince,
  type SocialRange,
} from "@/lib/marketing/social-range";
import { amsterdamDay, shiftIsoDay } from "@/lib/time/amsterdam";
import { cn, formatNumber } from "@/lib/utils";

type Props = {
  channel: SocialFeedChannel;
  /** Seed for default 30D (SSR). */
  initialPosts?: MarketingPostRow[];
  /** Primary metric label: "views" for YT/TikTok, "views"/"reach" for IG */
  impressionsLabel?: string;
};

function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function useChartColors() {
  const [colors, setColors] = useState({
    grid: "#d4cec0",
    tick: "#8a8678",
    tooltipBg: "#ffffff",
    tooltipFg: "#0a0a0a",
    primary: "#111111",
  });

  useEffect(() => {
    const sync = () => {
      setColors({
        grid: readCssVar("--chart-grid", "#d4cec0"),
        tick: readCssVar("--chart-tick", "#8a8678"),
        tooltipBg: readCssVar("--chart-tooltip-bg", "#ffffff"),
        tooltipFg: readCssVar("--chart-tooltip-fg", "#0a0a0a"),
        primary: readCssVar("--chart-primary", "#111111"),
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}

function shortDay(day: string, range: SocialRange) {
  const d = new Date(`${day}T12:00:00`);
  if (range === "1y" || range === "6m") {
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function rangeStartDay(range: SocialRange): string {
  return amsterdamDay(socialRangeSince(range));
}

type DayPostContribution = {
  id: string;
  title: string;
  views: number;
  permalink: string | null;
};

type DailyPoint = {
  day: string;
  label: string;
  views: number;
  likes: number;
  comments: number;
  engagement: number;
  posts: number;
  contributions: DayPostContribution[];
};

function postViews(post: MarketingPostRow): number {
  if (post.impressions > 0) return post.impressions;
  if (post.reach > 0) return post.reach;
  return 0;
}

function truncateTitle(title: string | null, max = 42): string {
  const raw = title?.trim() || "Zonder titel";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

/** Continuous daily series for the selected window (zeros on quiet days). */
function buildDailySeries(
  posts: MarketingPostRow[],
  range: SocialRange,
): DailyPoint[] {
  const start = rangeStartDay(range);
  const end = amsterdamDay(new Date());
  if (!start || !end || start > end) return [];

  const byDay = new Map<
    string,
    {
      views: number;
      likes: number;
      comments: number;
      engagement: number;
      contributions: DayPostContribution[];
    }
  >();

  for (const post of posts) {
    if (!post.publishedAt) continue;
    const key = amsterdamDay(post.publishedAt);
    if (!key || key < start || key > end) continue;
    const row = byDay.get(key) ?? {
      views: 0,
      likes: 0,
      comments: 0,
      engagement: 0,
      contributions: [],
    };
    const views = postViews(post);
    row.views += views;
    row.likes += post.likeCount;
    row.comments += post.commentCount;
    row.engagement += post.engagement;
    row.contributions.push({
      id: post.id,
      title: truncateTitle(post.title),
      views,
      permalink: post.permalink,
    });
    byDay.set(key, row);
  }

  const series: DailyPoint[] = [];
  let cursor = start;
  while (cursor <= end) {
    const row = byDay.get(cursor);
    series.push({
      day: cursor,
      label: shortDay(cursor, range),
      views: row?.views ?? 0,
      likes: row?.likes ?? 0,
      comments: row?.comments ?? 0,
      engagement: row?.engagement ?? 0,
      posts: row?.contributions.length ?? 0,
      contributions: row
        ? [...row.contributions].sort((a, b) => b.views - a.views)
        : [],
    });
    cursor = shiftIsoDay(cursor, 1);
  }
  return series;
}

function DailyViewsTooltip({
  active,
  payload,
  impressionsLabel,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DailyPoint }>;
  impressionsLabel: string;
  colors: { tooltipBg: string; tooltipFg: string; primary: string };
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const shown = point.contributions.slice(0, 6);
  const overflow = point.contributions.length - shown.length;

  return (
    <div
      className="max-w-72 border px-3 py-2 text-xs shadow-sm"
      style={{
        background: colors.tooltipBg,
        borderColor: colors.primary,
        color: colors.tooltipFg,
      }}
    >
      <p className="font-medium">{shortDay(point.day, "30d")}</p>
      <p className="mt-1 text-text-muted">
        {formatNumber(point.views)} {impressionsLabel}
        {" · "}
        {formatNumber(point.engagement)} eng.
        {" · "}
        {point.posts} post{point.posts === 1 ? "" : "s"}
      </p>

      {shown.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
          {shown.map((post) => (
            <li key={post.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0 leading-snug">{post.title}</span>
              <span className="shrink-0 tabular-nums text-text-muted">
                {formatNumber(post.views)}
              </span>
            </li>
          ))}
          {overflow > 0 && (
            <li className="text-text-dim">+{overflow} meer</li>
          )}
        </ul>
      )}
    </div>
  );
}

function buildTopPosts(posts: MarketingPostRow[], limit = 8) {
  return [...posts]
    .map((post) => {
      const views = postViews(post);
      const title = truncateTitle(post.title, 28);
      return {
        id: post.id,
        title,
        views,
        likes: post.likeCount,
        comments: post.commentCount,
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
    .reverse();
}

async function fetchPostsForRange(
  channel: SocialFeedChannel,
  range: SocialRange,
): Promise<MarketingPostRow[]> {
  const collected: MarketingPostRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 6; page += 1) {
    const params = new URLSearchParams({
      channel,
      range,
      limit: "50",
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/dashboard/marketing-posts?${params}`);
    const data = (await res.json().catch(() => ({}))) as MarketingPostsPage & {
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Grafiekdata laden mislukt");
    }
    collected.push(...data.posts);
    if (!data.hasMore || !data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return collected;
}

function filterPostsByRange(
  posts: MarketingPostRow[],
  range: SocialRange,
): MarketingPostRow[] {
  const start = rangeStartDay(range);
  return posts.filter((post) => {
    if (!post.publishedAt) return false;
    const day = amsterdamDay(post.publishedAt);
    return Boolean(day) && day >= start;
  });
}

export function ChannelPerformanceCharts({
  channel,
  initialPosts = [],
  impressionsLabel = "views",
}: Props) {
  const colors = useChartColors();
  const [range, setRange] = useState<SocialRange>(DEFAULT_SOCIAL_RANGE);
  const [allPosts, setAllPosts] = useState(initialPosts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  // Seed once from SSR; ignore later refreshes so sync/router.refresh
  // does not wipe the selected period.
  useEffect(() => {
    if (hydrated.current) return;
    if (initialPosts.length === 0) return;
    hydrated.current = true;
    setAllPosts(initialPosts);
  }, [initialPosts]);

  // Ensure we have a full 1Y window for client-side period filtering.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPostsForRange(channel, "1y");
        if (cancelled) return;
        setAllPosts(data);
        hydrated.current = true;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Grafiekdata laden mislukt");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  const posts = useMemo(
    () => filterPostsByRange(allPosts, range),
    [allPosts, range],
  );
  const daily = useMemo(() => buildDailySeries(posts, range), [posts, range]);
  const topPosts = useMemo(() => buildTopPosts(posts), [posts]);
  const rangeLabel = useMemo(() => {
    const start = rangeStartDay(range);
    const end = amsterdamDay(new Date());
    return `${shortDay(start, range)} – ${shortDay(end, range)}`;
  }, [range]);

  const tooltipStyle = {
    background: colors.tooltipBg,
    border: `1px solid ${colors.primary}`,
    borderRadius: 0,
    fontSize: 12,
    color: colors.tooltipFg,
  } as const;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
            Performance
          </h2>
          <p className="mt-1 text-[11px] text-text-muted">{rangeLabel}</p>
        </div>
        <div
          className="flex border border-border"
          role="group"
          aria-label="Periode"
        >
          {SOCIAL_RANGES.map((key, index) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={cn(
                "px-2.5 py-1.5 text-xs tracking-[0.06em] transition",
                index > 0 && "border-l border-border",
                range === key
                  ? "bg-text text-bg"
                  : "text-text-muted hover:text-text",
              )}
              aria-pressed={range === key}
            >
              {SOCIAL_RANGE_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {loading && allPosts.length === 0 ? (
        <p
          role="status"
          className="flex items-center gap-2 border border-border px-4 py-3 text-sm text-text-muted"
        >
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Grafiek laden…
        </p>
      ) : error && allPosts.length === 0 ? (
        <p className="border border-danger/40 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : (
        <div key={range} className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
              {impressionsLabel} per dag
            </h3>
            {daily.length === 0 ? (
              <p className="border border-border px-4 py-3 text-sm text-text-muted">
                Geen publicatiedata om te plotten.
              </p>
            ) : (
              <div className="h-56 w-full border border-border bg-surface p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={daily}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id={`fillChannelViews-${channel}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={colors.primary}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={colors.primary}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke={colors.grid}
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: colors.tick, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={range === "30d" ? 28 : 40}
                    />
                    <YAxis
                      tick={{ fill: colors.tick, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatNumber(Number(v))}
                    />
                    <Tooltip
                      content={
                        <DailyViewsTooltip
                          impressionsLabel={impressionsLabel}
                          colors={colors}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke={colors.primary}
                      fill={`url(#fillChannelViews-${channel})`}
                      strokeWidth={2}
                      name="views"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="engagement"
                      stroke="#5eb0e0"
                      fill="transparent"
                      strokeWidth={1.5}
                      name="engagement"
                      legendType="none"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
              Top posts · {impressionsLabel}
            </h3>
            {topPosts.length === 0 ? (
              <p className="border border-border px-4 py-3 text-sm text-text-muted">
                Geen posts in deze periode.
              </p>
            ) : (
              <div className="h-56 w-full border border-border bg-surface p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topPosts}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke={colors.grid}
                      strokeDasharray="3 3"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: colors.tick, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatNumber(Number(v))}
                    />
                    <YAxis
                      type="category"
                      dataKey="title"
                      width={96}
                      tick={{ fill: colors.tick, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => {
                        const n =
                          typeof value === "number" ? value : Number(value ?? 0);
                        if (name === "views") {
                          return [formatNumber(n), impressionsLabel];
                        }
                        return [formatNumber(n), String(name)];
                      }}
                    />
                    <Bar
                      dataKey="views"
                      fill={colors.primary}
                      name="views"
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
