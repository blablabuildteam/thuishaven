"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  RADAR_VENUE_STATUS_NL,
  RADAR_VENUE_TIER_NL,
  type RadarVenueTier,
} from "@/lib/radar/types";

type Venue = {
  id: string;
  name: string;
  kind: "club" | "festival" | "other";
  status: "seed" | "suggested" | "accepted" | "rejected";
  tier: RadarVenueTier;
  city: string | null;
  country: string | null;
  raUrl: string | null;
  websiteUrl: string | null;
  notes: string | null;
  venueScore: string | null;
  curatorScore: string | null;
};

export function VenuesWorkbench({ initial }: { initial: Venue[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"club" | "festival" | "other">("club");
  const [city, setCity] = useState("");
  const [raUrl, setRaUrl] = useState("");

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function addVenue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/radar/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind,
        city: city || null,
        raUrl: raUrl || null,
        status: "seed",
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Toevoegen mislukt");
      return;
    }
    setName("");
    setCity("");
    setRaUrl("");
    refresh();
  }

  async function setStatus(id: string, status: Venue["status"]) {
    setError(null);
    const res = await fetch(`/api/radar/venues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Update mislukt");
      return;
    }
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Venue verwijderen?")) return;
    const res = await fetch(`/api/radar/venues/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Verwijderen mislukt");
      return;
    }
    refresh();
  }

  const suggested = initial.filter((v) => v.status === "suggested");
  const active = initial.filter(
    (v) => v.status === "seed" || v.status === "accepted",
  );
  const other = initial.filter(
    (v) => v.status !== "suggested" && v.status !== "seed" && v.status !== "accepted",
  );

  return (
    <div className="space-y-8">
      <form
        onSubmit={addVenue}
        className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-[1.4fr_7rem_8rem_1.2fr_auto]"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Venue
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thuishaven, Awakenings…"
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Type
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="w-full border border-border bg-bg px-2 py-2"
          >
            <option value="club">Club</option>
            <option value="festival">Festival</option>
            <option value="other">Anders</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Stad
          </span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            RA URL / id
          </span>
          <input
            value={raUrl}
            onChange={(e) => setRaUrl(e.target.value)}
            placeholder="ra.co/clubs/109027"
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="w-full border border-accent bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-60"
          >
            Toevoegen
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-warn">{error}</p> : null}

      {suggested.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-xl tracking-[0.04em]">
            Suggesties
          </h2>
          <VenueTable
            rows={suggested}
            onAccept={(id) => setStatus(id, "accepted")}
            onReject={(id) => setStatus(id, "rejected")}
            onDelete={remove}
          />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-display text-xl tracking-[0.04em]">
          Startlijst
        </h2>
        {active.length === 0 ? (
          <p className="border border-dashed border-border px-4 py-8 text-sm text-text-muted">
            Nog geen venues. Voeg clubs/festivals toe met een RA-link zodat
            discovery line-ups kan ophalen.
          </p>
        ) : (
          <VenueTable rows={active} onDelete={remove} />
        )}
      </section>

      {other.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-xl tracking-[0.04em]">
            Overig
          </h2>
          <VenueTable rows={other} onDelete={remove} />
        </section>
      ) : null}
    </div>
  );
}

function VenueTable({
  rows,
  onAccept,
  onReject,
  onDelete,
}: {
  rows: Venue[];
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-text-dim uppercase">
            <th className="px-3 py-2 font-medium">Venue</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">RA</th>
            <th className="px-3 py-2 font-medium text-right">Actie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="border-b border-border/70">
              <td className="px-3 py-2.5">
                <p className="font-medium">{v.name}</p>
                <p className="text-xs text-text-muted">
                  {v.kind}
                  {v.tier ? ` · ${RADAR_VENUE_TIER_NL[v.tier]}` : ""}
                  {v.city ? ` · ${v.city}` : ""}
                  {v.country ? `, ${v.country}` : ""}
                </p>
              </td>
              <td className="px-3 py-2.5 text-text-muted">
                {RADAR_VENUE_STATUS_NL[v.status]}
              </td>
              <td className="px-3 py-2.5 font-mono tabular-nums">
                {v.curatorScore ?? v.venueScore ?? "—"}
              </td>
              <td className="px-3 py-2.5 text-xs text-text-muted">
                {v.raUrl ? (
                  <a
                    href={v.raUrl.startsWith("http") ? v.raUrl : `https://${v.raUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-text"
                  >
                    open
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                <div className="inline-flex flex-wrap justify-end gap-1">
                  {onAccept ? (
                    <button
                      type="button"
                      onClick={() => onAccept(v.id)}
                      className="border border-border px-2 py-1 text-xs hover:border-accent"
                    >
                      Accepteer
                    </button>
                  ) : null}
                  {onReject ? (
                    <button
                      type="button"
                      onClick={() => onReject(v.id)}
                      className="border border-border px-2 py-1 text-xs hover:border-accent"
                    >
                      Afwijs
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDelete(v.id)}
                    className="border border-border px-2 py-1 text-xs text-text-muted hover:border-warn hover:text-warn"
                  >
                    Weg
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
