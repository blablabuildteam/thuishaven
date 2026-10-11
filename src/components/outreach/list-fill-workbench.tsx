"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APOLLO_EMPLOYEE_RANGES,
  DEFAULT_APOLLO_CRITERIA,
  SEARCH_ZONES,
  boundsFromEmployeeRanges,
  criteriaSummary,
  distanceIndexForPreset,
  formatEmployeeBounds,
  keywordKey,
  normalizeCriteria,
  readyDistanceStops,
  sliceKey,
  slicesForCriteria,
  zoneLabel,
  zoneSliceStats,
  type ApolloSearchCriteria,
  type SearchZone,
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
  /** Werklijst: past in doelgroep, klaar om verder te gaan. */
  companyCount: number;
  withEmailCount: number;
  outOfRegionCount: number;
  /** Ooit via Apollo binnengekomen (kan hoger zijn dan companyCount). */
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
  const selectedSlices = slicesForCriteria(activeCriteria);
  const selectedKeys = new Set(selectedSlices.map((s) => s.key));
  const distanceIdx = distanceIndexForPreset(criteria.placePreset);

  function mergeCoverage(d: Record<string, unknown>) {
    if (!Array.isArray(d.coverage)) return;
    const states = d.coverage as SliceState[];
    setCoverage((prev) => {
      const next = { ...prev };
      for (const s of states) next[s.key] = s;
      return next;
    });
  }

  const plan = (() => {
    let uncounted = 0;
    let knownPages = 0;
    let unknownSlices = 0;
    let doneSlices = 0;
    let total = 0;
    let fetched = 0;
    let created = 0;
    let remaining = 0;
    for (const s of selectedSlices) {
      const st = coverage[s.key];
      if (!st || st.total == null) uncounted += 1;
      else {
        total += st.total;
        remaining += st.done ? 0 : Math.max(0, st.total - st.seen);
      }
      if (st) {
        fetched += st.seen;
        created += st.created;
      }
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
      created,
      remaining: uncounted > 0 ? null : remaining,
      allDone: doneSlices === selectedSlices.length,
    };
  })();

  /** Incremental Apollo totals per distance stop (current mdw + keywords). */
  const distanceImpact = useMemo(() => {
    const kw = keywordTags;
    return readyDistanceStops().map((stop) => {
      const zone = stop.outerZone;
      if (!zone) {
        return { stop, apollo: null as number | null, remaining: null as number | null, created: 0, uncounted: 0 };
      }
      const stats = zoneSliceStats(zone, criteria.employeeRanges, kw, coverage);
      return {
        stop,
        apollo: stats.apolloTotal,
        remaining: stats.remaining,
        created: stats.created,
        uncounted: stats.uncounted,
      };
    });
  }, [criteria.employeeRanges, keywordTags, coverage]);

  const selectionImpact = useMemo(() => {
    let cumulativeApollo = 0;
    let cumulativeKnown = true;
    let outerApollo: number | null = null;
    const selectedStop = readyDistanceStops()[distanceIdx];
    for (const row of distanceImpact) {
      const idx = readyDistanceStops().findIndex(
        (s) => s.preset === row.stop.preset,
      );
      if (idx < 0 || idx > distanceIdx) continue;
      if (row.apollo == null) {
        cumulativeKnown = false;
      } else {
        cumulativeApollo += row.apollo;
      }
      if (idx === distanceIdx) {
        outerApollo = row.apollo;
      }
    }
    return {
      selectedStop,
      cumulativeApollo: cumulativeKnown ? cumulativeApollo : null,
      outerApollo,
      fetchedInSelection: plan.fetched,
      createdInSelection: plan.created,
      openZones: selectedSlices.length - plan.doneSlices,
    };
  }, [
    distanceImpact,
    distanceIdx,
    plan.fetched,
    plan.created,
    plan.doneSlices,
    selectedSlices.length,
  ]);

  /** Waar de huidige lijst vandaan komt (uit eerdere ophaal-runs). */
  const listHistory = useMemo(() => {
    const slices = Object.values(coverage).filter(
      (s) => s.created > 0 || s.seen > 0 || s.done,
    );
    if (slices.length === 0) return null;
    const lastRunAt = slices
      .map((s) => s.lastRunAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    const zoneOrder: SearchZone[] = ["ams", "kern", "ring", "wide", "far"];
    const zones = [
      ...new Set(slices.map((s) => s.zone)),
    ].sort((a, b) => zoneOrder.indexOf(a) - zoneOrder.indexOf(b));
    const created = slices.reduce((n, s) => n + s.created, 0);
    const farthest = zones.at(-1);
    return {
      lastRunAt,
      created,
      zones,
      farthestLabel: farthest ? zoneLabel(farthest) : null,
      zoneLabels: zones.map((z) => zoneLabel(z)),
    };
  }, [coverage]);

  const countInFlight = useRef(false);
  const [counting, setCounting] = useState(false);

  // Auto-count missing slices for the full ~100 km map under the current
  // employee/keyword filters, so every distance chip can show its +N.
  useEffect(() => {
    if (!apolloReady || pending) return;
    const previewCriteria = {
      ...criteriaBody(),
      placePreset: "far" as const,
    };
    const missing = slicesForCriteria(previewCriteria).filter((s) => {
      const st = coverage[s.key];
      return !st || st.total == null;
    }).length;
    if (missing === 0) return;

    const handle = window.setTimeout(() => {
      if (countInFlight.current) return;
      countInFlight.current = true;
      setCounting(true);
      void fetch("/api/outreach/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ countOnly: true, criteria: previewCriteria }),
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          if (res.ok) mergeCoverage(data);
        })
        .finally(() => {
          countInFlight.current = false;
          setCounting(false);
        });
    }, 650);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    apolloReady,
    pending,
    criteria.employeeRanges.join(","),
    keywordTags.join(","),
    // Re-run when coverage gains totals (or still has gaps for far).
    Object.values(coverage)
      .filter((s) => s.total != null)
      .length,
  ]);

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

  const keywordSearches = pastSearches.filter(
    (p) => p.keywords.length > 0 && p.seen > 0,
  );

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
        cents: pendingPeople * 2 * OUTREACH_RATES.apolloCreditCents,
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

  function setEmployeeSpan(lo: number, hi: number) {
    setCriteria((c) => ({
      ...c,
      employeeRanges: rangesFromIndexSpan(lo, hi),
    }));
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
          ? "Alles was al geteld."
          : `Opnieuw geteld: Apollo kent ~${total.toLocaleString("nl-NL")} bedrijven voor deze keuze.`;
      },
    );
  }

  function fetchNew() {
    run(
      "/api/outreach/discover",
      { apply: true, drain: true, criteria: criteriaBody() },
      (d) => {
        mergeCoverage(d);
        const cost =
          typeof d.estimatedCostCents === "number"
            ? ` · ~${formatEurFromCents(d.estimatedCostCents)}`
            : "";
        const base = `${Number(d.created ?? 0)} nieuwe bedrijven op de lijst gezet · ${Number(d.duplicate ?? 0)} stonden er al op${cost}`;
        return d.done === true
          ? `${base}. Alles voor deze zoekopdracht is binnen — ga door naar stap 3.`
          : `${base}. Er zijn er nog meer: klik nog een keer.`;
      },
    );
  }

  const stopFill = useRef(false);
  const [filling, setFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState<string | null>(null);

  async function autoFill() {
    setError(null);
    setOk(null);
    stopFill.current = false;
    setFilling(true);
    const total = { headcount: 0, kvk: 0, people: 0, mails: 0 };
    const warnings = new Set<string>();
    try {
      for (let round = 1; round <= 40; round++) {
        setFillProgress(
          `Ronde ${round} bezig… Tot nu toe: ${total.people} contactpersonen, ${total.mails} e-mailadressen, ${total.kvk} KvK-gegevens, ${total.headcount} groottes.`,
        );
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
            typeof data.error === "string"
              ? `Gestopt: ${data.error}. Wat al gevonden is, is bewaard.`
              : "Gestopt: er ging iets mis. Wat al gevonden is, is bewaard.",
          );
          break;
        }
        const headcount = Number(data.headcountFilled ?? 0);
        const kvkProcessed = Number(data.kvkProcessed ?? 0);
        total.people += Number(data.peopleFilled ?? 0);
        total.mails +=
          Number(data.hunterFilled ?? 0) + Number(data.websiteFilled ?? 0);
        total.kvk += Number(data.kvkOk ?? 0);
        total.headcount += headcount;
        for (const w of (data.warnings as string[] | undefined) ?? []) {
          warnings.add(w);
        }
        const rounds = (data.rounds ?? {}) as Record<string, number>;
        const didWork =
          headcount > 0 ||
          kvkProcessed > 0 ||
          Object.values(rounds).some((n) => Number(n) > 0);
        router.refresh();
        if (!didWork || stopFill.current) break;
      }
      setOk(
        `${stopFill.current ? "Gestopt" : "Klaar"}: ${total.people} bedrijven met een nieuwe contactpersoon, ${total.mails} e-mailadressen gevonden, ${total.kvk} KvK-gegevens, ${total.headcount} groottes gecontroleerd.` +
          (warnings.size ? ` Let op: ${[...warnings].join(" · ")}.` : ""),
      );
    } finally {
      setFilling(false);
      setFillProgress(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border border-border bg-surface/50 p-4 text-sm text-text-muted">
        <p>
          Op deze pagina vullen we de lijst met bedrijven die we gaan mailen.
          Dat gaat in drie stappen:{" "}
          <strong className="text-text">1.</strong> je kiest welke bedrijven
          we zoeken, <strong className="text-text">2.</strong> we zetten ze
          op de lijst, en <strong className="text-text">3.</strong> we zoeken
          bij elk bedrijf de juiste persoon met een e-mailadres.
        </p>
        <p className="mt-2">
          Nu op de lijst:{" "}
          <strong className="text-text">{companyCount}</strong> bedrijven, waarvan{" "}
          <strong className="text-text">{withEmailCount}</strong> met een
          e-mailadres
          {listHistory?.lastRunAt
            ? ` · laatst nieuwe bedrijven toegevoegd op ${fmtDate(listHistory.lastRunAt)}`
            : ""}
          .
          {!apolloReady ? (
            <span className="ml-2">
              <StatusBadge tone="danger">Apollo niet gekoppeld</StatusBadge>
            </span>
          ) : null}
        </p>
      </div>

      {/* Filters */}
      <section>
        <h2 className="font-display text-xl tracking-[0.06em]">
          1 · Welke bedrijven zoeken we?
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          We zoeken in Apollo, een grote database met bedrijfsgegevens. Kies
          hoe ver vanaf Amsterdam en hoe groot de bedrijven moeten zijn. De
          getallen laten zien hoeveel bedrijven Apollo daar kent.
        </p>

        <div className="mt-5">
          <p className="text-sm font-medium text-text">
            Hoe ver vanaf Amsterdam?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {distanceImpact.map((row, i) => {
              const towns = SEARCH_ZONES.find(
                (z) => z.id === row.stop.outerZone,
              )?.hint;
              const delta =
                row.apollo == null
                  ? counting
                    ? "tellen…"
                    : "nog niet geteld"
                  : i === 0
                    ? `~${row.apollo.toLocaleString("nl-NL")} bedrijven`
                    : `+${row.apollo.toLocaleString("nl-NL")} extra`;
              return (
                <button
                  key={row.stop.preset}
                  type="button"
                  disabled={pending || filling}
                  title={towns}
                  onClick={() =>
                    setCriteria((c) => ({
                      ...c,
                      placePreset: row.stop.preset,
                    }))
                  }
                  className={`max-w-[11rem] px-3 py-1.5 text-left text-sm ${
                    distanceIdx === i
                      ? "border border-accent bg-accent/10"
                      : "border border-border text-text-muted hover:border-accent"
                  }`}
                >
                  <span className="block">
                    {i === 0 ? "Alleen Amsterdam" : `Tot ${row.stop.label}`}
                  </span>
                  {towns && i > 0 ? (
                    <span className="block truncate text-[11px] text-text-dim">
                      {towns}
                    </span>
                  ) : null}
                  <span
                    className={`mt-0.5 block text-[11px] tabular-nums ${
                      distanceIdx === i ? "text-text" : "text-text-dim"
                    }`}
                  >
                    {delta}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-text-dim">
            Elke stap verder telt de bedrijven van de stappen ervoor mee.
          </p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-text">
            Hoeveel medewerkers?
          </p>
          <p className="mt-0.5 text-xs text-text-dim">
            Grotere bedrijven organiseren vaker personeelsfeesten en events.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-xs text-text-dim">
              Van
              <select
                className="mt-1 block border border-border bg-bg px-3 py-2 text-sm text-text"
                value={empSpan.lo}
                disabled={pending || filling}
                onChange={(e) => {
                  const lo = Number(e.target.value);
                  setEmployeeSpan(lo, Math.max(lo, empSpan.hi));
                }}
              >
                {APOLLO_EMPLOYEE_RANGES.map((r, i) => (
                  <option key={r.id} value={i}>
                    {r.label.split("–")[0]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-dim">
              Tot
              <select
                className="mt-1 block border border-border bg-bg px-3 py-2 text-sm text-text"
                value={empSpan.hi}
                disabled={pending || filling}
                onChange={(e) => {
                  const hi = Number(e.target.value);
                  setEmployeeSpan(Math.min(empSpan.lo, hi), hi);
                }}
              >
                {APOLLO_EMPLOYEE_RANGES.map((r, i) => (
                  <option key={r.id} value={i}>
                    {r.label.split("–")[1] ?? r.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="pb-2 text-sm text-text-muted">medewerkers</span>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="text-sm font-medium text-text">
            Alleen bepaalde branches?{" "}
            <span className="font-normal text-text-dim">(optioneel)</span>
          </span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="bijv. software, advocatuur, bank"
            className="mt-1.5 block w-full max-w-sm border border-border bg-bg px-3 py-1.5 text-sm text-text"
          />
          <span className="mt-1 block text-xs text-text-dim">
            Leeg laten = alle branches. Meerdere woorden scheiden met een komma.
          </span>
        </label>

        <div className="mt-6 max-w-2xl border-l-2 border-accent bg-accent/5 px-4 py-3 text-sm">
          <p className="text-text">
            Je zoekt: bedrijven met{" "}
            {formatEmployeeBounds(empBounds.min, empBounds.max)}{" "}
            {distanceIdx === 0
              ? "in Amsterdam"
              : `tot ${selectionImpact.selectedStop?.label ?? ""} van Amsterdam`}
            {keywordTags.length ? `, branche: ${keywordTags.join(", ")}` : ""}.
          </p>
          <p className="mt-1 text-text-muted">
            {selectionImpact.cumulativeApollo != null ? (
              <>
                Apollo kent er ~
                {selectionImpact.cumulativeApollo.toLocaleString("nl-NL")}.
                {plan.fetched > 0
                  ? ` Daarvan hebben we er al ${plan.fetched.toLocaleString("nl-NL")} bekeken (${plan.created} toegevoegd).`
                  : " Bedrijven die al op de lijst staan, slaan we bij het toevoegen over."}
              </>
            ) : counting ? (
              "Apollo telt hoeveel bedrijven er zijn…"
            ) : (
              "Nog niet geteld voor deze keuze."
            )}
          </p>
        </div>
      </section>

      {/* Coverage */}
      <section className="border-t border-border pt-6">
        <h2 className="font-display text-xl tracking-[0.06em]">
          2 · Bedrijven op de lijst zetten
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          We halen de bedrijven uit stap 1 op en zetten ze op de lijst. Wat
          er al op staat, bestaande klanten en bedrijven buiten de regio
          slaan we automatisch over. Dit kost Apollo-tegoed.
        </p>

        <p className="mt-3 text-sm text-text">
          {plan.allDone
            ? "Alle bedrijven voor deze zoekopdracht staan al op de lijst. Kies een grotere afstand of andere grootte om meer te vinden."
            : plan.fetched > 0
              ? `Deze zoekopdracht is deels gedaan. Verwachte kosten voor de rest: ~${formatEurFromCents(fetchCents)}.`
              : `Verwachte kosten: ~${formatEurFromCents(fetchCents)}.`}
        </p>
        <button
          type="button"
          disabled={pending || filling || !apolloReady || plan.allDone}
          onClick={fetchNew}
          className="mt-3 bg-accent px-5 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          {pending
            ? "Bezig…"
            : plan.allDone
              ? "Alles staat al op de lijst"
              : `Bedrijven toevoegen · ~${formatEurFromCents(fetchCents)}`}
        </button>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
            Details: wat is waar al gezocht?
          </summary>
          <p className="mt-2 text-xs text-text-dim">
            Per afstand en grootte: hoeveel bedrijven Apollo kent, hoeveel we
            al bekeken hebben en hoeveel er nieuw op de lijst kwamen. De
            gekleurde vakjes horen bij je huidige keuze.
          </p>
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
                              ✓ Klaar · {st.created} toegevoegd
                              <span className="block text-text-dim">
                                van {st.total ?? st.seen} bij Apollo
                                {st.lastRunAt ? ` · ${fmtDate(st.lastRunAt)}` : ""}
                              </span>
                            </span>
                          ) : (
                            <span className="text-text">
                              ~{(st.total ?? 0).toLocaleString("nl-NL")} bij Apollo
                              <span className="block text-text-dim">
                                {st.seen > 0
                                  ? `${st.seen} bekeken · ${st.created} toegevoegd`
                                  : "nog niet bekeken"}
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
          {plan.uncounted < selectedSlices.length ? (
            <button
              type="button"
              disabled={pending || !apolloReady}
              onClick={() => count(true)}
              className="mt-2 text-xs text-text-dim underline hover:text-text disabled:opacity-50"
            >
              Aantallen opnieuw tellen (gratis)
            </button>
          ) : null}
        </details>

        {keywordSearches.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
              Eerder gezocht op branche ({keywordSearches.length})
            </summary>
            <p className="mt-2 text-xs text-text-dim">
              Klik op een zoekopdracht om die branches weer in te vullen.
            </p>
            <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
              {keywordSearches.map((p) => (
                <li
                  key={p.key || "none"}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <button
                    type="button"
                    onClick={() => setKeywords(p.keywords.join(", "))}
                    className="text-left text-text hover:text-accent"
                  >
                    {p.keywords.length ? p.keywords.join(", ") : "Alle branches"}
                  </button>
                  <span className="text-xs text-text-muted">
                    {p.seen} bekeken · {p.created} toegevoegd
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
          3 · De juiste persoon en het e-mailadres zoeken
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Voor elk bedrijf op de lijst zoeken we automatisch wat nodig is
          voor een goede, persoonlijke mail. Dat gebeurt in deze volgorde:
        </p>

        <ol className="mt-4 max-w-2xl divide-y divide-border border-y border-border text-sm">
          {[
            {
              title: "Grootte controleren",
              what: "Hoeveel medewerkers het bedrijf echt heeft, zodat we alleen bedrijven mailen die bij Thuishaven passen.",
              n: pendingHeadcount,
              cents: pendingHeadcount * OUTREACH_RATES.apolloCreditCents,
            },
            {
              title: "KvK-gegevens ophalen",
              what: "Oprichtingsjaar en vestigingsplaats uit het Handelsregister. Het oprichtingsjaar gebruiken we voor jubileum-mails.",
              n: pendingKvk,
              cents:
                pendingKvk *
                OUTREACH_RATES.kvkCallsPerCompany *
                OUTREACH_RATES.kvkCallCents,
            },
            {
              title: "De juiste persoon vinden",
              what: "Eerst een Event Manager, dan een Office- of Facility Manager, anders een (directie)assistent. HR, sales en directie slaan we over.",
              n: pendingPeople,
              cents: pendingPeople * 2 * OUTREACH_RATES.apolloCreditCents,
            },
            {
              title: "Persoonlijk e-mailadres zoeken",
              what: "Kennen we de persoon wel maar het adres nog niet, dan zoekt Hunter het adres erbij.",
              n: pendingHunter,
              cents: pendingHunter * OUTREACH_RATES.hunterSearchCents,
            },
            {
              title: "Algemeen adres van de website",
              what: "Staat er geen e-mailadres bij het bedrijf, dan zoeken we op de website naar bijvoorbeeld events@ of info@.",
              n: pendingEmail,
              cents: 0,
            },
          ].map((step, i) => (
            <li key={step.title} className="flex gap-3 py-3">
              <span className="mt-0.5 font-display text-text-dim">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text">{step.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">{step.what}</p>
              </div>
              <span className="shrink-0 text-right text-xs">
                {step.n === 0 ? (
                  <span className="text-success">✓ klaar</span>
                ) : (
                  <>
                    <span className="block text-text">{step.n} te doen</span>
                    <span className="block text-text-dim">
                      {step.cents === 0
                        ? "gratis"
                        : `~${formatEurFromCents(step.cents)}`}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 max-w-2xl text-xs text-text-dim">
          Vlak voordat een mail geschreven wordt, controleren we nog of het
          e-mailadres echt bestaat. Bestaat het niet, dan slaan we het over.
        </p>

        {openWork === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            Alles is aangevuld. Ga door naar Bedrijven om te mailen.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || filling}
              onClick={() => void autoFill()}
              className="bg-accent px-5 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
            >
              {filling
                ? "Bezig…"
                : `Start aanvullen · ~${formatEurFromCents(fillCost.totalCents)}`}
            </button>
            {filling ? (
              <button
                type="button"
                onClick={() => {
                  stopFill.current = true;
                }}
                className="border border-border px-4 py-2.5 text-sm text-text-muted hover:border-accent hover:text-text"
              >
                Stoppen na deze ronde
              </button>
            ) : null}
          </div>
        )}
        {fillProgress ? (
          <p className="mt-2 text-sm text-text-muted" role="status">
            {fillProgress}
          </p>
        ) : openWork > 0 ? (
          <p className="mt-2 max-w-2xl text-xs text-text-dim">
            Dit loopt in rondes van ongeveer een minuut en kan even duren. Je
            kunt altijd stoppen; wat al gevonden is, blijft bewaard.
          </p>
        ) : null}

        {outOfRegionCount > 0 ? (
          <p className="mt-3 text-xs text-text-dim">
            {outOfRegionCount} bedrijven liggen buiten de regio en slaan we
            over.
          </p>
        ) : null}
      </section>

      <details className="group border-t border-border pt-6">
        <summary className="cursor-pointer list-none text-sm text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          Eén stap los uitvoeren (geavanceerd)
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || filling || !kvkReady || pendingKvk === 0}
            onClick={() =>
              run("/api/outreach/kvk/enrich-batch", { limit: 10 }, (d) =>
                `KvK opgehaald voor ${Number(d.processed ?? 0)} bedrijven`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            KvK · 10 bedrijven
          </button>
          <button
            type="button"
            disabled={pending || filling || !apolloReady || pendingPeople === 0}
            onClick={() =>
              run("/api/outreach/people", { limit: 8 }, (d) =>
                `${Number(d.filled ?? 0)} bedrijven met een nieuwe contactpersoon`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            Persoon zoeken · 8 bedrijven
          </button>
          <button
            type="button"
            disabled={pending || filling || !hunterReady || pendingHunter === 0}
            onClick={() =>
              run(
                "/api/outreach/people",
                { limit: 8, hunterEmails: true },
                (d) => `${Number(d.filled ?? 0)} e-mailadressen via Hunter`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            Adres via Hunter · 8
          </button>
          <button
            type="button"
            disabled={pending || filling || pendingEmail === 0}
            onClick={() =>
              run("/api/outreach/website-email", { limit: 8 }, (d) =>
                `${Number(d.filled ?? 0)} adressen van websites`,
              )
            }
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            Adres van website · 8
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
