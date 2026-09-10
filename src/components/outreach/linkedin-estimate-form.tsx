"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

type Props = {
  prospectId: string;
  companySearchUrl: string;
  peopleSearchUrl: string;
  currentEstimate: number | null;
  currentUrl: string | null;
};

export function LinkedinEstimateForm({
  prospectId,
  companySearchUrl,
  peopleSearchUrl,
  currentEstimate,
  currentUrl,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [estimate, setEstimate] = useState(
    currentEstimate != null ? String(currentEstimate) : "",
  );
  const [linkedinUrl, setLinkedinUrl] = useState(currentUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await fetch("/api/outreach/crm/linkedin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prospectId,
          estimate: Number(estimate),
          linkedinUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a
          href={companySearchUrl}
          target="_blank"
          rel="noreferrer"
          className="border border-border bg-bg px-3 py-1.5 text-xs tracking-[0.08em] text-text hover:border-accent"
        >
          Bedrijf op LinkedIn →
        </a>
        <a
          href={peopleSearchUrl}
          target="_blank"
          rel="noreferrer"
          className="border border-border bg-bg px-3 py-1.5 text-xs tracking-[0.08em] text-text hover:border-accent"
        >
          Event / Office Manager →
        </a>
      </div>
      <p className="text-xs text-text-dim">
        Apollo vult het medewerkersaantal. Dit veld is alleen een handmatige
        override — geen Wikipedia, geen scrape.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-text-dim">
          LinkedIn-schatting medewerkers
        </span>
        <input
          type="number"
          min={1}
          required
          className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          placeholder="bijv. 1800"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-text-dim">
          Bedrijfspagina (optioneel)
        </span>
        <input
          type="url"
          className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://www.linkedin.com/company/…"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          {pending ? "Opslaan…" : "Schatting bewaren"}
        </button>
        {ok ? <StatusBadge tone="success">Opgeslagen</StatusBadge> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </form>
  );
}
