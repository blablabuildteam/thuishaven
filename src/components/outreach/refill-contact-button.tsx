"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  prospectId: string;
};

export function RefillContactButton({ prospectId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run() {
    setError(null);
    setOk(null);
    const res = await fetch("/api/outreach/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prospectId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Herzoeken mislukt",
      );
      return;
    }
    const person = data.rows?.[0]?.person;
    setOk(
      person?.name
        ? `Gevonden: ${person.name}${person.title ? ` · ${person.title}` : ""}`
        : "Contact bijgewerkt",
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        className="border border-border px-3 py-1.5 text-xs tracking-[0.08em] hover:border-accent disabled:opacity-50"
      >
        {pending ? "Zoeken…" : "Opnieuw Event Manager zoeken"}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? <p className="mt-2 text-xs text-text-muted">{ok}</p> : null}
    </div>
  );
}
