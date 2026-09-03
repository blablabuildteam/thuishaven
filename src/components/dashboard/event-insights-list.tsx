"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
/* eslint-disable @next/next/no-img-element */
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
  Euro,
  TrendingUp,
  Clock,
  X,
  BadgeEuro,
  Heart,
  MessageCircle,
  Eye,
  ExternalLink,
} from "lucide-react";
import { formatPoolUsage } from "@/lib/integrations/weeztix/channels";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialChannelIcon } from "@/components/ui/social-channel-icon";
import type {
  EventInsight,
  AnomalyInsight,
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
import { displayEditionName } from "@/lib/editions/lineup";
import {
  IMPACT_BAR_HEIGHTS,
  competitionBarFill,
  organicBarFill,
} from "@/lib/insights/impact-scale";
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

function insightChipIcon(insight: AnomalyInsight) {
  if (insight.dimension === "weather") {
    return weatherIcon(insight.weatherKind ?? "ok");
  }
  if (insight.dimension === "fill") return Ticket;
  if (insight.dimension === "competition") return Swords;
  if (insight.dimension === "scan") return ScanLine;
  if (insight.dimension === "social") return Share2;
  if (insight.dimension === "pricing") return Euro;
  if (insight.dimension === "soldout") return TrendingUp;
  if (insight.dimension === "same_day") return Clock;
  return Ticket;
}

const INSIGHT_DIMENSION_LABEL: Record<AnomalyInsight["dimension"], string> = {
  fill: "Verkoop",
  weather: "Weer",
  competition: "Concurrentie",
  scan: "Scan",
  social: "Social",
  email: "Mail",
  pricing: "Prijs",
  soldout: "Uitverkocht",
  same_day: "Last-minute",
};

const GEMINI_SRC = "/social-icons/Google_Gemini_icon_2025.svg.webp";

function GeminiMark({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={GEMINI_SRC}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

function useTypedText(text: string) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) {
      setShown("");
      setDone(true);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(text);
      setDone(true);
      return;
    }
    setShown("");
    setDone(false);
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(text.length, i + 3);
      setShown(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(id);
        setDone(true);
      }
    }, 12);
    return () => window.clearInterval(id);
  }, [text]);

  return { shown, done };
}

function InsightDeepDive({
  insight,
  event,
}: {
  insight: AnomalyInsight;
  event: EventInsight;
}) {
  const extras: string[] = [];
  if (insight.dimension === "weather" && event.weather) {
    const bits = [
      event.weather.sky,
      event.weather.tempMinC != null && event.weather.tempMaxC != null
        ? `${Math.round(event.weather.tempMinC)}–${Math.round(event.weather.tempMaxC)}°`
        : null,
      event.weather.precipMm != null && event.weather.precipMm > 0
        ? `${Math.round(event.weather.precipMm)} mm regen`
        : null,
    ].filter(Boolean);
    if (bits.length) extras.push(bits.join(" · "));
  }
  if (insight.dimension === "competition") {
    const names = event.competingFestivals.slice(0, 5).map((c) => c.name);
    if (names.length) extras.push(`Zelfde dag: ${names.join(", ")}`);
  }
  if (insight.dimension === "fill" && event.tickets.lastWeekSold != null) {
    extras.push(
      `${formatNumber(event.tickets.lastWeekSold)} tickets in de laatste 7 dagen${
        event.tickets.sameDaySold != null
          ? `, ${formatNumber(event.tickets.sameDaySold)} op de eventdag`
          : ""
      }.`,
    );
  }

  // Split posts by timing: promo (before event) vs same_day (event day)
  const MIN_LIFT_THRESHOLD = 10;
  const allPromoPosts =
    insight.dimension === "social"
      ? event.socialPosts.filter((p) => p.salesImpactRole === "promo")
      : [];
  const sameDayPosts =
    insight.dimension === "social"
      ? event.socialPosts.filter((p) => p.salesImpactRole === "same_day")
      : [];
  const concurrentPostCount = allPromoPosts.length;

  // Prefer posts with detected spikes, then fall back to window-based lift
  const postsWithSpikes = allPromoPosts.filter(
    (p) => p.spikeDetected && p.spikeEstimatedLift != null && p.spikeEstimatedLift >= MIN_LIFT_THRESHOLD,
  );
  const postsWithWindowLift = allPromoPosts.filter(
    (p) =>
      !p.spikeDetected &&
      p.ticketLiftSold != null &&
      p.ticketLiftSold >= MIN_LIFT_THRESHOLD,
  );
  const hasAnySpikes = postsWithSpikes.length > 0;

  // Show spike posts first, then window-based, capped at 3
  const marketingPosts = [
    ...postsWithSpikes.sort(
      (a, b) => (b.spikeEstimatedLift ?? 0) - (a.spikeEstimatedLift ?? 0),
    ),
    ...postsWithWindowLift.sort(
      (a, b) => (b.ticketLiftSold ?? 0) - (a.ticketLiftSold ?? 0),
    ),
  ].slice(0, 3);
  // Only show mail campaigns with orders, capped at 3
  const marketingMails =
    insight.dimension === "email"
      ? event.emailCampaigns
          .filter((m) => m.ordersAfter != null && m.ordersAfter > 0)
          .sort((a, b) => (b.ordersAfter ?? 0) - (a.ordersAfter ?? 0))
          .slice(0, 3)
      : [];

  return (
    <>
      {insight.facts && insight.facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3">
          {insight.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-[10px] tracking-wide text-text-dim uppercase">
                {fact.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {insight.dimension === "social" && (allPromoPosts.length > 0 || sameDayPosts.length > 0) && (
        <div
          className={cn(
            "border-t border-border pt-3",
            insight.facts && insight.facts.length > 0 ? "mt-4" : "mt-3",
          )}
        >
          {/* Pre-event posts */}
          {allPromoPosts.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
                Vóór event · {allPromoPosts.length} posts
              </p>
              {marketingPosts.length > 0 ? (
                <>
                  <p className="mb-2 text-[10px] text-text-dim">
                    {hasAnySpikes
                      ? "Verkoopspike gedetecteerd binnen 4u na publicatie — hoger dan baseline."
                      : `Posts met voorverkoop (±48u) — range bij ${concurrentPostCount} actieve posts.`}
                  </p>
                  <ul className="space-y-2">
                    {marketingPosts.map((post) => (
                      <li key={post.postId}>
                        <InsightModalSocialPost
                          post={post}
                          concurrentPosts={concurrentPostCount}
                        />
                      </li>
                    ))}
                  </ul>
                  {allPromoPosts.length > marketingPosts.length && (
                    <p className="mt-2 text-[10px] text-text-dim">
                      + {allPromoPosts.length - marketingPosts.length} posts zonder significante voorverkoop
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-text-muted">
                  Geen van de {concurrentPostCount} promo-posts had significante voorverkoop (&lt;10 tickets in ±48u).
                </p>
              )}
            </div>
          )}

          {/* Event-day posts */}
          {sameDayPosts.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
                Eventdag · {sameDayPosts.length} posts
              </p>
              {event.tickets.sameDaySold != null && event.tickets.sameDaySold > 0 && (
                <p className="mb-2 text-xs font-medium text-success">
                  {formatNumber(event.tickets.sameDaySold)} tickets verkocht op de dag zelf
                </p>
              )}
              <ul className="space-y-2">
                {sameDayPosts.slice(0, 3).map((post) => (
                  <li key={post.postId}>
                    <InsightModalSocialPostCompact post={post} />
                  </li>
                ))}
              </ul>
              {sameDayPosts.length > 3 && (
                <p className="mt-2 text-[10px] text-text-dim">
                  + {sameDayPosts.length - 3} meer posts
                </p>
              )}
            </div>
          )}

          <p className="mt-3 text-[10px] text-text-dim">
            Paid ads volgen later (Start Moving).
          </p>
        </div>
      )}
      {marketingMails.length > 0 && (
        <div
          className={cn(
            "border-t border-border pt-3",
            insight.facts && insight.facts.length > 0 ? "mt-4" : "mt-3",
          )}
        >
          <p className="mb-2 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Top campagnes met orders
          </p>
          <ul className="space-y-2">
            {marketingMails.map((campaign) => (
              <li key={campaign.campaignId}>
                <InsightModalEmailCampaign campaign={campaign} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-text-dim">
            Paid ads volgen later (Start Moving).
          </p>
        </div>
      )}
      {extras.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-text-dim">
          {extras.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function InsightDetailModal({
  insight,
  event,
  onClose,
}: {
  insight: AnomalyInsight;
  event: EventInsight;
  onClose: () => void;
}) {
  const titleId = useId();
  const body = insight.detail ?? "";
  const { shown, done } = useTypedText(body);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="insight-modal-backdrop absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="insight-modal-panel relative z-10 w-full max-w-md border border-border bg-surface p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] tracking-[0.14em] text-text-dim uppercase">
            <GeminiMark size={14} />
            AI-inzicht · {INSIGHT_DIMENSION_LABEL[insight.dimension]}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="text-text-dim transition-colors hover:text-text"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>
        <p id={titleId} className="mt-3 text-[15px] font-medium leading-snug">
          {insight.text}
        </p>
        {body && (
          <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-text-muted">
            {shown}
            {!done && (
              <span
                aria-hidden
                className="ml-px inline-block h-[1em] w-px translate-y-0.5 bg-text-muted align-text-bottom"
              />
            )}
          </p>
        )}
        <div
          className={cn(
            "transition-opacity duration-200",
            done ? "opacity-100" : "opacity-0",
          )}
        >
          <InsightDeepDive insight={insight} event={event} />
        </div>
      </div>
    </div>
  );
}

function InsightChip({
  insight,
  event,
}: {
  insight: AnomalyInsight;
  event: EventInsight;
}) {
  const [open, setOpen] = useState(false);
  const Icon = insightChipIcon(insight);

  const colors: Record<AnomalyInsight["tone"], string> = {
    positive: "border-success/40 bg-success/10 text-success",
    neutral: "border-border bg-surface-hover/80 text-text",
    caution: "border-warn/50 bg-warn/10 text-warn-fg",
    danger: "border-danger/50 bg-danger/10 text-danger",
  };

  return (
    <>
      <button
        type="button"
        aria-label="AI-toelichting"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "group/chip inline-flex max-w-full items-center gap-2 rounded-sm border px-3 py-1.5 text-left text-[13px] font-medium leading-snug tracking-wide transition-shadow hover:shadow-sm",
          colors[insight.tone],
        )}
      >
        {insight.dimension === "email" ? (
          <SocialChannelIcon channel="mail" size={15} alt="" />
        ) : (
          <Icon className="size-4 shrink-0 opacity-85" strokeWidth={1.75} />
        )}
        <span className="inline-flex min-w-0 items-center">
          <span className="min-w-0">{insight.text}</span>
          <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover/chip:grid-cols-[1fr] group-focus-visible/chip:grid-cols-[1fr] max-md:grid-cols-[1fr]">
            <span className="min-w-0 overflow-hidden">
              <GeminiMark size={16} className="ml-2 size-4" />
            </span>
          </span>
        </span>
      </button>
      {open &&
        createPortal(
          <InsightDetailModal
            insight={insight}
            event={event}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
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
    <div className="w-[26rem] shrink-0">
      <TicketCompositionBar
        sold={sold}
        capacity={capacity}
        scanned={scanned}
        animate={animate}
        className="h-2.5"
      />
      <div className="mt-1.5 flex justify-between">
        <div className="min-w-0 text-left" title="Beschikbaar">
          <p className="font-mono text-[13px] font-medium leading-none tabular-nums">
            {available != null ? formatNumber(available) : "—"}
          </p>
          <p className="mt-1 truncate text-[10px] tracking-wide text-text-dim uppercase">
            Open
          </p>
        </div>
        <div className="min-w-0 text-center" title="Verkocht">
          <p className="font-mono text-[13px] font-medium leading-none tabular-nums">
            {formatNumber(sold)}
          </p>
          <p className="mt-1 truncate text-[10px] tracking-wide text-text-dim uppercase">
            Verkocht
          </p>
        </div>
        <div className="min-w-0 text-right" title="Gescand">
          <p className="font-mono text-[13px] font-medium leading-none tabular-nums">
            {formatNumber(scanned)}
          </p>
          <p className="mt-1 truncate text-[10px] tracking-wide text-text-dim uppercase">
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
          ? "border-warn/40 bg-warn/10 text-warn-fg"
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
                  "text-warn-fg",
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
                        ? "text-warn-fg"
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
          ? "text-warn-fg"
          : "text-text"
      : "text-text";

  const miniStats = [
    avgPriceEur != null && {
      label: "Gem. prijs",
      value: `€${avgPriceEur.toFixed(0)}`,
      hint: "Gemiddelde betaalde ticketprijs",
    },
    lastWeekSold != null &&
      lastWeekSold > 0 && {
        label: "Laatste week",
        value: `+${formatNumber(lastWeekSold)}`,
        hint: "Verkoop in de 7 dagen vóór/op eventdag",
      },
    sameDaySold != null &&
      sameDaySold > 0 && {
        label: "Eventdag",
        value: `+${formatNumber(sameDaySold)}`,
        hint: "Tickets verkocht op de eventdag zelf (Weeztix)",
      },
    soldOutDaysBefore != null && {
      label: "Uitverkocht",
      value: `${soldOutDaysBefore}d vóór`,
      hint: "Dagen vóór start dat Weeztix uitverkocht raakte",
    },
  ].filter(Boolean) as Array<{ label: string; value: string; hint: string }>;

  return (
    <div className="mb-4 border border-border px-3 py-3">
      {/* Main metrics row: Beschikbaar | Verkocht | Gescand */}
      <div className="grid grid-cols-3 gap-4">
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

        <div title="Verkochte Weeztix-tickets" className="text-center">
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

        <div title="Check-ins t.o.v. verkochte tickets" className="text-right">
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

      {/* Secondary stats related to Verkocht */}
      {miniStats.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-border pt-3">
          {miniStats.map((s) => (
            <div key={s.label} title={s.hint} className="text-center">
              <p className="text-[9px] font-medium tracking-[0.1em] text-text-dim uppercase">
                {s.label}
              </p>
              <p className="mt-0.5 font-mono text-xs font-medium leading-none">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

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

  const eventDate = new Date(`${event.day}T12:00:00`);
  const dayNum = eventDate.getDate();
  const weekdayLabel = eventDate.toLocaleDateString("nl-NL", { weekday: "long" });
  const monthLabel = eventDate
    .toLocaleDateString("nl-NL", { month: "short" })
    .replace(".", "")
    .toUpperCase();
  const dateLabel = eventDate.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const artists = event.artists.filter(Boolean);

  const toggleOpen = () => setOpen((o) => !o);

  return (
    <li className="border border-border bg-surface">
      <div className="group/row transition-colors hover:bg-surface-hover/50">
        {/* Main row: date + title + metrics */}
        <div className="flex w-full items-start gap-4 px-4 py-4">
          <button
            type="button"
            aria-expanded={open}
            onClick={toggleOpen}
            className="flex min-w-0 flex-1 items-start gap-4 text-left"
          >
            <span
              className="flex w-12 shrink-0 flex-col items-center text-text-muted"
              title={dateLabel}
              aria-label={dateLabel}
            >
              <span className="text-[9px] font-medium leading-none tracking-[0.08em] text-text-dim capitalize">
                {weekdayLabel}
              </span>
              <span className="mt-0.5 font-mono text-[2.25rem] font-bold leading-none tabular-nums">
                {dayNum}
              </span>
              <span className="mt-0.5 text-[9px] font-medium leading-none tracking-[0.14em] text-text-dim uppercase">
                {monthLabel}
              </span>
            </span>
            <span className="min-w-0 flex-1 pt-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-medium leading-snug" title={event.name}>
                  {displayEditionName(event.name)}
                </span>
                {artists.length > 0 && (
                  <span className="text-xs text-text-dim">
                    {artists.join(" · ")}
                  </span>
                )}
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Details sluiten" : "Details openen"}
            onClick={toggleOpen}
            className="flex shrink-0 items-center gap-3 pt-1"
          >
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
          </button>
        </div>

        {/* AI Insights row — visually distinct section */}
        {event.insights.length > 0 && (
          <div className="border-t border-dashed border-border/60 bg-bg/30 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {event.insights.map((insight, i) => (
                <InsightChip
                  key={`${insight.dimension}-${i}`}
                  insight={insight}
                  event={event}
                />
              ))}
            </div>
          </div>
        )}
      </div>

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
    (s) =>
      s.status === "live" &&
      s.sold != null &&
      (s.reserved != null ? s.reserved > 0 : s.sold > 0),
  );
  const sourceMax = Math.max(
    tickets.capacity ?? 0,
    ...liveSources.map((s) =>
      s.reserved != null && s.reserved > 0 ? s.reserved : (s.sold ?? 0),
    ),
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
                const barValue =
                  s.reserved != null && s.reserved > 0
                    ? (s.sold ?? 0)
                    : (s.sold ?? 0);
                const barMax =
                  s.reserved != null && s.reserved > 0
                    ? s.reserved
                    : sourceMax;
                const pct =
                  s.status === "live" && s.sold != null && barMax > 0
                    ? (barValue / barMax) * 100
                    : 0;
                const valueLabel =
                  s.status === "shell" || s.status === "empty"
                    ? (s.note ?? "—")
                    : s.reserved != null && s.reserved > 0
                      ? formatPoolUsage(s.sold ?? 0, s.reserved)
                      : formatNumber(s.sold ?? 0);
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
                        {valueLabel}
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
            href={`/dashboard/tickets/${event.editionId}`}
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
            level={impactLevel ?? 1}
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

function InsightModalSocialPost({
  post,
  concurrentPosts,
}: {
  post: EventInsightSocial;
  /** Number of promo posts for context */
  concurrentPosts: number;
}) {
  // Prefer spike-based attribution if detected, fall back to window-based
  const hasSpike = post.spikeDetected && post.spikeEstimatedLift != null;
  const lift = hasSpike ? post.spikeEstimatedLift : post.ticketLiftSold;

  // For window-based, show range; for spike-based, show exact estimate
  const lowerBound =
    !hasSpike && lift != null && concurrentPosts > 1
      ? Math.round(lift / concurrentPosts)
      : null;
  const showRange = lowerBound != null && lowerBound !== lift;

  const content = (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <SocialChannelIcon channel={post.channel} size={18} alt={channelLabel(post.channel)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-xs font-medium text-text">
            {post.title?.slice(0, 50) || channelLabel(post.channel)}
          </span>
          {post.permalink && (
            <ExternalLink className="size-3 shrink-0 text-text-dim" aria-hidden />
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-text-dim">
          <OrganicEngagementMetrics
            impressions={post.impressions}
            reach={post.reach}
            likeCount={post.likeCount}
            commentCount={post.commentCount}
            shareCount={post.shareCount}
            engagement={post.engagement}
          />
        </div>
      </div>
      {lift != null && lift > 0 && (
        <div className="shrink-0 text-right">
          {hasSpike ? (
            <>
              <span className="block text-xs font-medium tabular-nums text-success">
                +{formatNumber(lift)}
              </span>
              <span className="text-[9px] text-success/70">
                spike {post.spikeHoursAfter != null ? `${post.spikeHoursAfter}u` : ""} na post
                {post.spikeMultiplier != null && ` · ${post.spikeMultiplier}×`}
              </span>
            </>
          ) : (
            <>
              <span className="block text-xs font-medium tabular-nums text-text">
                {showRange
                  ? `~${formatNumber(lowerBound!)}–${formatNumber(lift)}`
                  : formatNumber(lift)}
              </span>
              <span className="text-[9px] text-text-dim">
                {post.liftWindowLabel}
                {concurrentPosts > 1 && ` · ${concurrentPosts} posts`}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (post.permalink) {
    return (
      <a
        href={post.permalink}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "block rounded-sm border px-2.5 py-2 transition-colors hover:bg-surface-hover",
          hasSpike ? "border-success/40 bg-success/5" : "border-border",
        )}
        title="Open post"
      >
        {content}
      </a>
    );
  }

  return (
    <div
      className={cn(
        "rounded-sm border px-2.5 py-2",
        hasSpike ? "border-success/40 bg-success/5" : "border-border",
      )}
    >
      {content}
    </div>
  );
}

/** Compact post row for event-day posts — no ticket lift, just engagement */
function InsightModalSocialPostCompact({ post }: { post: EventInsightSocial }) {
  const content = (
    <div className="flex items-center gap-2.5">
      <div className="flex size-5 shrink-0 items-center justify-center">
        <SocialChannelIcon channel={post.channel} size={16} alt={channelLabel(post.channel)} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs text-text">
          {post.title?.slice(0, 45) || channelLabel(post.channel)}
        </span>
        <OrganicEngagementMetrics
          impressions={post.impressions}
          reach={post.reach}
          likeCount={post.likeCount}
          commentCount={post.commentCount}
          shareCount={post.shareCount}
          engagement={post.engagement}
          className="mt-0.5"
        />
      </div>
      {post.permalink && (
        <ExternalLink className="size-3 shrink-0 text-text-dim" aria-hidden />
      )}
    </div>
  );

  if (post.permalink) {
    return (
      <a
        href={post.permalink}
        target="_blank"
        rel="noreferrer"
        className="block rounded-sm border border-border px-2.5 py-2 transition-colors hover:bg-surface-hover"
        title="Open post"
      >
        {content}
      </a>
    );
  }

  return <div className="rounded-sm border border-border px-2.5 py-2">{content}</div>;
}

function InsightModalEmailCampaign({ campaign }: { campaign: EventInsightMail }) {
  return (
    <div className="flex items-start gap-2.5 rounded-sm border border-border px-2.5 py-2">
      <SocialChannelIcon channel="mail" size={16} alt="" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-text">
          {campaign.name}
        </span>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-text-dim">
          {campaign.sent > 0 && (
            <span>{formatNumber(campaign.sent)} verzonden</span>
          )}
          {campaign.openRate != null && (
            <span>{formatPercent(campaign.openRate, 0)} open</span>
          )}
        </div>
      </div>
      {campaign.ordersAfter != null && (
        <span className="shrink-0 text-xs font-medium text-success">
          ~{formatNumber(campaign.ordersAfter)}
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
  const label = organicImpactLevelLabel(level);
  const fill = organicBarFill(level);
  return (
    <span
      className="inline-flex h-3 shrink-0 items-end gap-0.5"
      title={label}
      aria-label={label}
      role="img"
    >
      {IMPACT_BAR_HEIGHTS.map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-1 rounded-[1px]",
            h,
            i < level ? fill : "bg-border",
          )}
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
  const resolved = level ?? 1;

  if (total === 0) {
    return (
      <div className="space-y-2">
        <CompetitionVerdict level={1} empty />
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
  level: CompetitionLevel;
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
  const label = competitionLevelLabel(level);
  const fill = competitionBarFill(level);
  return (
    <span
      className="inline-flex h-3 shrink-0 items-end gap-0.5"
      title={label}
      aria-label={label}
      role="img"
    >
      {IMPACT_BAR_HEIGHTS.map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-1 rounded-[1px]",
            h,
            i < level ? fill : "bg-border",
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

function EventListHeading({
  id,
  eyebrow,
  title,
  count,
}: {
  id: string;
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
          {eyebrow}
        </p>
        <h2 id={id} className="font-display text-2xl tracking-[0.03em] sm:text-3xl">
          {title}
        </h2>
      </div>
      <p className="shrink-0 text-right">
        <span className="font-display text-3xl tabular-nums leading-none">
          {count}
        </span>
        <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
          events
        </span>
      </p>
    </div>
  );
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
        <section className="mb-8" aria-labelledby="upcoming-events-heading">
          <EventListHeading
            id="upcoming-events-heading"
            eyebrow="Planning"
            title="Komende events"
            count={upcoming.length}
          />
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
        </section>
      )}

      {past.length > 0 && (
        <section
          className={cn(upcoming.length > 0 && "mt-12 border-t-2 border-border pt-10")}
          aria-labelledby="past-events-heading"
        >
          <EventListHeading
            id="past-events-heading"
            eyebrow="Archief"
            title="Afgelopen events"
            count={past.length}
          />
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
        </section>
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
