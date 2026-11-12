"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PartyIngestForm } from "@/components/radar/party-ingest-form";
import { RadarBadgePill } from "@/components/radar/radar-badge";
import {
  RADAR_PARTY_SOURCE_NL,
  type RadarPartySource,
  type RadarPartyStatus,
} from "@/lib/radar/types";
import { cn } from "@/lib/utils";

type Artist = {
  id: string | null;
  name: string;
  growthScore: string | null;
  homeGigCount: number;
  isNew: boolean;
};

type Party = {
  id: string;
  title: string;
  startsAt: string | null;
  dayKey: string | null;
  source: RadarPartySource;
  status: RadarPartyStatus;
  externalUrl: string | null;
  venueId: string | null;
  venueName: string | null;
  venueKind: string | null;
  city: string | null;
  country: string | null;
  artistCount: number;
  talentCount: number;
  homeArtistCount: number;
  artists: Artist[];
};

type Focus = "alle" | "kansen" | "review";

const LINEUP_PREVIEW = 10;

function score(a: Artist) {
  return a.growthScore != null ? Math.round(Number(a.growthScore)) : null;
}

function dayLabel(key: string, todayKey: string, tomorrowKey: string) {
  const d = new Date(`${key}T12:00:00`);
  const base = d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (key === todayKey) return `Vandaag · ${base}`;
  if (key === tomorrowKey) return `Morgen · ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function PartiesWorkbench({
  initial,
  venues,
  when,
  todayKey,
  tomorrowKey,
  talentMin,
}: {
  initial: Party[];
  venues: Array<{ id: string; name: string }>;
  when: "upcoming" | "past";
  todayKey: string;
  tomorrowKey: string;
  talentMin: number;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState<Focus>("alle");
  const [venueFilter, setVenueFilter] = useState("");
  const [q, setQ] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeVenue, setIntakeVenue] = useState(venues[0]?.id ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isTalent = (a: Artist) =>
    a.homeGigCount === 0 && (score(a) ?? 0) >= talentMin;

  const counts = useMemo(
    () => ({
      alle: initial.length,
      kansen: initial.filter((p) => p.talentCount > 0).length,
      review: initial.filter((p) => p.status === "needs_review").length,
    }),
    [initial],
  );

  const venueOptions = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const p of initial) {
      if (!p.venueId) continue;
      const cur = m.get(p.venueId) ?? { name: p.venueName ?? "Venue", n: 0 };
      cur.n += 1;
      m.set(p.venueId, cur);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [initial]);

  const needle = q.trim().toLowerCase();
  const shown = initial.filter((p) => {
    if (p.status === "rejected" && focus !== "review") return false;
    if (focus === "kansen" && p.talentCount === 0) return false;
    if (focus === "review" && p.status !== "needs_review") return false;
    if (venueFilter && p.venueId !== venueFilter) return false;
    if (needle) {
      const hay = [p.title, p.venueName ?? "", ...p.artists.map((a) => a.name)]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const groups = useMemo(() => {
    const map = new Map<string, Party[]>();
    for (const p of shown) {
      const key = p.dayKey ?? "onbekend";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [shown]);

  const totalTalent = shown.reduce((n, p) => n + p.talentCount, 0);

  async function setStatus(id: string, status: RadarPartyStatus) {
    setBusyId(id);
    await fetch(`/api/radar/parties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    router.refresh();
  }

  function setWhen(next: "upcoming" | "past") {
    router.push(next === "past" ? "/radar/feesten?wanneer=afgelopen" : "/radar/feesten");
  }

  const focusTabs: Array<{ id: Focus; label: string; n: number }> = [
    { id: "alle", label: "Alle feesten", n: counts.alle },
    { id: "kansen", label: "Met kansen", n: counts.kansen },
    { id: "review", label: "Te reviewen", n: counts.review },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <Explain
          step="1"
          title="Radar leest line-ups"
          body="Van onze clubs en festivals via RA, hun website en Instagram. Elke naam komt op de artiestenlijst."
        />
        <Explain
          step="2"
          title="Jij scant per dag"
          body="Per feest zie je de line-up, de sterkste namen eerst. Zo zie je wie er waar draait."
        />
        <Explain
          step="3"
          title="Kansen eruit pikken"
          body={`Een kans is een naam die nog niet bij Thuishaven stond en een score van ${talentMin}+ heeft. Klik door naar het dossier.`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
        <span className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
          Legenda
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LineupChipPreview tone="talent" /> Kans: nieuw voor ons, score {talentMin}+
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LineupChipPreview tone="home" /> Stond al bij Thuishaven
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LineupChipPreview tone="plain" /> Overige namen
        </span>
      </div>

      <div className="space-y-3 border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={when}
            onChange={setWhen}
            options={[
              { id: "upcoming", label: "Aankomend" },
              { id: "past", label: "Afgelopen 30 dagen" },
            ]}
          />
          <button
            type="button"
            onClick={() => setIntakeOpen((v) => !v)}
            className={cn(
              "border px-3 py-1.5 text-xs font-medium",
              intakeOpen
                ? "border-text bg-text text-bg"
                : "border-border hover:border-text",
            )}
          >
            {intakeOpen ? "Sluiten" : "+ Line-up handmatig toevoegen"}
          </button>
        </div>

        {intakeOpen ? (
          <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-[1fr_16rem]">
            <PartyIngestForm
              venueId={intakeVenue || null}
              venueName={venues.find((v) => v.id === intakeVenue)?.name}
            />
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
                  Bij welke venue?
                </span>
                <select
                  value={intakeVenue}
                  onChange={(e) => setIntakeVenue(e.target.value)}
                  className="w-full border border-border bg-bg px-2 py-2"
                >
                  <option value="">Geen venue</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs leading-relaxed text-text-muted">
                Voor een line-up die Radar zelf niet vindt, bijvoorbeeld een
                flyer of een story. Plak één naam per regel. Nieuwe namen komen
                direct op de artiestenlijst.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <div role="tablist" className="flex flex-wrap gap-1">
            {focusTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={focus === t.id}
                onClick={() => setFocus(t.id)}
                disabled={t.n === 0 && t.id !== "alle"}
                className={cn(
                  "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40",
                  focus === t.id
                    ? "border-text bg-text text-bg"
                    : "border-border hover:border-text",
                )}
              >
                {t.label}
                <span className="tabular-nums opacity-70">{t.n}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={venueFilter}
              onChange={(e) => setVenueFilter(e.target.value)}
              className="border border-border bg-bg px-2 py-1.5 text-xs"
              aria-label="Venue"
            >
              <option value="">Alle venues</option>
              {venueOptions.map(([id, v]) => (
                <option key={id} value={id}>
                  {v.name} ({v.n})
                </option>
              ))}
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek artiest of feest"
              className="w-44 border border-border bg-bg px-2 py-1.5 text-xs"
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">
          <span className="font-medium text-text tabular-nums">{shown.length}</span>{" "}
          feesten ·{" "}
          <span className="font-medium text-text tabular-nums">{totalTalent}</span>{" "}
          kansen in de line-ups
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-text-muted">
          {focus === "review"
            ? "Niets te reviewen. Feesten van website en Instagram die Radar niet zeker weet komen hier."
            : "Geen feesten met deze filters."}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(([key, parties]) => (
            <section key={key}>
              <h2 className="sticky top-0 z-10 mb-2 flex items-baseline justify-between border-b border-border bg-bg py-2">
                <span className="font-display text-lg tracking-[0.04em]">
                  {key === "onbekend"
                    ? "Datum onbekend"
                    : dayLabel(key, todayKey, tomorrowKey)}
                </span>
                <span className="text-xs text-text-dim tabular-nums">
                  {parties.length} {parties.length === 1 ? "feest" : "feesten"}
                </span>
              </h2>
              <ul className="space-y-2">
                {parties.map((p) => (
                  <PartyCard
                    key={p.id}
                    party={p}
                    isTalent={isTalent}
                    busy={busyId === p.id}
                    onStatus={(s) => setStatus(p.id, s)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Explain({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className="inline-flex size-5 items-center justify-center bg-text text-[10px] text-bg">
          {step}
        </span>
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">{body}</p>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div role="radiogroup" className="inline-flex border border-border">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => value !== o.id && onChange(o.id)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium",
            value === o.id ? "bg-text text-bg" : "hover:bg-bg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const CHIP_TONE = {
  talent: "bg-highlight text-highlight-fg",
  home: "bg-text text-bg",
  plain: "border border-border text-text",
} as const;

function LineupChipPreview({ tone }: { tone: keyof typeof CHIP_TONE }) {
  return <span className={cn("inline-block h-3 w-5", CHIP_TONE[tone])} />;
}

function PartyCard({
  party: p,
  isTalent,
  busy,
  onStatus,
}: {
  party: Party;
  isTalent: (a: Artist) => boolean;
  busy: boolean;
  onStatus: (s: RadarPartyStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [...p.artists].sort((a, b) => {
    const rank = (x: Artist) => (isTalent(x) ? 0 : x.homeGigCount > 0 ? 1 : 2);
    return rank(a) - rank(b) || (score(b) ?? -1) - (score(a) ?? -1);
  });
  const visible = expanded ? ordered : ordered.slice(0, LINEUP_PREVIEW);
  const hidden = ordered.length - visible.length;
  const time = p.startsAt
    ? new Date(p.startsAt).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Amsterdam",
      })
    : null;

  return (
    <li
      className={cn(
        "border border-border bg-surface px-3 py-3 sm:px-4",
        p.talentCount > 0 && "shadow-[inset_3px_0_0_var(--color-highlight)]",
        p.status === "rejected" && "opacity-50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {p.venueId ? (
              <Link
                href={`/radar/venues/${p.venueId}`}
                className="font-medium hover:underline"
              >
                {p.venueName ?? "Venue"}
              </Link>
            ) : (
              <span className="font-medium">Geen venue</span>
            )}
            {p.venueKind === "festival" ? (
              <RadarBadgePill tone="muted">Festival</RadarBadgePill>
            ) : null}
            {p.talentCount > 0 ? (
              <RadarBadgePill tone="new">
                {p.talentCount} {p.talentCount === 1 ? "kans" : "kansen"}
              </RadarBadgePill>
            ) : null}
            {p.homeArtistCount > 0 ? (
              <RadarBadgePill tone="home">{p.homeArtistCount}× TH</RadarBadgePill>
            ) : null}
            {p.status === "needs_review" ? (
              <RadarBadgePill tone="warn">Te reviewen</RadarBadgePill>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {[time, p.title !== p.venueName ? p.title : null, p.city]
              .filter(Boolean)
              .join(" · ")}
            <span className="text-text-dim">
              {" "}
              · {RADAR_PARTY_SOURCE_NL[p.source] ?? p.source} · {p.artistCount}{" "}
              namen
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {p.status === "needs_review" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus("published")}
                className="border border-text bg-text px-2 py-1 text-xs text-bg disabled:opacity-50"
              >
                Klopt
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus("rejected")}
                className="border border-border px-2 py-1 text-xs hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Afwijzen
              </button>
            </>
          ) : null}
          {p.externalUrl ? (
            <a
              href={p.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="border border-border px-2 py-1 text-xs hover:border-text"
            >
              Bron ↗
            </a>
          ) : null}
        </div>
      </div>

      {ordered.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {visible.map((a, i) => {
            const tone = isTalent(a) ? "talent" : a.homeGigCount > 0 ? "home" : "plain";
            const s = score(a);
            const inner = (
              <>
                {a.name}
                {s != null ? (
                  <span className="tabular-nums opacity-60">{s}</span>
                ) : null}
              </>
            );
            const cls = cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs",
              CHIP_TONE[tone],
            );
            return (
              <li key={`${a.id ?? a.name}-${i}`}>
                {a.id ? (
                  <Link
                    href={`/radar/artiesten/${a.id}`}
                    className={cn(cls, "hover:opacity-80")}
                    title={
                      tone === "home"
                        ? `Stond al ${a.homeGigCount}× bij Thuishaven`
                        : tone === "talent"
                          ? "Nieuw voor Thuishaven, hoge score"
                          : undefined
                    }
                  >
                    {inner}
                  </Link>
                ) : (
                  <span className={cls}>{inner}</span>
                )}
              </li>
            );
          })}
          {hidden > 0 || expanded ? (
            <li>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="px-2 py-0.5 text-xs text-text-muted underline hover:text-text"
              >
                {expanded ? "Minder" : `+${hidden} meer`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-text-dim">Nog geen line-up bekend.</p>
      )}
    </li>
  );
}
