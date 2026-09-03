"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sun,
  CloudSun,
  CloudRain,
  CloudSnow,
  Snowflake,
  Wind,
  ThermometerSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudLightning,
  Users,
  MapPin,
  Cake,
  ChevronDown,
  Music2,
  Ticket,
  ScanLine,
  Share2,
  Swords,
  Megaphone,
  Euro,
  TrendingUp,
  BadgeEuro,
  Heart,
  MessageCircle,
  Eye,
  ExternalLink,
} from "lucide-react";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialChannelIcon } from "@/components/ui/social-channel-icon";
import type {
  EventInsight,
  EventInsightHeadline,
  EventInsightMail,
  EventInsightSocial,
  EventInsightSocialVariant,
  CompetingEvent,
} from "@/lib/insights/event-insights";
import {
  SALES_IMPACT_ROLE_HINT,
  type SalesImpactRole,
} from "@/lib/marketing/sales-impact";
import {
  organicImpactLevelLabel,
  organicPostWeightLabel,
  type OrganicImpactLevel,
  type OrganicPostWeight,
} from "@/lib/marketing/organic-impact";
import {
  competeSizeLabel,
  competitionLevelLabel,
  type CompeteSize,
  type CompetitionLevel,
} from "@/lib/integrations/ra/genres";
import type { WeatherKind } from "@/lib/weather/classify";
import type {
  WeatherCodeIconKind,
  WeatherHourRow,
} from "@/lib/weather/open-meteo";
import type { DemographicBucket } from "@/lib/db/schema";

const COLLAPSE_MS = 380;
const DETAIL_LOAD_MS = 220;

const CHANNEL_LABEL: Record<string, string> = {
  brevo: "Brevo / mail",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  shop: "Weeztix shop",
  direct: "Direct",
  other: "Overig",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const ORGANIC_ROLE_ORDER = ["promo", "same_day", "after"] as const;

const ORGANIC_GROUP_LABEL: Record<(typeof ORGANIC_ROLE_ORDER)[number], string> =
  {
    promo: "Voor event",
    same_day: "Eventdag",
    after: "Na event",
  };

function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

function isColdOrWet(kind: WeatherKind): boolean {
  return kind === "wet" || kind === "cold" || kind === "cold_wet";
}

function weatherIcon(kind: WeatherKind) {
  if (kind === "ideal") return Sun;
  if (kind === "heat") return ThermometerSun;
  if (kind === "wet") return CloudRain;
  if (kind === "cold_wet") return CloudSnow;
  if (kind === "cold") return Snowflake;
  if (kind === "windy") return Wind;
  return CloudSun;
}

function HeadlineChip({ h }: { h: EventInsightHeadline }) {
  const Icon =
    h.kind === "tickets"
      ? Ticket
      : h.kind === "scan"
        ? ScanLine
        : h.kind === "social"
          ? Share2
          : h.kind === "demo"
            ? Users
            : h.kind === "compete"
              ? Swords
              : h.kind === "referrer"
                ? Megaphone
                : Ticket;

  const colors: Record<EventInsightHeadline["tone"], string> = {
    positive: "border-success/35 bg-success/10 text-success",
    neutral: "border-border bg-surface-hover text-text",
    caution: "border-warn/40 bg-warn/10 text-warn",
    danger: "border-danger/40 bg-danger/10 text-danger",
    cold: "border-info/50 bg-info/15 text-text",
  };

  return (
    <span
      title={h.hint}
      className={cn(
        "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium tracking-wide",
        colors[h.tone],
      )}
    >
      {h.kind === "mail" ? (
        <SocialChannelIcon channel="mail" size={14} alt="" />
      ) : (
        <Icon className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
      )}
      {h.text}
    </span>
  );
}

function WeatherChip({
  weather,
}: {
  weather: NonNullable<EventInsight["weather"]>;
}) {
  const Icon = weatherIcon(weather.kind);
  const coldWet = isColdOrWet(weather.kind);
  const temp =
    weather.tempMinC != null && weather.tempMaxC != null
      ? `${Math.round(weather.tempMinC)}–${Math.round(weather.tempMaxC)}°`
      : weather.tempMaxC != null
        ? `${Math.round(weather.tempMaxC)}°`
        : null;

  return (
    <span
      title={`${weather.label}${temp ? ` · ${temp}` : ""} · ${
        weather.tone === "positive"
          ? "Gunstig voor outdoor"
          : weather.tone === "caution"
            ? "Ongunstig voor outdoor"
            : "Neutraal"
      }`}
      className={cn(
        "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium",
        coldWet
          ? "border-info/50 bg-info/15 text-text"
          : weather.tone === "positive"
            ? "border-success/35 bg-success/10 text-success"
            : weather.tone === "caution"
              ? "border-warn/40 bg-warn/10 text-warn"
              : "border-border bg-surface-hover text-text",
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span>{weather.label}</span>
      {temp && <span className="font-mono text-text-muted">{temp}</span>}
    </span>
  );
}

function ticketComposition(sold: number, capacity: number | null, scanned: number) {
  const available =
    capacity != null && capacity > 0 ? Math.max(0, capacity - sold) : null;
  const scannedClamped = Math.min(scanned, Math.max(sold, 0));
  const soldUnscanned = Math.max(0, sold - scannedClamped);
  const base = capacity != null && capacity > 0 ? capacity : Math.max(sold, 1);
  return {
    available,
    scannedClamped,
    soldUnscanned,
    scannedW: (scannedClamped / base) * 100,
    soldRestW: (soldUnscanned / base) * 100,
    availableW:
      available != null
        ? (available / base) * 100
        : Math.max(0, 100 - (scannedClamped / base) * 100 - (soldUnscanned / base) * 100),
  };
}

function TicketCompositionBar({
  sold,
  capacity,
  scanned,
  animate = false,
  className,
}: {
  sold: number;
  capacity: number | null;
  scanned: number;
  animate?: boolean;
  className?: string;
}) {
  const { available, scannedClamped, soldUnscanned, scannedW, soldRestW, availableW } =
    ticketComposition(sold, capacity, scanned);

  return (
    <div
      className={cn("flex h-1.5 w-full overflow-hidden bg-border", className)}
      role="img"
      aria-label={
        capacity != null
          ? `${formatNumber(sold)} van ${formatNumber(capacity)} verkocht, ${formatNumber(scanned)} gescand`
          : `${formatNumber(sold)} verkocht, ${formatNumber(scanned)} gescand`
      }
    >
      {scannedW > 0 && (
        <div
          className={cn("h-full bg-success", animate && "animate-bar-grow")}
          style={{
            width: `${scannedW}%`,
            animationDelay: animate ? "0.05s" : undefined,
          }}
          title={`Gescand: ${formatNumber(scannedClamped)}`}
        />
      )}
      {soldRestW > 0 && (
        <div
          className={cn("h-full bg-text", animate && "animate-bar-grow")}
          style={{
            width: `${soldRestW}%`,
            animationDelay: animate ? "0.1s" : undefined,
          }}
          title={`Verkocht, niet gescand: ${formatNumber(soldUnscanned)}`}
        />
      )}
      {availableW > 0 && capacity != null && (
        <div
          className="h-full bg-border"
          style={{ width: `${availableW}%` }}
          title={`Beschikbaar: ${formatNumber(available ?? 0)}`}
        />
      )}
    </div>
  );
}

function CompactTicketMetrics({
  sold,
  capacity,
  scanned,
  animate = false,
}: {
  sold: number;
  capacity: number | null;
  scanned: number;
  animate?: boolean;
}) {
  const { available } = ticketComposition(sold, capacity, scanned);
  if (sold <= 0 && (capacity == null || capacity <= 0) && scanned <= 0) {
    return null;
  }

  return (
    <div className="w-[10rem] shrink-0">
      <TicketCompositionBar
        sold={sold}
        capacity={capacity}
        scanned={scanned}
        animate={animate}
        className="h-2"
      />
      <div className="mt-1 flex justify-between">
        <div className="min-w-0 text-left" title="Beschikbaar">
          <p className="font-mono text-[11px] font-medium leading-none tabular-nums">
            {available != null ? formatNumber(available) : "—"}
          </p>
          <p className="mt-0.5 truncate text-[8px] tracking-wide text-text-dim uppercase">
            Open
          </p>
        </div>
        <div className="min-w-0 text-center" title="Verkocht">
          <p className="font-mono text-[11px] font-medium leading-none tabular-nums">
            {formatNumber(sold)}
          </p>
          <p className="mt-0.5 truncate text-[8px] tracking-wide text-text-dim uppercase">
            Verkocht
          </p>
        </div>
        <div className="min-w-0 text-right" title="Gescand">
          <p className="font-mono text-[11px] font-medium leading-none tabular-nums">
            {formatNumber(scanned)}
          </p>
          <p className="mt-0.5 truncate text-[8px] tracking-wide text-text-dim uppercase">
            Scan
          </p>
        </div>
      </div>
    </div>
  );
}

function WeatherIcon({
  kind,
  size = "sm",
}: {
  kind: WeatherKind;
  size?: "sm" | "lg";
}) {
  const Icon = weatherIcon(kind);
  const box = size === "lg" ? "size-14" : "size-11";
  const icon = size === "lg" ? "size-7" : "size-5";
  const label: Record<WeatherKind, string> = {
    ideal: "Zonnig",
    ok: "Deels bewolkt",
    wet: "Regen",
    cold_wet: "Koud & nat",
    cold: "Koud",
    heat: "Hitte",
    windy: "Wind",
  };
  const tone =
    kind === "ideal"
      ? "border-success/35 bg-success/10 text-success"
      : kind === "wet" || kind === "cold_wet" || kind === "cold"
        ? "border-info/40 bg-info/10 text-info"
        : kind === "heat" || kind === "windy"
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-border bg-surface text-text-muted";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border",
        box,
        tone,
      )}
      title={label[kind]}
      aria-label={label[kind]}
    >
      <Icon className={icon} strokeWidth={1.5} />
    </span>
  );
}

function hourlyWeatherIcon(kind: WeatherCodeIconKind) {
  if (kind === "clear") return Sun;
  if (kind === "fog") return CloudFog;
  if (kind === "drizzle") return CloudDrizzle;
  if (kind === "rain") return CloudRain;
  if (kind === "snow") return Snowflake;
  if (kind === "thunder") return CloudLightning;
  return Cloud;
}

/** Weather block with collapsible hourly strip. */
function WeatherBlock({
  weather,
}: {
  weather: NonNullable<EventInsight["weather"]>;
}) {
  const [showHourly, setShowHourly] = useState(false);
  const hasHourly = weather.hourly && weather.hourly.length > 0;

  const afternoon = (weather.hourly ?? []).filter(
    (h) => h.hour >= 12 && h.hour <= 23,
  );
  const late = (weather.hourly ?? []).filter((h) => h.hour <= 2);
  const strip = afternoon.length > 0 ? [...afternoon, ...late] : weather.hourly ?? [];
  const maxPrecip = Math.max(0.4, ...strip.map((h) => h.precipMm ?? 0));

  return (
    <div
      className={cn(
        "border",
        isColdOrWet(weather.kind)
          ? "border-info/40 bg-info/10"
          : weather.tone === "positive"
            ? "border-success/30 bg-success/5"
            : weather.tone === "caution"
              ? "border-warn/30 bg-warn/5"
              : "border-border bg-surface",
      )}
    >
      <button
        type="button"
        onClick={() => hasHourly && setShowHourly((s) => !s)}
        disabled={!hasHourly}
        className={cn(
          "flex w-full items-start gap-3 p-2.5 text-left",
          hasHourly && "cursor-pointer hover:bg-surface-hover/50",
        )}
      >
        <WeatherIcon kind={weather.kind} size="lg" />
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium">{weather.label}</p>
          <p className="mt-0.5 text-text-muted">
            {weather.tempMinC != null && weather.tempMaxC != null
              ? `${Math.round(weather.tempMinC)}–${Math.round(weather.tempMaxC)}°C`
              : weather.tempMaxC != null
                ? `${Math.round(weather.tempMaxC)}°C`
                : ""}
            {weather.precipMm != null &&
              weather.precipMm > 0 &&
              ` · ${weather.precipMm.toFixed(1)}mm`}
            {" · "}
            <span
              className={cn(
                weather.tone === "positive" && "text-success",
                weather.tone === "caution" &&
                  !isColdOrWet(weather.kind) &&
                  "text-warn",
                isColdOrWet(weather.kind) && "text-info",
              )}
            >
              {weather.tone === "positive"
                ? "Gunstig"
                : weather.tone === "caution"
                  ? "Ongunstig"
                  : "Neutraal"}
            </span>
          </p>
          {hasHourly && (
            <p className="mt-1 text-[10px] text-text-dim">
              {showHourly ? "Verberg uurlijks" : "Toon uurlijks"}
              <ChevronDown
                className={cn(
                  "ml-1 inline size-3 transition-transform",
                  showHourly && "rotate-180",
                )}
                strokeWidth={1.5}
              />
            </p>
          )}
        </div>
      </button>

      {showHourly && strip.length > 0 && (
        <div className="border-t border-border/50 bg-surface/50 px-2 py-2">
          <p className="mb-2 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Uurlijks · AMS
          </p>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {strip.map((h) => {
              const Icon = hourlyWeatherIcon(h.iconKind);
              const precip = h.precipMm ?? 0;
              const barH =
                precip > 0 ? Math.max(6, (precip / maxPrecip) * 24) : 0;
              return (
                <div
                  key={`${h.day}-${h.hour}`}
                  title={`${String(h.hour).padStart(2, "0")}:00 · ${h.label}${
                    precip > 0 ? ` · ${precip.toFixed(1)} mm` : ""
                  }`}
                  className="flex w-10 shrink-0 flex-col items-center"
                >
                  <span className="font-mono text-[10px] text-text-dim">
                    {String(h.hour).padStart(2, "0")}
                  </span>
                  <Icon
                    className={cn(
                      "my-0.5 size-4",
                      h.iconKind === "clear"
                        ? "text-warn"
                        : h.iconKind === "rain" ||
                            h.iconKind === "drizzle" ||
                            h.iconKind === "thunder" ||
                            h.iconKind === "snow"
                          ? "text-info"
                          : "text-text-muted",
                    )}
                    strokeWidth={1.5}
                  />
                  <span className="font-mono text-[11px] font-medium text-text">
                    {h.tempC != null ? `${Math.round(h.tempC)}°` : "—"}
                  </span>
                  <div className="mt-1 flex h-6 w-full items-end justify-center">
                    {barH > 0 ? (
                      <div
                        className="w-2.5 rounded-t-sm bg-info/70"
                        style={{ height: `${barH}px` }}
                        aria-hidden
                      />
                    ) : (
                      <div className="h-px w-2.5 bg-border" aria-hidden />
                    )}
                  </div>
                  <span className="mt-0.5 h-3 font-mono text-[9px] text-text-dim">
                    {precip >= 0.1 ? precip.toFixed(1) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-2">
      <span className="text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Capacity → sold → scanned as one composition. */
function TicketMiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div title={hint} className="min-w-0 text-right">
      <p className="text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-medium leading-none">{value}</p>
    </div>
  );
}

function TicketMetricsVisual({
  sold,
  capacity,
  scanned,
  fillPct,
  scanRatePct,
  avgPriceEur,
  lastWeekSold,
  sameDaySold,
  soldOutDaysBefore,
}: {
  sold: number;
  capacity: number | null;
  scanned: number;
  fillPct: number | null;
  scanRatePct: number | null;
  avgPriceEur: number | null;
  lastWeekSold: number | null;
  sameDaySold: number | null;
  soldOutDaysBefore: number | null;
}) {
  const { available } = ticketComposition(sold, capacity, scanned);

  const fillTone =
    fillPct != null
      ? fillPct >= 85
        ? "text-success"
        : fillPct < 50
          ? "text-warn"
          : "text-text"
      : "text-text";

  return (
    <div className="mb-4 border border-border bg-surface px-3 py-3">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div title="Nog beschikbare tickets (capaciteit − verkocht)">
          <p className="text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Beschikbaar
          </p>
          <p className="mt-1 font-display text-2xl leading-none tracking-tight">
            {available != null ? formatNumber(available) : "—"}
          </p>
          <p className="mt-1 text-[10px] text-text-dim">
            {capacity != null ? `van ${formatNumber(capacity)}` : "geen capaciteit"}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div title="Verkochte Weeztix-tickets">
              <p className="text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
                Verkocht
              </p>
              <p
                className={cn(
                  "mt-1 font-display text-2xl leading-none tracking-tight",
                  fillTone,
                )}
              >
                {formatNumber(sold)}
              </p>
              <p className="mt-1 text-[10px] text-text-dim">
                {fillPct != null ? `${formatPercent(fillPct, 0)} vol` : "totaal"}
              </p>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-x-4 gap-y-2">
              {avgPriceEur != null && (
                <TicketMiniStat
                  label="Gem. prijs"
                  value={`€${avgPriceEur.toFixed(0)}`}
                  hint="Gemiddelde betaalde ticketprijs"
                />
              )}
              {lastWeekSold != null && lastWeekSold > 0 && (
                <TicketMiniStat
                  label="Laatste week"
                  value={`+${formatNumber(lastWeekSold)}`}
                  hint="Verkoop in de 7 dagen vóór/op eventdag"
                />
              )}
              {sameDaySold != null && sameDaySold > 0 && (
                <TicketMiniStat
                  label="Eventdag"
                  value={`+${formatNumber(sameDaySold)}`}
                  hint="Tickets verkocht op de eventdag zelf (Weeztix)"
                />
              )}
              {soldOutDaysBefore != null && (
                <TicketMiniStat
                  label="Uitverkocht"
                  value={`${soldOutDaysBefore}d vóór`}
                  hint="Dagen vóór start dat Weeztix uitverkocht raakte"
                />
              )}
            </div>
          </div>
        </div>
        <div title="Check-ins t.o.v. verkochte tickets">
          <p className="text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Gescand
          </p>
          <p className="mt-1 font-display text-2xl leading-none tracking-tight">
            {formatNumber(scanned)}
          </p>
          <p className="mt-1 text-[10px] text-text-dim">
            {scanRatePct != null
              ? `${formatPercent(scanRatePct, 0)} check-in`
              : sold > 0
                ? "nog geen scans"
                : "—"}
          </p>
        </div>
      </div>

      <TicketCompositionBar
        sold={sold}
        capacity={capacity}
        scanned={scanned}
        animate
        className="mt-3 h-2.5"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-dim">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 bg-success" aria-hidden />
          Gescand
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 bg-text" aria-hidden />
          Verkocht
        </span>
        {capacity != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 border border-border bg-border" aria-hidden />
            Beschikbaar
          </span>
        )}
      </div>
    </div>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4" aria-hidden>
      <div className="border border-border px-3 py-3">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-2 w-12" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-3 h-2.5 w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-2.5 w-28" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
          <Skeleton className="mt-2 h-2.5 w-32" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={`r-${i}`} className="space-y-1">
              <div className="flex justify-between">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-2.5 w-10" />
              </div>
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
          <Skeleton className="mt-2 h-2.5 w-16" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-2.5 w-40" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-2.5 w-36" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: EventInsight }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [revealKey, setRevealKey] = useState(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setPhase("loading");
      const ready = window.setTimeout(() => {
        setRevealKey((k) => k + 1);
        setPhase("ready");
      }, DETAIL_LOAD_MS);
      return () => window.clearTimeout(ready);
    }

    const unmount = window.setTimeout(() => {
      setMounted(false);
      setPhase("loading");
    }, COLLAPSE_MS);
    return () => window.clearTimeout(unmount);
  }, [open]);

  const dateStr = new Date(`${event.day}T12:00:00`).toLocaleDateString(
    "nl-NL",
    { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );

  return (
    <li className="border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-medium leading-snug">
              {event.name}
            </span>
            {event.headliner && event.headliner !== event.name && (
              <span className="text-xs text-text-dim">{event.headliner}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {dateStr}
            {event.isOutdoor ? " · outdoor" : ""}
            {event.periodLabels.length > 0
              ? ` · ${event.periodLabels.join(", ")}`
              : ""}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {event.weather && <WeatherChip weather={event.weather} />}
            {event.headlines.map((h, i) => (
              <HeadlineChip key={i} h={h} />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          <CompactTicketMetrics
            key={open ? `fill-${revealKey}` : "fill"}
            sold={event.tickets.sold}
            capacity={event.tickets.capacity}
            scanned={event.tickets.scanned}
            animate={open && phase === "ready"}
          />
          <ChevronDown
            className={cn(
              "size-4 text-text-dim transition-transform duration-300 ease-out",
              open && "rotate-180",
            )}
            strokeWidth={1.5}
          />
        </div>
      </button>

      <div className="collapse-panel" data-open={open ? "true" : "false"}>
        <div className="collapse-inner">
          {mounted && (
            <div className="relative border-t border-border bg-bg/30">
              {phase === "loading" ? (
                <div className="relative">
                  <EventDetailSkeleton />
                  <div className="insight-loading-pass absolute inset-0" />
                </div>
              ) : (
                <EventDetail key={revealKey} event={event} />
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function EventDetail({ event }: { event: EventInsight }) {
  const {
    tickets,
    weather,
    socialPosts,
    emailCampaigns,
    referrers,
    competingFestivals,
    demographics,
  } = event;

  const festivals = competingFestivals.filter((e) => e.kind === "festival");
  const parties = competingFestivals.filter((e) => e.kind === "party");
  const holidays = competingFestivals.filter((e) => e.kind === "holiday");

  const liveSources = tickets.sources.filter(
    (s) => s.status === "live" && s.sold != null,
  );
  const sourceMax = Math.max(
    tickets.capacity ?? 0,
    ...liveSources.map((s) => s.sold ?? 0),
    1,
  );

  return (
    <div className="relative px-4 py-4">
      <div className="insight-loading-pass absolute inset-0 z-[1]" />

      <div className="insight-reveal relative z-0 space-y-1">
        <TicketMetricsVisual
          sold={tickets.sold}
          capacity={tickets.capacity}
          scanned={tickets.scanned}
          fillPct={tickets.fillPct}
          scanRatePct={tickets.scanRatePct}
          avgPriceEur={tickets.avgPriceEur}
          lastWeekSold={tickets.lastWeekSold}
          sameDaySold={tickets.sameDaySold}
          soldOutDaysBefore={tickets.soldOutDaysBefore}
        />

        <div className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
          <div>
            <SectionDivider label="Verkoop per bron" />
            <div className="space-y-2.5">
              {tickets.sources.map((s, i) => {
                const pct =
                  s.status === "live" && s.sold != null
                    ? (s.sold / sourceMax) * 100
                    : 0;
                return (
                  <div key={s.id} className="text-xs">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className={
                          s.status === "shell" ? "text-text-dim" : "font-medium"
                        }
                      >
                        {s.label}
                      </span>
                      <span className="font-mono text-text-muted">
                        {s.status === "shell" || s.status === "empty"
                          ? (s.note ?? "—")
                          : formatNumber(s.sold ?? 0)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-border">
                      {s.status === "live" && s.sold != null ? (
                        <div
                          className="animate-bar-grow h-full bg-accent"
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            animationDelay: `${0.08 + i * 0.05}s`,
                          }}
                        />
                      ) : (
                        <div className="h-full w-full border border-dashed border-border/80" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {referrers.length > 0 && (
              <>
                <SectionDivider label="Orderherkomst" />
                <div className="space-y-2">
                  {referrers.slice(0, 5).map((r, i) => {
                    const total = referrers.reduce((s, x) => s + x.orders, 0);
                    const pct = total > 0 ? (r.orders / total) * 100 : 0;
                    return (
                      <div key={r.channel} className="text-xs">
                        <div className="mb-1 flex items-center gap-2">
                          <div
                            className={cn(
                              "size-2 shrink-0",
                              i === 0
                                ? "bg-accent"
                                : i === 1
                                  ? "bg-info"
                                  : "bg-text-dim",
                            )}
                          />
                          <span className="flex flex-1 items-center gap-1.5 truncate">
                            <SocialChannelIcon
                              channel={r.channel}
                              size={12}
                              alt=""
                            />
                            {channelLabel(r.channel)}
                          </span>
                          <span className="font-mono text-text-muted">
                            {formatNumber(r.orders)}
                          </span>
                          <span className="w-10 text-right text-text-dim">
                            {formatPercent(pct, 0)}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-border">
                          <div
                            className={cn(
                              "animate-bar-grow h-full",
                              i === 0
                                ? "bg-accent"
                                : i === 1
                                  ? "bg-info"
                                  : "bg-text-dim",
                            )}
                            style={{
                              width: `${pct}%`,
                              animationDelay: `${0.12 + i * 0.05}s`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {demographics && (
              <>
                <SectionDivider label="Demografie" />
                <div className="grid grid-cols-3 gap-3">
                  <DemoMini
                    title="Geslacht"
                    icon={Users}
                    rows={demographics.gender}
                  />
                  {demographics.ageReady && (
                    <DemoMini
                      title="Leeftijd"
                      icon={Cake}
                      rows={demographics.age}
                    />
                  )}
                  <DemoMini
                    title="Stad"
                    icon={MapPin}
                    rows={[...demographics.city]
                      .filter((c) => c.key !== "onbekend")
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 4)}
                  />
                </div>
                {demographics.coveragePct != null && (
                  <p className="mt-2 text-[10px] text-text-dim">
                    {formatPercent(demographics.coveragePct, 0)} ingevuld (
                    {formatNumber(demographics.answered)}/
                    {formatNumber(demographics.total)})
                  </p>
                )}
              </>
            )}

            {weather && (
              <>
                <SectionDivider label="Weer" />
                <WeatherBlock weather={weather} />
              </>
            )}

            <SectionDivider
              label={`Andere events & festivals (${competingFestivals.length})`}
            />
            <CompetitionBlock
              festivals={festivals}
              parties={parties}
              holidays={holidays}
              level={event.competitionLevel}
            />
          </div>

          <div>
            <SectionDivider label="Marketing · organic" />
            <OrganicMarketingBlock
              socialPosts={socialPosts}
              emailCampaigns={emailCampaigns}
              impactLevel={event.organicImpactLevel}
              impactScore={event.organicImpactScore}
              sameDaySold={tickets.sameDaySold}
            />

            <SectionDivider label="Marketing · paid" />
            <div className="border border-dashed border-border px-3 py-2.5 text-xs text-text-dim">
              <p className="flex items-center gap-1.5 font-medium text-text-muted">
                <BadgeEuro className="size-3.5" strokeWidth={1.5} />
                Paid ads · shell
              </p>
              <p className="mt-1 leading-relaxed">
                Ad spend, paid posts en ROAS per event volgen zodra Start Moving
                / Looker gekoppeld is.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-text-dim">Spend</p>
                  <p className="font-mono">—</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-dim">Paid posts</p>
                  <p className="font-mono">—</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-dim">ROAS</p>
                  <p className="font-mono">—</p>
                </div>
              </div>
            </div>

            <SectionDivider label="Line-up" />
            <LineupBlock artists={event.artists} />
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <Link
            href={`/dashboard/weeztix/${event.editionId}`}
            className="text-xs underline underline-offset-2 hover:text-text"
          >
            Volledig ticket detail →
          </Link>
        </div>
      </div>
    </div>
  );
}

function OrganicMarketingBlock({
  socialPosts,
  emailCampaigns,
  impactLevel,
  impactScore,
  sameDaySold,
}: {
  socialPosts: EventInsightSocial[];
  emailCampaigns: EventInsightMail[];
  impactLevel: EventInsight["organicImpactLevel"];
  impactScore: number;
  sameDaySold: number | null;
}) {
  const mails = emailCampaigns.slice(0, 2);
  const byRole: Record<SalesImpactRole, EventInsightSocial[]> = {
    promo: socialPosts.filter((p) => p.salesImpactRole === "promo"),
    same_day: socialPosts.filter((p) => p.salesImpactRole === "same_day"),
    after: socialPosts.filter((p) => p.salesImpactRole === "after"),
  };

  const blocks = ORGANIC_ROLE_ORDER.flatMap((role) => {
    const posts = byRole[role];
    const groupMails = role === "promo" ? mails : [];
    if (posts.length === 0 && groupMails.length === 0) return [];
    const label =
      role === "same_day" && sameDaySold != null && sameDaySold > 0
        ? `${ORGANIC_GROUP_LABEL[role]} · +${formatNumber(sameDaySold)} tickets`
        : ORGANIC_GROUP_LABEL[role];
    return [
      {
        key: role,
        label,
        posts,
        mails: groupMails,
      },
    ];
  });

  return (
    <div className="border border-dashed border-border px-3 py-2.5 text-xs">
      {blocks.length === 0 ? (
        <p className="text-text-dim">Geen organic gekoppeld</p>
      ) : (
        <div className="space-y-3">
          <OrganicImpactVerdict
            level={impactLevel ?? "low"}
            score={impactScore}
            empty={
              socialPosts.every((p) => p.salesImpactRole === "after") &&
              mails.length === 0
            }
          />
          <div>
            {blocks.map((block, i) => (
              <div key={block.key}>
                {i > 0 && <div className="my-2.5 h-px bg-border" />}
                <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
                  {block.label}
                </p>
                <div className="space-y-1">
                  {block.posts.map((p) => (
                    <OrganicPostRow key={p.postId} post={p} />
                  ))}
                  {block.mails.map((m) => (
                    <div
                      key={m.campaignId}
                      className="flex items-center justify-between gap-2 py-1"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <SocialChannelIcon channel="mail" size={14} alt="" />
                        <span className="truncate text-text-muted">
                          {m.name.slice(0, 30)}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-text-muted">
                        {m.ordersAfter != null
                          ? `~${formatNumber(m.ordersAfter)}`
                          : `${formatNumber(m.sent)} sent`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrganicEngagementMetrics({
  impressions,
  reach,
  likeCount,
  commentCount,
  shareCount,
  engagement,
  className,
}: {
  impressions: number;
  reach: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  engagement: number;
  className?: string;
}) {
  const views = impressions > 0 ? impressions : reach > 0 ? reach : 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-text-dim",
        className,
      )}
    >
      {views > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Eye className="size-2.5" aria-hidden />
          {formatNumber(views)}
        </span>
      )}
      {likeCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Heart className="size-2.5" aria-hidden />
          {formatNumber(likeCount)}
        </span>
      )}
      {commentCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <MessageCircle className="size-2.5" aria-hidden />
          {formatNumber(commentCount)}
        </span>
      )}
      {shareCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Share2 className="size-2.5" aria-hidden />
          {formatNumber(shareCount)}
        </span>
      )}
      {views === 0 &&
        likeCount === 0 &&
        commentCount === 0 &&
        shareCount === 0 &&
        engagement > 0 && <span>{formatNumber(engagement)} eng.</span>}
      {views === 0 &&
        likeCount === 0 &&
        commentCount === 0 &&
        shareCount === 0 &&
        engagement === 0 && (
          <span title="Nog geen metrics van Meta/TikTok/YouTube">
            geen metrics
          </span>
        )}
    </div>
  );
}

function OrganicPostRow({ post }: { post: EventInsightSocial }) {
  const [open, setOpen] = useState(false);
  const role = post.salesImpactRole;
  const hasVariants = post.variants.length > 1;
  const liftLabel =
    role === "after"
      ? "n.v.t."
      : post.ticketLiftSold != null
        ? `+${formatNumber(post.ticketLiftSold)}`
        : "—";

  return (
    <div className="py-0.5">
      <div className="group -mx-1.5 rounded-sm px-1.5 py-1 transition-colors hover:bg-surface-hover">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <SocialChannelIcon channel={post.channel} size={14} alt="" />
              {post.permalink ? (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-text-muted transition-colors hover:text-text hover:underline hover:underline-offset-2"
                  title={`${SALES_IMPACT_ROLE_HINT[role]} · Open post`}
                >
                  {post.title?.slice(0, 36) || post.channel}
                </a>
              ) : (
                <span
                  className="truncate text-text-muted"
                  title={SALES_IMPACT_ROLE_HINT[role]}
                >
                  {post.title?.slice(0, 36) || post.channel}
                </span>
              )}
              {post.permalink && (
                <ExternalLink
                  className="size-3 shrink-0 text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              )}
            </div>
            <OrganicEngagementMetrics
              impressions={post.impressions}
              reach={post.reach}
              likeCount={post.likeCount}
              commentCount={post.commentCount}
              shareCount={post.shareCount}
              engagement={post.engagement}
              className="pl-[18px]"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {hasVariants && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[10px] font-medium tracking-wide text-text-dim uppercase transition-colors hover:text-text"
                aria-expanded={open}
              >
                {post.variants.length} variants
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            )}
            {role !== "after" && (
              <OrganicPostWeightBars weight={post.impactWeight} />
            )}
            <span
              className="font-mono text-text-muted"
              title={
                role === "after"
                  ? "Geen sales-impact"
                  : `Tickets in window (${post.liftWindowLabel})`
              }
            >
              {liftLabel}
            </span>
          </div>
        </div>
      </div>

      {hasVariants && open && (
        <ul className="mt-1 space-y-1 border-l border-border pl-3 ml-[7px]">
          {post.variants.map((v, i) => (
            <OrganicVariantRow
              key={v.postId}
              variant={v}
              channel={post.channel}
              index={i + 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrganicVariantRow({
  variant,
  channel,
  index,
}: {
  variant: EventInsightSocialVariant;
  channel: string;
  index: number;
}) {
  const label = `Variant ${index}`;
  const inner = (
    <div className="space-y-0.5 py-0.5">
      <div className="flex items-center gap-1.5">
        <SocialChannelIcon channel={channel} size={12} alt="" />
        <span className="truncate text-[11px] text-text-muted">
          {label}
          {variant.publishedAt && (
            <span className="text-text-dim">
              {" "}
              ·{" "}
              {new Date(variant.publishedAt).toLocaleDateString("nl-NL", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </span>
        {variant.permalink && (
          <ExternalLink
            className="size-2.5 shrink-0 text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
      </div>
      <OrganicEngagementMetrics
        impressions={variant.impressions}
        reach={variant.reach}
        likeCount={variant.likeCount}
        commentCount={variant.commentCount}
        shareCount={variant.shareCount}
        engagement={variant.engagement}
        className="pl-[16px]"
      />
    </div>
  );

  if (variant.permalink) {
    return (
      <li>
        <a
          href={variant.permalink}
          target="_blank"
          rel="noreferrer"
          className="group -mx-1 block rounded-sm px-1 transition-colors hover:bg-surface-hover"
        >
          {inner}
        </a>
      </li>
    );
  }
  return <li>{inner}</li>;
}

function OrganicImpactVerdict({
  level,
  score,
  empty,
}: {
  level: OrganicImpactLevel;
  score: number;
  empty?: boolean;
}) {
  const label = organicImpactLevelLabel(level);
  return (
    <div className="flex items-center gap-2.5">
      <OrganicImpactLevelBars level={level} />
      <div className="min-w-0">
        <p className="text-xs font-medium capitalize text-text">{label}</p>
        <p className="text-[10px] text-text-dim">
          {empty
            ? "Geen promo-posts die meetellen voor sales"
            : `Conclusie op bereik, engagement en ticketlift · score ${score}`}
        </p>
      </div>
    </div>
  );
}

/** Per-post heaviness — same rising-bar language as concurrentie-omvang. */
function OrganicPostWeightBars({ weight }: { weight: OrganicPostWeight }) {
  const filled = weight === "heavy" ? 3 : weight === "medium" ? 2 : 1;
  const label = organicPostWeightLabel(weight);
  const heights = ["h-1.5", "h-2.5", "h-3.5"] as const;
  return (
    <span
      className="inline-flex h-3.5 shrink-0 items-end gap-0.5"
      title={`Impact per post: ${label}`}
      aria-label={`Impact ${label}`}
      role="img"
    >
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-1 rounded-[1px]",
            h,
            i < filled ? "bg-text-muted" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

function OrganicImpactLevelBars({ level }: { level: OrganicImpactLevel }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const label = organicImpactLevelLabel(level);
  const heights = ["h-2", "h-3", "h-4"] as const;
  const fill =
    level === "high"
      ? "bg-success"
      : level === "medium"
        ? "bg-accent"
        : "bg-text-dim";
  return (
    <span
      className="inline-flex h-4 shrink-0 items-end gap-0.5"
      title={label}
      aria-label={label}
      role="img"
    >
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn("w-1.5 rounded-[1px]", h, i < filled ? fill : "bg-border")}
        />
      ))}
    </span>
  );
}

function CompetitionBlock({
  festivals,
  parties,
  holidays,
  level,
}: {
  festivals: CompetingEvent[];
  parties: CompetingEvent[];
  holidays: CompetingEvent[];
  level: EventInsight["competitionLevel"];
}) {
  const total = festivals.length + parties.length + holidays.length;
  const resolved = level ?? "low";

  if (total === 0) {
    return (
      <div className="space-y-2">
        <CompetitionVerdict level="low" empty />
        <div className="border border-dashed border-border px-3 py-2.5 text-xs text-text-dim">
          Geen RA-concurrenten op deze datum (electronic umbrella · ≥200 op RA
          voor parties).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <CompetitionVerdict level={resolved} />
      {festivals.length > 0 && (
        <CompeteList
          title="Festivals"
          note="Grootschalig — trekken publiek weg"
          events={festivals}
        />
      )}
      {parties.length > 0 && (
        <CompeteList
          title="AMS parties"
          note="Vergelijkbare club/warehouse nights"
          events={parties}
        />
      )}
      {holidays.length > 0 && (
        <CompeteList title="Feestdagen" events={holidays} />
      )}
    </div>
  );
}

function CompetitionVerdict({
  level,
  empty,
}: {
  level: NonNullable<EventInsight["competitionLevel"]> | "low";
  empty?: boolean;
}) {
  const label = competitionLevelLabel(level);
  return (
    <div className="flex items-center gap-2.5">
      <CompetitionLevelBars level={level} />
      <div className="min-w-0">
        <p className="text-xs font-medium capitalize text-text">{label}</p>
        <p className="text-[10px] text-text-dim">
          {empty
            ? "Geen noemenswaardige concurrenten gevonden"
            : "Conclusie op basis van aantal + omvang dezelfde dag"}
        </p>
      </div>
    </div>
  );
}

function CompeteList({
  title,
  note,
  events,
}: {
  title: string;
  note?: string;
  events: CompetingEvent[];
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium tracking-wide text-text-dim uppercase">
        {title}
        {note ? ` · ${note}` : ""}
      </p>
      <ul className="space-y-1">
        {events.slice(0, 5).map((e) => (
          <li
            key={`${e.name}-${e.venue ?? ""}`}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="min-w-0 truncate">
              <span className="font-medium">{e.name}</span>
              {e.venue && (
                <span className="text-text-dim"> · {e.venue}</span>
              )}
              {e.genreLabel && (
                <span className="text-text-dim"> · {e.genreLabel}</span>
              )}
            </span>
            {e.size && <CompeteSizeBars size={e.size} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Three rising bars — filled count encodes small / medium / large. */
function CompeteSizeBars({ size }: { size: CompeteSize }) {
  const filled = size === "large" ? 3 : size === "medium" ? 2 : 1;
  const label = competeSizeLabel(size);
  const heights = ["h-1.5", "h-2.5", "h-3.5"] as const;
  return (
    <span
      className="inline-flex h-3.5 shrink-0 items-end gap-0.5"
      title={`Relatieve omvang: ${label} (RA-interesse, geen echte bezoekers)`}
      aria-label={`Omvang ${label}`}
      role="img"
    >
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-1 rounded-[1px]",
            h,
            i < filled ? "bg-text-muted" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

/** Overall competition pressure — same bar language, stronger fill for high. */
function CompetitionLevelBars({ level }: { level: CompetitionLevel }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const label = competitionLevelLabel(level);
  const heights = ["h-2", "h-3", "h-4"] as const;
  const fill =
    level === "high"
      ? "bg-danger"
      : level === "medium"
        ? "bg-warn"
        : "bg-success";
  return (
    <span
      className="inline-flex h-4 shrink-0 items-end gap-0.5"
      title={label}
      aria-label={label}
      role="img"
    >
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-1.5 rounded-[1px]",
            h,
            i < filled ? fill : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

function LineupBlock({ artists }: { artists: string[] }) {
  const names = artists.length > 0 ? artists : [];
  return (
    <div className="space-y-2">
      {names.length === 0 ? (
        <div className="border border-dashed border-border px-3 py-2 text-xs text-text-dim">
          Geen DJs bekend
        </div>
      ) : (
        <ul className="space-y-1.5">
          {names.slice(0, 10).map((name) => (
            <li
              key={name}
              className="flex items-center gap-3 border border-border px-2.5 py-1.5 text-xs"
            >
              <Music2
                className="size-3.5 shrink-0 text-text-dim"
                strokeWidth={1.5}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              <span className="inline-flex items-center gap-1 text-text-dim">
                <Euro className="size-3" strokeWidth={1.5} />
                fee —
              </span>
              <span className="inline-flex items-center gap-1 text-text-dim">
                <TrendingUp className="size-3" strokeWidth={1.5} />
                pop. —
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DemoMini({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  rows: DemographicBucket[];
}) {
  const known = rows.filter((r) => r.key !== "onbekend");
  const total = known.reduce((s, r) => s + r.count, 0);
  if (!total) return null;
  const top = known.slice(0, 3);
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[10px] text-text-dim">
        <Icon className="size-3" strokeWidth={1.5} />
        {title}
      </p>
      <ul className="space-y-0.5 text-xs">
        {top.map((r) => (
          <li key={r.key} className="flex justify-between">
            <span className="truncate capitalize">{r.key}</span>
            <span className="font-mono text-text-muted">
              {formatPercent((r.count / total) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function monthKey(day: string): string {
  return day.slice(0, 7); // YYYY-MM
}

function monthLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function groupByMonth(events: EventInsight[]): Array<{
  key: string;
  label: string;
  events: EventInsight[];
}> {
  const map = new Map<string, EventInsight[]>();
  for (const e of events) {
    const key = monthKey(e.day);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, evs]) => ({
    key,
    label: monthLabel(evs[0]!.day),
    events: evs,
  }));
}

export function EventInsightsList({
  upcoming,
  past,
}: {
  upcoming: EventInsight[];
  past: EventInsight[];
}) {
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, 8);
  const visiblePast = showAllPast ? past : past.slice(0, 8);
  const upcomingMonths = groupByMonth(visibleUpcoming);
  const pastMonths = groupByMonth(visiblePast);

  return (
    <div>
      {upcoming.length > 0 && (
        <div className="mb-8">
          <p className="mb-3 text-[11px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Komende events ({upcoming.length})
          </p>
          <div className="space-y-6">
            {upcomingMonths.map((m) => (
              <div key={m.key}>
                <p className="mb-2 text-sm font-medium capitalize text-text-muted">
                  {m.label}
                </p>
                <ul className="space-y-2">
                  {m.events.map((e) => (
                    <EventRow key={e.editionId} event={e} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {upcoming.length > 8 && !showAllUpcoming && (
            <button
              type="button"
              onClick={() => setShowAllUpcoming(true)}
              className="mt-3 text-sm underline underline-offset-2 hover:text-text"
            >
              Toon {upcoming.length - 8} meer komende events
            </button>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <p className="mb-3 text-[11px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Afgelopen events ({past.length})
          </p>
          <div className="space-y-6">
            {pastMonths.map((m) => (
              <div key={m.key}>
                <p className="mb-2 text-sm font-medium capitalize text-text-muted">
                  {m.label}
                </p>
                <ul className="space-y-2">
                  {m.events.map((e) => (
                    <EventRow key={e.editionId} event={e} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {past.length > 8 && !showAllPast && (
            <button
              type="button"
              onClick={() => setShowAllPast(true)}
              className="mt-3 text-sm underline underline-offset-2 hover:text-text"
            >
              Toon alle {past.length} afgelopen events
            </button>
          )}
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div className="border border-border bg-surface p-5">
          <p className="text-sm text-text-muted">
            Geen events gevonden. We proberen Weeztix automatisch te syncen —
            vernieuw de pagina over een moment, of sync handmatig via{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
