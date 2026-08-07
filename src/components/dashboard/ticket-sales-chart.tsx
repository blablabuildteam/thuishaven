"use client";

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

export function TicketSalesChart() {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={salesByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="fillWeeztix" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c8f542" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#c8f542" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2e2e28" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#8f8c7d", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#8f8c7d", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1a17",
              border: "1px solid #2e2e28",
              borderRadius: 2,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="weeztix"
            stroke="#c8f542"
            fill="url(#fillWeeztix)"
            strokeWidth={2}
            name="Weeztix"
          />
          <Area
            type="monotone"
            dataKey="ra"
            stroke="#6eb6ff"
            fill="transparent"
            strokeWidth={1.5}
            name="RA"
          />
          <Area
            type="monotone"
            dataKey="appic"
            stroke="#ff8a3d"
            fill="transparent"
            strokeWidth={1.5}
            name="Appic"
          />
          <Area
            type="monotone"
            dataKey="ticketswap"
            stroke="#ff4d4d"
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
