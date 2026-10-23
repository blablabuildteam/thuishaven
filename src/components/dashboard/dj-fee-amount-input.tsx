"use client";

import { useState } from "react";
import {
  djFeeRangeDef,
  parseDjFeeAmount,
  type DjFeeRangeId,
} from "@/lib/dashboard/dj-fee-ranges";
import { cn, formatNumber } from "@/lib/utils";

function draftFor(value: number | null): string {
  return value == null ? "" : formatNumber(value);
}

/** Exact fee in whole euros. Saves on blur or Enter; empty clears it. */
export function DjFeeAmountInput({
  value,
  legacyRange,
  disabled,
  label,
  onChange,
}: {
  value: number | null;
  /** Old band, shown as a hint until an amount is entered. */
  legacyRange: DjFeeRangeId | null;
  disabled?: boolean;
  label: string;
  onChange: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState(() => draftFor(value));
  const [invalid, setInvalid] = useState(false);
  const [synced, setSynced] = useState(value);
  const legacy = value == null ? djFeeRangeDef(legacyRange) : null;

  // Saved (or rolled back) value changed: reset the draft to match.
  if (synced !== value) {
    setSynced(value);
    setDraft(draftFor(value));
    setInvalid(false);
  }

  function commit() {
    const parsed = parseDjFeeAmount(draft);
    if (parsed === "invalid") {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed === value) {
      setDraft(draftFor(value));
      return;
    }
    onChange(parsed);
  }

  return (
    <div className="w-full">
      <div
        className={cn(
          "flex w-full items-center border bg-bg text-sm focus-within:border-text",
          invalid
            ? "border-danger"
            : value == null
              ? "border-highlight"
              : "border-border",
          disabled && "opacity-60",
        )}
      >
        <span className="pl-2.5 text-text-dim" aria-hidden>
          €
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={disabled}
          placeholder={legacy ? legacy.label.replace(/€/g, "") : "Invullen"}
          aria-label={label}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (invalid) setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(draftFor(value));
              setInvalid(false);
              e.currentTarget.blur();
            }
          }}
          className="w-full min-w-0 bg-transparent px-1.5 py-1 tabular-nums outline-none placeholder:text-text-dim"
        />
      </div>
      {invalid ? (
        <p className="mt-0.5 text-[10px] text-danger">Alleen een bedrag, bv. 1.250</p>
      ) : legacy ? (
        <p className="mt-0.5 text-[10px] text-text-dim">
          Was range {legacy.label} — vul het bedrag in
        </p>
      ) : null}
    </div>
  );
}
