"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export function FollowUpDraftButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function run() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/follow-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apply: true, limit: 10 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Follow-up drafts mislukt");
        return;
      }
      setOk(`${data.created ?? 0} follow-up drafts`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] disabled:opacity-60"
      >
        {pending ? "Bezig…" : "Maak follow-up drafts"}
      </button>
      {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
    </div>
  );
}
