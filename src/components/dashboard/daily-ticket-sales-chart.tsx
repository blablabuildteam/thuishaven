"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
  DailyTicketSalesRefreshProgress,
  DailyTicketSalesRefreshStep,
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

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => {
      if (mq.matches) setCoarse(true);
    };
    sync();
    mq.addEventListener("change", sync);
    // Phones in "desktop site" mode still report a fine pointer; first touch
    // flips us into tap-to-pin so the sticky hover flyout never sticks.
    const onTouch = () => setCoarse(true);
    window.addEventListener("touchstart", onTouch, { passive: true, once: true });
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("touchstart", onTouch);
    };
  }, []);
  return coarse;
}

type TooltipColors = {
  tooltipBg: string;
  tooltipFg: string;
  primary: string;
};

function DailySalesFlyout({
  point,
  left,
  top,
  events,
  colors,
  interactive,
}: {
  point: ChartRow;
  left: number;
  top: number;
  events: DailyTicketSalesEvent[];
  colors: TooltipColors;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    clampNodeToViewport(node);
    const frame = requestAnimationFrame(() => clampNodeToViewport(node));
    return () => cancelAnimationFrame(frame);
  }, [point.day, left, top]);

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

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Verkoop op ${formatDayNl(point.day)}`}
      className={cn(
        "max-h-[calc(100dvh-2rem)] max-w-[min(58rem,calc(100vw-2rem))] overflow-y-auto border px-3 py-2 text-xs shadow-sm",
        interactive ? "pointer-events-auto" : "pointer-events-none",
      )}
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 80,
        background: colors.tooltipBg,
        borderColor: colors.primary,
        color: colors.tooltipFg,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="font-medium">{formatDayNl(point.day)}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-text-muted">Geen verkoop op deze dag.</p>
      ) : (
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="text-[10px] tracking-[0.08em] text-text-dim uppercase">
              <th className="pb-1.5 pr-3 font-medium text-left">Datum · event</th>
              <th className="pb-1.5 pl-2 font-medium text-right">Betaald</th>
              <th className="pb-1.5 pl-2 font-medium text-right">Incl. btw</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-1 pr-3 align-top">
                  {/* Eventdatum eerst, dan de naam op één regel — zoals Weeztix. */}
                  <span className="flex items-baseline gap-2 whitespace-nowrap">
                    <span
                      className="size-2.5 shrink-0 self-center"
                      style={{ background: row.color }}
                      aria-hidden
                    />
                    <span className="shrink-0 tabular-nums text-text-dim">
                      {formatDate(row.startsAt, { day: "2-digit" })}
                    </span>
                    <span>{displayEditionName(row.name)}</span>
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
      {rows.length > 0 ? (
        <p className="mt-2 text-[10px] text-text-dim">
          Weeztix-prijs is inclusief 9% btw.
        </p>
      ) : null}
    </div>
  );
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
  colors: TooltipColors;
  containerRef: { current: HTMLDivElement | null };
}) {
  const point = active && payload?.length ? payload[0]?.payload : undefined;
  const wrapper =
    containerRef.current?.querySelector(".recharts-wrapper") ??
    containerRef.current;
  const anchor = wrapper?.getBoundingClientRect();
  const left = (anchor?.left ?? 0) + (coordinate?.x ?? 0) + 12;
  const top = (anchor?.top ?? 0) + (coordinate?.y ?? 0) + 12;

  if (!point || typeof document === "undefined") return null;

  return createPortal(
    <DailySalesFlyout
      point={point}
      left={left}
      top={top}
      events={events}
      colors={colors}
    />,
    document.body,
  );
}

function chartAnchor(
  container: HTMLDivElement | null,
  coordinate: { x?: number; y?: number } | null | undefined,
) {
  const wrapper =
    container?.querySelector(".recharts-wrapper") ?? container;
  const rect = wrapper?.getBoundingClientRect();
  return {
    left: (rect?.left ?? 0) + (coordinate?.x ?? 0) + 12,
    top: (rect?.top ?? 0) + (coordinate?.y ?? 0) + 12,
  };
}

export function DailyTicketSalesChart({ data }: { data: DailyTicketSales }) {
  const colors = useChartColors();
  const coarse = useCoarsePointer();
  const chartRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState<{
    point: ChartRow;
    left: number;
    top: number;
  } | null>(null);
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

  useEffect(() => {
    if (!pinned) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

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
      <div className="daily-sales-chart relative h-64 w-full min-w-0 th-panel sm:h-72">
        <div ref={chartRef} className="absolute inset-0 p-2 sm:p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              barCategoryGap="8%"
              onClick={(state) => {
                if (!coarse) return;
                const indexRaw = state?.activeTooltipIndex ?? state?.activeIndex;
                const index =
                  typeof indexRaw === "number"
                    ? indexRaw
                    : typeof indexRaw === "string" && /^\d+$/.test(indexRaw)
                      ? Number(indexRaw)
                      : chartData.findIndex(
                          (row) =>
                            row.label === state?.activeLabel ||
                            row.day === state?.activeLabel,
                        );
                const row = index >= 0 ? chartData[index] : undefined;
                if (!row) {
                  setPinned(null);
                  return;
                }
                const { left, top } = chartAnchor(
                  chartRef.current,
                  state.activeCoordinate,
                );
                setPinned((prev) =>
                  prev?.point.day === row.day
                    ? null
                    : { point: row, left, top },
                );
              }}
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
                  coarse ? (
                    () => null
                  ) : (
                    <DailySalesTooltip
                      events={data.events}
                      colors={colors}
                      containerRef={chartRef}
                    />
                  )
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
      {pinned && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Sluit details"
                className="fixed inset-0 z-[79] cursor-default bg-transparent"
                onClick={() => setPinned(null)}
              />
              <DailySalesFlyout
                point={pinned.point}
                left={pinned.left}
                top={pinned.top}
                events={data.events}
                colors={colors}
                interactive
              />
            </>,
            document.body,
          )
        : null}
      {data.days.filter((day) => day.total > 0).length < data.windowDays ? (
        <p className="mt-2 text-[11px] text-text-muted">
          Geen staaf = geen Weeztix-verkoop op die dag.
        </p>
      ) : null}
    </section>
  );
}

/** Open the dashboard and the stand is older than this → pull live on mount. */
const AUTO_REFRESH_STALE_MS = 10 * 60 * 1000;

const REFRESH_STEP_LABEL: Record<DailyTicketSalesRefreshStep, string> = {
  inventory: "Tickettotalen ophalen",
  saleDays: "Dagverkoop ophalen",
  curves: "Verkoopverloop ophalen",
};

type RefreshResult = {
  ok?: boolean;
  refreshedAt?: string | null;
  error?: string;
};

/**
 * Read the NDJSON progress stream from the refresh route. Falls back to a
 * single JSON body if the server answered without streaming.
 */
async function readRefreshResponse(
  res: Response,
  onProgress: (progress: DailyTicketSalesRefreshProgress) => void,
): Promise<RefreshResult> {
  const type = res.headers.get("content-type") ?? "";
  if (!res.body || !type.includes("application/x-ndjson")) {
    return (await res.json().catch(() => ({}))) as RefreshResult;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: RefreshResult = { ok: false, error: "Verversen afgebroken" };
  const handle = (line: string) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line) as
        | ({ type: "progress" } & DailyTicketSalesRefreshProgress)
        | ({ type: "done" } & RefreshResult);
      if (msg.type === "progress") onProgress(msg);
      else if (msg.type === "done") result = msg;
    } catch {
      // Ignore a malformed line; the final "done" line decides the outcome.
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handle(buffer + decoder.decode());
  return result;
}

/** How often a page that opened mid-pull checks whether that pull is done. */
const FOLLOW_POLL_MS = 3_000;
/** Give up waiting on someone else's pull after this (route maxDuration + slack). */
const FOLLOW_MAX_MS = 5.5 * 60 * 1000;

function DailySalesRefresh({
  completedAt,
  runningSince,
}: {
  completedAt: string | null;
  runningSince: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] =
    useState<DailyTicketSalesRefreshProgress | null>(null);
  /** Set while this page waits on a pull it did not start. */
  const [followingSince, setFollowingSince] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shownAt, setShownAt] = useState(completedAt);
  const [now, setNow] = useState(() => new Date());
  const spinning = busy || isPending || followingSince != null;

  useEffect(() => {
    setShownAt(completedAt);
  }, [completedAt]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setBusy(true);
    setProgress(null);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/daily-ticket-sales/refresh", {
        method: "POST",
        headers: { Accept: "application/x-ndjson" },
      });
      const body = res.ok
        ? await readRefreshResponse(res, setProgress)
        : ((await res.json().catch(() => ({}))) as RefreshResult);
      if (!res.ok || body.ok === false) {
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
  }, [router]);

  /**
   * A pull is already running (reload mid-pull, another tab, a cron slot):
   * its first tables are written but today's histogram is not yet. Wait for
   * it to finish, then re-render; if it failed or vanished, pull ourselves.
   */
  const followRunningPull = useCallback(
    async (since: string) => {
      setFollowingSince(since);
      setError(null);
      const startedWaiting = Date.now();
      let state: { completedAt?: string | null; runningSince?: string | null } =
        {};
      try {
        while (Date.now() - startedWaiting < FOLLOW_MAX_MS) {
          await new Promise((r) => window.setTimeout(r, FOLLOW_POLL_MS));
          const res = await fetch("/api/dashboard/daily-ticket-sales/refresh", {
            cache: "no-store",
          });
          if (!res.ok) break;
          state = await res.json();
          if (!state.runningSince) break;
        }
      } catch {
        // Fall through: pull ourselves below.
      } finally {
        setFollowingSince(null);
      }
      const finished =
        state.completedAt != null &&
        new Date(state.completedAt).getTime() >= new Date(since).getTime();
      if (finished) {
        setShownAt(state.completedAt ?? null);
        startTransition(() => {
          router.refresh();
        });
      } else {
        await onRefresh();
      }
    },
    [router, onRefresh],
  );

  /**
   * Once when the dashboard opens: follow a pull that is still running, or
   * start one if the last *finished* pull is older than the window above.
   * Judged on the finished pull, not the newest table stamp — those land
   * seconds into a pull while today's number only lands at its end.
   */
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (didAutoRefresh.current) return;
    didAutoRefresh.current = true;
    if (runningSince) {
      void followRunningPull(runningSince);
      return;
    }
    const stale =
      !completedAt ||
      Date.now() - new Date(completedAt).getTime() > AUTO_REFRESH_STALE_MS;
    if (stale) void onRefresh();
  }, [completedAt, runningSince, onRefresh, followRunningPull]);

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
      {spinning ? (
        <RefreshProgress
          progress={progress}
          finishing={isPending && !busy && followingSince == null}
          followingSince={followingSince}
          now={now}
        />
      ) : (
        <p className="min-w-0 text-[11px] leading-snug text-text-muted" aria-live="polite">
          {`${formatRefreshedAt(shownAt)} · ${formatNextAmsterdamSync(now)}`}
          {error ? <span className="text-warn"> · {error}</span> : null}
        </p>
      )}
    </div>
  );
}

/** Typical length of a full pull; only used to estimate a followed pull's bar. */
const TYPICAL_PULL_MS = 75_000;

function RefreshProgress({
  progress,
  finishing,
  followingSince,
  now,
}: {
  progress: DailyTicketSalesRefreshProgress | null;
  finishing: boolean;
  followingSince: string | null;
  now: Date;
}) {
  const [tick, setTick] = useState(() => now.getTime());
  useEffect(() => {
    if (!followingSince) return;
    const id = window.setInterval(() => setTick(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [followingSince]);
  // A followed pull streams nothing to this page: estimate from its age.
  const followedFraction = followingSince
    ? Math.min(
        0.95,
        (Math.max(now.getTime(), tick) - new Date(followingSince).getTime()) /
          TYPICAL_PULL_MS,
      )
    : null;
  const fraction = finishing
    ? 1
    : (followedFraction ?? progress?.fraction ?? 0);
  const percent = Math.round(Math.max(0, fraction) * 100);
  const label = finishing
    ? "Grafiek bijwerken…"
    : followingSince
      ? "Ophalen loopt al…"
      : progress
        ? `${REFRESH_STEP_LABEL[progress.step]} · ${progress.done}/${progress.total}`
        : "Events opzoeken…";
  return (
    <div className="min-w-0 flex-1">
      <p
        className="flex justify-between gap-2 text-[11px] leading-snug text-text-muted"
        aria-live="polite"
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{percent}%</span>
      </p>
      <div
        role="progressbar"
        aria-label="Verkoop ophalen"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1 h-1 w-full bg-border"
      >
        <div
          className="h-full bg-text transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
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
        <DailySalesRefresh
          completedAt={data.completedAt}
          runningSince={data.runningSince}
        />
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
