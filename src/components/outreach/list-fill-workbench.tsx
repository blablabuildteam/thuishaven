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
  apolloReady: boolean;
  hunterReady: boolean;
  kvkReady: boolean;
  apolloNextPage: number;
  companyCount: number;
  withEmailCount: number;
  outOfRegionCount: number;
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
  apolloReady,
  hunterReady,
  kvkReady,
  apolloNextPage,
  companyCount,
  withEmailCount,
  outOfRegionCount,
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
          apply: false,
          page: apolloNextPage,
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
      setPreview({
        total: Number(data.total ?? 0),
        pageKeep: Number(data.pageKeep ?? 0),
        pageOutOfRegion: Number(data.pageOutOfRegion ?? 0),
        pageUnknownCity: Number(data.pageUnknownCity ?? 0),
        criteriaLabel:
          typeof data.criteriaLabel === "string"
            ? data.criteriaLabel
            : "Criteria",
        keepSample: Array.isArray(data.keepSample)
          ? (data.keepSample as Preview["keepSample"])
          : [],
        droppedSample: Array.isArray(data.droppedSample)
          ? (data.droppedSample as Preview["droppedSample"])
          : [],
      });
      setOk(
        `Apollo vindt ~${Number(data.total ?? 0)} matches · op deze pagina houden we ${Number(data.pageKeep ?? 0)} (1 credit gebruikt)`,
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Bedrijven op de lijst" value={String(companyCount)} />
        <Stat label="Met e-mailadres" value={String(withEmailCount)} />
        <Stat
          label="Nog open"
          value={`${pendingKvk + pendingPeople + pendingHunter + pendingEmail}`}
          hint="gegevens / mails"
        />
      </div>

      {outOfRegionCount > 0 ? (
        <p className="border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          {outOfRegionCount} bestaande bedrijven staan buiten de regio — die
          slaan we over bij aanvullen/mailen. Filter in Bedrijven op{" "}
          <strong className="text-text">Buiten regio</strong> om ze te zien.
        </p>
      ) : null}

      <section className="border border-border bg-surface p-4 sm:p-5">
        <p className="font-display text-sm tracking-[0.16em] text-text-dim">
          Stap 1
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.06em]">
          Nieuwe bedrijven ophalen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Apollo zoekt op HQ-plaats + medewerkers. Wij bewaren alleen bedrijven
          waarvan de Apollo-plaats in de gekozen ring valt (of nog onbekend
          is). Max <strong>100 per keer</strong> = 1 credit.
        </p>

        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <div>
            <p className="font-display text-xs tracking-[0.14em] text-text-dim">
              Medewerkers (Apollo-ranges)
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
            <p className="font-display text-xs tracking-[0.14em] text-text-dim">
              Regio-preset
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

          <div>
            <label className="font-display text-xs tracking-[0.14em] text-text-dim">
              Keywords (optioneel, Apollo)
              <input
                value={keywords}
                onChange={(e) => {
                  setPreview(null);
                  setKeywords(e.target.value);
                }}
                placeholder="bijv. technology, finance"
                className="mt-2 block w-full max-w-md border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={previewCount}
            className="border border-border bg-bg px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
          >
            {pending ? "Bezig…" : "Tel matches (1 credit)"}
          </button>
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={() =>
              run(
                "/api/outreach/discover",
                { apply: true, criteria: criteriaBody() },
                (d) => {
                  const dropped = Number(d.pageOutOfRegion ?? 0);
                  const base = `${Number(d.created ?? 0)} nieuw · ${Number(d.duplicate ?? 0)} stonden al`;
                  return dropped
                    ? `${base} · ${dropped} buiten regio overgeslagen`
                    : base;
                },
              )
            }
            className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : apolloNextPage > 1
                ? `Haal volgende 100 op`
                : "Haal 100 bedrijven op"}
          </button>
          {!apolloReady ? (
            <StatusBadge tone="danger">
              Koppeling ontbreekt — vraag Kevin
            </StatusBadge>
          ) : (
            <span className="text-xs text-text-dim">
              Batch {apolloNextPage}
            </span>
          )}
        </div>

        {preview ? (
          <div className="mt-4 border border-border bg-bg p-4 text-sm">
            <p className="font-medium text-text">{preview.criteriaLabel}</p>
            <p className="mt-1 text-text-muted">
              Apollo-totaal ~{preview.total.toLocaleString("nl-NL")} · deze
              pagina: {preview.pageKeep} bewaren
              {preview.pageOutOfRegion
                ? ` · ${preview.pageOutOfRegion} buiten regio weg`
                : ""}
              {preview.pageUnknownCity
                ? ` · ${preview.pageUnknownCity} zonder plaats`
                : ""}
            </p>
            {preview.keepSample.length > 0 ? (
              <ul className="mt-3 space-y-1 text-text-muted">
                {preview.keepSample.map((c) => (
                  <li key={c.name}>
                    {c.name}
                    {c.city ? ` · ${c.city}` : ""}
                    {c.employeeCount != null
                      ? ` · ~${c.employeeCount} mdw`
                      : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {preview.droppedSample.length > 0 ? (
              <p className="mt-3 text-xs text-text-dim">
                Voorbeelden overgeslagen:{" "}
                {preview.droppedSample
                  .map((c) => `${c.name} (${c.city ?? "?"})`)
                  .join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="border border-border bg-surface p-4 sm:p-5">
        <p className="font-display text-sm tracking-[0.16em] text-text-dim">
          Stap 2
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.06em]">
          Bedrijfsgegevens aanvullen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Haalt KvK-info op: plaats, medewerkers, jubileum. Bedrijven die al
          “past niet” scoren, worden overgeslagen.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
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
                return `${Number(d.processed ?? 0)} aangevuld · ${fit} past in de doelgroep`;
              })
            }
            className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : pendingKvk === 0
                ? "Alles al aangevuld"
                : `Vul 10 bedrijven aan (${pendingKvk} open)`}
          </button>
          {!kvkReady ? (
            <StatusBadge tone="danger">
              KvK-koppeling ontbreekt — vraag Kevin
            </StatusBadge>
          ) : null}
        </div>
      </section>

      <section className="border border-border bg-surface p-4 sm:p-5">
        <p className="font-display text-sm tracking-[0.16em] text-text-dim">
          Stap 3
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.06em]">
          E-mailadressen zoeken
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Zoekt eerst de Event / Office Manager, daarna hun e-mail. Als dat niet
          lukt: generiek adres van de website (events@ / info@).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !apolloReady || pendingPeople === 0}
            onClick={() =>
              run("/api/outreach/people", { limit: 8 }, (d) =>
                `${Number(d.filled ?? 0)} contactpersonen · ${Number(d.withEmail ?? 0)} met mail`,
              )
            }
            className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : pendingPeople === 0
                ? "Geen open contactpersonen"
                : `Zoek 8 contactpersonen (${pendingPeople} open)`}
          </button>
          <button
            type="button"
            disabled={pending || !hunterReady || pendingHunter === 0}
            onClick={() =>
              run(
                "/api/outreach/people",
                { limit: 8, hunterEmails: true },
                (d) =>
                  `${Number(d.filled ?? 0)} e-mails gevonden · ${Number(d.processed ?? 0)} geprobeerd`,
              )
            }
            className="border border-border bg-bg px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : pendingHunter === 0
                ? "Geen open Hunter-mails"
                : `Hunter-mail (${pendingHunter} open)`}
          </button>
          <button
            type="button"
            disabled={pending || pendingEmail === 0}
            onClick={() =>
              run("/api/outreach/website-email", { limit: 8 }, (d) =>
                `${Number(d.filled ?? 0)} website-mails · ${Number(d.processed ?? 0)} geprobeerd`,
              )
            }
            className="border border-border bg-bg px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : pendingEmail === 0
                ? "Geen open website-mails"
                : `Website-mail (${pendingEmail} open)`}
          </button>
        </div>
      </section>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? <p className="text-sm text-text-muted">{ok}</p> : null}

      <p className="text-sm text-text-muted">
        Klaar? Ga naar{" "}
        <Link href="/outreach/crm" className="text-accent underline">
          Bedrijven
        </Link>{" "}
        om te filteren en te mailen.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="font-display text-xs tracking-[0.14em] text-text-dim">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl tracking-[0.06em]">{value}</p>
      {hint ? <p className="text-xs text-text-dim">{hint}</p> : null}
    </div>
  );
}
