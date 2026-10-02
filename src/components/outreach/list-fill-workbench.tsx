"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APOLLO_EMPLOYEE_RANGES,
  DEFAULT_APOLLO_CRITERIA,
  DISTANCE_SLIDER_STOPS,
  SEARCH_ZONES,
  boundsFromEmployeeRanges,
  criteriaSummary,
  distanceIndexForPreset,
  formatEmployeeBounds,
  keywordKey,
  normalizeCriteria,
  presetForDistanceIndex,
  readyDistanceStops,
  sliceKey,
  slicesForCriteria,
  type ApolloSearchCriteria,
} from "@/lib/integrations/apollo/criteria";
import {
  APOLLO_PAGE_SIZE,
  OUTREACH_RATES,
  formatEurFromCents,
} from "@/lib/outreach/batch-costs";
import type { SliceState } from "@/lib/outreach/search-coverage";

type Props = {
  pendingKvk: number;
  pendingEmail: number;
  pendingPeople: number;
  pendingHunter: number;
  pendingHeadcount: number;
  apolloReady: boolean;
  hunterReady: boolean;
  kvkReady: boolean;
  companyCount: number;
  withEmailCount: number;
  outOfRegionCount: number;
  apolloOnList: number;
  coverage: SliceState[];
  initialCriteria?: Partial<ApolloSearchCriteria> | null;
};

/** Dual-thumb range over Apollo bucket indices (0 … n-1). */
function employeeIndexSpan(ranges: string[]): { lo: number; hi: number } {
  const idxs = APOLLO_EMPLOYEE_RANGES.map((r, i) =>
    ranges.includes(r.id) ? i : -1,
  ).filter((i) => i >= 0);
  if (idxs.length === 0) return { lo: 1, hi: 3 };
  return { lo: Math.min(...idxs), hi: Math.max(...idxs) };
}

function rangesFromIndexSpan(lo: number, hi: number): string[] {
  const a = Math.max(0, Math.min(lo, hi));
  const b = Math.min(APOLLO_EMPLOYEE_RANGES.length - 1, Math.max(lo, hi));
  return APOLLO_EMPLOYEE_RANGES.slice(a, b + 1).map((r) => r.id);
}

function pagesLeftFor(s: SliceState | undefined): number | null {
  if (!s) return null;
  if (s.done) return 0;
  if (s.total == null) return null;
  return Math.max(0, Math.ceil(s.total / APOLLO_PAGE_SIZE) - s.pagesFetched);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

export function ListFillWorkbench({
  pendingKvk,
  pendingEmail,
  pendingPeople,
  pendingHunter,
  pendingHeadcount,
  apolloReady,
  hunterReady,
  kvkReady,
  companyCount,
  withEmailCount,
  outOfRegionCount,
  apolloOnList,
  coverage: initialCoverage,
  initialCriteria,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<ApolloSearchCriteria>(() =>
    normalizeCriteria(initialCriteria ?? DEFAULT_APOLLO_CRITERIA),
  );
  const [keywords, setKeywords] = useState(
    () => (initialCriteria?.keywordTags ?? []).join(", "),
  );
  const [coverage, setCoverage] = useState<Record<string, SliceState>>(() =>
    Object.fromEntries(initialCoverage.map((s) => [s.key, s])),
  );

  const keywordTags = keywords
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  function criteriaBody(): ApolloSearchCriteria {
    return { ...criteria, keywordTags };
  }

  const activeCriteria = { ...criteria, keywordTags };
  const activeKw = keywordKey(keywordTags);
  const selectedSlices = slicesForCriteria(activeCriteria);
  const selectedKeys = new Set(selectedSlices.map((s) => s.key));

  const plan = (() => {
    let uncounted = 0;
    let knownPages = 0;
    let unknownSlices = 0;
    let doneSlices = 0;
    let total = 0;
    let fetched = 0;
    for (const s of selectedSlices) {
      const st = coverage[s.key];
      if (!st || st.total == null) uncounted += 1;
      else total += st.total;
      if (st) fetched += st.seen;
      const left = pagesLeftFor(st);
      if (left === 0) doneSlices += 1;
      else if (left == null) unknownSlices += 1;
      else knownPages += left;
    }
    return {
      uncounted,
      knownPages,
      unknownSlices,
      doneSlices,
      total,
      fetched,
      allDone: doneSlices === selectedSlices.length,
    };
  })();

  const pastSearches = useMemo(() => {
    const byKw = new Map<string, { keywords: string[]; slices: SliceState[] }>();
    for (const s of Object.values(coverage)) {
      const k = keywordKey(s.keywords);
      const entry = byKw.get(k) ?? { keywords: s.keywords, slices: [] };
      entry.slices.push(s);
      byKw.set(k, entry);
    }
    return [...byKw.entries()]
      .map(([k, v]) => ({
        key: k,
        keywords: v.keywords,
        created: v.slices.reduce((n, s) => n + s.created, 0),
        seen: v.slices.reduce((n, s) => n + s.seen, 0),
        done: v.slices.filter((s) => s.done).length,
        slices: v.slices.length,
        lastRunAt: v.slices
          .map((s) => s.lastRunAt)
          .filter(Boolean)
          .sort()
          .at(-1),
      }))
      .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  }, [coverage]);

  const fetchCents =
    (plan.knownPages + plan.unknownSlices) * OUTREACH_RATES.apolloCreditCents;

  const fillCost = useMemo(() => {
    const lines: { label: string; n: number; cents: number }[] = [];
    if (pendingHeadcount > 0) {
      lines.push({
        label: "Apollo mdw",
        n: pendingHeadcount,
        cents: pendingHeadcount * OUTREACH_RATES.apolloCreditCents,
      });
    }
    if (pendingKvk > 0) {
      lines.push({
        label: "KvK",
        n: pendingKvk,
        cents:
          pendingKvk *
          OUTREACH_RATES.kvkCallsPerCompany *
          OUTREACH_RATES.kvkCallCents,
      });
    }
    if (pendingPeople > 0) {
      lines.push({
        label: "Contactpersonen",
        n: pendingPeople,
        cents: pendingPeople * OUTREACH_RATES.apolloCreditCents,
      });
    }
    if (pendingHunter > 0) {
      lines.push({
        label: "Hunter-mail",
        n: pendingHunter,
        cents: pendingHunter * OUTREACH_RATES.hunterSearchCents,
      });
    }
    if (pendingEmail > 0) {
      lines.push({
        label: "Website-mail",
        n: pendingEmail,
        cents: 0,
      });
    }
    const totalCents = lines.reduce((s, l) => s + l.cents, 0);
    return { lines, totalCents };
  }, [
    pendingHeadcount,
    pendingKvk,
    pendingPeople,
    pendingHunter,
    pendingEmail,
  ]);

  const openWork =
    pendingKvk +
    pendingPeople +
    pendingHunter +
    pendingEmail +
    pendingHeadcount;

  const empSpan = employeeIndexSpan(criteria.employeeRanges);
  const empBounds = boundsFromEmployeeRanges(criteria.employeeRanges);
  const distanceIdx = distanceIndexForPreset(criteria.placePreset);

  function setEmployeeSpan(lo: number, hi: number) {
    setCriteria((c) => ({
      ...c,
      employeeRanges: rangesFromIndexSpan(lo, hi),
    }));
  }

  function mergeCoverage(d: Record<string, unknown>) {
    if (!Array.isArray(d.coverage)) return;
    const states = d.coverage as SliceState[];
    setCoverage((prev) => {
      const next = { ...prev };
      for (const s of states) next[s.key] = s;
      return next;
    });
  }

  function run(
    path: string,
    body: Record<string, unknown>,
    success: (data: Record<string, unknown>) => string,
  ) {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Actie mislukt",
        );
        return;
      }
      setOk(success(data));
      router.refresh();
    });
  }

  function count(recount = false) {
    run(
      "/api/outreach/discover",
      { countOnly: true, recount, criteria: criteriaBody() },
      (d) => {
        mergeCoverage(d);
        const counted = Number(d.counted ?? 0);
        const total = Number(d.total ?? 0);
        return counted === 0
          ? "Alles was al geteld — geen credits gebruikt."
          : `${counted} segment${counted === 1 ? "" : "en"} geteld · Apollo vindt ~${total.toLocaleString("nl-NL")} binnen deze filters`;
      },
    );
  }

  function fetchNew() {
    run(
      "/api/outreach/discover",
      { apply: true, drain: true, criteria: criteriaBody() },
      (d) => {
        mergeCoverage(d);
        const pages = Number(d.pages ?? 0);
        const cost =
          typeof d.estimatedCostCents === "number"
            ? ` · ~${formatEurFromCents(d.estimatedCostCents)}`
            : "";
        const base = `${Number(d.created ?? 0)} nieuw · ${Number(d.duplicate ?? 0)} stonden al · ${pages} Apollo-pagina’s${cost}`;
        return d.done === true
          ? `${base} · alles binnen voor deze filters`
          : `${base} · nog niet alles (klik nogmaals)`;
      },
    );
  }

  function autoFill() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/auto-fill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          discover: false,
          fillHeadcounts: true,
          criteria: criteriaBody(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Aanvullen mislukt",
        );
        return;
      }
      const parts = [
        Number(data.headcountFilled ?? 0)
          ? `${Number(data.headcountFilled)} mdw`
          : null,
        `KvK ${Number(data.kvkOk ?? 0)}`,
        `contacten ${Number(data.peopleFilled ?? 0)}`,
        `mails ${Number(data.hunterFilled ?? 0) + Number(data.websiteFilled ?? 0)}`,
      ].filter(Boolean);
      setOk(parts.join(" · "));
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* Stand */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-border pb-4 text-sm">
        <p>
          <span className="text-text-dim">Op de lijst</span>{" "}
          <strong className="font-display text-lg text-text">{companyCount}</strong>
        </p>
        <p>
          <span className="text-text-dim">Met e-mail</span>{" "}
          <strong className="text-text">{withEmailCount}</strong>
        </p>
        <p>
          <span className="text-text-dim">Via Apollo</span>{" "}
          <strong className="text-text">{apolloOnList}</strong>
        </p>
        {!apolloReady ? (
          <StatusBadge tone="danger">Apollo niet gekoppeld</StatusBadge>
        ) : null}
      </div>

      {/* Filters */}
      <section>
        <h2 className="font-display text-xl tracking-[0.06em]">
          1 · Wat zoeken we?
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Wat al binnen is, halen we niet opnieuw op. Een grotere afstand pakt
          alleen de extra ring.
        </p>

        <div className="mt-5 max-w-md">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-text-dim">
              Afstand vanaf Amsterdam
            </p>
            <p className="text-sm text-text">
              {readyDistanceStops()[distanceIdx]?.label ?? "~50 km"}
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={readyDistanceStops().length - 1}
            step={1}
            value={distanceIdx}
            disabled={pending}
            onChange={(e) =>
              setCriteria((c) => ({
                ...c,
                placePreset: presetForDistanceIndex(Number(e.target.value)),
              }))
            }
            className="mt-2 w-full accent-accent"
            aria-label="Afstand"
          />
          <div className="mt-1 flex justify-between text-[11px] text-text-dim">
            {DISTANCE_SLIDER_STOPS.map((s) => (
              <span
                key={`${s.km}-${s.label}`}
                className={s.ready ? undefined : "opacity-40"}
                title={s.ready ? undefined : "Binnenkort — meer plaatsen"}
              >
                {s.label}
              </span>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-text-dim">
            Nu tot ~50 km; grotere ring volgt later beschikbaar.
          </p>
        </div>

        <div className="mt-6 max-w-md">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-text-dim">
              Medewerkers
            </p>
            <p className="text-sm text-text">
              {formatEmployeeBounds(empBounds.min, empBounds.max)}
            </p>
          </div>
          <div className="relative mt-3 h-6">
            <div className="pointer-events-none absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 bg-border" />
            <div
              className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 bg-accent/70"
              style={{
                left: `${(empSpan.lo / (APOLLO_EMPLOYEE_RANGES.length - 1)) * 100}%`,
                right: `${((APOLLO_EMPLOYEE_RANGES.length - 1 - empSpan.hi) / (APOLLO_EMPLOYEE_RANGES.length - 1)) * 100}%`,
              }}
            />
            <input
              type="range"
              min={0}
              max={APOLLO_EMPLOYEE_RANGES.length - 1}
              step={1}
              value={empSpan.lo}
              disabled={pending}
              onChange={(e) => {
                const lo = Number(e.target.value);
                setEmployeeSpan(lo, Math.max(lo, empSpan.hi));
              }}
              className="absolute inset-0 z-20 w-full appearance-none bg-transparent accent-accent [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
              aria-label="Minimum medewerkers"
            />
            <input
              type="range"
              min={0}
              max={APOLLO_EMPLOYEE_RANGES.length - 1}
              step={1}
              value={empSpan.hi}
              disabled={pending}
              onChange={(e) => {
                const hi = Number(e.target.value);
                setEmployeeSpan(Math.min(empSpan.lo, hi), hi);
              }}
              className="absolute inset-0 z-10 w-full appearance-none bg-transparent accent-accent [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30"
              aria-label="Maximum medewerkers"
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-text-dim">
            <span>{APOLLO_EMPLOYEE_RANGES[0]?.label}</span>
            <span>
              {APOLLO_EMPLOYEE_RANGES[APOLLO_EMPLOYEE_RANGES.length - 1]?.label}
            </span>
          </div>
        </div>

        <label className="mt-6 block text-[11px] uppercase tracking-wider text-text-dim">
          Keywords (optioneel — elke keyword-set is een eigen zoekopdracht)
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="bijv. software, fintech"
            className="mt-1.5 block w-full max-w-sm border border-border bg-bg px-3 py-1.5 text-sm normal-case tracking-normal text-text"
          />
        </label>
      </section>

      {/* Coverage grid */}
      <section className="border-t border-border pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl tracking-[0.06em]">
            2 · Zoekdekking
          </h2>
          <p className="text-xs text-text-dim">
            {activeKw ? `Keywords: ${keywordTags.join(", ")}` : "Zonder keywords"}
          </p>
        </div>

        <ul className="mt-4 space-y-1 text-sm text-text-muted">
          <li>
            Al op de lijst:{" "}
            <strong className="text-text">{companyCount}</strong>
          </li>
          <li>
            Deze filters:{" "}
            <strong className="text-text">{plan.doneSlices}</strong> van{" "}
            {selectedSlices.length} zones binnen
            {plan.doneSlices < selectedSlices.length ? (
              <>
                {" "}
                · nog{" "}
                <strong className="text-text">
                  {selectedSlices.length - plan.doneSlices}
                </strong>{" "}
                nieuw
              </>
            ) : null}
          </li>
          {!plan.allDone ? (
            <li>
              Ophalen kost ongeveer{" "}
              <strong className="text-text">
                {formatEurFromCents(fetchCents)}
              </strong>
              {plan.unknownSlices > 0
                ? " — de prijs wordt preciezer zodra een zone een keer geteld is"
                : ""}
            </li>
          ) : (
            <li>Niets nieuws voor deze afstand en grootte.</li>
          )}
        </ul>
        <button
          type="button"
          disabled={pending || !apolloReady || plan.allDone}
          onClick={fetchNew}
          className="mt-4 bg-accent px-5 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          {pending
            ? "Bezig…"
            : plan.allDone
              ? "Alles al binnen"
              : `Haal de nieuwe op · ~${formatEurFromCents(fetchCents)}`}
        </button>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
            Per zone
          </summary>
        <div className="mt-3 overflow-x-auto border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Medewerkers</th>
                {SEARCH_ZONES.map((z) => (
                  <th key={z.id} className="px-3 py-2 font-medium" title={z.hint}>
                    {z.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {APOLLO_EMPLOYEE_RANGES.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-text-muted">{r.label}</td>
                  {SEARCH_ZONES.map((z) => {
                    const key = sliceKey(z.id, r.id, keywordTags);
                    const st = coverage[key];
                    const inSel = selectedKeys.has(key);
                    const left = pagesLeftFor(st);
                    return (
                      <td
                        key={z.id}
                        className={`px-3 py-2 align-top text-xs ${
                          inSel ? "bg-accent/5" : "opacity-50"
                        }`}
                      >
                        {!st ? (
                          <span className="text-text-dim">
                            {inSel ? "Nog niet gezocht" : "—"}
                          </span>
                        ) : st.done ? (
                          <span className="text-success">
                            ✓ Klaar · {st.created} nieuw
                            <span className="block text-text-dim">
                              {st.total ?? st.seen} bij Apollo
                              {st.lastRunAt ? ` · ${fmtDate(st.lastRunAt)}` : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-text">
                            ≈{(st.total ?? 0).toLocaleString("nl-NL")} bij Apollo
                            <span className="block text-text-dim">
                              {st.seen > 0
                                ? `${st.seen} bekeken · ${st.created} nieuw · nog ${left ?? "?"} pag.`
                                : `nog ${left ?? "?"} pag. te halen`}
                            </span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-text-dim">
          Gekleurde vakjes horen bij de gekozen filters.
        </p>
        {plan.uncounted < selectedSlices.length ? (
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={() => count(true)}
            className="mt-2 text-xs text-text-dim underline hover:text-text disabled:opacity-50"
          >
            Opnieuw tellen
          </button>
        ) : null}
        </details>

        {pastSearches.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
              Eerdere zoekopdrachten ({pastSearches.length})
            </summary>
            <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
              {pastSearches.map((p) => (
                <li
                  key={p.key || "none"}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <button
                    type="button"
                    onClick={() => setKeywords(p.keywords.join(", "))}
                    className="text-left text-text hover:text-accent"
                  >
                    {p.keywords.length ? p.keywords.join(", ") : "Zonder keywords"}
                  </button>
                  <span className="text-xs text-text-muted">
                    {p.done}/{p.slices} vakjes klaar · {p.seen} bekeken ·{" "}
                    {p.created} nieuw
                    {p.lastRunAt ? ` · ${fmtDate(p.lastRunAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="sr-only">{criteriaSummary(activeCriteria)}</p>
      </section>

      {/* Enrich */}
      <section className="border-t border-border pt-6">
        <h2 className="font-display text-xl tracking-[0.06em]">
          3 · Gegevens aanvullen
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          MdW → KvK → contacten → mail. Alleen voor wie al op de lijst staat.
        </p>

        {openWork === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Niets meer open.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
              {fillCost.lines.map((l) => (
                <li
                  key={l.label}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <span>
                    {l.label}{" "}
                    <span className="text-text-dim">({l.n})</span>
                  </span>
                  <span className="text-text-muted">
                    {l.cents === 0
                      ? "gratis"
                      : `~${formatEurFromCents(l.cents)}`}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending || openWork === 0}
              onClick={autoFill}
              className="mt-4 border border-border px-5 py-3 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
            >
              {pending
                ? "Bezig…"
                : `Aanvullen · ~${formatEurFromCents(fillCost.totalCents)}`}
            </button>
          </>
        )}

        {outOfRegionCount > 0 ? (
          <p className="mt-3 text-xs text-text-dim">
            {outOfRegionCount} buiten regio — overgeslagen bij aanvullen/mailen.
          </p>
        ) : null}
      </section>

      <details className="group border-t border-border pt-6">
        <summary className="cursor-pointer list-none text-sm text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          Handmatig per stap
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !kvkReady || pendingKvk === 0}
            onClick={() =>
              run("/api/outreach/kvk/enrich-batch", { limit: 10 }, (d) =>
                `${Number(d.processed ?? 0)} KvK`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            10× KvK
          </button>
          <button
            type="button"
            disabled={pending || !apolloReady || pendingPeople === 0}
            onClick={() =>
              run("/api/outreach/people", { limit: 8 }, (d) =>
                `${Number(d.filled ?? 0)} contacten`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            8× contacten
          </button>
          <button
            type="button"
            disabled={pending || !hunterReady || pendingHunter === 0}
            onClick={() =>
              run(
                "/api/outreach/people",
                { limit: 8, hunterEmails: true },
                (d) => `${Number(d.filled ?? 0)} Hunter`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            8× Hunter
          </button>
          <button
            type="button"
            disabled={pending || pendingEmail === 0}
            onClick={() =>
              run("/api/outreach/website-email", { limit: 8 }, (d) =>
                `${Number(d.filled ?? 0)} website-mail`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            8× website-mail
          </button>
        </div>
      </details>

      {(error || ok) && (
        <p
          className={`text-sm ${error ? "text-danger" : "text-text-muted"}`}
          role={error ? "alert" : undefined}
        >
          {error ?? ok}
        </p>
      )}

      <p className="border-t border-border pt-6 text-sm text-text-muted">
        Klaar?{" "}
        <Link href="/outreach/crm" className="text-accent underline">
          Volgende: Bedrijven
        </Link>
        .
      </p>
    </div>
  );
}
