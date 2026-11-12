"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PartyIngestForm } from "@/components/radar/party-ingest-form";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";
import {
  RADAR_PARTY_SOURCE_NL,
  RADAR_PARTY_STATUS_NL,
  type RadarPartySource,
  type RadarPartyStatus,
} from "@/lib/radar/types";

type Party = {
  id: string;
  title: string;
  startsAt: string | Date | null;
  source: RadarPartySource;
  status: RadarPartyStatus;
  externalUrl: string | null;
  venueId: string | null;
  venueName: string | null;
  city: string | null;
  country: string | null;
  artistCount: number;
  newArtistCount: number;
  artists: Array<{
    id: string | null;
    name: string;
    growthScore: string | null;
    homeGigCount: number;
    isNew: boolean;
  }>;
};

function SourceBadge({ source }: { source: RadarPartySource }) {
  return (
    <span className="border border-border px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-text-dim uppercase">
      {RADAR_PARTY_SOURCE_NL[source] ?? source}
    </span>
  );
}

export function PartiesWorkbench({
  initial,
  venues,
}: {
  initial: Party[];
  venues: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "needs_review">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown =
    filter === "needs_review"
      ? initial.filter((p) => p.status === "needs_review")
      : initial;

  async function setStatus(id: string, status: RadarPartyStatus) {
    setBusyId(id);
    await fetch(`/api/radar/parties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <span className="text-text-dim">Filter</span>
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "all" | "needs_review")
            }
            className="border border-border bg-surface px-2 py-1.5"
          >
            <option value="all">Alles</option>
            <option value="needs_review">Te reviewen</option>
          </select>
        </label>
        <RadarInfoTip topic="bronnen" withLabel />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <PartyIngestForm
          venueId={venueId || null}
          venueName={venues.find((v) => v.id === venueId)?.name}
        />
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Venue voor handmatige intake
            </span>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full border border-border bg-surface px-2 py-2"
            >
              <option value="">— geen venue —</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-text-muted">
            Feesten komen uit RA, websites, Instagram én handmatige line-ups.
            Nieuwe namen gaan automatisch de artiestenlijst in.
          </p>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-text-muted">
          Nog geen feesten in dit overzicht. Voeg een line-up toe of wacht op
          discovery.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {shown.map((p) => (
            <li key={p.id} className="px-3 py-4 sm:px-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.title}</p>
                    <SourceBadge source={p.source} />
                    {p.status === "needs_review" ? (
                      <span className="text-[10px] tracking-[0.08em] text-warn uppercase">
                        {RADAR_PARTY_STATUS_NL[p.status]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-text-dim">
                    {p.venueId ? (
                      <Link
                        href={`/radar/venues/${p.venueId}`}
                        className="underline hover:text-text"
                      >
                        {p.venueName ?? "Venue"}
                      </Link>
                    ) : (
                      "Geen venue"
                    )}
                    {p.city || p.country
                      ? ` · ${[p.city, p.country].filter(Boolean).join(", ")}`
                      : ""}
                    {" · "}
                    {p.startsAt
                      ? new Date(p.startsAt).toLocaleString("nl-NL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "datum onbekend"}
                    {p.newArtistCount > 0
                      ? ` · ${p.newArtistCount} nieuw gespot`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.externalUrl ? (
                    <a
                      href={p.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-border px-2 py-1 text-xs hover:border-accent"
                    >
                      Bron
                    </a>
                  ) : null}
                  {p.status === "needs_review" ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => setStatus(p.id, "published")}
                        className="border border-border px-2 py-1 text-xs hover:border-accent"
                      >
                        Goedkeuren
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => setStatus(p.id, "rejected")}
                        className="border border-border px-2 py-1 text-xs text-warn hover:border-warn"
                      >
                        Afwijzen
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {p.artists.map((a, i) => (
                  <li key={`${a.id ?? a.name}-${i}`}>
                    {a.id ? (
                      <Link
                        href={`/radar/artiesten/${a.id}`}
                        className="underline hover:text-text"
                      >
                        {a.name}
                      </Link>
                    ) : (
                      <span>{a.name}</span>
                    )}
                    <span className="text-text-dim">
                      {a.growthScore != null ? ` ${a.growthScore}` : ""}
                      {a.isNew ? " · nieuw" : ""}
                      {a.homeGigCount > 0 ? " · TH" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
