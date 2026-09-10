"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

type Mode = "single" | "paste";

export function AddProspectsForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("single");
  const [type, setType] = useState<"agency" | "company">("company");
  const [source, setSource] = useState<"manual" | "linkedin">("linkedin");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);

    startTransition(async () => {
      const body =
        mode === "paste"
          ? {
              mode: "paste",
              text: paste,
              type,
              source: source === "linkedin" ? "linkedin" : "paste",
            }
          : {
              mode: "single",
              companyName,
              type,
              source,
              email,
              website,
              notes,
            };

      const res = await fetch("/api/outreach/prospects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        duplicate?: number;
        excluded?: number;
      };

      if (!res.ok) {
        setError(data.error ?? "Toevoegen mislukt");
        return;
      }

      const bits = [`${data.created ?? 0} toegevoegd`];
      if (data.duplicate) bits.push(`${data.duplicate} bestond al`);
      if (data.excluded) bits.push(`${data.excluded} op Niet mailen`);
      setOk(bits.join(" · "));
      setCompanyName("");
      setEmail("");
      setWebsite("");
      setNotes("");
      setPaste("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-8 border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-[0.06em]">Lijst vullen</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`border px-3 py-1.5 text-xs tracking-[0.08em] ${
              mode === "single"
                ? "border-accent bg-accent text-accent-contrast"
                : "border-border bg-bg text-text-muted"
            }`}
          >
            Eén naam
          </button>
          <button
            type="button"
            onClick={() => setMode("paste")}
            className={`border px-3 py-1.5 text-xs tracking-[0.08em] ${
              mode === "paste"
                ? "border-accent bg-accent text-accent-contrast"
                : "border-border bg-bg text-text-muted"
            }`}
          >
            Lijst plakken
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-text-muted">
        Plak bedrijfsnamen uit LinkedIn. Standaard type: bedrijf. Partnerbureaus
        niet hierin zetten.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-text-dim">Type</span>
          <select
            className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={type}
            onChange={(e) =>
              setType(e.target.value === "company" ? "company" : "agency")
            }
          >
            <option value="agency">Eventbureau (partner / koud)</option>
            <option value="company">Bedrijf (jubileum / intern event)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-dim">Waar vandaan</span>
          <select
            className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={source}
            onChange={(e) =>
              setSource(e.target.value === "linkedin" ? "linkedin" : "manual")
            }
          >
            <option value="manual">Handmatig / sheet</option>
            <option value="linkedin">Gevonden op LinkedIn</option>
          </select>
        </label>
      </div>

      {mode === "single" ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-text-dim">Bedrijfsnaam</span>
            <input
              required
              className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Fresh Cotton Events"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-text-dim">E-mail (optioneel)</span>
            <input
              type="email"
              className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@bureau.nl"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-text-dim">Website (optioneel)</span>
            <input
              type="url"
              className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-text-dim">Notitie (optioneel)</span>
            <input
              className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contact via LinkedIn, Office Manager…"
            />
          </label>
        </div>
      ) : (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-text-dim">
            Eén bedrijf per regel · optioneel e-mail ernaast
          </span>
          <textarea
            required
            rows={7}
            className="w-full border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={"Sense Events, hello@sense-events.nl\nTomTom\nAdyen"}
          />
        </label>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          {pending ? "Bezig…" : mode === "paste" ? "Lijst toevoegen" : "Naam toevoegen"}
        </button>
        {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </form>
  );
}
