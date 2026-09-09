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
  buildSalesCurveSeries,
  type SalesCurvePoint,
  type SalesDayPoint,
} from "@/lib/insights/sales-curve";
import { formatDayNl } from "@/lib/time/amsterdam";
import { formatNumber } from "@/lib/utils";

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

function SalesCurveTooltip({
  active,
  payload,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SalesCurvePoint }>;
  colors: { tooltipBg: string; tooltipFg: string; primary: string };
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      className="border px-2.5 py-2 text-xs shadow-sm"
      style={{
        background: colors.tooltipBg,
        borderColor: colors.primary,
        color: colors.tooltipFg,
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
    </div>
  );
}

export function EventSalesCurveChart({
  points,
  eventDay,
  sinceDay,
}: {
  points: SalesDayPoint[];
  eventDay: string;
  sinceDay?: string | null;
}) {
  const colors = useChartColors();
  const reactId = useId();
  const series = useMemo(
    () => buildSalesCurveSeries(points, eventDay),
    [points, eventDay],
  );

  if (series.length === 0) return null;

  const total = series[series.length - 1]?.cumulative ?? 0;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const eventInRange = series.some((row) => row.isEvent);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-end justify-between gap-3">
        <p className="text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
          Verkoop per dag
        </p>
        <p className="text-[10px] text-text-dim">
          {first.label} – {last.label}
          {sinceDay ? " · snapshot" : ""}
        </p>
      </div>
      <p className="sr-only">
        {formatNumber(total)} tickets van {formatDayNl(first.day)} tot{" "}
        {formatDayNl(last.day)}. Hover een dag voor het aantal.
      </p>
      <div className="h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
          >
            <CartesianGrid
              stroke={colors.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
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
              width={36}
              tickFormatter={(value) => formatNumber(Number(value))}
            />
            <Tooltip
              cursor={{ stroke: colors.primary, strokeOpacity: 0.25 }}
              content={<SalesCurveTooltip colors={colors} />}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20 }}
            />
            {eventInRange && (
              <ReferenceLine
                x={series.find((row) => row.isEvent)?.label}
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
              dataKey="sold"
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
    </div>
  );
}
