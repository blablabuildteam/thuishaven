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
  apolloRemainingApprox: number | null;
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
  apolloRemainingApprox,
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
        `Apollo vindt nu ~${total.toLocaleString("nl-NL")} bedrijven · ±${Math.ceil(total / 100)} batches van 100 (1 credit)`,
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
    <div className="space-y-6">
      <section className="border border-accent/40 bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm tracking-[0.16em] text-text-dim">
              Apollo-universum (live)
            </p>
            <p className="mt-1 font-display text-4xl tracking-[0.04em] text-text">
              {universeTotal > 0
                ? `~${universeTotal.toLocaleString("nl-NL")}`
                : "—"}
            </p>
            <p className="mt-1 max-w-xl text-sm text-text-muted">
              {universeLabel || "Huidige criteria"} · max 100 per batch ·{" "}
              {universeTotal > 0
                ? `±${Math.ceil(universeTotal / 100)} credits om alles op te halen`
                : "druk op Ververs telling"}
            </p>
            {universeCheckedAt ? (
              <p className="mt-1 text-xs text-text-dim">
                Laatst geteld:{" "}
                {new Date(universeCheckedAt).toLocaleString("nl-NL")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={previewCount}
            className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending ? "Bezig…" : "Ververs telling (1 credit)"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Al via Apollo op de lijst"
            value={String(apolloOnList)}
          />
          <Stat
            label="Nog te halen (approx.)"
            value={
              universeTotal > 0
                ? `~${Math.max(0, universeTotal - apolloOnList).toLocaleString("nl-NL")}`
                : "—"
            }
            hint="Apollo-totaal − al binnengehaald"
          />
          <Stat
            label="Volgende batch"
            value={String(apolloNextPage)}
            hint="pagina"
          />
        </div>
        <p className="mt-3 text-xs text-text-dim">
          Dit is Apollo’s soft HQ-match. Bij binnenhalen filteren we hard op
          plaats in de ring. Vergelijking: kern ~354 · alleen Amsterdam ~272
          (zelfde size-band).
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Bedrijven op de lijst" value={String(companyCount)} />
        <Stat label="Met e-mailadres" value={String(withEmailCount)} />
        <Stat
          label="Nog open"
          value={String(openWork)}
          hint="mdw / KvK / contact / mail"
        />
      </div>

      <section className="border border-accent/40 bg-surface p-4 sm:p-5">
        <p className="font-display text-sm tracking-[0.16em] text-text-dim">
          Automatisch
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.06em]">
          Alles aanvullen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Geen handmatig werk: Apollo-mdw waar die ontbreekt → KvK
          (oprichtingsdatum) → Event/Office Managers → Hunter/website-mail.
          Draait door tot de wachtrij leeg is (binnen credits/limieten).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || openWork === 0}
            onClick={() => autoFill(false)}
            className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending
              ? "Bezig (kan even duren)…"
              : openWork === 0
                ? "Niets meer open"
                : `Vul ${openWork} open items aan`}
          </button>
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={() => autoFill(true)}
            className="border border-border bg-bg px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : "Haal 100 op + vul alles aan"}
          </button>
        </div>
        <p className="mt-3 text-xs text-text-dim">
          Open: {pendingHeadcount} mdw · {pendingKvk} KvK · {pendingPeople}{" "}
          contact · {pendingHunter} Hunter · {pendingEmail} website-mail
        </p>
      </section>

      {outOfRegionCount > 0 ? (
        <p className="border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          {outOfRegionCount} bestaande bedrijven staan buiten de regio — die
          slaan we over bij aanvullen/mailen. Filter in Bedrijven op{" "}
          <strong className="text-text">Buiten regio</strong> om ze te zien.
        </p>
      ) : null}

      <section className="border border-border bg-surface p-4 sm:p-5">
        <p className="font-display text-sm tracking-[0.16em] text-text-dim">
          Stap 1 (optioneel los)
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
            {pending ? "Bezig…" : "Tel opnieuw (1 credit)"}
          </button>
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
                  const base = `${Number(d.created ?? 0)} nieuw · ${Number(d.duplicate ?? 0)} stonden al · Apollo-totaal ~${total}`;
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
          Haalt bij KvK vooral oprichtingsdatum (jubileum), KvK-nummer,
          non-mailing en plaats. Vestiging-medewerkers zijn alleen ter info —
          niet leidend voor fit. Twijfelachtige naammatch wordt gemarkeerd.
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
          Zoekt Event / Office / Facilities Manager via Apollo (tot 3
          contactopties per bedrijf). Daarna e-mail via Apollo of Hunter. Die
          personen verschijnen in de CRM-kolom Contact.
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
