"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  applyActivitiesToSeries,
  buildSalesCurveSeries,
  marketingActivitiesByDay,
  uniqueActivityChannels,
  type SalesCurvePoint,
  type SalesDayPoint,
} from "@/lib/insights/sales-curve";
import { formatDayNl, formatDayShort } from "@/lib/time/amsterdam";
import { formatNumber } from "@/lib/utils";
import {
  SocialChannelIcon,
  socialBrandIconSrc,
} from "@/components/ui/social-channel-icon";

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

const EMPTY_POSTS: Array<{
  publishedAt: string | null;
  channel: string;
  title: string | null;
  variants?: Array<{ publishedAt: string | null; title: string | null }>;
}> = [];
const EMPTY_MAILS: Array<{ sentAt: string | null; name: string }> = [];
const ICON_SIZE = 12;
const PLOT_RIGHT = 36;

function MarketingActivityRow({ series }: { series: SalesCurvePoint[] }) {
  const marks = series
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.activities.length > 0);
  if (marks.length === 0) return null;
  const last = Math.max(series.length - 1, 1);

  return (
    <div className="mt-1 flex items-center gap-0">
      <p className="w-8 shrink-0 text-[9px] leading-none tracking-[0.08em] text-text-dim uppercase">
        Post
      </p>
      <div
        className="relative h-5 flex-1"
        style={{ marginRight: PLOT_RIGHT }}
      >
        {marks.map(({ row, index }) => {
          const channels = uniqueActivityChannels(row.activities).filter(
            (channel) => socialBrandIconSrc(channel),
          );
          if (channels.length === 0) return null;
          const left = (index / last) * 100;
          return (
            <div
              key={row.day}
              className="group absolute top-0 z-10 -translate-x-1/2 hover:z-20"
              style={{ left: `${left}%` }}
            >
              <div className="flex items-center justify-center gap-px">
                {channels.map((channel) => (
                  <SocialChannelIcon
                    key={channel}
                    channel={channel}
                    size={ICON_SIZE}
                  />
                ))}
              </div>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-52 -translate-x-1/2 border border-border bg-surface px-2.5 py-2 text-xs shadow-sm group-hover:block">
                <p className="font-medium">
                  {formatDayNl(row.day)}
                  {row.isEvent ? " · eventdag" : ""}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {row.activities.slice(0, 6).map((activity, activityIndex) => (
                    <li
                      key={`${activity.kind}-${activityIndex}`}
                      className="flex items-start gap-1.5"
                    >
                      <SocialChannelIcon
                        channel={
                          activity.kind === "mail" ? "mail" : activity.channel
                        }
                        size={11}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 leading-snug text-text line-clamp-2">
                        {activity.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SalesCurveTooltip({
  active,
  payload,
  coordinate,
  viewBox,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SalesCurvePoint }>;
  coordinate?: { x?: number; y?: number };
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  colors: { tooltipBg: string; tooltipFg: string; primary: string };
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const x = coordinate?.x ?? 0;
  const width = viewBox?.width ?? 0;
  const flipLeft = width > 0 && x > width - 220;
  const activities = point.activities ?? [];
  const shown = activities.slice(0, 6);
  const extra = activities.length - shown.length;

  return (
    <div
      className="max-w-[220px] border px-2.5 py-2 text-xs shadow-sm"
      style={{
        background: colors.tooltipBg,
        borderColor: colors.primary,
        color: colors.tooltipFg,
        transform: flipLeft ? "translateX(-100%)" : undefined,
      }}
    >
      <p className="font-medium">
        {formatDayNl(point.day)}
        {point.isEvent ? " · eventdag" : ""}
      </p>
      <p className="mt-1 font-mono tabular-nums">
        +{formatNumber(point.sold)}{" "}
        <span className="text-text-dim">deze dag</span>
      </p>
      <p className="mt-0.5 font-mono tabular-nums text-text-dim">
        {formatNumber(point.cumulative)} cumulatief
      </p>
      {shown.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border pt-1.5">
          {shown.map((activity, index) => (
            <li
              key={`${activity.kind}-${index}`}
              className="flex items-start gap-1.5"
            >
              <SocialChannelIcon
                channel={activity.kind === "mail" ? "mail" : activity.channel}
                size={11}
                className="mt-0.5"
              />
              <span className="min-w-0 leading-snug text-text line-clamp-2">
                {activity.title}
              </span>
            </li>
          ))}
          {extra > 0 && (
            <li className="text-[10px] text-text-dim">+{extra} meer</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function EventSalesCurveChart({
  points,
  eventDay,
  sinceDay,
  posts = EMPTY_POSTS,
  mails = EMPTY_MAILS,
}: {
  points: SalesDayPoint[];
  eventDay: string;
  sinceDay?: string | null;
  posts?: Array<{
    publishedAt: string | null;
    channel: string;
    title: string | null;
    variants?: Array<{ publishedAt: string | null; title: string | null }>;
  }>;
  mails?: Array<{ sentAt: string | null; name: string }>;
}) {
  const colors = useChartColors();
  const reactId = useId();
  const activityDays = useMemo(
    () => marketingActivitiesByDay({ posts, mails }),
    [posts, mails],
  );
  const series = useMemo(() => {
    const built = buildSalesCurveSeries(points, eventDay, [
      ...activityDays.keys(),
    ]);
    return applyActivitiesToSeries(built, activityDays);
  }, [points, eventDay, activityDays]);

  if (series.length === 0) return null;

  const total = series[series.length - 1]?.cumulative ?? 0;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const eventInRange = series.some((row) => row.isEvent);
  const yMax = Math.max(...series.map((row) => row.cumulative), 0);
  const hasActivities = series.some((row) => row.activities.length > 0);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-end justify-between gap-3">
        <p className="text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
          Verkoopverloop
        </p>
        <p className="text-[10px] text-text-dim">
          {first.label} – {last.label}
          {sinceDay ? " · snapshot" : ""}
        </p>
      </div>
      <p className="sr-only">
        {formatNumber(total)} tickets van {formatDayNl(first.day)} tot{" "}
        {formatDayNl(last.day)}. Hover een dag voor tickets en marketing.
      </p>
      <div className="h-28 w-full overflow-visible">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 8, right: PLOT_RIGHT, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              stroke={colors.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tickFormatter={(value) => formatDayShort(String(value))}
              tick={{ fill: colors.tick, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: colors.tick, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={42}
              domain={[0, yMax]}
              tickFormatter={(value) => formatNumber(Number(value))}
            />
            <Tooltip
              cursor={{ stroke: colors.primary, strokeOpacity: 0.25 }}
              content={<SalesCurveTooltip colors={colors} />}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
            />
            {eventInRange && (
              <ReferenceLine
                x={series.find((row) => row.isEvent)?.day}
                stroke={colors.tick}
                strokeDasharray="3 3"
                label={{
                  value: "Event",
                  position: "insideTopRight",
                  fill: colors.tick,
                  fontSize: 9,
                }}
              />
            )}
            <Line
              type="linear"
              dataKey="cumulative"
              stroke={colors.primary}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
              name={reactId}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hasActivities ? <MarketingActivityRow series={series} /> : null}
    </div>
  );
}
