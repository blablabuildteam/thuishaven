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
              <stop offset="0%" stopColor="#ffff00" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#ffff00" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#a8a8a8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#a8a8a8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#111111",
              border: "1px solid #ffff00",
              borderRadius: 0,
              fontSize: 12,
              color: "#ffffff",
            }}
          />
          <Area
            type="monotone"
            dataKey="weeztix"
            stroke="#ffff00"
            fill="url(#fillWeeztix)"
            strokeWidth={2}
            name="Weeztix"
          />
          <Area
            type="monotone"
            dataKey="ra"
            stroke="#7ec8ff"
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
