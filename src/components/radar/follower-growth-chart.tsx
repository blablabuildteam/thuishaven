"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildFollowerSeries } from "@/lib/radar/metric-series-client";

type Metric = {
  platform: string;
  capturedAt: string | Date;
  metrics: Record<string, number | string | null>;
};

function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

export function FollowerGrowthChart({ metrics }: { metrics: Metric[] }) {
  const data = useMemo(() => buildFollowerSeries(metrics), [metrics]);
  const hasAny = data.some((d) => d.ra != null || d.ig != null || d.sc != null);
  const [colors, setColors] = useState({
    grid: "#d4cec0",
    tick: "#8a8678",
    tooltipBg: "#ffffff",
    tooltipFg: "#0a0a0a",
    ra: "#111111",
    ig: "#79cae5",
    sc: "#2f6f4e",
  });

  useEffect(() => {
    const sync = () => {
      setColors({
        grid: readCssVar("--chart-grid", "#d4cec0"),
        tick: readCssVar("--chart-tick", "#8a8678"),
        tooltipBg: readCssVar("--chart-tooltip-bg", "#ffffff"),
        tooltipFg: readCssVar("--chart-tooltip-fg", "#0a0a0a"),
        ra: readCssVar("--chart-primary", "#111111"),
        ig: readCssVar("--highlight", "#79cae5"),
        sc: readCssVar("--success", "#2f6f4e"),
      });
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  if (!hasAny) {
    return (
      <p className="text-sm text-text-muted">
        Nog te weinig snapshots voor een lijn. Zet de artiest op Volgen — dan
        vult de avondcron RA, Instagram en SoundCloud.
      </p>
    );
  }

  if (data.length < 2) {
    return (
      <p className="text-sm text-text-muted">
        Eerste meetpunt staat. Over een paar dagen zie je hier de groei-lijn
        (wanneer iemand “lanceert”).
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: colors.tick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) =>
              new Intl.NumberFormat("nl-NL", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(v))
            }
          />
          <Tooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.ra}`,
              borderRadius: 0,
              fontSize: 12,
              color: colors.tooltipFg,
            }}
            formatter={(value, name) => [
              typeof value === "number"
                ? value.toLocaleString("nl-NL")
                : String(value ?? "—"),
              String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="ra"
            name="RA"
            stroke={colors.ra}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="ig"
            name="Instagram"
            stroke={colors.ig}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="sc"
            name="SoundCloud"
            stroke={colors.sc}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny inline sparkline (RA followers). */
export function FollowerSparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) {
    return <span className={className} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const w = 64;
  const h = 20;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      width={w}
      height={h}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={up ? "var(--success)" : "var(--text-dim)"}
        strokeWidth="1.5"
        points={pts}
      />
    </svg>
  );
}
