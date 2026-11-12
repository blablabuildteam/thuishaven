"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { RadarBadgePill } from "@/components/radar/radar-badge";
import {
  RADAR_ALERT_DEFS,
  RADAR_ALERT_DEF_BY_KIND,
  type RadarAlertKind,
} from "@/lib/radar/alert-defs";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  kind: RadarAlertKind;
  title: string;
  body: string | null;
  artistId: string | null;
  artistName: string | null;
  artistHomeGigCount: number | null;
  venueId: string | null;
  venueName: string | null;
  triggeredAt: string;
  readAt: string | null;
};

type Counts = Record<string, { unread: number; total: number }>;

function relTime(iso: string) {
  const diff = Date.parse(iso);
  const days = Math.floor((Date.now() - diff) / 86_400_000);
  if (days <= 0) return "vandaag";
  if (days === 1) return "gisteren";
  if (days < 7) return `${days} dagen geleden`;
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function AlertsWorkbench({
  initial,
  kind,
  unreadOnly,
  counts,
}: {
  initial: Alert[];
  kind: RadarAlertKind | null;
  unreadOnly: boolean;
  counts: Counts;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const totalUnread = Object.values(counts).reduce((s, c) => s + c.unread, 0);
  const tabs = RADAR_ALERT_DEFS.filter((d) => (counts[d.kind]?.total ?? 0) > 0);
  const activeDef = kind ? RADAR_ALERT_DEF_BY_KIND.get(kind) : null;
  const shown = initial.filter((a) => !hidden.has(a.id));
  const unreadHere = kind ? (counts[kind]?.unread ?? 0) : totalUnread;

  function setParams(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => router.replace(`?${params.toString()}`, { scroll: false }));
  }

  async function markRead(id: string) {
    setError(null);
    if (unreadOnly) setHidden((s) => new Set(s).add(id));
    const res = await fetch("/api/radar/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Markeren mislukt");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function markAllRead() {
    setError(null);
    const res = await fetch("/api/radar/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true, kinds: kind ? [kind] : undefined }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Markeren mislukt");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-surface">
        <div className="flex flex-wrap gap-1.5 p-3 sm:p-4">
          <TypeTab
            on={!kind}
            label="Alles"
            count={unreadOnly ? totalUnread : undefined}
            onClick={() => setParams((p) => p.delete("type"))}
          />
          {tabs.map((d) => (
            <TypeTab
              key={d.kind}
              on={kind === d.kind}
              label={d.label}
              tone={d.tone}
              count={unreadOnly ? (counts[d.kind]?.unread ?? 0) : counts[d.kind]?.total}
              onClick={() => setParams((p) => p.set("type", d.kind))}
            />
          ))}
        </div>

        {activeDef ? (
          <div className="grid gap-2 border-t border-border px-4 py-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
                Wat is dit?
              </span>
              <br />
              {activeDef.meaning}
            </p>
            <p>
              <span className="text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
                Wat doe je?
              </span>
              <br />
              {activeDef.action}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg-elevated/50 px-4 py-2.5">
          <div role="radiogroup" aria-label="Weergave" className="inline-flex border border-border bg-bg p-0.5 text-sm">
            {[
              { v: true, l: "Open" },
              { v: false, l: "Alles (ook gelezen)" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={unreadOnly === o.v}
                onClick={() =>
                  setParams((p) => (o.v ? p.delete("alles") : p.set("alles", "1")))
                }
                className={cn(
                  "px-3 py-1.5",
                  unreadOnly === o.v ? "bg-text text-bg" : "text-text-muted hover:text-text",
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {pending ? <span className="text-xs text-text-dim">laden…</span> : null}
            {unreadHere > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="border border-border bg-bg px-3 py-1.5 hover:border-text"
              >
                {activeDef ? `Alle “${activeDef.label}” gelezen` : "Alles gelezen"} ({unreadHere})
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {shown.length === 0 ? (
        <div className="border border-dashed border-border px-4 py-12 text-center">
          <p className="font-display text-lg">
            {unreadOnly ? "Niets meer open" : "Geen alerts"}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {unreadOnly
              ? "Alles is afgewerkt. Nieuwe signalen komen na de volgende sync (08:00 en 20:00)."
              : "Er zijn nog geen alerts van dit type."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {shown.map((a) => {
            const def = RADAR_ALERT_DEF_BY_KIND.get(a.kind);
            return (
              <li
                key={a.id}
                className={cn(
                  "flex flex-wrap items-start gap-3 px-3 py-3.5 sm:flex-nowrap sm:px-4",
                  a.readAt ? "bg-bg opacity-60" : "bg-surface",
                )}
              >
                <div className="w-28 shrink-0 pt-0.5">
                  <RadarBadgePill tone={def?.tone ?? "muted"} title={def?.meaning}>
                    {def?.label ?? a.kind}
                  </RadarBadgePill>
                  <p className="mt-1 text-[11px] text-text-dim">{relTime(a.triggeredAt)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {a.artistId && a.artistName ? (
                      <Link href={`/radar/artiesten/${a.artistId}`} className="hover:underline">
                        {a.artistName}
                      </Link>
                    ) : a.venueId && a.venueName ? (
                      <Link href={`/radar/venues/${a.venueId}`} className="hover:underline">
                        {a.venueName}
                      </Link>
                    ) : (
                      a.title
                    )}
                    {(a.artistHomeGigCount ?? 0) > 0 ? (
                      <RadarBadgePill tone="home" className="ml-2 align-middle">
                        TH {a.artistHomeGigCount}×
                      </RadarBadgePill>
                    ) : null}
                  </p>
                  {a.body ? <p className="mt-0.5 text-sm text-text-muted">{a.body}</p> : null}
                  {def && !a.readAt ? (
                    <p className="mt-1 text-xs text-text-dim">→ {def.action}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {a.artistId ? (
                    <Link
                      href={`/radar/artiesten/${a.artistId}`}
                      className="border border-border px-2.5 py-1 text-xs hover:border-text"
                    >
                      Dossier
                    </Link>
                  ) : a.venueId ? (
                    <Link
                      href={`/radar/venues/${a.venueId}`}
                      className="border border-border px-2.5 py-1 text-xs hover:border-text"
                    >
                      Venue
                    </Link>
                  ) : null}
                  {!a.readAt ? (
                    <button
                      type="button"
                      onClick={() => markRead(a.id)}
                      className="border border-text bg-text px-2.5 py-1 text-xs text-bg"
                    >
                      Gelezen
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TypeTab({
  on,
  label,
  count,
  tone,
  onClick,
}: {
  on: boolean;
  label: string;
  count?: number;
  tone?: Parameters<typeof RadarBadgePill>[0]["tone"];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-2 border px-3 py-1.5 text-sm transition-colors",
        on ? "border-text bg-text text-bg" : "border-border bg-bg hover:border-text",
      )}
    >
      {tone && !on ? <ToneDot tone={tone} /> : null}
      {label}
      {count != null ? (
        <span className={cn("text-xs tabular-nums", on ? "opacity-70" : "text-text-dim")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function ToneDot({ tone }: { tone: NonNullable<Parameters<typeof TypeTab>[0]["tone"]> }) {
  const color: Record<typeof tone, string> = {
    home: "bg-text",
    new: "bg-highlight",
    growth: "bg-success",
    nl: "bg-info",
    sets: "bg-text",
    warn: "bg-warn",
    muted: "bg-border",
  };
  return <span aria-hidden className={cn("size-2 rounded-full", color[tone])} />;
}
