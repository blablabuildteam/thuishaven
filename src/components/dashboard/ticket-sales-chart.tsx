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
import { salesByDay } from "@/lib/mock/dashboard";

function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function TicketSalesChart() {
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

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={salesByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="fillWeeztix" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: colors.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: colors.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.primary}`,
              borderRadius: 0,
              fontSize: 12,
              color: colors.tooltipFg,
            }}
          />
          <Area
            type="monotone"
            dataKey="weeztix"
            stroke={colors.primary}
            fill="url(#fillWeeztix)"
            strokeWidth={2}
            name="Weeztix"
          />
          <Area
            type="monotone"
            dataKey="ra"
            stroke="#5eb0e0"
            fill="transparent"
            strokeWidth={1.5}
            name="RA"
          />
          <Area
            type="monotone"
            dataKey="appic"
            stroke="#ff6a00"
            fill="transparent"
            strokeWidth={1.5}
            name="Appic"
          />
          <Area
            type="monotone"
            dataKey="ticketswap"
            stroke="#e10600"
            fill="transparent"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            name="TicketSwap"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
