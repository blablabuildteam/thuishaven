"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { DOELGROEP } from "@/lib/outreach/doelgroep";
import { formatEurFromCents, OUTREACH_RATES } from "@/lib/outreach/batch-costs";
import { UNIVERSE } from "@/lib/outreach/universe";

type Props = {
  pendingKvk: number;
  pendingEmail: number;
  pendingPeople: number;
  pendingHunter: number;
  apolloReady: boolean;
  hunterReady: boolean;
  apolloNextPage: number;
};

export function DoelgroepActions({
  pendingKvk,
  pendingEmail,
  pendingPeople,
  pendingHunter,
  apolloReady,
  hunterReady,
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

  function fillPeople() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 8 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        filled?: number;
        processed?: number;
        withEmail?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Decision-makers zoeken mislukt");
        return;
      }
      setOk(
        `${data.filled ?? 0} personen · ${data.withEmail ?? 0} met mail · ${data.processed ?? 0} bedrijven`,
      );
      router.refresh();
    });
  }

  function fillHunterEmails() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 8, hunterEmails: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        filled?: number;
        processed?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Hunter-mails mislukt");
        return;
      }
      setOk(
        `${data.filled ?? 0} Event Manager-mails · ${data.processed ?? 0} geprobeerd`,
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
        `${data.filled ?? 0} generieke adressen · ${data.processed ?? 0} sites`,
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
        hier niet bij. Geschat {UNIVERSE.fitLow}–{UNIVERSE.fitHigh} bedrijven
        in dit filter —{" "}
        <Link href="/outreach/kosten" className="text-accent underline">
          hele lijst en kosten
        </Link>
        .
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="border border-border bg-bg p-3 text-sm text-text-muted">
          <p className="font-medium text-text">1. Apollo · bedrijven</p>
          <p className="mt-1">
            {DOELGROEP.minEmployees}–{DOELGROEP.maxEmployees} mdw ·{" "}
            {DOELGROEP.regionLabel}.
          </p>
          <p className="mt-2 text-xs text-text-dim">
            {apolloReady
              ? "Key aan · 1 credit / 100 bedrijven."
              : "APOLLO_API_KEY ontbreekt (betaald plan nodig)."}
          </p>
        </div>
        <div className="border border-border bg-bg p-3 text-sm text-text-muted">
          <p className="font-medium text-text">
            2. Apollo + Hunter · Event Manager
          </p>
          <p className="mt-1">
            Apollo zoekt de persoon. Heeft die geen mail, dan Hunter op naam +
            domein.
          </p>
          <p className="mt-2 text-xs text-text-dim">
            {hunterReady
              ? "Hunter-key aan."
              : "Zet HUNTER_API_KEY voor Event Manager-mails."}
          </p>
        </div>
        <div className="border border-border bg-bg p-3 text-sm text-text-muted">
          <p className="font-medium text-text">3. KvK + generieke mail</p>
          <p className="mt-1">
            KvK voor jubileum/non-mailing. Site/`events@` alleen als er geen
            persoon is.
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
              ? `Haal volgende 100 op (pagina ${apolloNextPage})`
              : "Haal 100 bedrijven op"}
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
          disabled={pending || pendingPeople === 0 || !apolloReady}
          onClick={fillPeople}
          className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] disabled:opacity-60"
        >
          Zoek 8 Event Managers
          {pendingPeople ? ` (${pendingPeople} open)` : ""}
          {hunterReady ? " · + Hunter" : ""}
        </button>
        <button
          type="button"
          disabled={pending || pendingHunter === 0 || !hunterReady}
          onClick={fillHunterEmails}
          className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] disabled:opacity-60"
        >
          Hunter-mail voor 8 personen
          {pendingHunter ? ` (${pendingHunter} open)` : ""}
        </button>
        <button
          type="button"
          disabled={pending || pendingEmail === 0}
          onClick={fillEmails}
          className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] disabled:opacity-60"
        >
          Generieke site-mail (8)
          {pendingEmail ? ` (${pendingEmail} open)` : ""}
        </button>
        {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
      <p className="mt-3 text-xs text-text-dim">
        Event Manager-route: Apollo-persoon → Hunter email-finder (~
        {formatEurFromCents(OUTREACH_RATES.hunterSearchCents)} / persoon).
        Generieke site-mail is alleen backup.{" "}
        <Link href="/outreach/kosten" className="text-accent underline">
          Kostmeter
        </Link>
      </p>
    </div>
  );
}
