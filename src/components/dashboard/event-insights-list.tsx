"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sun,
  CloudSun,
  CloudRain,
  CloudSnow,
  Snowflake,
  Wind,
  ThermometerSun,
  Users,
  MapPin,
  Cake,
  ChevronDown,
  Music2,
} from "lucide-react";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import type {
  EventInsight,
  EventInsightHeadline,
} from "@/lib/insights/event-insights";
import type { WeatherKind } from "@/lib/weather/classify";
import type { DemographicBucket } from "@/lib/db/schema";

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

function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

function HeadlineBadge({ h }: { h: EventInsightHeadline }) {
  const colors: Record<EventInsightHeadline["tone"], string> = {
    positive: "bg-success/10 text-success border-success/30",
    neutral: "bg-surface-hover text-text-muted border-border",
    caution: "bg-warn/10 text-warn border-warn/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 text-[11px] tracking-wide",
        colors[h.tone],
      )}
    >
      {h.text}
    </span>
  );
}

function FillBar({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const tone =
    clamped >= 85 ? "bg-success" : clamped >= 50 ? "bg-accent" : "bg-warn";
  return (
    <div className={cn("w-20", className)}>
      <div className="mb-0.5 flex justify-between text-[10px] text-text-dim">
        <span>{formatPercent(clamped, 0)}</span>
      </div>
      <div className="h-1.5 w-full bg-border">
        <div
          className={cn("h-full transition-[width]", tone)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function WeatherIcon({
  kind,
  size = "lg",
}: {
  kind: WeatherKind;
  size?: "sm" | "lg";
}) {
  const label: Record<WeatherKind, string> = {
    ideal: "Zonnig",
    ok: "Deels bewolkt",
    wet: "Regen",
    cold_wet: "Koud & nat",
    cold: "Koud",
    heat: "Hitte",
    windy: "Wind",
  };
  const Icon =
    kind === "ideal"
      ? Sun
      : kind === "heat"
        ? ThermometerSun
        : kind === "wet"
          ? CloudRain
          : kind === "cold_wet"
            ? CloudSnow
            : kind === "cold"
              ? Snowflake
              : kind === "windy"
                ? Wind
                : CloudSun;

  const box = size === "lg" ? "size-14" : "size-9";
  const icon = size === "lg" ? "size-7" : "size-4.5 size-[18px]";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border border-border bg-bg-elevated",
        box,
      )}
      title={label[kind]}
      aria-label={label[kind]}
    >
      <Icon className={cn(icon, "text-text")} strokeWidth={1.5} />
    </span>
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

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "caution" | "neutral";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border px-2 py-1 text-xs",
        tone === "positive"
          ? "border-success/30 bg-success/5"
          : tone === "caution"
            ? "border-warn/30 bg-warn/5"
            : "border-border bg-surface",
      )}
    >
      <span className="text-text-dim">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function EventRow({ event }: { event: EventInsight }) {
  const [open, setOpen] = useState(false);

  const dateStr = new Date(`${event.day}T12:00:00`).toLocaleDateString(
    "nl-NL",
    { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );

  return (
    <li className="border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{event.name}</span>
            {event.headliner && event.headliner !== event.name && (
              <span className="text-xs text-text-dim">{event.headliner}</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {dateStr}
            {event.isOutdoor ? " · outdoor" : ""}
            {event.periodLabels.length > 0
              ? ` · ${event.periodLabels.join(", ")}`
              : ""}
            {event.weather ? ` · ${event.weather.label}` : ""}
          </p>
          {event.headlines.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {event.headlines.map((h, i) => (
                <HeadlineBadge key={i} h={h} />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          {event.weather && <WeatherIcon kind={event.weather.kind} size="sm" />}
          {event.tickets.fillPct != null ? (
            <FillBar pct={event.tickets.fillPct} />
          ) : event.tickets.sold > 0 ? (
            <span className="font-mono text-sm">
              {formatNumber(event.tickets.sold)}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 text-text-dim transition-transform",
              open && "rotate-180",
            )}
            strokeWidth={1.5}
          />
        </div>
      </button>

      {open && <EventDetail event={event} />}
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

  return (
    <div className="border-t border-border bg-bg/30 px-4 py-4">
      {/* Quick stats row */}
      <div className="mb-4 flex flex-wrap gap-2">
        <StatPill
          label="Verkocht"
          value={
            tickets.capacity
              ? `${formatNumber(tickets.sold)} / ${formatNumber(tickets.capacity)}`
              : formatNumber(tickets.sold)
          }
          tone={
            tickets.fillPct != null
              ? tickets.fillPct >= 85
                ? "positive"
                : tickets.fillPct < 50
                  ? "caution"
                  : "neutral"
              : "neutral"
          }
        />
        {tickets.scanned > 0 && (
          <StatPill
            label="Gescand"
            value={`${formatNumber(tickets.scanned)}${tickets.scanRatePct != null ? ` (${formatPercent(tickets.scanRatePct, 0)})` : ""}`}
          />
        )}
        {tickets.avgPriceEur != null && (
          <StatPill label="Gem. prijs" value={`€${tickets.avgPriceEur.toFixed(0)}`} />
        )}
        {tickets.lastWeekSold != null && tickets.lastWeekSold > 0 && (
          <StatPill label="Laatste week" value={`+${formatNumber(tickets.lastWeekSold)}`} />
        )}
        {tickets.soldOutDaysBefore != null && (
          <StatPill label="Uitverkocht" value={`${tickets.soldOutDaysBefore}d vóór`} tone="positive" />
        )}
      </div>

      <div className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div>
          <SectionDivider label="Verkoop per bron" />
          <div className="space-y-2">
            {tickets.sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className={s.status === "shell" ? "text-text-dim" : "font-medium"}>
                  {s.label}
                </span>
                <span className="font-mono text-text-muted">
                  {s.status === "shell" || s.status === "empty"
                    ? s.note ?? "—"
                    : formatNumber(s.sold ?? 0)}
                </span>
              </div>
            ))}
          </div>

          {referrers.length > 0 && (
            <>
              <SectionDivider label="Orderherkomst" />
              <div className="space-y-1.5">
                {referrers.slice(0, 5).map((r, i) => {
                  const total = referrers.reduce((s, x) => s + x.orders, 0);
                  const pct = total > 0 ? (r.orders / total) * 100 : 0;
                  return (
                    <div key={r.channel} className="flex items-center gap-2 text-xs">
                      <div
                        className={cn(
                          "size-2 shrink-0",
                          i === 0 ? "bg-accent" : i === 1 ? "bg-info" : "bg-text-dim",
                        )}
                      />
                      <span className="flex-1 truncate">{channelLabel(r.channel)}</span>
                      <span className="font-mono text-text-muted">{formatNumber(r.orders)}</span>
                      <span className="w-10 text-right text-text-dim">{formatPercent(pct, 0)}</span>
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
                <DemoMini title="Geslacht" icon={Users} rows={demographics.gender} />
                {demographics.ageReady && (
                  <DemoMini title="Leeftijd" icon={Cake} rows={demographics.age} />
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
                  {formatPercent(demographics.coveragePct, 0)} ingevuld ({formatNumber(demographics.answered)}/{formatNumber(demographics.total)})
                </p>
              )}
            </>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {weather && (
            <>
              <SectionDivider label="Weer" />
              <div className="flex items-start gap-3">
                <WeatherIcon kind={weather.kind} size="sm" />
                <div className="text-xs">
                  <p className="font-medium">{weather.label}</p>
                  <p className="mt-0.5 text-text-muted">
                    {weather.tempMinC != null && weather.tempMaxC != null
                      ? `${Math.round(weather.tempMinC)}–${Math.round(weather.tempMaxC)}°C`
                      : weather.tempMaxC != null
                        ? `${Math.round(weather.tempMaxC)}°C`
                        : ""}
                    {weather.precipMm != null && weather.precipMm > 0 && ` · ${weather.precipMm.toFixed(1)}mm`}
                    {" · "}
                    <span
                      className={cn(
                        weather.tone === "positive" && "text-success",
                        weather.tone === "caution" && "text-warn",
                      )}
                    >
                      {weather.tone === "positive" ? "Gunstig" : weather.tone === "caution" ? "Ongunstig" : "Neutraal"}
                    </span>
                  </p>
                </div>
              </div>
            </>
          )}

          {competingFestivals.length > 0 && (
            <>
              <SectionDivider label={`Concurrentie (${competingFestivals.length})`} />
              <ul className="space-y-1">
                {competingFestivals.slice(0, 4).map((e) => (
                  <li key={`${e.name}-${e.venue ?? ""}`} className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="shrink-0 text-text-dim">
                      {e.attending != null && e.attending > 0 ? formatNumber(e.attending) : e.venue ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <SectionDivider label={`Marketing (${socialPosts.length + emailCampaigns.length})`} />
          <div className="space-y-1">
            {socialPosts.slice(0, 3).map((p) => (
              <div key={p.postId} className="flex items-center justify-between text-xs">
                <span className="truncate">
                  <span className="capitalize text-text-muted">{p.channel}</span>
                  {p.title && <span className="ml-1 text-text-dim">· {p.title.slice(0, 30)}</span>}
                </span>
                <span className="shrink-0 font-mono text-text-muted">
                  {p.ticketLiftSold != null ? `+${formatNumber(p.ticketLiftSold)}` : "—"}
                </span>
              </div>
            ))}
            {emailCampaigns.slice(0, 2).map((m) => (
              <div key={m.campaignId} className="flex items-center justify-between text-xs">
                <span className="truncate">
                  <span className="text-text-muted">Mail</span>
                  <span className="ml-1 text-text-dim">· {m.name.slice(0, 30)}</span>
                </span>
                <span className="shrink-0 font-mono text-text-muted">
                  {m.ordersAfter != null ? `~${formatNumber(m.ordersAfter)}` : `${formatNumber(m.sent)} sent`}
                </span>
              </div>
            ))}
            {socialPosts.length === 0 && emailCampaigns.length === 0 && (
              <p className="text-xs text-text-dim">Geen marketing gekoppeld</p>
            )}
          </div>

          {event.artists.length > 0 && (
            <>
              <SectionDivider label="Line-up" />
              <div className="flex flex-wrap gap-1.5">
                {event.artists.slice(0, 6).map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 border border-dashed border-border px-2 py-0.5 text-xs"
                  >
                    <Music2 className="size-3 text-text-dim" strokeWidth={1.5} />
                    {name}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-text-dim">
                Fee & populariteit volgen zodra DJ-prijzen en SoundCloud gekoppeld zijn.
              </p>
            </>
          )}
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
            <span className="font-mono text-text-muted">{formatPercent((r.count / total) * 100, 0)}</span>
          </li>
        ))}
      </ul>
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
  const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, 3);
  const visiblePast = showAllPast ? past : past.slice(0, 8);

  return (
    <div>
      {upcoming.length > 0 && (
        <div className="mb-8">
          <p className="mb-3 text-[11px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Komende events ({upcoming.length})
          </p>
          <ul className="space-y-2">
            {visibleUpcoming.map((e) => (
              <EventRow key={e.editionId} event={e} />
            ))}
          </ul>
          {upcoming.length > 3 && !showAllUpcoming && (
            <button
              type="button"
              onClick={() => setShowAllUpcoming(true)}
              className="mt-3 text-sm underline underline-offset-2 hover:text-text"
            >
              Toon {upcoming.length - 3} meer komende events
            </button>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <p className="mb-3 text-[11px] font-medium tracking-[0.12em] text-text-dim uppercase">
            Afgelopen events ({past.length})
          </p>
          <ul className="space-y-2">
            {visiblePast.map((e) => (
              <EventRow key={e.editionId} event={e} />
            ))}
          </ul>
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
            Geen events gevonden. Sync Weeztix via{" "}
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
