"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";
import {
  countryLabel,
  countrySortKey,
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

function sortVenues(rows: Venue[]) {
  return [...rows].sort((a, b) => {
    const c = countrySortKey(a.country) - countrySortKey(b.country);
    if (c !== 0) return c;
    const kindRank = (k: Venue["kind"]) =>
      k === "festival" ? 0 : k === "club" ? 1 : 2;
    const k = kindRank(a.kind) - kindRank(b.kind);
    if (k !== 0) return k;
    return (
      Number(b.curatorScore ?? b.venueScore ?? 0) -
      Number(a.curatorScore ?? a.venueScore ?? 0)
    );
  });
}

function groupByCountry(rows: Venue[]) {
  const map = new Map<string, Venue[]>();
  for (const v of sortVenues(rows)) {
    const key = (v.country ?? "").toUpperCase() || "—";
    const list = map.get(key) ?? [];
    list.push(v);
    map.set(key, list);
  }
  return [...map.entries()].sort(
    (a, b) => countrySortKey(a[0]) - countrySortKey(b[0]),
  );
}

export function VenuesWorkbench({ initial }: { initial: Venue[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"club" | "festival" | "other">("club");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("NL");
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
        country: country || null,
        raUrl: raUrl || null,
        status: "seed",
        tier: kind === "festival" ? "festival" : "mid",
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

  const suggested = useMemo(
    () =>
      sortVenues(initial.filter((v) => v.status === "suggested")).sort(
        (a, b) =>
          Number(b.venueScore ?? b.curatorScore ?? 0) -
          Number(a.venueScore ?? a.curatorScore ?? 0),
      ),
    [initial],
  );
  const active = useMemo(
    () =>
      initial.filter((v) => v.status === "seed" || v.status === "accepted"),
    [initial],
  );
  const other = useMemo(
    () =>
      initial.filter(
        (v) =>
          v.status !== "suggested" &&
          v.status !== "seed" &&
          v.status !== "accepted",
      ),
    [initial],
  );
  const activeByCountry = useMemo(() => groupByCountry(active), [active]);
  const festivals = active.filter((v) => v.kind === "festival").length;
  const clubs = active.filter((v) => v.kind === "club").length;

  async function acceptTop5() {
    const top = suggested.slice(0, 5);
    for (const v of top) {
      await setStatus(v.id, "accepted");
    }
  }

  async function rejectRest() {
    const rest = suggested.slice(5);
    for (const v of rest) {
      await setStatus(v.id, "rejected");
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={addVenue}
        className="grid gap-3 border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="text-sm lg:col-span-2">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Naam
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Type
          </span>
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "club" | "festival" | "other")
            }
            className="w-full border border-border bg-bg px-2 py-2"
          >
            <option value="club">Club</option>
            <option value="festival">Festival</option>
            <option value="other">Overig</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Stad
          </span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Land
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full border border-border bg-bg px-2 py-2"
          >
            <option value="NL">NL</option>
            <option value="DE">DE</option>
            <option value="UK">UK</option>
            <option value="FR">FR</option>
            <option value="HR">HR</option>
            <option value="BE">BE</option>
            <option value="ES">ES</option>
          </select>
        </label>
        <label className="text-sm lg:col-span-2">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            RA-link (club of promoter)
          </span>
          <input
            value={raUrl}
            onChange={(e) => setRaUrl(e.target.value)}
            placeholder="https://ra.co/clubs/… of /promoters/…"
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <div className="flex items-end lg:col-span-6">
          <button
            type="submit"
            disabled={pending}
            className="border border-accent bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-60"
          >
            Toevoegen aan startlijst
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-warn">{error}</p> : null}

      <section className="space-y-6">
        <div>
          <h2 className="font-display text-xl tracking-[0.04em]">Startlijst</h2>
          <p className="mt-1 text-sm text-text-muted">
            {clubs} clubs · {festivals} festivals — gegroepeerd per land. Klik
            door voor parties en line-ups.
          </p>
          <div className="mt-2">
            <RadarInfoTip topic="curator" withLabel />
          </div>
        </div>

        {active.length === 0 ? (
          <p className="border border-dashed border-border px-4 py-8 text-sm text-text-muted">
            Nog geen venues. Voeg clubs/festivals toe met een RA-link.
          </p>
        ) : (
          activeByCountry.map(([code, rows]) => {
            const fest = rows.filter((v) => v.kind === "festival");
            const clubRows = rows.filter((v) => v.kind !== "festival");
            return (
              <div key={code} className="space-y-3">
                <h3 className="text-[11px] tracking-[0.14em] text-text-dim uppercase">
                  {countryLabel(code)} · {rows.length}
                </h3>
                {fest.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-text-muted">Festivals</p>
                    <VenueTable
                      rows={fest}
                      onDelete={remove}
                      showCountry={false}
                    />
                  </div>
                ) : null}
                {clubRows.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-text-muted">Clubs</p>
                    <VenueTable
                      rows={clubRows}
                      onDelete={remove}
                      showCountry={false}
                    />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {suggested.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-xl tracking-[0.04em]">
                Suggesties
              </h2>
              <div className="mt-1">
                <RadarInfoTip topic="overlap" withLabel />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={acceptTop5}
                className="border border-border px-2 py-1 text-xs hover:border-accent"
              >
                Top 5 accepteren
              </button>
              {suggested.length > 5 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={rejectRest}
                  className="border border-border px-2 py-1 text-xs hover:border-accent"
                >
                  Rest afwijzen
                </button>
              ) : null}
            </div>
          </div>
          <VenueTable
            rows={suggested}
            onAccept={(id) => setStatus(id, "accepted")}
            onReject={(id) => setStatus(id, "rejected")}
            onDelete={remove}
            scoreTopic="overlap"
          />
        </section>
      ) : null}

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
  showCountry = true,
  scoreTopic = "curator",
}: {
  rows: Venue[];
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onDelete: (id: string) => void;
  showCountry?: boolean;
  scoreTopic?: "curator" | "overlap";
}) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-text-dim uppercase">
            <th className="px-3 py-2 font-medium">Venue</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">
              <span className="inline-flex items-center gap-1">
                Score
                <RadarInfoTip topic={scoreTopic} />
              </span>
            </th>
            <th className="px-3 py-2 font-medium">RA</th>
            <th className="px-3 py-2 font-medium text-right">Actie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="border-b border-border/70">
              <td className="px-3 py-2.5">
                <Link
                  href={`/radar/venues/${v.id}`}
                  className="font-medium hover:underline"
                >
                  {v.name}
                </Link>
                <p className="text-xs text-text-muted">
                  {v.kind === "festival" ? "festival" : v.kind}
                  {v.tier ? ` · ${RADAR_VENUE_TIER_NL[v.tier]}` : ""}
                  {v.city ? ` · ${v.city}` : ""}
                  {showCountry && v.country ? `, ${v.country}` : ""}
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
                    href={
                      v.raUrl.startsWith("http")
                        ? v.raUrl
                        : `https://${v.raUrl}`
                    }
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
                    className="border border-border px-2 py-1 text-xs text-warn hover:border-warn"
                  >
                    Verwijder
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
