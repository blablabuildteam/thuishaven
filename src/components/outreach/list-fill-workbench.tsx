"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APOLLO_EMPLOYEE_RANGES,
  DEFAULT_APOLLO_CRITERIA,
  criteriaSummary,
  normalizeCriteria,
  type ApolloSearchCriteria,
  type PlacePreset,
} from "@/lib/integrations/apollo/criteria";
import {
  APOLLO_PAGE_SIZE,
  OUTREACH_RATES,
  formatEurFromCents,
} from "@/lib/outreach/batch-costs";

type Props = {
  pendingKvk: number;
  pendingEmail: number;
  pendingPeople: number;
  pendingHunter: number;
  pendingHeadcount: number;
  apolloReady: boolean;
  hunterReady: boolean;
  kvkReady: boolean;
  apolloNextPage: number;
  companyCount: number;
  withEmailCount: number;
  outOfRegionCount: number;
  apolloUniverseTotal: number;
  apolloUniverseCheckedAt: string | null;
  apolloUniverseLabel: string;
  apolloOnList: number;
  initialCriteria?: Partial<ApolloSearchCriteria> | null;
};

const PLACE_OPTIONS: { id: PlacePreset; label: string; hint: string }[] = [
  {
    id: "ring",
    label: "Amsterdam + ~50 km",
    hint: "Volledige ring (standaard)",
  },
  {
    id: "kern",
    label: "Kern",
    hint: "Amsterdam, Amstelveen, Schiphol, Zaandam…",
  },
  {
    id: "amsterdam",
    label: "Alleen Amsterdam",
    hint: "Strakste filter",
  },
];

export function ListFillWorkbench({
  pendingKvk,
  pendingEmail,
  pendingPeople,
  pendingHunter,
  pendingHeadcount,
  apolloReady,
  hunterReady,
  kvkReady,
  apolloNextPage,
  companyCount,
  withEmailCount,
  outOfRegionCount,
  apolloUniverseTotal,
  apolloUniverseCheckedAt,
  apolloUniverseLabel,
  apolloOnList,
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
  const [universeTotal, setUniverseTotal] = useState(apolloUniverseTotal);
  const [universeLabel, setUniverseLabel] = useState(apolloUniverseLabel);
  const [universeCheckedAt, setUniverseCheckedAt] = useState(
    apolloUniverseCheckedAt,
  );

  function criteriaBody(): ApolloSearchCriteria {
    return {
      ...criteria,
      keywordTags: keywords
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    };
  }

  const activeLabel = criteriaSummary({
    ...criteria,
    keywordTags: keywords
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8),
  });

  const remainingApprox =
    universeTotal > 0 ? Math.max(0, universeTotal - apolloOnList) : null;
  const pagesLeft =
    remainingApprox != null
      ? Math.max(1, Math.ceil(remainingApprox / APOLLO_PAGE_SIZE))
      : universeTotal > 0
        ? Math.max(1, Math.ceil(universeTotal / APOLLO_PAGE_SIZE) - (apolloNextPage - 1))
        : null;
  const fetchAllCredits = pagesLeft ?? (universeTotal > 0 ? Math.ceil(universeTotal / APOLLO_PAGE_SIZE) : null);
  const fetchAllCents =
    fetchAllCredits != null
      ? fetchAllCredits * OUTREACH_RATES.apolloCreditCents
      : null;

  const fillCost = useMemo(() => {
    const lines: { label: string; n: number; cents: number; payer: string }[] =
      [];
    if (pendingHeadcount > 0) {
      lines.push({
        label: "Apollo mdw",
        n: pendingHeadcount,
        cents: pendingHeadcount * OUTREACH_RATES.apolloCreditCents,
        payer: "onze",
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
        payer: "hun",
      });
    }
    if (pendingPeople > 0) {
      lines.push({
        label: "Contactpersonen",
        n: pendingPeople,
        cents: pendingPeople * OUTREACH_RATES.apolloCreditCents,
        payer: "onze",
      });
    }
    if (pendingHunter > 0) {
      lines.push({
        label: "Hunter-mail",
        n: pendingHunter,
        cents: pendingHunter * OUTREACH_RATES.hunterSearchCents,
        payer: "onze",
      });
    }
    if (pendingEmail > 0) {
      lines.push({
        label: "Website-mail",
        n: pendingEmail,
        cents: 0,
        payer: "gratis",
      });
    }
    const totalCents = lines.reduce((s, l) => s + l.cents, 0);
    const ourCents = lines
      .filter((l) => l.payer === "onze")
      .reduce((s, l) => s + l.cents, 0);
    const theirCents = lines
      .filter((l) => l.payer === "hun")
      .reduce((s, l) => s + l.cents, 0);
    return { lines, totalCents, ourCents, theirCents };
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

  function toggleRange(id: string) {
    setCriteria((c) => {
      const has = c.employeeRanges.includes(id);
      const next = has
        ? c.employeeRanges.filter((r) => r !== id)
        : [...c.employeeRanges, id];
      return {
        ...c,
        employeeRanges:
          next.length > 0 ? next : [...DEFAULT_APOLLO_CRITERIA.employeeRanges],
      };
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

  function previewCount() {
    run(
      "/api/outreach/discover",
      { countOnly: true, criteria: criteriaBody() },
      (d) => {
        const total = Number(d.total ?? 0);
        setUniverseTotal(total);
        setUniverseCheckedAt(new Date().toISOString());
        if (typeof d.criteriaLabel === "string") {
          setUniverseLabel(d.criteriaLabel);
        }
        return `Apollo vindt ~${total.toLocaleString("nl-NL")} bedrijven binnen deze filters`;
      },
    );
  }

  function fetchAll() {
    run(
      "/api/outreach/discover",
      { apply: true, drain: true, criteria: criteriaBody() },
      (d) => {
        const total = Number(d.total ?? 0);
        if (total > 0) {
          setUniverseTotal(total);
          setUniverseCheckedAt(new Date().toISOString());
        }
        if (typeof d.criteriaLabel === "string") {
          setUniverseLabel(d.criteriaLabel);
        }
        const pages = Number(d.pages ?? 0);
        const cost =
          typeof d.estimatedCostCents === "number"
            ? formatEurFromCents(d.estimatedCostCents)
            : null;
        const base = `${Number(d.created ?? 0)} nieuw · ${Number(d.duplicate ?? 0)} stonden al · ${pages} Apollo-pagina’s`;
        const done = d.done === true ? " · klaar" : " · nog niet alles (klik opnieuw)";
        return cost ? `${base}${done} · ~${cost}` : `${base}${done}`;
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

      {/* Filters + cost preview */}
      <section>
        <h2 className="font-display text-xl tracking-[0.06em]">Filters</h2>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {APOLLO_EMPLOYEE_RANGES.map((r) => {
            const on = criteria.employeeRanges.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                disabled={pending}
                onClick={() => toggleRange(r.id)}
                className={
                  on
                    ? "border border-accent bg-accent/10 px-2.5 py-1 text-sm text-text"
                    : "border border-border px-2.5 py-1 text-sm text-text-muted hover:border-accent"
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLACE_OPTIONS.map((p) => {
            const on = criteria.placePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={pending}
                title={p.hint}
                onClick={() =>
                  setCriteria((c) => ({ ...c, placePreset: p.id }))
                }
                className={
                  on
                    ? "border border-accent bg-accent/10 px-2.5 py-1 text-sm text-text"
                    : "border border-border px-2.5 py-1 text-sm text-text-muted hover:border-accent"
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords (optioneel)"
            className="w-full max-w-xs border border-border bg-bg px-3 py-1.5 text-sm text-text sm:w-56"
          />
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={previewCount}
            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            {pending ? "…" : `Tel · ${formatEurFromCents(OUTREACH_RATES.apolloCreditCents)}`}
          </button>
        </div>

        {/* Live cost / progress for these filters */}
        <div className="mt-4 border border-border bg-bg-elevated/50 px-4 py-3 text-sm dark:bg-surface">
          <p className="text-xs uppercase tracking-wider text-text-dim">
            Voor deze filters
          </p>
          {criteriaChanged ? (
            <p className="mt-1 text-text-muted">
              Filters gewijzigd t.o.v. laatste telling
              {universeLabel ? ` (“${universeLabel}”)` : ""}. Tel opnieuw om te
              zien hoeveel bedrijven Apollo vindt en wat ophalen kost.
            </p>
          ) : universeTotal > 0 ? (
            <ul className="mt-2 space-y-1 text-text-muted">
              <li>
                Apollo-match ≈{" "}
                <strong className="text-text">
                  {universeTotal.toLocaleString("nl-NL")}
                </strong>
                {universeCheckedAt
                  ? ` · geteld ${new Date(universeCheckedAt).toLocaleString("nl-NL")}`
                  : ""}
              </li>
              <li>
                Al op onze lijst:{" "}
                <strong className="text-text">{apolloOnList}</strong>
                {remainingApprox != null ? (
                  <>
                    {" "}
                    · nog ≈{" "}
                    <strong className="text-text">
                      {remainingApprox.toLocaleString("nl-NL")}
                    </strong>
                  </>
                ) : null}
              </li>
              <li>
                Pagina’s al gelopen:{" "}
                <strong className="text-text">{Math.max(0, apolloNextPage - 1)}</strong>
                {fetchAllCents != null ? (
                  <>
                    {" "}
                    · ophalen rest ≈{" "}
                    <strong className="text-text">
                      {formatEurFromCents(fetchAllCents)}
                    </strong>{" "}
                    ({fetchAllCredits} credits)
                  </>
                ) : null}
              </li>
            </ul>
          ) : (
            <p className="mt-1 text-text-muted">
              Nog geen telling. Druk op Tel (~
              {formatEurFromCents(OUTREACH_RATES.apolloCreditCents)}) om te zien
              wat ophalen kost.
            </p>
          )}
          <p className="mt-2 text-xs text-text-dim">
            Namen die we al hebben worden overgeslagen — geen dubbele rijen
            onder Bedrijven. Apollo vraagt wél opnieuw credits per pagina die we
            doorlopen.
          </p>
        </div>
      </section>

      {/* Fetch */}
      <section className="border-t border-border pt-6">
        <h2 className="font-display text-xl tracking-[0.06em]">
          Bedrijven ophalen
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Eén knop haalt alles binnen deze filters. Apollo max{" "}
          {APOLLO_PAGE_SIZE}/pagina — wij lopen die door.
        </p>
        <button
          type="button"
          disabled={pending || !apolloReady || (remainingApprox === 0 && !criteriaChanged)}
          onClick={fetchAll}
          className="mt-4 bg-accent px-5 py-3 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          {pending
            ? "Bezig…"
            : remainingApprox === 0 && !criteriaChanged
              ? "Alles al binnen voor deze telling"
              : fetchAllCents != null && !criteriaChanged
                ? `Haal rest op · ~${formatEurFromCents(fetchAllCents)}`
                : "Haal alles op"}
        </button>
        {criteriaChanged ? (
          <p className="mt-2 text-xs text-text-dim">
            Tip: eerst tellen, dan zie je hier een €-schatting.
          </p>
        ) : null}
      </section>

      {/* Enrich */}
      <section className="border-t border-border pt-6">
        <h2 className="font-display text-xl tracking-[0.06em]">
          Open items aanvullen
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
                      : `~${formatEurFromCents(l.cents)} · ${l.payer}`}
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
