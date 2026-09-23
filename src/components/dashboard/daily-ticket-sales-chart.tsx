"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import type { BarShapeProps } from "recharts";
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
import {
  amsterdamClock,
  amsterdamDay,
  formatDayNl,
  formatDayShort,
  formatNextAmsterdamSync,
} from "@/lib/time/amsterdam";
import { cn, formatDate, formatNumber } from "@/lib/utils";

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

function DailySalesBarShape(props: BarShapeProps) {
  const x = Number(props.x) || 0;
  const y = Number(props.y) || 0;
  const width = Number(props.width) || 0;
  const height = Number(props.height) || 0;
  if (width <= 0 || height <= 0) return null;

  const index = props.index ?? props.originalDataIndex ?? 0;
  const baseline =
    typeof props.stackedBarStart === "number"
      ? props.stackedBarStart
      : props.background &&
          typeof props.background.y === "number"
        ? props.background.y + props.background.height
        : y + height;

  return (
    <g transform={`translate(${x} ${baseline})`}>
      <g
        className="daily-sales-bar"
        style={{ animationDelay: `${index * 12}ms` }}
      >
        <rect
          x={0}
          y={y - baseline}
          width={width}
          height={height}
          fill={props.fill}
        />
      </g>
    </g>
  );
}

type ChartRow = {
  day: string;
  label: string;
  total: number;
  breakdown: DailyTicketSalesDay["breakdown"];
  [editionId: string]: string | number | DailyTicketSalesDay["breakdown"];
};

function clampNodeToViewport(node: HTMLElement) {
  node.style.transform = "";
  const rect = node.getBoundingClientRect();
  const pad = 16;
  let dx = 0;
  let dy = 0;
  if (rect.right > window.innerWidth - pad) {
    dx = window.innerWidth - pad - rect.right;
  }
  if (rect.left + dx < pad) {
    dx += pad - (rect.left + dx);
  }
  if (rect.bottom > window.innerHeight - pad) {
    dy = window.innerHeight - pad - rect.bottom;
  }
  if (rect.top + dy < pad) {
    dy += pad - (rect.top + dy);
  }
  const next = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
  if (node.style.transform !== next) {
    node.style.transform = next;
  }
}

function DailySalesTooltip({
  active,
  payload,
  coordinate,
  events,
  colors,
  containerRef,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  coordinate?: { x?: number; y?: number };
  events: DailyTicketSalesEvent[];
  colors: { tooltipBg: string; tooltipFg: string; primary: string };
  containerRef: { current: HTMLDivElement | null };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const point = active && payload?.length ? payload[0]?.payload : undefined;
  const wrapper =
    containerRef.current?.querySelector(".recharts-wrapper") ??
    containerRef.current;
  const anchor = wrapper?.getBoundingClientRect();
  const left = (anchor?.left ?? 0) + (coordinate?.x ?? 0) + 12;
  const top = (anchor?.top ?? 0) + (coordinate?.y ?? 0) + 12;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!point || !node) return;
    clampNodeToViewport(node);
    const frame = requestAnimationFrame(() => clampNodeToViewport(node));
    return () => cancelAnimationFrame(frame);
  }, [point?.day, left, top]);

  if (!point || typeof document === "undefined") return null;

  const eventById = new Map(events.map((event) => [event.id, event]));
  const rows = point.breakdown
    .map((row) => {
      const event = eventById.get(row.editionId);
      if (!event) return null;
      const paidSold =
        row.paidSold + row.freeSold > 0 ? row.paidSold : row.sold;
      return { ...event, ...row, paidSold };
    })
    .filter(
      (
        row,
      ): row is DailyTicketSalesEvent &
        DailyTicketSalesBreakdown & { paidSold: number } => row != null,
    );
  const totalPaid = rows.reduce((sum, row) => sum + row.paidSold, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenueCents, 0);

  return createPortal(
    <div
      ref={ref}
      className="pointer-events-none max-h-[calc(100dvh-2rem)] max-w-[min(34rem,calc(100vw-2rem))] overflow-y-auto border px-3 py-2 text-xs shadow-sm"
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 80,
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
              <td className="pt-1.5 pl-2 text-right font-mono font-medium tabular-nums whitespace-nowrap">
                {formatEuroCents(totalRevenue)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>,
    document.body,
  );
}

export function DailyTicketSalesChart({ data }: { data: DailyTicketSales }) {
  const colors = useChartColors();
  const chartRef = useRef<HTMLDivElement>(null);
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
          eventdag.
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
      <div className="daily-sales-chart relative h-64 w-full min-w-0 border border-border bg-surface sm:h-72">
        <div ref={chartRef} className="absolute inset-0 p-2 sm:p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              barCategoryGap="8%"
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
                  <DailySalesTooltip
                    events={data.events}
                    colors={colors}
                    containerRef={chartRef}
                  />
                }
                allowEscapeViewBox={{ x: true, y: true }}
                isAnimationActive={false}
                wrapperStyle={{ visibility: "hidden", pointerEvents: "none" }}
              />
              {data.events.map((event) => (
                <Bar
                  key={event.id}
                  dataKey={event.id}
                  stackId="sold"
                  fill={event.color}
                  name={displayEditionName(event.name)}
                  maxBarSize={22}
                  isAnimationActive={false}
                  shape={DailySalesBarShape}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {data.days.filter((day) => day.total > 0).length < data.windowDays ? (
        <p className="mt-2 text-[11px] text-text-muted">
          Geen staaf = geen Weeztix-verkoop op die dag.
        </p>
      ) : null}
    </section>
  );
}

function DailySalesRefresh({ refreshedAt }: { refreshedAt: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownAt, setShownAt] = useState(refreshedAt);
  const [now, setNow] = useState(() => new Date());
  const spinning = busy || isPending;

  useEffect(() => {
    setShownAt(refreshedAt);
  }, [refreshedAt]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function onRefresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/daily-ticket-sales/refresh", {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        refreshedAt?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Verversen mislukt");
        return;
      }
      if (body.refreshedAt) setShownAt(body.refreshedAt);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Verversen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={spinning}
        aria-label="Laatste verkoop ophalen"
        title="Laatste verkoop ophalen"
        className="inline-flex size-7 shrink-0 items-center justify-center border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
      >
        <RefreshCw className={cn("size-3.5", spinning && "animate-spin")} />
      </button>
      <p className="min-w-0 text-[11px] leading-snug text-text-muted" aria-live="polite">
        {spinning
          ? "Bezig met ophalen… dit kan een minuut of twee duren."
          : `${formatRefreshedAt(shownAt)} · ${formatNextAmsterdamSync(now)}`}
        {error ? <span className="text-warn"> · {error}</span> : null}
      </p>
    </div>
  );
}

function formatRefreshedAt(iso: string | null): string {
  if (!iso) return "Nog niet bijgewerkt";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Nog niet bijgewerkt";
  const clock = amsterdamClock(date);
  const day = amsterdamDay(date);
  if (day === amsterdamDay(new Date())) return `Bijgewerkt vandaag ${clock}`;
  return `Bijgewerkt ${formatDayShort(day)} ${clock}`;
}

function ChartHeading({ data }: { data: DailyTicketSales }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
      <div className="min-w-0 flex-1 basis-48">
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
        <DailySalesRefresh refreshedAt={data.refreshedAt} />
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
