"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

function toDraft(value: number | null): string {
  return value == null ? "" : String(value);
}

function parseDraft(
  draft: string,
  allowEmpty: boolean,
): number | null | "invalid" {
  const trimmed = draft.trim();
  if (trimmed === "") return allowEmpty ? null : "invalid";
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 1 || n > 100_000) return "invalid";
  return n;
}

export function ExpectedCell({
  id,
  name,
  value,
  isExternal,
  onSaved,
}: {
  id: string;
  name: string;
  value: number | null;
  isExternal?: boolean;
  onSaved: (value: number | null) => void;
}) {
  const router = useRouter();
  const committed = useRef(value);
  const focused = useRef(false);
  const [draft, setDraft] = useState(toDraft(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowEmpty = !isExternal;

  useEffect(() => {
    if (focused.current) return;
    committed.current = value;
    setDraft(toDraft(value));
  }, [value]);

  async function save() {
    const parsed = parseDraft(draft, allowEmpty);
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
      const href = isExternal
        ? `/api/dashboard/external-ticket-events/${id}`
        : `/api/dashboard/editions/${id}/expected`;
      const res = await fetch(href, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedAttendees: parsed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        expectedAttendees?: number | null;
        event?: { expectedAttendees?: number };
      };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        setDraft(toDraft(committed.current));
        return;
      }
      const next =
        data.expectedAttendees ?? data.event?.expectedAttendees ?? parsed;
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
      <span className="sr-only">Expected {name}</span>
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
        title={error ?? "Expected — forecast hoeveel mensen er komen"}
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
