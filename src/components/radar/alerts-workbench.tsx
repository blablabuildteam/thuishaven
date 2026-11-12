"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";

type Alert = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  artistId: string | null;
  venueId: string | null;
  triggeredAt: string | Date;
  readAt: string | Date | null;
};

export function AlertsWorkbench({ initial }: { initial: Alert[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function markRead(id: string) {
    setError(null);
    const res = await fetch("/api/radar/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Markeren mislukt");
      return;
    }
    router.refresh();
  }

  async function markAllRead() {
    setError(null);
    const res = await fetch("/api/radar/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Markeren mislukt");
      return;
    }
    router.refresh();
  }

  if (initial.length === 0) {
    return (
      <div className="space-y-3">
        <RadarInfoTip topic="alerts" withLabel />
        <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-text-muted">
          Geen alerts. Ze verschijnen bij snelle groei of nieuwe namen boven de
          drempel.
        </p>
      </div>
    );
  }

  const unread = initial.filter((a) => !a.readAt).length;

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RadarInfoTip topic="alerts" withLabel />
        {unread > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            className="border border-border px-3 py-1.5 text-xs hover:border-accent"
          >
            Alles gelezen ({unread})
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-border border border-border">
        {initial.map((a) => (
          <li
            key={a.id}
            className={`flex flex-wrap items-start justify-between gap-3 px-3 py-3 sm:px-4 ${
              a.readAt ? "opacity-60" : "bg-surface"
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
                {a.kind.replaceAll("_", " ")} ·{" "}
                {new Date(a.triggeredAt).toLocaleString("nl-NL")}
              </p>
              <p className="mt-1 font-medium">{a.title}</p>
              {a.body ? (
                <p className="mt-1 text-sm text-text-muted">{a.body}</p>
              ) : null}
              {a.artistId ? (
                <Link
                  href={`/radar/artiesten/${a.artistId}`}
                  className="mt-2 inline-block text-xs underline hover:text-text"
                >
                  Open dossier
                </Link>
              ) : null}
            </div>
            {!a.readAt ? (
              <button
                type="button"
                onClick={() => markRead(a.id)}
                className="shrink-0 border border-border px-2 py-1 text-xs hover:border-accent"
              >
                Gelezen
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
