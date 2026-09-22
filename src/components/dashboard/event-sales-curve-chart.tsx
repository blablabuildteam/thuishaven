"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  type SalesCurvePoint,
  type SalesDayPoint,
} from "@/lib/insights/sales-curve";
import { formatDayNl, formatDayShort } from "@/lib/time/amsterdam";
import { cn, formatNumber } from "@/lib/utils";
import {
  SocialChannelIcon,
  paidAdBrandChannel,
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
const EMPTY_ADS: Array<{
  publishedAt: string | null;
  dateStart: string | null;
  platform: string;
  campaignName: string | null;
  adName: string | null;
}> = [];
const ICON_SIZE = 12;
const PLOT_RIGHT = 36;

function flyoutPosition(
  x: number,
  y: number,
  width = 220,
): { left: number; top: number; transform: string } {
  const pad = 12;
  const flipLeft = x > window.innerWidth - width - pad;
  const flipUp = y > window.innerHeight - 220;
  return {
    left: flipLeft ? x - 10 : x + 12,
    top: flipUp ? y - 10 : y + 12,
    transform: `${flipLeft ? "translateX(-100%)" : ""} ${flipUp ? "translateY(-100%)" : ""}`.trim(),
  };
}

function ActivityChannelIcon({
  channel,
  paid,
  size,
  className,
}: {
  channel: string;
  paid?: boolean;
  size: number;
  className?: string;
}) {
  const resolved = paid ? paidAdBrandChannel(channel) : channel;
  if (!socialBrandIconSrc(resolved)) return null;
  return (
    <SocialChannelIcon
      channel={resolved}
      size={size}
      paid={paid}
      className={className}
      alt={paid ? "Paid" : undefined}
    />
  );
}

function ActivityList({
  activities,
}: {
  activities: SalesCurvePoint["activities"];
}) {
  if (activities.length === 0) return null;
  const organic = activities.filter((a) => a.kind !== "paid");
  const paid = activities.filter((a) => a.kind === "paid");

  function group(
    label: string | null,
    rows: SalesCurvePoint["activities"],
    max: number,
  ) {
    if (rows.length === 0) return null;
    const shown = rows.slice(0, max);
    const extra = rows.length - shown.length;
    return (
      <>
        {label && (
          <li className="pt-1 text-[9px] font-medium tracking-[0.1em] text-text-dim uppercase">
            {label} ({rows.length})
          </li>
        )}
        {shown.map((activity, index) => (
          <li
            key={`${activity.kind}-${index}`}
            className="flex items-start gap-1.5"
          >
            <ActivityChannelIcon
              channel={activity.kind === "mail" ? "mail" : activity.channel}
              paid={activity.kind === "paid"}
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
      </>
    );
  }

  const both = organic.length > 0 && paid.length > 0;
  return (
    <ul className="mt-2 space-y-1 border-t border-border pt-1.5">
      {group(both || paid.length > 0 ? "Organic" : null, organic, 4)}
      {group("Paid", paid, 4)}
    </ul>
  );
}

type LaneMark = {
  row: SalesCurvePoint;
  index: number;
  channels: string[];
  count: number;
};

function laneMarks(
  series: SalesCurvePoint[],
  paid: boolean,
): LaneMark[] {
  return series
    .map((row, index) => {
      const rows = row.activities.filter((a) =>
        paid ? a.kind === "paid" : a.kind !== "paid",
      );
      const seen = new Set<string>();
      const channels: string[] = [];
      for (const activity of rows) {
        const channel =
          activity.kind === "mail"
            ? "mail"
            : paid
              ? paidAdBrandChannel(activity.channel)
              : activity.channel;
        if (!channel || seen.has(channel) || !socialBrandIconSrc(channel)) {
          continue;
        }
        seen.add(channel);
        channels.push(channel);
        if (channels.length >= 2) break;
      }
      return { row, index, channels, count: rows.length };
    })
    .filter((mark) => mark.count > 0 && mark.channels.length > 0);
}

function ActivityLane({
  label,
  marks,
  last,
  paid,
  onHover,
  onLeave,
}: {
  label: string;
  marks: LaneMark[];
  last: number;
  paid: boolean;
  onHover: (row: SalesCurvePoint, x: number, y: number) => void;
  onLeave: () => void;
}) {
  if (marks.length === 0) return null;
  return (
    <div className="flex items-center gap-0">
      <div
        className={cn(
          "w-8 shrink-0 pr-1 text-right text-[8px] font-medium tracking-[0.08em] uppercase",
          paid ? "text-success" : "text-text-dim",
        )}
        aria-hidden
      >
        {label}
      </div>
      <div className="relative h-6 min-w-0 flex-1" style={{ marginRight: PLOT_RIGHT }}>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-1/2 h-px",
            paid ? "bg-success/40" : "bg-border",
          )}
          aria-hidden
        />
        {marks.map((mark) => {
          const left = (mark.index / last) * 100;
          return (
            <div
              key={mark.row.day}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%` }}
              onMouseEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onHover(mark.row, rect.left + rect.width / 2, rect.top);
              }}
              onMouseLeave={onLeave}
            >
              <div className="flex items-center justify-center gap-px">
                {mark.channels.map((channel) => (
                  <ActivityChannelIcon
                    key={channel}
                    channel={channel}
                    paid={paid}
                    size={ICON_SIZE}
                  />
                ))}
                {mark.count > mark.channels.length && (
                  <span
                    className={
                      paid
                        ? "ml-px font-mono text-[8px] leading-none font-semibold text-success"
                        : "ml-px font-mono text-[8px] leading-none text-text-dim"
                    }
                  >
                    ×{mark.count}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketingActivityRow({ series }: { series: SalesCurvePoint[] }) {
  const [hover, setHover] = useState<{
    row: SalesCurvePoint;
    x: number;
    y: number;
  } | null>(null);
  const organicMarks = laneMarks(series, false);
  const paidMarks = laneMarks(series, true);

  if (organicMarks.length === 0 && paidMarks.length === 0) return null;
  const last = Math.max(series.length - 1, 1);

  const onHover = (row: SalesCurvePoint, x: number, y: number) =>
    setHover({ row, x, y });
  const onLeave = () => setHover(null);

  return (
    <div className="mt-1 space-y-0.5">
      <ActivityLane
        label={paidMarks.length > 0 ? "Org" : ""}
        marks={organicMarks}
        last={last}
        paid={false}
        onHover={onHover}
        onLeave={onLeave}
      />
      <ActivityLane
        label="Paid"
        marks={paidMarks}
        last={last}
        paid
        onHover={onHover}
        onLeave={onLeave}
      />
      {hover && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none max-w-[220px] border border-border bg-surface px-2.5 py-2 text-xs shadow-md"
              style={{
                position: "fixed",
                zIndex: 80,
                ...flyoutPosition(hover.x, hover.y),
              }}
            >
              <p className="font-medium">
                {formatDayNl(hover.row.day)}
                {hover.row.isEvent ? " · eventdag" : ""}
              </p>
              <ActivityList activities={hover.row.activities} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function SalesCurveTooltip({
  active,
  payload,
  coordinate,
  colors,
  containerRef,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SalesCurvePoint }>;
  coordinate?: { x?: number; y?: number };
  colors: { tooltipBg: string; tooltipFg: string; primary: string };
  containerRef: { current: HTMLDivElement | null };
}) {
  if (!active || !payload?.length || typeof document === "undefined") {
    return null;
  }
  const point = payload[0]?.payload;
  if (!point) return null;

  const rect = containerRef.current?.getBoundingClientRect();
  const x = (rect?.left ?? 0) + (coordinate?.x ?? 0);
  const y = (rect?.top ?? 0) + (coordinate?.y ?? 0);

  return createPortal(
    <div
      className="pointer-events-none max-w-[220px] border px-2.5 py-2 text-xs shadow-md"
      style={{
        position: "fixed",
        zIndex: 80,
        background: colors.tooltipBg,
        borderColor: colors.primary,
        color: colors.tooltipFg,
        ...flyoutPosition(x, y),
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
      <ActivityList activities={point.activities ?? []} />
    </div>,
    document.body,
  );
}

export function EventSalesCurveChart({
  points,
  eventDay,
  sinceDay,
  posts = EMPTY_POSTS,
  mails = EMPTY_MAILS,
  ads = EMPTY_ADS,
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
  ads?: Array<{
    publishedAt: string | null;
    dateStart: string | null;
    platform: string;
    campaignName: string | null;
    adName: string | null;
  }>;
}) {
  const colors = useChartColors();
  const reactId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const activityDays = useMemo(
    () => marketingActivitiesByDay({ posts, mails, ads }),
    [posts, mails, ads],
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
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
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
      <div ref={chartRef} className="h-28 w-full min-w-0">
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
              content={
                <SalesCurveTooltip colors={colors} containerRef={chartRef} />
              }
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 80, pointerEvents: "none" }}
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
