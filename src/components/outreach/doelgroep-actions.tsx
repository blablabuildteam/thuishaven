"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { DOELGROEP } from "@/lib/outreach/doelgroep";

type Props = {
  pendingKvk: number;
  pendingEmail: number;
  apolloReady: boolean;
  apolloNextPage: number;
};

export function DoelgroepActions({
  pendingKvk,
  pendingEmail,
  apolloReady,
  apolloNextPage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function discoverApollo() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        duplicate?: number;
        excluded?: number;
        total?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Apollo ophalen mislukt");
        return;
      }
      setOk(
        `${data.created ?? 0} nieuw · ${data.duplicate ?? 0} bestond al · ${data.total ?? 0} in Apollo`,
      );
      router.refresh();
    });
  }

  function fillEmails() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/website-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 8 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        filled?: number;
        processed?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Contactmails zoeken mislukt");
        return;
      }
      setOk(
        `${data.filled ?? 0} adressen gevonden · ${data.processed ?? 0} sites bekeken`,
      );
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
          <p className="font-medium text-text">1. Apollo haalt de doelgroep</p>
          <p className="mt-1">
            Filter: {DOELGROEP.minEmployees}–{DOELGROEP.maxEmployees} mdw · HQ
            in {DOELGROEP.regionLabel}. Dat is de enige watervaste ophaalstap —
            geen KvK-targeting, geen LinkedIn-scrape.
          </p>
          <p className="mt-2 text-xs text-text-dim">
            {apolloReady
              ? "Key staat aan · 1 credit per 25 bedrijven (goedkoopste legale bron)."
              : "Nog geen APOLLO_API_KEY. Gratis Apollo-account → Settings → API → key in Vercel."}
          </p>
        </div>
        <div className="border border-border bg-bg p-3 text-sm text-text-muted">
          <p className="font-medium text-text">2. KvK + publieke mail</p>
          <p className="mt-1">
            KvK: nummer, jubileum, vestiging. Daarna events@ / info@ van de
            bedrijfswebsite. Apollo-headcount blijft de size-schatting.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !apolloReady}
          onClick={discoverApollo}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          {pending
            ? "Bezig…"
            : apolloNextPage > 1
              ? `Haal volgende 25 op (pagina ${apolloNextPage})`
              : "Haal 25 bedrijven op"}
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
        <button
          type="button"
          disabled={pending || pendingEmail === 0}
          onClick={fillEmails}
          className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] disabled:opacity-60"
        >
          Zoek 8 contactmails
          {pendingEmail ? ` (${pendingEmail} open)` : ""}
        </button>
        {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </div>
  );
}
