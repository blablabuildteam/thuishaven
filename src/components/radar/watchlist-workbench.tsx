"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { FollowerSparkline } from "@/components/radar/follower-growth-chart";
import {
  RadarBadge,
  RadarScoreBars,
  radarScoreClass,
} from "@/components/radar/radar-badge";
import type { RadarBadgeId } from "@/lib/radar/badge-defs";
import { RADAR_ARTIST_STATUS_NL, type RadarArtistStatus } from "@/lib/radar/types";
import { cn } from "@/lib/utils";

type Artist = {
  id: string;
  name: string;
  status: RadarArtistStatus;
  growthScore: string | null;
  momentumScore: string | null;
  fitScore: string | null;
  bookabilityScore: string | null;
  scoreReasons: string[];
  residentCountry: string | null;
  country: string | null;
  raFollowerCount: number | null;
  badges: RadarBadgeId[];
  sparkline: number[];
};

type Candidate = {
  id: string;
  name: string;
  growthScore: string | null;
  momentumScore: string | null;
  residentCountry: string | null;
  country: string | null;
  badges: RadarBadgeId[];
  scoreReasons: string[];
};

function num(v: string | null) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function WatchlistWorkbench({
  initial,
  total,
  page,
  pageSize,
  candidates,
}: {
  initial: Artist[];
  total: number;
  page: number;
  pageSize: number;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  async function setStatus(id: string, status: RadarArtistStatus) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/radar/artists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Status updaten mislukt");
      return;
    }
    startTransition(() => router.refresh());
  }

  function goPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    startTransition(() => router.replace(`?${params.toString()}`));
  }

  return (
    <div className="space-y-8">
      {candidates.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-xl tracking-[0.04em]">
                Aanvoer · zet op Volgen
              </h2>
              <p className="text-xs text-text-muted">
                Sterke nieuwe namen. Eén klik en ze komen op de watchlist —
                daarna meten we groei.
              </p>
            </div>
            <Link
              href="/radar/artiesten?th=nieuw"
              className="text-xs underline hover:text-text"
            >
              Alle ontdekkingen →
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {candidates.map((c) => {
              const score = num(c.growthScore);
              return (
                <li
                  key={c.id}
                  className="flex flex-col border border-border bg-surface p-3"
                >
                  <Link
                    href={`/radar/artiesten/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-text-dim line-clamp-1">
                    {c.scoreReasons[0] ??
                      c.residentCountry ??
                      c.country ??
                      "—"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.badges.slice(0, 2).map((b) => (
                      <RadarBadge key={b} id={b} />
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span
                      className={cn(
                        "font-display text-2xl tabular-nums",
                        radarScoreClass(score),
                      )}
                    >
                      {score != null ? Math.round(score) : "—"}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => setStatus(c.id, "watching")}
                      className="border border-text bg-text px-2.5 py-1 text-xs text-bg disabled:opacity-50"
                    >
                      Volgen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3">
          <h2 className="font-display text-xl tracking-[0.04em]">
            Jouw watchlist
          </h2>
          <p className="text-xs text-text-muted">
            {total === 0
              ? "Nog leeg. Begin bij Aanvoer hierboven of bij Artiesten."
              : `${total} namen · sparkline = RA-volgers over tijd`}
            {pending ? " · laden…" : ""}
          </p>
        </div>

        {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}

        {initial.length === 0 ? (
          <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-text-muted">
            Niemand op Volgen of Shortlist. Pak 5 namen uit de aanvoer en zet ze
            op Volgen — over een week zie je hier de eerste groei-lijnen.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-elevated/50 text-left text-[10px] tracking-[0.12em] text-text-dim uppercase">
                  <th className="px-3 py-2.5 font-medium">Artiest</th>
                  <th className="px-3 py-2.5 font-medium">Score</th>
                  <th className="px-3 py-2.5 font-medium">RA-groei</th>
                  <th className="px-3 py-2.5 text-right font-medium">RA-volgers</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {initial.map((a) => {
                  const score = num(a.growthScore);
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-border/70 hover:bg-surface-hover"
                    >
                      <td className="px-3 py-3">
                        <Link
                          href={`/radar/artiesten/${a.id}`}
                          className="font-medium hover:underline"
                        >
                          {a.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {a.badges.slice(0, 3).map((b) => (
                            <RadarBadge key={b} id={b} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-display text-2xl tabular-nums",
                              radarScoreClass(score),
                            )}
                          >
                            {score != null ? Math.round(score) : "—"}
                          </span>
                          <RadarScoreBars
                            momentum={num(a.momentumScore)}
                            fit={num(a.fitScore)}
                            bookability={num(a.bookabilityScore)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <FollowerSparkline values={a.sparkline} />
                        {a.sparkline.length < 2 ? (
                          <span className="text-[10px] text-text-dim">
                            wacht op data
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-text-muted">
                        {a.raFollowerCount?.toLocaleString("nl-NL") ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              ["watching", "Volgen"],
                              ["shortlist", "Shortlist"],
                              ["passed", "Weg"],
                            ] as const
                          ).map(([s, label]) => (
                            <button
                              key={s}
                              type="button"
                              disabled={busyId === a.id || a.status === s}
                              onClick={() => setStatus(a.id, s)}
                              className={cn(
                                "border px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] disabled:opacity-40",
                                a.status === s
                                  ? "border-text bg-text text-bg"
                                  : "border-border hover:border-text",
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px] text-text-dim">
                          {RADAR_ARTIST_STATUS_NL[a.status]}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 ? (
          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={page <= 1 || pending}
              onClick={() => goPage(page - 1)}
              className="border border-border px-3 py-1.5 disabled:opacity-40"
            >
              ← Vorige
            </button>
            <span className="text-text-muted">
              Pagina {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount || pending}
              onClick={() => goPage(page + 1)}
              className="border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Volgende →
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
