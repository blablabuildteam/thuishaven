"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export function LeadNotifyButton({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/leads/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Notificatie mislukt");
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending || ok}
        onClick={run}
        className="border border-border bg-bg px-3 py-1.5 font-display text-xs tracking-[0.1em] disabled:opacity-60"
      >
        {pending ? "Bezig…" : ok ? "Mail verstuurd" : "Mail salesteam"}
      </button>
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
    </div>
  );
}
