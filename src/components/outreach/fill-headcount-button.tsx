"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export function FillHeadcountButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          setErr(null);
          startTransition(async () => {
            const res = await fetch("/api/outreach/crm/headcount", {
              method: "POST",
            });
            const data = (await res.json().catch(() => ({}))) as {
              filled?: number;
              tried?: number;
              error?: string;
            };
            if (!res.ok) {
              setErr(data.error ?? "Ophalen mislukt");
              return;
            }
            setMsg(`${data.filled ?? 0} schattingen uit Wikidata`);
            router.refresh();
          });
        }}
        className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-60"
      >
        {pending ? "Ophalen…" : "Vul schattingen"}
      </button>
      {msg ? <StatusBadge tone="success">{msg}</StatusBadge> : null}
      {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
    </div>
  );
}
