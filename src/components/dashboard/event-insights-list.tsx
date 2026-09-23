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
  Disc3,
  Layers,
  X,
  BadgeEuro,
  Megaphone,
  Heart,
  MessageCircle,
  Eye,
  ExternalLink,
} from "lucide-react";
import { formatPoolUsage } from "@/lib/integrations/weeztix/channels";
import { cn, formatEuroFromCents, formatNumber, formatPercent } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialChannelIcon, paidAdBrandChannel } from "@/components/ui/social-channel-icon";
import type {
  EventInsight,
  AnomalyInsight,
  EventInsightMail,
  EventInsightSocial,
  EventInsightSocialVariant,
  EventInsightPaidAd,
  CompetingEvent,
} from "@/lib/insights/event-insights";
import {
  SALES_IMPACT_ROLE_HINT,
  organicAttributionWeight,
  organicTicketSalesRank,
  organicSalesContribution,
  type OrganicSalesContribution,
  type SalesImpactRole,
} from "@/lib/marketing/sales-impact";
import {
  organicImpactLevelLabel,
  type OrganicImpactLevel,
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
import { EventSalesCurveChart } from "@/components/dashboard/event-sales-curve-chart";
import { ImpactLevelBars } from "@/components/dashboard/impact-level-bars";
import { amsterdamDay, formatDayShort } from "@/lib/time/amsterdam";
import { displayEditionName, normalizeArtistKey } from "@/lib/editions/lineup";
import {
  djFeeInvestmentLevelLabel,
  djFeeRangeDef,
  formatDjFeeSpend,
  type DjFeeInvestmentLevel,
} from "@/lib/dashboard/dj-fee-ranges";
import {
  IMPACT_BAR_HEIGHTS,
  competitionBarFill,
  djFeeBarFill,
  organicBarFill,
  paidRoasLevelLabel,
  paidSalesBarFill,
  paidSalesLevelLabel,
  roasBarFill,
} from "@/lib/insights/impact-scale";
import type { DemographicBucket } from "@/lib/db/schema";
import type { TakedownChannel } from "@/lib/integrations/alerts/types";

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

const PAID_PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function paidPlatformsLabel(ads: EventInsightPaidAd[] | undefined): string {
  const names = [
    ...new Set(
      (ads ?? []).map((ad) => PAID_PLATFORM_LABEL[ad.platform] ?? "Ads"),
    ),
  ];
  return names.length > 0 ? names.join(" + ") : "ads";
}

function paidSummaryLine(
  event: EventInsight,
  options?: { withCount?: boolean },
): string {
  const spend = event.paid?.spendCents ?? 0;
  if (spend <= 0) return "Nog geen paid ads gekoppeld.";
  const platforms = paidPlatformsLabel(event.paidAds);
  const count = options?.withCount
    ? ` · ${event.paid?.ads ?? 0} ads`
    : "";
  const purchases = event.paid?.purchases ?? 0;
  const tickets =
    purchases > 0 ? ` · ${formatNumber(purchases)} ticket sales` : "";
  const roas =
    event.paid?.purchaseRoas != null
      ? ` · ROAS ${event.paid.purchaseRoas.toFixed(1)}×`
      : "";
  return `Paid ${platforms} · ${formatEuroFromCents(spend)}${tickets}${count}${roas}`;
}

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

function formatContributionLift(c: OrganicSalesContribution): string {
  if (c.mode === "none" || c.lift == null) return "—";
  if (c.mode === "range" && c.lowerBound != null) {
    return `~${formatNumber(c.lowerBound)}–${formatNumber(c.lift)}`;
  }
  return `+${formatNumber(c.lift)}`;
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
  if (insight.dimension === "weather" || insight.weatherKind) {
    return weatherIcon(insight.weatherKind ?? "ok");
  }
  if (insight.dimension === "fill") return Ticket;
  if (insight.dimension === "competition") return Swords;
  if (insight.dimension === "scan") return ScanLine;
  if (insight.dimension === "social") return Share2;
  if (insight.dimension === "pricing") return Euro;
  if (insight.dimension === "dj_fees") return Disc3;
  if (insight.dimension === "paid") return Megaphone;
  if (insight.dimension === "investment") return BadgeEuro;
  if (insight.dimension === "soldout") return TrendingUp;
  if (insight.dimension === "same_day") return Clock;
  if (insight.dimension === "story") return Layers;
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
  dj_fees: "DJ-fees",
  paid: "Paid ads",
  investment: "Investering",
  soldout: "Uitverkocht",
  same_day: "Last-minute",
  story: "Samenhang",
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
  if (insight.dimension === "story") {
    if (event.isOutdoor && event.weather) {
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
    const names = event.competingFestivals.slice(0, 5).map((c) => c.name);
    if (names.length) extras.push(`Zelfde dag: ${names.join(", ")}`);
    const paidLine = paidSummaryLine(event);
    if (!paidLine.startsWith("Nog geen")) extras.push(paidLine);
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
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border pt-3 sm:gap-x-4">
          {insight.facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[10px] tracking-wide text-text-dim uppercase">
                {fact.label}
              </dt>
              <dd className="mt-0.5 break-words text-sm font-medium tabular-nums">
                {fact.value}
              </dd>
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
            {paidSummaryLine(event, { withCount: true })}
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
            {paidSummaryLine(event)}
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
        className="insight-modal-panel relative z-10 max-h-[min(88dvh,100%)] w-full min-w-0 max-w-md overflow-y-auto overscroll-contain border border-border bg-surface p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] tracking-[0.14em] text-text-dim uppercase">
            <GeminiMark size={14} />
            <span className="min-w-0 break-words">
              AI-inzicht · {INSIGHT_DIMENSION_LABEL[insight.dimension]}
            </span>
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
        <p id={titleId} className="mt-3 break-words text-[15px] font-medium leading-snug">
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
          "group/chip inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border px-2 py-1 text-left text-[11px] font-medium leading-snug tracking-wide transition-shadow hover:shadow-sm",
          colors[insight.tone],
        )}
      >
        {insight.dimension === "email" ? (
          <SocialChannelIcon channel="mail" size={13} alt="" />
        ) : (
          <Icon className="size-3.5 shrink-0 opacity-85" strokeWidth={1.75} />
        )}
        <span className="min-w-0 break-words">{insight.text}</span>
        <span className="inline-flex size-4 shrink-0 items-center justify-center overflow-visible">
          <GeminiMark size={14} className="block size-3.5" />
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
    <div className="w-full min-w-0">
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
    <div className="flex min-w-0 items-center gap-3 pt-4 pb-2">
      <span className="min-w-0 text-[10px] font-medium tracking-[0.08em] text-text-dim uppercase sm:tracking-[0.14em]">
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
  salesByDay,
  salesTrackedFrom,
  salesCurveSource,
  eventDay,
  socialPosts,
  emailCampaigns,
  paidAds,
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
  salesByDay: Array<{ day: string; sold: number }>;
  salesTrackedFrom: string | null;
  salesCurveSource: "orders" | "snapshots" | null;
  eventDay: string;
  socialPosts: EventInsightSocial[];
  emailCampaigns: EventInsightMail[];
  paidAds: EventInsightPaidAd[];
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
        hint: "Tickets erbij in de laatste 7 dagen",
      },
    sameDaySold != null &&
      sameDaySold > 0 && {
        label: "Eventdag",
        value: `+${formatNumber(sameDaySold)}`,
        hint: "Tickets verkocht op de eventdag zelf (snapshot-delta)",
      },
    soldOutDaysBefore != null && {
      label: "Uitverkocht",
      value: `${soldOutDaysBefore}d vóór`,
      hint: "Dagen vóór start dat Weeztix uitverkocht raakte",
    },
  ].filter(Boolean) as Array<{ label: string; value: string; hint: string }>;

  return (
    <div className="mb-4 min-w-0 border border-border px-3 py-3">
      {/* Main metrics row: Beschikbaar | Verkocht | Gescand */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="min-w-0" title="Nog beschikbare tickets (capaciteit − verkocht)">
          <p className="truncate text-[9px] font-medium tracking-normal text-text-dim uppercase sm:text-[10px] sm:tracking-[0.12em]">
            Beschikbaar
          </p>
          <p className="mt-1 font-display text-xl leading-none tracking-tight sm:text-2xl">
            {available != null ? formatNumber(available) : "—"}
          </p>
          <p className="mt-1 truncate text-[10px] text-text-dim">
            {capacity != null ? `van ${formatNumber(capacity)}` : "geen capaciteit"}
          </p>
        </div>

        <div title="Weeztix-shop plus gebruikt uit Appic/RA/vrienden-pools" className="min-w-0 text-center">
          <p className="truncate text-[9px] font-medium tracking-normal text-text-dim uppercase sm:text-[10px] sm:tracking-[0.12em]">
            Verkocht
          </p>
          <p
            className={cn(
              "mt-1 font-display text-xl leading-none tracking-tight sm:text-2xl",
              fillTone,
            )}
          >
            {formatNumber(sold)}
          </p>
          <p className="mt-1 truncate text-[10px] text-text-dim">
            {fillPct != null ? `${formatPercent(fillPct, 0)} vol` : "totaal"}
          </p>
        </div>

        <div title="Check-ins t.o.v. verkochte tickets" className="min-w-0 text-right">
          <p className="truncate text-[9px] font-medium tracking-normal text-text-dim uppercase sm:text-[10px] sm:tracking-[0.12em]">
            Gescand
          </p>
          <p className="mt-1 font-display text-xl leading-none tracking-tight sm:text-2xl">
            {formatNumber(scanned)}
          </p>
          <p className="mt-1 truncate text-[10px] text-text-dim">
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

      {salesByDay.length > 0 ? (
        <EventSalesCurveChart
          points={salesByDay}
          eventDay={eventDay}
          sinceDay={
            salesCurveSource === "snapshots" ? salesTrackedFrom : null
          }
          posts={socialPosts}
          mails={emailCampaigns}
          ads={paidAds}
        />
      ) : salesTrackedFrom && salesCurveSource !== "orders" ? (
        <p className="mt-3 border-t border-border pt-3 text-[10px] text-text-dim">
          Dagelijkse verkoop vanaf {formatDayShort(salesTrackedFrom)}. Eerste
          punt na de volgende dagelijkse snapshot.
        </p>
      ) : null}
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

function takedownHint(channels: TakedownChannel[]): string {
  const hasAppic = channels.includes("appic");
  const hasRa = channels.includes("resident_advisor");
  if (hasAppic && hasRa) return "Nog tickets op Appic en Resident Advisor";
  if (hasAppic) return "Nog tickets op Appic";
  return "Nog tickets op Resident Advisor";
}

function daysFromToday(day: string): number {
  const today = amsterdamDay(new Date());
  const ms =
    Date.parse(`${day}T12:00:00.000Z`) -
    Date.parse(`${today}T12:00:00.000Z`);
  return Math.round(ms / 86_400_000);
}

function upcomingWhenLabel(day: string): string {
  const days = daysFromToday(day);
  if (days <= 0) return "Vandaag";
  if (days === 1) return "Morgen";
  return `Over ${days}d`;
}

function EventRow({
  event,
  variant,
  takedownChannels,
}: {
  event: EventInsight;
  variant: "upcoming" | "past";
  takedownChannels?: TakedownChannel[];
}) {
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
  const weekdayLabel = eventDate
    .toLocaleDateString("nl-NL", { weekday: "short" })
    .replace(".", "");
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
  const isUpcoming = variant === "upcoming";
  const whenLabel = isUpcoming ? upcomingWhenLabel(event.day) : null;

  return (
    <li
      className={cn(
        "min-w-0 border",
        isUpcoming
          ? "border-border-strong bg-surface"
          : "border-border/80 bg-bg-elevated",
        takedownChannels?.length && "border-l-2 border-l-warn/70",
      )}
    >
      <div
        className={cn(
          "group/row transition-colors",
          isUpcoming ? "hover:bg-surface-hover/50" : "hover:bg-surface-hover/30",
        )}
      >
        {/* Main row: date + title, ticket bar underneath until the row is wide enough */}
        <div className="relative flex w-full min-w-0 flex-col gap-3 px-3 py-3 pr-10 sm:px-4 sm:py-4 sm:pr-11 md:flex-row md:items-start md:gap-4">
          <button
            type="button"
            aria-expanded={open}
            onClick={toggleOpen}
            className="flex min-w-0 flex-1 items-start gap-3 text-left sm:gap-4"
          >
            <span
              className={cn(
                "flex w-12 shrink-0 flex-col items-center",
                isUpcoming ? "text-text" : "text-text-muted",
              )}
              title={whenLabel ? `${dateLabel} · ${whenLabel}` : dateLabel}
              aria-label={
                whenLabel ? `${dateLabel} · ${whenLabel}` : dateLabel
              }
            >
              <span
                className={cn(
                  "text-[9px] font-medium leading-none tracking-[0.08em] capitalize",
                  isUpcoming ? "text-text-muted" : "text-text-dim",
                )}
              >
                {weekdayLabel}
              </span>
              <span className="mt-0.5 font-mono text-[2.25rem] font-bold leading-none tabular-nums">
                {dayNum}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-[9px] font-medium leading-none tracking-[0.14em] uppercase",
                  isUpcoming ? "text-text-muted" : "text-text-dim",
                )}
              >
                {monthLabel}
              </span>
            </span>
            <span className="min-w-0 flex-1 pt-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="break-words text-[15px] font-medium leading-snug" title={event.name}>
                  {displayEditionName(event.name)}
                </span>
                {whenLabel && (
                  <span className="text-[10px] font-medium tracking-[0.12em] text-text-muted uppercase">
                    {whenLabel}
                  </span>
                )}
                {artists.length > 0 && (
                  <span className="min-w-0 break-words text-xs text-text-dim">
                    {artists.join(" · ")}
                  </span>
                )}
              </span>
              {takedownChannels?.length ? (
                <span className="mt-1 block text-[11px] tracking-wide text-text-dim">
                  {takedownHint(takedownChannels)}
                </span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Details sluiten" : "Details openen"}
            onClick={toggleOpen}
            className="absolute top-2 right-2 inline-flex size-7 items-center justify-center text-text-dim hover:text-text sm:top-2.5 sm:right-2.5"
          >
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-300 ease-out",
                open && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Details sluiten" : "Details openen"}
            onClick={toggleOpen}
            className="flex w-full min-w-0 items-center md:w-[min(26rem,42%)] md:shrink-0 md:pt-1"
          >
            <CompactTicketMetrics
              key={open ? `fill-${revealKey}` : "fill"}
              sold={event.tickets.sold}
              capacity={event.tickets.capacity}
              scanned={event.tickets.scanned}
              animate={open && phase === "ready"}
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
    <div className="relative min-w-0 px-3 py-4 sm:px-4">
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
          salesByDay={tickets.salesByDay ?? []}
          salesTrackedFrom={tickets.salesTrackedFrom ?? null}
          salesCurveSource={tickets.salesCurveSource ?? null}
          eventDay={event.day}
          socialPosts={socialPosts}
          emailCampaigns={emailCampaigns}
          paidAds={event.paidAds}
        />

        <div className="grid min-w-0 gap-x-6 gap-y-1 lg:grid-cols-2">
          <div className="min-w-0">
            <SectionDivider label="Tickets per bron" />
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
                  <DemoMini
                    title="Geslacht"
                    icon={Users}
                    rows={demographics.gender}
                  />
                  {demographics.ageReady && (
                    <DemoMini
                      title={
                        demographics.ageAvg != null
                          ? `Leeftijd · gem. ${demographics.ageAvg}`
                          : "Leeftijd"
                      }
                      icon={Cake}
                      rows={demographics.age}
                      limit={5}
                      isAge
                    />
                  )}
                  <DemoMini
                    title="Stad"
                    icon={MapPin}
                    rows={demographics.city}
                    limit={5}
                  />
                </div>
                {demographics.coveragePct != null && (
                  <p className="mt-2 text-[10px] text-text-dim">
                    Door {formatNumber(demographics.answered)} van{" "}
                    {formatNumber(demographics.total)} bezoekers ingevuld (
                    {formatPercent(demographics.coveragePct, 0)})
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

          <div className="min-w-0">
            <SectionDivider label="Marketing · organic" />
            <OrganicMarketingBlock
              socialPosts={socialPosts}
              emailCampaigns={emailCampaigns}
              impactLevel={event.organicImpactLevel}
              impactScore={event.organicImpactScore}
              ticketsSold={tickets.sold}
              sameDaySold={tickets.sameDaySold}
            />

            <SectionDivider label="Marketing · paid" />
            <PaidMarketingBlock
              paid={event.paid}
              ads={event.paidAds}
              salesLevel={event.paidSalesLevel}
              roasLevel={event.paidRoasLevel}
            />

            <SectionDivider label="Line-up" />
            <LineupBlock
              artists={event.artists}
              djFees={event.djFees}
              investmentLevel={event.djFeeInvestmentLevel}
            />
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

function PaidMarketingBlock({
  paid,
  ads,
  salesLevel,
  roasLevel,
}: {
  paid: EventInsight["paid"] | undefined;
  ads: EventInsightPaidAd[] | undefined;
  salesLevel: EventInsight["paidSalesLevel"];
  roasLevel: EventInsight["paidRoasLevel"];
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = paid ?? {
    spendCents: 0,
    ads: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    purchaseRoas: null,
    roas: null,
  };
  const all = [...(ads ?? [])].sort((a, b) => {
    const purchaseDelta = (b.purchases ?? 0) - (a.purchases ?? 0);
    if (purchaseDelta !== 0) return purchaseDelta;
    return b.spendCents - a.spendCents;
  });
  const PREVIEW = 6;
  const rows = expanded ? all : all.slice(0, PREVIEW);
  const hidden = Math.max(0, all.length - PREVIEW);

  if (summary.ads === 0) {
    return (
      <div className="border border-dashed border-border px-3 py-2.5 text-xs text-text-dim">
        <p className="flex items-center gap-1.5 font-medium text-text-muted">
          <BadgeEuro className="size-3.5" strokeWidth={1.5} />
          Geen paid ads gekoppeld
        </p>
        <p className="mt-1 leading-relaxed">
          Paid ads verschijnen hier zodra Meta- of TikTok-campagnes aan deze
          editie gekoppeld zijn.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-dashed border-border px-3 py-2.5 text-xs">
      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-text-dim">Spend</p>
          <p className="break-words font-mono text-text">
            {formatEuroFromCents(summary.spendCents)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-text-dim">Ticket Sales</p>
          <p className="flex flex-wrap items-center gap-1.5 font-mono text-text">
            {salesLevel != null && (
              <ImpactLevelBars
                level={salesLevel}
                fill={paidSalesBarFill(salesLevel)}
                label={paidSalesLevelLabel(salesLevel)}
              />
            )}
            {summary.purchases > 0 ? formatNumber(summary.purchases) : "—"}
          </p>
          {summary.purchases > 0 && (
            <p className="text-[10px] text-text-dim">
              {formatEuroFromCents(
                Math.round(summary.spendCents / summary.purchases),
              )}{" "}
              / aankoop
            </p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-text-dim">ROAS</p>
          <p className="flex flex-wrap items-center gap-1.5 font-mono text-text">
            {roasLevel != null && (
              <ImpactLevelBars
                level={roasLevel}
                fill={roasBarFill(roasLevel)}
                label={paidRoasLevelLabel(roasLevel)}
              />
            )}
            {summary.purchaseRoas != null
              ? `${summary.purchaseRoas.toFixed(1)}×`
              : "—"}
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {rows.map((ad) => (
          <div
            key={ad.adId}
            className="flex items-center justify-between gap-2 py-0.5"
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate text-text-muted">
              <SocialChannelIcon
                channel={paidAdBrandChannel(ad.platform)}
                size={14}
                paid
                alt=""
              />
              <span className="truncate">
                {ad.adName || ad.campaignName || "Ad"}
              </span>
            </span>
            <span className="shrink-0 font-mono text-text-muted">
              {(ad.purchases ?? 0) > 0
                ? `${formatNumber(ad.purchases ?? 0)} · `
                : ""}
              {formatEuroFromCents(ad.spendCents)}
            </span>
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11px] underline underline-offset-2 hover:text-text"
        >
          {expanded
            ? "Toon top 6"
            : `Toon alle ${formatNumber(all.length)} ads`}
        </button>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-text-dim">
        {summary.impressions > 0
          ? `${formatNumber(summary.ads)} ads · ${formatNumber(summary.impressions)} impr. · ${formatNumber(summary.clicks)} clicks. `
          : `${formatNumber(summary.ads)} ads. `}
        Ticket Sales zijn Meta-pixel purchases en TikTok complete payments,
        opgeteld. De balkjes zijn 1–5 t.o.v. andere events. ROAS = ticket sales
        × gemiddelde ticketprijs / spend. Dezelfde koper kan op beide
        platformen meetellen.
      </p>
    </div>
  );
}

type OrganicActivity =
  | {
      kind: "post";
      post: EventInsightSocial;
      high: number;
      low: number;
      weight: number;
      publishedAt: string | null;
    }
  | {
      kind: "mail";
      mail: EventInsightMail;
      high: number;
      low: number;
      weight: number;
      publishedAt: string | null;
    };

function postTicketRank(
  post: EventInsightSocial,
  ctx: {
    concurrentPosts: number;
    preEventSold?: number;
    totalWeight?: number;
  },
): { high: number; low: number } {
  return organicTicketSalesRank(
    organicSalesContribution({
      ticketLiftSold: post.ticketLiftSold,
      spikeDetected: post.spikeDetected,
      spikeEstimatedLift: post.spikeEstimatedLift,
      concurrentPosts: ctx.concurrentPosts,
      preEventSold: ctx.preEventSold,
      postWeight: organicAttributionWeight(post),
      totalWeight: ctx.totalWeight,
    }),
  );
}

function postActivity(
  post: EventInsightSocial,
  rank: { high: number; low: number },
): OrganicActivity {
  return {
    kind: "post",
    post,
    high: rank.high,
    low: rank.low,
    weight: organicAttributionWeight(post),
    publishedAt: post.publishedAt,
  };
}

function mailActivity(mail: EventInsightMail): OrganicActivity {
  const tickets = mail.ordersAfter ?? 0;
  return {
    kind: "mail",
    mail,
    high: tickets,
    low: tickets,
    weight: mail.sent,
    publishedAt: mail.sentAt,
  };
}

/** Highest expected ticket sales first; reach, then recency, breaks ties. */
function byExpectedTickets(a: OrganicActivity, b: OrganicActivity): number {
  if (b.high !== a.high) return b.high - a.high;
  if (b.low !== a.low) return b.low - a.low;
  if (b.weight !== a.weight) return b.weight - a.weight;
  return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
}

function OrganicMarketingBlock({
  socialPosts,
  emailCampaigns,
  impactLevel,
  impactScore,
  ticketsSold,
  sameDaySold,
}: {
  socialPosts: EventInsightSocial[];
  emailCampaigns: EventInsightMail[];
  impactLevel: EventInsight["organicImpactLevel"];
  impactScore: number;
  ticketsSold: number;
  sameDaySold: number | null;
}) {
  const byRole: Record<SalesImpactRole, EventInsightSocial[]> = {
    promo: socialPosts.filter((p) => p.salesImpactRole === "promo"),
    same_day: socialPosts.filter((p) => p.salesImpactRole === "same_day"),
    after: socialPosts.filter((p) => p.salesImpactRole === "after"),
  };
  const promoWeights = byRole.promo.map(organicAttributionWeight);
  const promoTotalWeight = promoWeights.reduce((s, w) => s + w, 0);
  const preEventSold = Math.max(0, ticketsSold - (sameDaySold ?? 0));
  const promoHasWindowLift = byRole.promo.some(
    (p) =>
      (p.ticketLiftSold != null && p.ticketLiftSold > 0) ||
      (p.spikeDetected && p.spikeEstimatedLift != null),
  );
  const promoCtx = {
    concurrentPosts: byRole.promo.length,
    preEventSold,
    totalWeight: promoTotalWeight,
  };

  const activitiesByRole: Record<SalesImpactRole, OrganicActivity[]> = {
    promo: [
      ...byRole.promo.map((post) =>
        postActivity(post, postTicketRank(post, promoCtx)),
      ),
      ...emailCampaigns.map((mail) => mailActivity(mail)),
    ].sort(byExpectedTickets),
    same_day: byRole.same_day
      .map((post) =>
        postActivity(post, postTicketRank(post, { concurrentPosts: 1 })),
      )
      .sort(byExpectedTickets),
    after: byRole.after.map((post) =>
      postActivity(post, { high: 0, low: 0 }),
    ),
  };

  const blocks = ORGANIC_ROLE_ORDER.flatMap((role) => {
    const activities = activitiesByRole[role];
    if (activities.length === 0) return [];
    const label =
      role === "same_day" && sameDaySold != null && sameDaySold > 0
        ? `${ORGANIC_GROUP_LABEL[role]} · +${formatNumber(sameDaySold)} tickets`
        : ORGANIC_GROUP_LABEL[role];
    return [
      {
        key: role,
        label,
        activities,
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
              emailCampaigns.length === 0
            }
          />
          <div>
            {blocks.map((block, i) => (
              <div key={block.key}>
                {i > 0 && <div className="my-2.5 h-px bg-border" />}
                <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
                  {block.label}
                </p>
                {block.key === "promo" && byRole.promo.length > 0 && (
                  <p className="mb-1.5 text-[10px] text-text-dim">
                    {promoHasWindowLift
                      ? `Gesorteerd op verwachte tickets. Tickets in ±48u — range bij ${byRole.promo.length} actieve posts.`
                      : preEventSold > 0
                        ? `Gesorteerd op verwachte tickets. Voorverkoop ${formatNumber(preEventSold)} tickets — range = gelijke split vs. naar bereik.`
                        : "Geen meetbare ticketlift rond deze posts."}
                  </p>
                )}
                <div className="space-y-1">
                  {block.activities.map((activity) =>
                    activity.kind === "post" ? (
                      <OrganicPostRow
                        key={activity.post.postId}
                        post={activity.post}
                        concurrentPosts={
                          block.key === "promo" ? byRole.promo.length : 1
                        }
                        preEventSold={
                          block.key === "promo" ? preEventSold : null
                        }
                        postWeight={
                          block.key === "promo"
                            ? organicAttributionWeight(activity.post)
                            : 0
                        }
                        totalWeight={
                          block.key === "promo" ? promoTotalWeight : 0
                        }
                      />
                    ) : (
                      <div
                        key={activity.mail.campaignId}
                        className="flex items-center justify-between gap-2 py-1"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <SocialChannelIcon channel="mail" size={14} alt="" />
                          <span className="truncate text-text-muted">
                            {activity.mail.name.slice(0, 30)}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-text-muted">
                          {activity.mail.ordersAfter != null
                            ? `~${formatNumber(activity.mail.ordersAfter)}`
                            : `${formatNumber(activity.mail.sent)} sent`}
                        </span>
                      </div>
                    ),
                  )}
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
  const contribution = organicSalesContribution({
    ticketLiftSold: post.ticketLiftSold,
    spikeDetected: post.spikeDetected,
    spikeEstimatedLift: post.spikeEstimatedLift,
    concurrentPosts,
  });
  const hasSpike = contribution.mode === "spike";
  const lift = contribution.lift;
  const showRange = contribution.mode === "range";
  const lowerBound = contribution.lowerBound;

  const content = (
    <div className="flex min-w-0 flex-wrap items-start gap-2.5">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <SocialChannelIcon channel={post.channel} size={18} alt={channelLabel(post.channel)} />
      </div>
      <div className="min-w-0 flex-1 basis-40">
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

function OrganicPostRow({
  post,
  concurrentPosts = 1,
  preEventSold = null,
  postWeight = 0,
  totalWeight = 0,
}: {
  post: EventInsightSocial;
  /** Promo posts that share overlapping ±48u windows. */
  concurrentPosts?: number;
  preEventSold?: number | null;
  postWeight?: number;
  totalWeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const role = post.salesImpactRole;
  const hasVariants = post.variants.length > 1;
  const contribution = organicSalesContribution({
    ticketLiftSold: post.ticketLiftSold,
    spikeDetected: post.spikeDetected,
    spikeEstimatedLift: post.spikeEstimatedLift,
    concurrentPosts,
    preEventSold,
    postWeight,
    totalWeight,
  });
  const liftLabel =
    role === "after" ? "n.v.t." : formatContributionLift(contribution);
  const showContributionUnder =
    role === "promo" &&
    contribution.mode !== "none" &&
    (contribution.lift ?? 0) > 0;

  return (
    <div className="py-0.5">
      <div className="group -mx-1.5 rounded-sm px-1.5 py-1 transition-colors hover:bg-surface-hover">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
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
            {showContributionUnder && (
              <p
                className="pl-[18px] text-[10px] text-text-dim"
                title={
                  contribution.source === "spike"
                    ? "Verkoopspike binnen 4u na publicatie, boven baseline."
                    : contribution.source === "allocated"
                      ? "Voorverkoop (totaal minus eventdag) — ondergrens gelijke split, bovengrens naar bereik."
                      : contribution.mode === "range"
                        ? `Tickets in ${post.liftWindowLabel} — range omdat ${concurrentPosts} posts dezelfde window delen.`
                        : `Tickets in window (${post.liftWindowLabel})`
                }
              >
                {contribution.source === "spike" ? (
                  <>
                    spike
                    {post.spikeHoursAfter != null
                      ? ` ${post.spikeHoursAfter}u na post`
                      : " na post"}
                    {post.spikeMultiplier != null
                      ? ` · ${post.spikeMultiplier}×`
                      : ""}
                  </>
                ) : contribution.source === "allocated" ? (
                  <>
                    {formatContributionLift(contribution)} tickets ·
                    voorverkoop
                  </>
                ) : (
                  <>
                    {formatContributionLift(contribution)} tickets
                    {post.liftWindowLabel ? ` · ${post.liftWindowLabel}` : ""}
                    {contribution.mode === "range" && concurrentPosts > 1
                      ? ` · ${concurrentPosts} posts`
                      : ""}
                  </>
                )}
              </p>
            )}
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
            <span
              className="font-mono text-text-muted"
              title={
                role === "after"
                  ? "Geen sales-impact"
                  : contribution.source === "spike"
                    ? "Verkoopspike binnen 4u na publicatie, boven baseline."
                    : contribution.source === "allocated"
                      ? "Voorverkoop (totaal minus eventdag) — ondergrens gelijke split, bovengrens naar bereik."
                      : contribution.mode === "range"
                        ? `Tickets in ${post.liftWindowLabel} — range omdat ${concurrentPosts} posts dezelfde window delen.`
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
            : `Score ${score} t.o.v. andere events · bereik, engagement en ticketlift`}
        </p>
      </div>
    </div>
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

function DjFeeInvestmentVerdict({
  level,
  spendLabel,
  missing,
}: {
  level: DjFeeInvestmentLevel;
  spendLabel: string;
  missing: number;
}) {
  const label = djFeeInvestmentLevelLabel(level);
  return (
    <div className="flex items-center gap-2.5">
      <DjFeeInvestmentLevelBars level={level} />
      <div className="min-w-0">
        <p className="text-xs font-medium capitalize text-text">{label}</p>
        <p className="text-[10px] text-text-dim">
          Totaal bandbreedte {spendLabel} t.o.v. andere events
          {missing > 0
            ? ` · ${missing} DJ${missing === 1 ? "" : "s"} zonder range`
            : ""}
        </p>
      </div>
    </div>
  );
}

function DjFeeInvestmentLevelBars({ level }: { level: DjFeeInvestmentLevel }) {
  const label = djFeeInvestmentLevelLabel(level);
  const fill = djFeeBarFill(level);
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

function LineupBlock({
  artists,
  djFees,
  investmentLevel,
}: {
  artists: string[];
  djFees?: EventInsight["djFees"];
  investmentLevel?: EventInsight["djFeeInvestmentLevel"];
}) {
  const feeRows = djFees?.artists ?? [];
  const feeByKey = new Map(
    feeRows.map((row) => [normalizeArtistKey(row.name), row]),
  );
  const names: string[] = [];
  const seen = new Set<string>();
  for (const name of artists) {
    const key = normalizeArtistKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  for (const row of feeRows) {
    const key = normalizeArtistKey(row.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(row.name);
  }

  return (
    <div className="space-y-2">
      {investmentLevel != null && djFees && djFees.spend.priced > 0 && (
        <DjFeeInvestmentVerdict
          level={investmentLevel}
          spendLabel={djFees.spendLabel}
          missing={djFees.spend.missing}
        />
      )}
      {investmentLevel == null && djFees && djFees.spend.priced > 0 && (
        <p className="text-[11px] text-text-muted">
          Line-up spend {formatDjFeeSpend(djFees.spend)}
          {djFees.spend.missing > 0
            ? ` · ${djFees.spend.missing} DJ${djFees.spend.missing === 1 ? "" : "s"} zonder range`
            : ""}
        </p>
      )}
      {names.length === 0 ? (
        <div className="border border-dashed border-border px-3 py-2 text-xs text-text-dim">
          Geen DJs bekend
        </div>
      ) : (
        <ul className="space-y-1.5">
          {names.slice(0, 10).map((name) => {
            const fee = feeByKey.get(normalizeArtistKey(name));
            const rangeLabel = djFeeRangeDef(fee?.feeRange ?? null)?.label;
            return (
              <li
                key={name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border px-2.5 py-1.5 text-xs"
              >
                <Music2
                  className="size-3.5 shrink-0 text-text-dim"
                  strokeWidth={1.5}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {name}
                  {fee?.isTenHour ? (
                    <span className="ml-1.5 text-[10px] tracking-wide text-text-dim uppercase">
                      10HRS
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    rangeLabel ? "text-text-muted" : "text-text-dim",
                  )}
                >
                  <Euro className="size-3" strokeWidth={1.5} />
                  {rangeLabel ?? "fee —"}
                </span>
                <span className="inline-flex items-center gap-1 text-text-dim">
                  <TrendingUp className="size-3" strokeWidth={1.5} />
                  pop. —
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/dashboard/dj-fees"
        className="inline-block text-[11px] underline underline-offset-2 hover:text-text"
      >
        DJ-fees bijwerken →
      </Link>
    </div>
  );
}

const AGE_RANGE_YEARS = 3;

/** Fixed 3-year bands (18–20, 21–23, …) so the top rows are ranges, not single ages. */
function ageRanges(ageBuckets: DemographicBucket[]): DemographicBucket[] {
  const totals = new Map<string, number>();
  for (const bucket of ageBuckets) {
    if (bucket.key === "onbekend") continue;
    const age = Number(bucket.key);
    if (!Number.isFinite(age) || age < 0) continue;
    const start = Math.floor(age / AGE_RANGE_YEARS) * AGE_RANGE_YEARS;
    const key = `${start}–${start + AGE_RANGE_YEARS - 1}`;
    totals.set(key, (totals.get(key) ?? 0) + bucket.count);
  }
  return [...totals.entries()].map(([key, count]) => ({ key, count }));
}

function ageRangeStart(key: string): number {
  const start = Number(key.split("–")[0]);
  return Number.isFinite(start) ? start : 0;
}

function withOtherBucket(
  rows: DemographicBucket[],
  limit: number,
): DemographicBucket[] {
  if (rows.length <= limit) return rows;
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((sum, row) => sum + row.count, 0);
  if (rest <= 0) return top;
  return [...top, { key: "overig", count: rest }];
}

function DemoMini({
  title,
  icon: Icon,
  rows,
  limit = 3,
  isAge = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  rows: DemographicBucket[];
  limit?: number;
  /** If true, roll single ages into 3-year ranges, then keep the largest `limit` ranges. */
  isAge?: boolean;
}) {
  const known = rows.filter((r) => r.key !== "onbekend");
  const prepared = (isAge ? ageRanges(known) : known).sort((a, b) => {
    const byCount = b.count - a.count;
    if (byCount !== 0) return byCount;
    return isAge
      ? ageRangeStart(a.key) - ageRangeStart(b.key)
      : a.key.localeCompare(b.key);
  });
  const total = prepared.reduce((s, r) => s + r.count, 0);
  if (!total) return null;
  const display = withOtherBucket(prepared, limit);

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-[10px] text-text-dim">
        <Icon className="size-3" strokeWidth={1.5} />
        {title}
      </p>
      <ul className="space-y-1.5 text-xs">
        {display.map((r) => {
          const pct = (r.count / total) * 100;
          const isOther = r.key === "overig";
          return (
            <li key={r.key}>
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate",
                    isOther ? "text-text-dim" : "capitalize",
                  )}
                >
                  {isOther ? "Overig" : r.key}
                </span>
                <span className="shrink-0 font-mono text-text-muted">
                  {formatPercent(pct, 0)}
                </span>
              </div>
              <div className="h-1 w-full bg-border">
                <div
                  className={cn(
                    "h-full",
                    isOther ? "bg-text-dim/40" : "bg-accent",
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
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
  live,
}: {
  id: string;
  eyebrow: string;
  title: string;
  count: number;
  live?: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex items-end justify-between gap-4 border-b pb-3",
        live ? "border-border-strong" : "border-border",
      )}
    >
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
  platformAlerts = [],
}: {
  upcoming: EventInsight[];
  past: EventInsight[];
  platformAlerts?: Array<{
    editionId: string;
    channels: TakedownChannel[];
  }>;
}) {
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, 8);
  const visiblePast = showAllPast ? past : past.slice(0, 8);
  const upcomingMonths = groupByMonth(visibleUpcoming);
  const pastMonths = groupByMonth(visiblePast);
  const takedownById = new Map(
    platformAlerts.map((a) => [a.editionId, a.channels]),
  );

  return (
    <div>
      {upcoming.length > 0 && (
        <section className="mb-8" aria-labelledby="upcoming-events-heading">
          <EventListHeading
            id="upcoming-events-heading"
            eyebrow="Planning"
            title="Komende events"
            count={upcoming.length}
            live
          />
          <div className="space-y-6">
            {upcomingMonths.map((m) => (
              <div key={m.key}>
                <p className="mb-2 text-sm font-medium capitalize text-text-muted">
                  {m.label}
                </p>
                <ul className="space-y-2">
                  {m.events.map((e) => (
                    <EventRow
                      key={e.editionId}
                      event={e}
                      variant="upcoming"
                      takedownChannels={takedownById.get(e.editionId)}
                    />
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
                    <EventRow
                      key={e.editionId}
                      event={e}
                      variant="past"
                      takedownChannels={takedownById.get(e.editionId)}
                    />
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
