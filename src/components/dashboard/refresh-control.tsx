"use client";

import { RefreshCw } from "lucide-react";
import {
  amsterdamClock,
  amsterdamDay,
  formatDayShort,
} from "@/lib/time/amsterdam";
import { cn } from "@/lib/utils";

export function formatRefreshedAt(iso: string | null): string {
  if (!iso) return "Nog niet bijgewerkt";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Nog niet bijgewerkt";
  const clock = amsterdamClock(date);
  const day = amsterdamDay(date);
  if (day === amsterdamDay(new Date())) return `Bijgewerkt vandaag ${clock}`;
  return `Bijgewerkt ${formatDayShort(day)} ${clock}`;
}

/**
 * Handmatig verversen: knop + laatste sync of lopende status.
 * Zelfde vorm als de knop bij “Verkoop per dag”.
 */
export function RefreshControl({
  onRefresh,
  spinning,
  refreshedAt,
  label,
  message,
  error,
  disabled = false,
  className,
}: {
  onRefresh: () => void;
  spinning: boolean;
  refreshedAt: string | null;
  /** Knoptekst voor screenreaders en tooltip. */
  label: string;
  /** Status tijdens of net na een sync; anders tonen we “Bijgewerkt …”. */
  message?: string | null;
  error?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={onRefresh}
        disabled={spinning || disabled}
        aria-label={label}
        title={label}
        className="inline-flex size-7 shrink-0 items-center justify-center border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
      >
        <RefreshCw className={cn("size-3.5", spinning && "animate-spin")} />
      </button>
      <p
        className="min-w-0 text-[11px] leading-snug text-text-muted"
        aria-live="polite"
      >
        {message ?? formatRefreshedAt(refreshedAt)}
        {error ? <span className="text-danger"> · {error}</span> : null}
      </p>
    </div>
  );
}
