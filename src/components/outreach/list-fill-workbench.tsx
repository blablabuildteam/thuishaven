"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

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
};

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
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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

      <section className="border border-border bg-surface p-4 sm:p-5">
        <p className="font-display text-sm tracking-[0.16em] text-text-dim">
          Stap 1
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.06em]">
          Nieuwe bedrijven ophalen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Haalt midgrote bedrijven op in Amsterdam + omgeving (zo’n 500–5.000
          medewerkers). Je kunt dit meerdere keren doen voor de volgende
          batch.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !apolloReady}
            onClick={() =>
              run("/api/outreach/discover", { apply: true }, (d) =>
                `${Number(d.created ?? 0)} nieuw · ${Number(d.duplicate ?? 0)} stonden al op de lijst`,
              )
            }
            className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending
              ? "Bezig…"
              : apolloNextPage > 1
                ? `Haal volgende 100 bedrijven op`
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
      </section>

      <section className="border border-border bg-surface p-4 sm:p-5">
        <p className="font-display text-sm tracking-[0.16em] text-text-dim">
          Stap 2
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.06em]">
          Bedrijfsgegevens aanvullen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Haalt KvK-info op: plaats, medewerkers, jubileum. Daarna zie je of
          een bedrijf past (of “Past niet”).
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
            className="border border-border bg-bg px-4 py-2.5 font-display text-sm tracking-[0.1em] disabled:opacity-50"
          >
            {pendingHunter === 0
              ? "Geen open e-mails"
              : `Zoek 8 e-mails (${pendingHunter} open)`}
          </button>
          <button
            type="button"
            disabled={pending || pendingEmail === 0}
            onClick={() =>
              run("/api/outreach/website-email", { limit: 8 }, (d) =>
                `${Number(d.filled ?? 0)} website-mails · ${Number(d.processed ?? 0)} sites`,
              )
            }
            className="border border-border bg-bg px-4 py-2.5 font-display text-sm tracking-[0.1em] disabled:opacity-50"
          >
            {pendingEmail === 0
              ? "Geen website-mails open"
              : `Website-mail (8) · ${pendingEmail} open`}
          </button>
        </div>
        {!hunterReady ? (
          <p className="mt-3 text-xs text-text-dim">
            Extra e-mailzoeken staat uit tot Kevin de koppeling aanzet — contact
            zoeken werkt wel.
          </p>
        ) : null}
      </section>

      {(ok || error) && (
        <div className="flex flex-wrap gap-2">
          {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
          {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
        </div>
      )}

      <p className="text-sm text-text-muted">
        Klaar? Ga naar{" "}
        <Link href="/outreach/crm" className="text-accent underline">
          Bedrijven
        </Link>{" "}
        om te zien wie past, en daarna naar{" "}
        <Link href="/outreach/emails" className="text-accent underline">
          Mailen
        </Link>
        .
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
      <p className="text-[11px] uppercase tracking-wider text-text-dim">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl tracking-[0.06em] text-text">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-text-dim">{hint}</p> : null}
    </div>
  );
}
