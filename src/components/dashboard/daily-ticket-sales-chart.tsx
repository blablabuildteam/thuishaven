"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { displayEditionName } from "@/lib/editions/lineup";
import type {
  DailyTicketSales,
  DailyTicketSalesBreakdown,
  DailyTicketSalesDay,
  DailyTicketSalesEvent,
} from "@/lib/dashboard/daily-ticket-sales";
import { formatDayNl, formatDayShort } from "@/lib/time/amsterdam";
import { formatDate, formatNumber } from "@/lib/utils";

function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

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

type ChartRow = {
  day: string;
  label: string;
  total: number;
  breakdown: DailyTicketSalesDay["breakdown"];
  [editionId: string]: string | number | DailyTicketSalesDay["breakdown"];
};

function DailySalesTooltip({
  active,
  payload,
  events,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  events: DailyTicketSalesEvent[];
  colors: { tooltipBg: string; tooltipFg: string; primary: string };
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const eventById = new Map(events.map((event) => [event.id, event]));
  const rows = point.breakdown
    .map((row) => {
      const event = eventById.get(row.editionId);
      if (!event) return null;
      const paidSold =
        row.paidSold + row.freeSold > 0 ? row.paidSold : row.sold;
      const freeSold = row.paidSold + row.freeSold > 0 ? row.freeSold : 0;
      return { ...event, ...row, paidSold, freeSold };
    })
    .filter(
      (
        row,
      ): row is DailyTicketSalesEvent &
        DailyTicketSalesBreakdown & { paidSold: number; freeSold: number } =>
        row != null,
    );
  const totalPaid = rows.reduce((sum, row) => sum + row.paidSold, 0);
  const totalFree = rows.reduce((sum, row) => sum + row.freeSold, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenueCents, 0);

  return (
    <div
      className="max-h-80 max-w-[min(34rem,calc(100vw-2rem))] overflow-y-auto border px-3 py-2 text-xs shadow-sm"
      style={{
        background: colors.tooltipBg,
        borderColor: colors.primary,
        color: colors.tooltipFg,
      }}
    >
      <p className="font-medium">{formatDayNl(point.day)}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-text-muted">Geen verkoop op deze dag.</p>
      ) : (
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="text-[10px] tracking-[0.08em] text-text-dim uppercase">
              <th className="pb-1.5 pr-3 font-medium text-left">Event</th>
              <th className="pb-1.5 pl-2 font-medium text-right">Betaald</th>
              <th className="pb-1.5 pl-2 font-medium text-right">Gratis</th>
              <th className="pb-1.5 pl-2 font-medium text-right">Omzet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-1 pr-3 align-top">
                  <span className="flex items-start gap-2">
                    <span
                      className="mt-0.5 size-2.5 shrink-0"
                      style={{ background: row.color }}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block leading-snug">
                        {displayEditionName(row.name)}
                      </span>
                      <span className="text-[10px] text-text-dim">
                        {formatDate(row.startsAt)}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="py-1 pl-2 text-right align-top font-mono tabular-nums">
                  {formatNumber(row.paidSold)}
                </td>
                <td className="py-1 pl-2 text-right align-top font-mono tabular-nums">
                  {formatNumber(row.freeSold)}
                </td>
                <td className="py-1 pl-2 text-right align-top font-mono tabular-nums whitespace-nowrap">
                  {formatEuroCents(row.revenueCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="pt-1.5 pr-3 font-medium">Totaal</td>
              <td className="pt-1.5 pl-2 text-right font-mono font-medium tabular-nums">
                {formatNumber(totalPaid)}
              </td>
              <td className="pt-1.5 pl-2 text-right font-mono font-medium tabular-nums">
                {formatNumber(totalFree)}
              </td>
              <td className="pt-1.5 pl-2 text-right font-mono font-medium tabular-nums whitespace-nowrap">
                {formatEuroCents(totalRevenue)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

export function DailyTicketSalesChart({ data }: { data: DailyTicketSales }) {
  const colors = useChartColors();
  const chartData = useMemo<ChartRow[]>(
    () =>
      data.days.map((day) => ({
        day: day.day,
        label: day.label,
        total: day.total,
        breakdown: day.breakdown,
        ...day.values,
      })),
    [data.days],
  );

  if (data.windowTotal === 0) {
    return (
      <section className="mb-10" aria-labelledby="daily-sales-heading">
        <ChartHeading data={data} />
        <p className="border border-border px-4 py-3 text-sm text-text-muted">
          Nog geen dagverkoop in dit venster. De grafiek telt tickets die op
          die kalenderdag zijn verkocht — niet het eventtotaal op de
          eventdag. Weeztix levert die historie niet via onze huidige API;
          vanaf nu bewaren we elke sync een dagstand, zodat de staven zich
          vullen.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-10" aria-labelledby="daily-sales-heading">
      <ChartHeading data={data} />
      <p className="sr-only">
        {formatNumber(data.windowTotal)} tickets verkocht in de laatste{" "}
        {data.windowDays} dagen. Hover een dag voor de verdeling per event.
      </p>
      <div className="relative h-72 w-full border border-border bg-surface">
        <div className="absolute inset-0 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              barCategoryGap="18%"
            >
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
                minTickGap={20}
              />
              <YAxis
                tick={{ fill: colors.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={(value) => formatNumber(Number(value))}
              />
              <Tooltip
                cursor={{ fill: colors.primary, fillOpacity: 0.06 }}
                content={
                  <DailySalesTooltip events={data.events} colors={colors} />
                }
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 20 }}
              />
              {data.events.map((event) => (
                <Bar
                  key={event.id}
                  dataKey={event.id}
                  stackId="sold"
                  fill={event.color}
                  name={displayEditionName(event.name)}
                  maxBarSize={40}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {data.days.filter((day) => day.total > 0).length < data.windowDays ? (
        <p className="mt-2 text-[11px] text-text-muted">
          Lege dagen hebben nog geen snapshot. Weeztix geeft via deze API geen
          14-dagenhistorie; de rest vult zich na elke sync.
        </p>
      ) : null}
    </section>
  );
}

function ChartHeading({ data }: { data: DailyTicketSales }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
          Weeztix
        </p>
        <h2
          id="daily-sales-heading"
          className="font-display text-2xl tracking-[0.03em] sm:text-3xl"
        >
          Verkoop per dag
        </h2>
        <p className="mt-1 text-[11px] text-text-muted">
          Tickets verkocht op die kalenderdag, gestapeld per event ·{" "}
          {formatDayShort(data.startDay)} – {formatDayShort(data.endDay)}
        </p>
      </div>
      <p className="shrink-0 text-right">
        <span className="font-display text-3xl tabular-nums leading-none">
          {formatNumber(data.windowTotal)}
        </span>
        <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
          tickets · {data.windowDays}d
        </span>
      </p>
    </div>
  );
}
