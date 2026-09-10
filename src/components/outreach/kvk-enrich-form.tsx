"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export type EnrichProspectOption = {
  id: string;
  companyName: string;
  kvkNumber?: string | null;
};

type Candidate = {
  kvkNumber: string;
  companyName: string;
  city?: string;
  employeeCount?: number;
  foundedAt?: string;
  anniversaryYears?: number;
  sector?: string;
  website?: string;
  nonMailing: boolean;
};

type Props = {
  prospects: EnrichProspectOption[];
};

export function KvkEnrichForm({ prospects }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prospectId, setProspectId] = useState("");
  const [naam, setNaam] = useState("");
  const [kvkNummer, setKvkNummer] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSelectProspect(id: string) {
    setProspectId(id);
    const p = prospects.find((x) => x.id === id);
    if (p) {
      setNaam(p.companyName);
      setKvkNummer(p.kvkNumber ?? "");
    }
  }

  function call(apply: boolean) {
    setError(null);
    setOk(null);

    startTransition(async () => {
      const res = await fetch("/api/outreach/kvk/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          naam: naam || undefined,
          kvkNummer: kvkNummer || undefined,
          prospectId: prospectId || undefined,
          apply,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        candidate?: Candidate;
        matchedProspect?: { companyName: string };
        applied?: boolean;
      };

      if (!res.ok) {
        setError(data.error ?? "KvK-verrijking mislukt");
        if (data.candidate) setCandidate(data.candidate);
        return;
      }

      if (data.candidate) setCandidate(data.candidate);
      if (apply && data.applied) {
        setOk(
          `Opgeslagen bij ${data.matchedProspect?.companyName ?? "prospect"}`,
        );
        router.refresh();
      } else {
        setOk("KvK-profiel gevonden — controleer en sla op.");
      }
    });
  }

  return (
    <section className="mb-8 border border-border bg-surface p-4">
      <h2 className="font-display text-2xl tracking-[0.06em]">
        Verrijk via KvK
      </h2>
      <p className="mt-2 text-sm text-text-muted">
        Alleen bedrijven die je al kent: zoek op naam of KvK-nummer. Geen
        plaats- of SBI-targeting.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-text-dim">Bestaande prospect</span>
          <select
            className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={prospectId}
            onChange={(e) => onSelectProspect(e.target.value)}
          >
            <option value="">Kies (optioneel)</option>
            {prospects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.companyName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-dim">Bedrijfsnaam</span>
          <input
            className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            placeholder="Thuishaven"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-dim">KvK-nummer</span>
          <input
            className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={kvkNummer}
            onChange={(e) => setKvkNummer(e.target.value)}
            placeholder="12345678"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => call(false)}
          className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-60"
        >
          {pending ? "Zoeken…" : "Opzoeken"}
        </button>
        <button
          type="button"
          disabled={pending || !candidate}
          onClick={() => call(true)}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          Opslaan op prospect
        </button>
        {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>

      {candidate ? (
        <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-dim">Naam</dt>
            <dd className="text-text">{candidate.companyName}</dd>
          </div>
          <div>
            <dt className="text-text-dim">KvK</dt>
            <dd className="font-mono text-text">{candidate.kvkNumber}</dd>
          </div>
          <div>
            <dt className="text-text-dim">Plaats</dt>
            <dd className="text-text">{candidate.city ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-dim">Medewerkers</dt>
            <dd className="text-text">{candidate.employeeCount ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-dim">Sector</dt>
            <dd className="text-text">{candidate.sector ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-dim">Jubileum</dt>
            <dd className="text-text">
              {candidate.anniversaryYears
                ? `${candidate.anniversaryYears} jr`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-dim">Opgericht / jubileum</dt>
            <dd className="text-text">
              {candidate.foundedAt ?? "—"}
              {candidate.anniversaryYears
                ? ` · ${candidate.anniversaryYears} jr`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-text-dim">Website</dt>
            <dd className="truncate text-text">{candidate.website ?? "—"}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
