"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimelineDay } from "@/lib/marketing/timeline";

function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function shortDay(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function MarketingTimelineChart({ days }: { days: TimelineDay[] }) {
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

  if (!days.length) {
    return (
      <p className="border border-border px-4 py-3 text-sm text-text-muted">
        Nog geen dagcurve om te plotten. Sync Weeztix daily sales.
      </p>
    );
  }

  const data = days.map((d) => ({
    ...d,
    label: shortDay(d.day),
    activity: d.posts + d.mails,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="fillSold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillActivity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5eb0e0" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#5eb0e0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            yAxisId="sold"
            tick={{ fill: colors.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="activity"
            orientation="right"
            tick={{ fill: colors.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.primary}`,
              borderRadius: 0,
              fontSize: 12,
              color: colors.tooltipFg,
            }}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value ?? 0);
              if (name === "sold") return [n, "Tickets sold"];
              if (name === "activity") return [n, "Posts + mails"];
              return [n, String(name)];
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as TimelineDay | undefined;
              return row?.day ?? "";
            }}
          />
          <Area
            yAxisId="sold"
            type="monotone"
            dataKey="sold"
            stroke={colors.primary}
            fill="url(#fillSold)"
            strokeWidth={2}
            name="sold"
          />
          <Area
            yAxisId="activity"
            type="monotone"
            dataKey="activity"
            stroke="#5eb0e0"
            fill="url(#fillActivity)"
            strokeWidth={1.5}
            name="activity"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
