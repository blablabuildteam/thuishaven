"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DJ_FEE_RANGES,
  djFeeRangeDef,
  type DjFeeRangeId,
} from "@/lib/dashboard/dj-fee-ranges";
import { cn } from "@/lib/utils";

export function DjFeeRangeSelect({
  value,
  disabled,
  onChange,
}: {
  value: DjFeeRangeId | null;
  disabled?: boolean;
  onChange: (next: DjFeeRangeId | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = djFeeRangeDef(value);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "min-w-[9.5rem] border px-2.5 py-1 text-left text-sm tabular-nums",
          selected
            ? selected.className
            : "border-border bg-bg text-text-dim hover:border-text",
          selected && "border-transparent",
          disabled && "opacity-60",
        )}
      >
        {selected?.label ?? "—"}
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Prijsrange"
          className="absolute top-full left-0 z-20 mt-1 min-w-[11rem] border border-border bg-surface p-1 shadow-lg"
        >
          {DJ_FEE_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              role="option"
              aria-selected={value === range.id}
              onClick={() => {
                onChange(range.id);
                setOpen(false);
              }}
              className={cn(
                "mb-0.5 block w-full px-2.5 py-1 text-left text-sm last:mb-0",
                range.className,
              )}
            >
              {range.label}
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={value == null}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-0.5 block w-full px-2.5 py-1 text-left text-sm text-text-dim hover:bg-surface-hover"
          >
            —
          </button>
        </div>
      )}
    </div>
  );
}
