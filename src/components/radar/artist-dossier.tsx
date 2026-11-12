"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FollowerGrowthChart } from "@/components/radar/follower-growth-chart";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";
import { RadarBadge, RadarBadgePill } from "@/components/radar/radar-badge";
import { SocialChannelIcon } from "@/components/ui/social-channel-icon";
import type { RadarBadgeId } from "@/lib/radar/badge-defs";
import {
  followerDeltas,
  formatDelta,
  labelsFromProfiles,
} from "@/lib/radar/metric-deltas";

const PLATFORM_LABEL: Record<string, string> = {
  resident_advisor: "Resident Advisor",
  instagram: "Instagram",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  youtube: "YouTube",
  tiktok: "TikTok",
};
import {
  RADAR_ARTIST_STATUS_NL,
  RADAR_FEEDBACK_REASON_NL,
  type RadarArtistStatus,
  type RadarFeedbackReason,
} from "@/lib/radar/types";

type Props = {
  artist: {
    id: string;
    name: string;
    status: RadarArtistStatus;
    primaryGenre: string | null;
    secondaryGenres: string[] | null;
    growthScore: string | null;
    growthVelocity: string | null;
    momentumScore: string | null;
    fitScore: string | null;
    bookabilityScore: string | null;
    scoreReasons: string[];
    notes: string | null;
    discoverySource: string;
    imageUrl: string | null;
    growthBreakdown: Record<string, unknown> | null;
    homeGigCount?: number;
    hasAgency?: boolean;
    raFollowerCount?: number | null;
    residentCountry?: string | null;
    nlAudienceScore?: string | null;
    nlGigShare?: string | null;
  };
  profiles: Array<{
    platform: string;
    url: string | null;
    handle: string | null;
    externalId: string | null;
    lastSyncedAt: string | Date | null;
    raw?: Record<string, unknown> | null;
  }>;
  recentMetrics: Array<{
    id: string;
    platform: string;
    capturedAt: string | Date;
    metrics: Record<string, number | string | null>;
  }>;
  recentGigs: Array<{
    id: string;
    eventName: string | null;
    startsAt: string | Date | null;
    city: string | null;
    country: string | null;
    attending: number | null;
    billingIndex: number | null;
    isHeadliner: boolean;
    sourceUrl: string | null;
    source?: string | null;
  }>;
  badges?: RadarBadgeId[];
  mixseries?: Array<{
    id: string;
    channelTitle: string | null;
    channelKey: string;
    title: string;
    url: string | null;
    publishedAt: string | Date | null;
    viewCount: number | null;
  }>;
};

const STATUSES = Object.keys(RADAR_ARTIST_STATUS_NL) as RadarArtistStatus[];

export function ArtistDossier({
  artist,
  profiles,
  recentMetrics,
  recentGigs,
  mixseries = [],
  badges = [],
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(artist.notes ?? "");
  const [status, setStatus] = useState(artist.status);
  const [genre, setGenre] = useState(artist.primaryGenre ?? "");
  const [feedbackReason, setFeedbackReason] =
    useState<RadarFeedbackReason>("no_fit");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deltas = followerDeltas(recentMetrics, [
    "resident_advisor",
    "instagram",
    "soundcloud",
  ]);
  const labels = labelsFromProfiles(profiles);
  // Compare against a fixed "now" for this mount (avoids impure Date.now in render).
  const [nowMs] = useState(() => Date.now());
  const upcoming = recentGigs.filter(
    (g) => g.startsAt && new Date(g.startsAt).getTime() >= nowMs - 6 * 3600_000,
  );
  const nlSharePct =
    artist.nlGigShare != null && artist.nlGigShare !== ""
      ? Math.round(Number(artist.nlGigShare) * 100)
      : null;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/radar/artists/${artist.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/radar/artiesten"
            className="text-xs text-text-muted hover:text-text"
          >
            ← Artiesten
          </Link>
          {artist.residentCountry || artist.raFollowerCount != null ? (
            <p className="mt-1 text-xs text-text-muted">
              {[
                artist.residentCountry,
                artist.raFollowerCount != null
                  ? `${artist.raFollowerCount.toLocaleString("nl-NL")} RA-volgers`
                  : null,
                artist.hasAgency ? "agency" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <h1 className="mt-2 font-display text-3xl tracking-[0.03em] sm:text-4xl">
            {artist.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            via {artist.discoverySource}
            {artist.primaryGenre ? ` · ${artist.primaryGenre}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
              {(artist.homeGigCount ?? 0) > 0 ? (
                <RadarBadgePill tone="home" title="Speelde al bij Thuishaven">
                  Al bij Thuishaven {artist.homeGigCount}×
                </RadarBadgePill>
              ) : (
                <RadarBadgePill tone="new" title="Nog nooit bij Thuishaven">
                  Nieuw voor Thuishaven
                </RadarBadgePill>
              )}
              {badges.map((b) => (
                <RadarBadge key={b} id={b} />
              ))}
            </div>
          {artist.scoreReasons.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-text-muted">
              {artist.scoreReasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          ) : null}
          {profiles.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {profiles.map((p) => {
                const label = PLATFORM_LABEL[p.platform] ?? p.platform;
                const inner = (
                  <>
                    <SocialChannelIcon channel={p.platform} size={14} />
                    <span>
                      {label}
                      {p.handle ? (
                        <span className="text-text-muted"> @{p.handle}</span>
                      ) : null}
                    </span>
                  </>
                );
                return (
                  <li key={`${p.platform}-${p.handle ?? p.url}`}>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 border border-border px-2 py-1 hover:border-text"
                      >
                        {inner}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-text-muted">
                        {inner}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-text-dim">
              Nog geen socials — RA-enrich draait nog over de catalogus.
            </p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          <div className="bg-surface px-4 py-3">
            <dt className="flex items-center gap-1 text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Totaal
              <RadarInfoTip topic="totaal" />
            </dt>
            <dd className="font-display text-3xl tabular-nums">
              {artist.growthScore ?? "—"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="flex items-center gap-1 text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Momentum
              <RadarInfoTip topic="momentum" />
            </dt>
            <dd className="font-display text-3xl tabular-nums">
              {artist.momentumScore ?? "—"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="flex items-center gap-1 text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Fit
              <RadarInfoTip topic="fit" />
            </dt>
            <dd className="font-display text-3xl tabular-nums">
              {artist.fitScore ?? "—"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="flex items-center gap-1 text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Bookable
              <RadarInfoTip topic="bookability" />
            </dt>
            <dd className="font-display text-3xl tabular-nums">
              {artist.bookabilityScore ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      <section className="border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg tracking-[0.04em]">
              Volgersgroei
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              RA, Instagram en SoundCloud over tijd — zo zie je wanneer iemand
              lanceert.
            </p>
          </div>
          {deltas.length > 0 ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {deltas.map((d) => (
                <li key={d.platform} className="inline-flex items-center gap-1.5">
                  <SocialChannelIcon channel={d.platform} size={12} />
                  <span>
                    {PLATFORM_LABEL[d.platform] ?? d.platform}
                    {": "}
                    {formatDelta(d)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-3">
          <FollowerGrowthChart metrics={recentMetrics} />
        </div>
        {status === "new" ? (
          <p className="mt-2 text-xs text-text-dim">
            Tip: zet op <strong className="text-text">Volgen</strong> zodat we
            vaker snapshots nemen en de lijn gevuld blijft.
          </p>
        ) : null}
      </section>

      {(labels.length > 0 ||
        upcoming.length > 0 ||
        artist.nlAudienceScore != null ||
        mixseries.length > 0) && (
        <section className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="flex items-center gap-1 font-display text-lg tracking-[0.04em]">
              NL-audience
              <RadarInfoTip topic="nl-audience" />
            </h2>
            {artist.nlAudienceScore == null ? (
              <p className="mt-2 text-xs text-text-muted">
                Nog niet berekend — komt mee in de pipeline.
              </p>
            ) : (
              <p className="mt-2 text-sm">
                <span className="font-display text-2xl tabular-nums">
                  {artist.nlAudienceScore}
                </span>
                {nlSharePct != null ? (
                  <span className="text-text-dim">
                    {" "}
                    · {nlSharePct}% recente gigs NL
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <div>
            <h2 className="font-display text-lg tracking-[0.04em]">Labels</h2>
            {labels.length === 0 ? (
              <p className="mt-2 text-xs text-text-muted">
                Geen labels uit RA-enrich.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {labels.map((l) => (
                  <li
                    key={l}
                    className="border border-border px-2 py-0.5 text-xs"
                  >
                    {l}
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                <li className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
                  Speelt binnenkort
                </li>
                {upcoming.slice(0, 3).map((g) => (
                  <li key={g.id}>
                    {g.eventName ?? "Event"}
                    <span className="text-text-dim">
                      {g.startsAt
                        ? ` · ${new Date(g.startsAt).toLocaleDateString("nl-NL")}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <h2 className="flex items-center gap-1 font-display text-lg tracking-[0.04em]">
              Mixseries
              <RadarInfoTip topic="mixseries" />
            </h2>
            {mixseries.length === 0 ? (
              <p className="mt-2 text-xs text-text-muted">
                Geen Boiler Room / HÖR / … matches.
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {mixseries.slice(0, 4).map((m) => (
                  <li key={m.id}>
                    {m.url ? (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-text"
                      >
                        {m.channelTitle ?? m.channelKey}
                      </a>
                    ) : (
                      <span>{m.channelTitle ?? m.channelKey}</span>
                    )}
                    <span className="text-text-dim">
                      {m.viewCount != null
                        ? ` · ${m.viewCount.toLocaleString("nl-NL")} views`
                        : ""}
                    </span>
                    <p className="text-xs text-text-muted line-clamp-1">
                      {m.title}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {error ? <p className="text-sm text-warn">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4 border border-border bg-surface p-4">
          <h2 className="font-display text-lg tracking-[0.04em]">Workflow</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["watching", "Volgen"],
                ["shortlist", "Shortlist"],
                ["passed", "Gepasseerd"],
              ] as const
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                disabled={busy || status === s}
                onClick={() => {
                  setStatus(s);
                  if (s === "passed") {
                    void save({ status: s, feedbackReason });
                    return;
                  }
                  void save({ status: s });
                }}
                className={
                  status === s
                    ? "border border-text bg-text px-3 py-1.5 text-xs text-bg"
                    : "border border-border px-3 py-1.5 text-xs hover:border-text"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Status (alle)
            </span>
            <select
              value={status}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as RadarArtistStatus;
                setStatus(next);
                if (next === "passed" || next === "not_relevant") {
                  void save({
                    status: next,
                    feedbackReason,
                  });
                  return;
                }
                void save({ status: next });
              }}
              className="w-full border border-border bg-bg px-2 py-2"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RADAR_ARTIST_STATUS_NL[s]}
                </option>
              ))}
            </select>
          </label>
          {status === "passed" || status === "not_relevant" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
                Waarom gepasseerd?
              </span>
              <select
                value={feedbackReason}
                disabled={busy}
                onChange={(e) => {
                  const reason = e.target.value as RadarFeedbackReason;
                  setFeedbackReason(reason);
                  void save({
                    status,
                    feedbackReason: reason,
                  });
                }}
                className="w-full border border-border bg-bg px-2 py-2"
              >
                {(
                  Object.keys(RADAR_FEEDBACK_REASON_NL) as RadarFeedbackReason[]
                ).map((r) => (
                  <option key={r} value={r}>
                    {RADAR_FEEDBACK_REASON_NL[r]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Primair genre
            </span>
            <div className="flex gap-2">
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="min-w-0 flex-1 border border-border bg-bg px-2 py-2"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({
                    primaryGenre: genre || null,
                    genreManual: true,
                  })
                }
                className="border border-border px-3 py-2 text-sm hover:border-accent"
              >
                Bewaar
              </button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Notities
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="w-full border border-border bg-bg px-2 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ notes })}
              className="border border-accent bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              Notitie opslaan
            </button>
          </div>
        </section>

        <section className="space-y-4 border border-border bg-surface p-4">
          <h2 className="font-display text-lg tracking-[0.04em]">Gigs</h2>
          {recentGigs.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nog geen gigs — run discovery zodra seed venues staan.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {recentGigs.map((g) => (
                <li key={g.id} className="border-b border-border/60 py-2">
                  <p className="font-medium">
                    {g.sourceUrl ? (
                      <a
                        href={g.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {g.eventName ?? "Event"}
                      </a>
                    ) : (
                      (g.eventName ?? "Event")
                    )}
                  </p>
                  <p className="text-xs text-text-dim">
                    {g.startsAt
                      ? new Date(g.startsAt).toLocaleDateString("nl-NL")
                      : "—"}
                    {g.city ? ` · ${g.city}` : ""}
                    {g.country ? `, ${g.country}` : ""}
                    {g.attending != null ? ` · ${g.attending} attending` : ""}
                    {g.isHeadliner
                      ? " · headliner"
                      : g.billingIndex != null
                        ? ` · #${g.billingIndex + 1}`
                        : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <h2 className="pt-2 font-display text-lg tracking-[0.04em]">
            Profielen
          </h2>
          {profiles.length === 0 ? (
            <p className="text-sm text-text-muted">Nog geen platformprofielen.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {profiles.map((p) => (
                <li
                  key={`${p.platform}-${p.externalId}`}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-2"
                >
                  <span className="capitalize text-text-muted">{p.platform}</span>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate underline hover:text-text"
                    >
                      {p.handle ?? "open"}
                    </a>
                  ) : (
                    <span>{p.handle ?? p.externalId ?? "—"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h2 className="pt-2 font-display text-lg tracking-[0.04em]">
            Recente metrics
          </h2>
          {recentMetrics.length === 0 ? (
            <p className="text-sm text-text-muted">Nog geen snapshots.</p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
              {recentMetrics.slice(0, 10).map((m) => (
                <li key={m.id} className="border border-border/70 px-2 py-1.5">
                  <p className="text-text-dim">
                    {m.platform} ·{" "}
                    {new Date(m.capturedAt).toLocaleString("nl-NL")}
                  </p>
                  <p className="font-mono tabular-nums text-text-muted">
                    {Object.entries(m.metrics)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
