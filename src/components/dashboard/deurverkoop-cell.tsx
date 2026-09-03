"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

function toDraft(value: number | null): string {
  return value == null ? "" : String(value);
}

function parseDraft(draft: string): number | null | "invalid" {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return "invalid";
  return n;
}

export function DeurverkoopCell({
  editionId,
  editionName,
  value,
  onSaved,
}: {
  editionId: string;
  editionName: string;
  value: number | null;
  onSaved: (value: number | null) => void;
}) {
  const router = useRouter();
  const committed = useRef(value);
  const focused = useRef(false);
  const [draft, setDraft] = useState(toDraft(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (focused.current) return;
    committed.current = value;
    setDraft(toDraft(value));
  }, [value]);

  async function save() {
    const parsed = parseDraft(draft);
    if (parsed === "invalid") {
      setError("Ongeldig aantal");
      setDraft(toDraft(committed.current));
      return;
    }
    if (parsed === committed.current) {
      setDraft(toDraft(parsed));
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/editions/${editionId}/deurverkoop`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sold: parsed }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sold?: number | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        setDraft(toDraft(committed.current));
        return;
      }
      const next = data.sold === undefined ? parsed : data.sold;
      committed.current = next;
      setDraft(toDraft(next));
      onSaved(next);
      router.refresh();
    } catch {
      setError("Opslaan mislukt");
      setDraft(toDraft(committed.current));
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="block">
      <span className="sr-only">Deurverkoop {editionName}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        placeholder="—"
        disabled={saving}
        autoComplete="off"
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          setDraft(e.target.value.replace(/[^\d]/g, ""));
          setError(null);
        }}
        onBlur={() => {
          focused.current = false;
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(toDraft(committed.current));
            setError(null);
            e.currentTarget.blur();
          }
        }}
        aria-invalid={error != null}
        title={error ?? "Deurverkoop — typ het aantal van de deurlijst"}
        className={cn(
          "ml-auto block w-[4.5rem] bg-transparent py-0.5 text-right font-mono text-sm tabular-nums outline-none",
          "border border-transparent px-1 hover:border-border focus:border-text",
          saving && "opacity-60",
          error && "border-danger text-danger",
        )}
      />
    </label>
  );
}
