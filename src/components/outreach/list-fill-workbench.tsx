"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APOLLO_EMPLOYEE_RANGES,
  DEFAULT_APOLLO_CRITERIA,
  type ApolloSearchCriteria,
  type PlacePreset,
} from "@/lib/integrations/apollo/criteria";

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
};

type Preview = {
  total: number;
  pageKeep: number;
  pageOutOfRegion: number;
  pageUnknownCity: number;
  criteriaLabel: string;
  keepSample: Array<{
    name: string;
    city: string | null;
    employeeCount: number | null;
  }>;
  droppedSample: Array<{ name: string; city: string | null }>;
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
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<ApolloSearchCriteria>({
    ...DEFAULT_APOLLO_CRITERIA,
    employeeRanges: [...DEFAULT_APOLLO_CRITERIA.employeeRanges],
    keywordTags: [],
  });
  const [keywords, setKeywords] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
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

  function toggleRange(id: string) {
    setPreview(null);
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
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countOnly: true,
          criteria: criteriaBody(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Teller mislukt",
        );
        return;
      }
      const total = Number(data.total ?? 0);
      setUniverseTotal(total);
      setUniverseLabel(
        typeof data.criteriaLabel === "string"
          ? data.criteriaLabel
          : universeLabel,
      );
      setUniverseCheckedAt(new Date().toISOString());
      setPreview({
        total,
        pageKeep: 0,
        pageOutOfRegion: 0,
        pageUnknownCity: 0,
        criteriaLabel:
          typeof data.criteriaLabel === "string"
            ? data.criteriaLabel
            : "Criteria",
        keepSample: [],
        droppedSample: [],
      });
      setOk(
        `Apollo vindt ~${total.toLocaleString("nl-NL")} bedrijven · ±${Math.ceil(total / 100)} batches`,
      );
      router.refresh();
    });
  }

  const openWork =
    pendingKvk +
    pendingPeople +
    pendingHunter +
    pendingEmail +
    pendingHeadcount;

  const remaining =
    universeTotal > 0
      ? Math.max(0, universeTotal - apolloOnList)
      : null;

  function autoFill(withDiscover: boolean) {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/auto-fill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          discover: withDiscover,
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
          typeof data.error === "string" ? data.error : "Auto-aanvullen mislukt",
        );
        return;
      }
      const discover = data.discover as
        | { created?: number; duplicate?: number }
        | undefined;
      const parts = [
        discover
          ? `${Number(discover.created ?? 0)} nieuw opgehaald`
          : null,
        Number(data.headcountFilled ?? 0)
          ? `${Number(data.headcountFilled)} mdw via Apollo`
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
      {/* Status strip — no card grid */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-4 text-sm">
        <p>
          <span className="text-text-dim">Op de lijst</span>{" "}
          <strong className="font-display text-lg tracking-[0.04em] text-text">
            {companyCount}
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Met e-mail</span>{" "}
          <strong className="text-text">{withEmailCount}</strong>
        </p>
        <p>
          <span className="text-text-dim">Open werk</span>{" "}
          <strong className="text-text">{openWork}</strong>
          <span className="ml-1 text-xs text-text-dim">
            (mdw {pendingHeadcount} · KvK {pendingKvk} · contact{" "}
            {pendingPeople} · mail {pendingHunter + pendingEmail})
          </span>
        </p>
        {universeTotal > 0 ? (
          <p>
            <span className="text-text-dim">Apollo</span>{" "}
            <strong className="text-text">
              ~{universeTotal.toLocaleString("nl-NL")}
            </strong>
            <span className="ml-1 text-xs text-text-dim">
              · {apolloOnList} binnen
              {remaining != null
                ? ` · ~${remaining.toLocaleString("nl-NL")} te gaan`
                : ""}
            </span>
          </p>
        ) : null}
        {!apolloReady ? (
          <StatusBadge tone="danger">Apollo niet gekoppeld</StatusBadge>
        ) : null}
      </div>

      {/* Primary actions */}
      <section>
        <h2 className="font-display text-xl tracking-[0.06em] text-text">
          Wat wil je doen?
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Meestal: eerst bedrijven ophalen, daarna alles automatisch aanvullen
          (KvK → contacten → e-mail).
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={() =>
              run(
                "/api/outreach/discover",
                { apply: true, criteria: criteriaBody() },
                (d) => {
                  const total = Number(d.total ?? 0);
                  if (total > 0) {
                    setUniverseTotal(total);
                    setUniverseCheckedAt(new Date().toISOString());
                    if (typeof d.criteriaLabel === "string") {
                      setUniverseLabel(d.criteriaLabel);
                    }
                  }
                  const dropped = Number(d.pageOutOfRegion ?? 0);
                  const base = `${Number(d.created ?? 0)} nieuw · ${Number(d.duplicate ?? 0)} stonden al`;
                  return dropped
                    ? `${base} · ${dropped} buiten regio overgeslagen`
                    : base;
                },
              )
            }
            className="bg-accent px-5 py-3 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : apolloNextPage > 1
                ? "Haal volgende 100 op"
                : "Haal 100 bedrijven op"}
          </button>

          <button
            type="button"
            disabled={pending || openWork === 0}
            onClick={() => autoFill(false)}
            className="border border-border bg-surface px-5 py-3 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : openWork === 0
                ? "Niets meer aan te vullen"
                : `Vul ${openWork} open items aan`}
          </button>

          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={() => autoFill(true)}
            className="border border-border px-5 py-3 font-display text-sm tracking-[0.1em] text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
          >
            {pending ? "Bezig…" : "100 ophalen + aanvullen"}
          </button>
        </div>

        {(error || ok) && (
          <p
            className={`mt-4 text-sm ${error ? "text-danger" : "text-text-muted"}`}
            role={error ? "alert" : undefined}
          >
            {error ?? ok}
          </p>
        )}

        {outOfRegionCount > 0 ? (
          <p className="mt-3 text-xs text-text-dim">
            {outOfRegionCount} buiten regio — die worden overgeslagen bij
            aanvullen/mailen.
          </p>
        ) : null}
      </section>

      {/* Criteria — collapsed by default */}
      <details className="group border-t border-border pt-6">
        <summary className="cursor-pointer list-none font-display text-sm tracking-[0.1em] text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          <span className="underline-offset-4 group-open:no-underline">
            Zoekcriteria aanpassen
          </span>
          <span className="ml-2 text-xs font-sans tracking-normal text-text-dim">
            {universeLabel || "standaard ring · mdw-band"}
            {universeCheckedAt
              ? ` · geteld ${new Date(universeCheckedAt).toLocaleString("nl-NL")}`
              : ""}
          </span>
        </summary>

        <div className="mt-5 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-dim">
              Medewerkers
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
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
                        ? "border border-accent bg-accent/10 px-3 py-1.5 text-sm text-text"
                        : "border border-border px-3 py-1.5 text-sm text-text-muted hover:border-accent"
                    }
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-text-dim">
              Regio
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLACE_OPTIONS.map((p) => {
                const on = criteria.placePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={pending}
                    title={p.hint}
                    onClick={() => {
                      setPreview(null);
                      setCriteria((c) => ({ ...c, placePreset: p.id }));
                    }}
                    className={
                      on
                        ? "border border-accent bg-accent/10 px-3 py-1.5 text-sm text-text"
                        : "border border-border px-3 py-1.5 text-sm text-text-muted hover:border-accent"
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block max-w-md text-xs uppercase tracking-wider text-text-dim">
            Keywords (optioneel)
            <input
              value={keywords}
              onChange={(e) => {
                setPreview(null);
                setKeywords(e.target.value);
              }}
              placeholder="bijv. technology, finance"
              className="mt-2 block w-full border border-border bg-bg px-3 py-2 font-sans text-sm normal-case tracking-normal text-text"
            />
          </label>

          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={previewCount}
            className="border border-border px-4 py-2 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
          >
            {pending ? "Bezig…" : "Tel opnieuw (1 credit)"}
          </button>

          {preview ? (
            <p className="text-sm text-text-muted">
              {preview.criteriaLabel}: ~{preview.total.toLocaleString("nl-NL")}{" "}
              bij Apollo
            </p>
          ) : null}
        </div>
      </details>

      {/* Manual steps — collapsed */}
      <details className="group border-t border-border pt-6">
        <summary className="cursor-pointer list-none font-display text-sm tracking-[0.1em] text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          Handmatig per stap
          <span className="ml-2 text-xs font-sans tracking-normal text-text-dim">
            alleen als auto-aanvullen niet genoeg is
          </span>
        </summary>

        <div className="mt-5 space-y-6">
          <div>
            <h3 className="font-display text-base tracking-[0.06em]">
              KvK (oprichtingsdatum)
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pending || !kvkReady || pendingKvk === 0}
                onClick={() =>
                  run("/api/outreach/kvk/enrich-batch", { limit: 10 }, (d) => {
                    const rows = Array.isArray(d.rows) ? d.rows : [];
                    const fit = rows.filter(
                      (r) =>
                        r &&
                        typeof r === "object" &&
                        (r as { ok?: boolean; fit?: string }).ok &&
                        (r as { fit?: string }).fit === "ja",
                    ).length;
                    return `${Number(d.processed ?? 0)} aangevuld · ${fit} past`;
                  })
                }
                className="border border-border px-4 py-2 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
              >
                {pending
                  ? "Bezig…"
                  : pendingKvk === 0
                    ? "KvK klaar"
                    : `Vul 10 KvK (${pendingKvk} open)`}
              </button>
              {!kvkReady ? (
                <StatusBadge tone="danger">KvK niet gekoppeld</StatusBadge>
              ) : null}
            </div>
          </div>

          <div>
            <h3 className="font-display text-base tracking-[0.06em]">
              Contacten & e-mail
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || !apolloReady || pendingPeople === 0}
                onClick={() =>
                  run("/api/outreach/people", { limit: 8 }, (d) =>
                    `${Number(d.filled ?? 0)} contacten · ${Number(d.withEmail ?? 0)} met mail`,
                  )
                }
                className="border border-border px-4 py-2 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
              >
                {pending
                  ? "Bezig…"
                  : pendingPeople === 0
                    ? "Contacten klaar"
                    : `Zoek 8 contacten (${pendingPeople})`}
              </button>
              <button
                type="button"
                disabled={pending || !hunterReady || pendingHunter === 0}
                onClick={() =>
                  run(
                    "/api/outreach/people",
                    { limit: 8, hunterEmails: true },
                    (d) =>
                      `${Number(d.filled ?? 0)} e-mails · ${Number(d.processed ?? 0)} geprobeerd`,
                  )
                }
                className="border border-border px-4 py-2 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
              >
                {pending
                  ? "Bezig…"
                  : pendingHunter === 0
                    ? "Hunter klaar"
                    : `Hunter (${pendingHunter})`}
              </button>
              <button
                type="button"
                disabled={pending || pendingEmail === 0}
                onClick={() =>
                  run("/api/outreach/website-email", { limit: 8 }, (d) =>
                    `${Number(d.filled ?? 0)} website-mails · ${Number(d.processed ?? 0)} geprobeerd`,
                  )
                }
                className="border border-border px-4 py-2 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
              >
                {pending
                  ? "Bezig…"
                  : pendingEmail === 0
                    ? "Website-mail klaar"
                    : `Website-mail (${pendingEmail})`}
              </button>
            </div>
          </div>
        </div>
      </details>

      <p className="border-t border-border pt-6 text-sm text-text-muted">
        Klaar?{" "}
        <Link href="/outreach/crm" className="text-accent underline">
          Naar bedrijven
        </Link>{" "}
        om te filteren en te mailen.
      </p>
    </div>
  );
}
