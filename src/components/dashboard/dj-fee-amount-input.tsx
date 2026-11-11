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
    <div className="relative w-full">
      <div
        className={cn(
          "flex h-8 w-full items-center border-[1.5px] transition-colors focus-within:border-border-strong",
          invalid
            ? "border-danger"
            : value != null
              ? "border-border bg-bg"
              : legacy
                ? "border-dashed border-border-strong/50 bg-bg"
                : "th-marker border-transparent",
          disabled && "opacity-60",
        )}
      >
        <span className="th-num pl-2 text-sm text-text-dim" aria-hidden>
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
          className="th-num w-full min-w-0 bg-transparent px-1.5 text-lg outline-none placeholder:font-sans placeholder:text-xs placeholder:font-medium placeholder:text-text-muted"
        />
      </div>
      {invalid ? (
        <p className="mt-0.5 text-[10px] text-danger">Alleen een bedrag, bv. 1.250</p>
      ) : legacy ? (
        <p
          className="mt-0.5 truncate text-[10px] text-text-dim"
          title={`Was range ${legacy.label} — vul het bedrag in`}
        >
          Oude range — vul exact bedrag in
        </p>
      ) : null}
    </div>
  );
}
