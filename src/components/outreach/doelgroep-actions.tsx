"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { DOELGROEP, DOELGROEP_STARTLIJST } from "@/lib/outreach/doelgroep";

type Props = {
  pendingKvk: number;
};

export function DoelgroepActions({ pendingKvk }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function seedStartlijst() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/prospects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "paste",
          type: "company",
          source: "manual",
          text: DOELGROEP_STARTLIJST.join("\n"),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        duplicate?: number;
        excluded?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Startlijst toevoegen mislukt");
        return;
      }
      const bits = [`${data.created ?? 0} bedrijven op de lijst`];
      if (data.duplicate) bits.push(`${data.duplicate} stonden er al`);
      if (data.excluded) bits.push(`${data.excluded} geblokkeerd (Niet mailen)`);
      setOk(bits.join(" · "));
      router.refresh();
    });
  }

  function enrichBatch() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/kvk/enrich-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        processed?: number;
        rows?: Array<{ ok: boolean; companyName: string; fit?: string }>;
      };
      if (!res.ok) {
        setError(data.error ?? "KvK-batch mislukt");
        return;
      }
      const fit = data.rows?.filter((r) => r.ok && r.fit === "ja").length ?? 0;
      setOk(
        `${data.processed ?? 0} opgezocht bij KvK · ${fit} past in de doelgroep`,
      );
      router.refresh();
    });
  }

  return (
    <div className="mb-8 border border-accent/40 bg-surface p-4">
      <h2 className="font-display text-2xl tracking-[0.06em]">
        Doelgroep · bedrijven
      </h2>
      <p className="mt-2 text-sm text-text-muted">
        {DOELGROEP.minEmployees}–{DOELGROEP.maxEmployees} medewerkers ·{" "}
        {DOELGROEP.regionLabel} · {DOELGROEP.trigger}. Partnerbureaus horen
        hier niet bij.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="border border-border bg-bg p-3 text-sm text-text-muted">
          <p className="font-medium text-text">1. Namen van LinkedIn</p>
          <p className="mt-1">
            Sales Nav / zoeken:{" "}
            <span className="text-text">{DOELGROEP.linkedinCompanySearch}</span>
          </p>
          <p className="mt-1">
            Beslisser:{" "}
            <span className="text-text">{DOELGROEP.linkedinPeopleSearch}</span>
          </p>
          <p className="mt-2 text-xs text-text-dim">
            Geen LinkedIn-API — plak bedrijfsnamen hieronder. KvK mag deze
            selectie niet zelf maken (geen SBI/plaats-zoekactie).
          </p>
        </div>
        <div className="border border-border bg-bg p-3 text-sm text-text-muted">
          <p className="font-medium text-text">2. Of startlijst + KvK-check</p>
          <p className="mt-1">
            {DOELGROEP_STARTLIJST.length} werkgevers in de regio (zonder
            partnerbureaus). Daarna KvK: medewerkers, plaats, jubileum.
          </p>
          <p className="mt-2 text-xs text-text-dim">
            Zoeken is gratis · profiel ~€0,04 per bedrijf · max 10 per klik.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={seedStartlijst}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          {pending ? "Bezig…" : "Zet startlijst op Prospects"}
        </button>
        <button
          type="button"
          disabled={pending || pendingKvk === 0}
          onClick={enrichBatch}
          className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] disabled:opacity-60"
        >
          Verrijk 10 via KvK
          {pendingKvk ? ` (${pendingKvk} open)` : ""}
        </button>
        {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </div>
  );
}
