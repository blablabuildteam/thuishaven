"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileSpreadsheet, RefreshCw } from "lucide-react";
import type { DjFeesSheetStatus } from "@/lib/dashboard/dj-fees-sheet-sync";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(day?: string): string {
  if (!day) return "";
  const [y, m, d] = day.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Google Sheet sync status for the DJ-fees page: last sync, "Sync nu", and
 * the sheet rows that could not be placed on an event.
 */
export function DjFeesSheetSyncBar({ status }: { status: DjFeesSheetStatus }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!status.configured) return null;

  async function syncNow() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dashboard/dj-fees/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        updated?: number;
        inserted?: number;
        released?: number;
      };
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Sync mislukt" });
      } else {
        const changed = (data.updated ?? 0) + (data.inserted ?? 0) + (data.released ?? 0);
        setMessage({
          ok: true,
          text:
            changed === 0
              ? "Alles was al bijgewerkt."
              : `${changed} DJ${changed === 1 ? "" : "s"} bijgewerkt.`,
        });
      }
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Sync mislukt" });
    } finally {
      setSyncing(false);
    }
  }

  const failed = status.lastStatus === "failed";
  const unmatched = status.unmatched;

  return (
    <div className="border-[1.5px] border-border-strong bg-surface">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 text-sm">
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-text-dim" aria-hidden />
          <div className="min-w-0">
            <p className="text-text">
              Fees komen uit de{" "}
              {status.sheetUrl ? (
                <a
                  href={status.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-border-strong underline-offset-2 hover:decoration-text"
                >
                  Google Sheet
                </a>
              ) : (
                "Google Sheet"
              )}{" "}
              van de klant
              <span className="text-text-dim"> · elke ochtend gesynchroniseerd</span>
            </p>
            <p className={cn("mt-0.5 text-xs", failed ? "text-danger" : "text-text-dim")}>
              {status.lastRunAt
                ? `${failed ? "Laatste sync mislukt" : "Laatste sync"}: ${formatWhen(status.lastRunAt)}${
                    failed && status.lastError ? ` — ${status.lastError}` : ""
                  }`
                : "Nog niet gesynchroniseerd"}
            </p>
            {message && (
              <p className={cn("mt-0.5 text-xs", message.ok ? "text-success" : "text-danger")}>
                {message.text}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={syncing}
          className="th-sticker inline-flex shrink-0 items-center gap-2 self-start border-[1.5px] border-border-strong bg-surface px-3 py-2.5 text-xs transition-colors hover:bg-accent hover:text-accent-contrast disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw className={cn("size-4", syncing && "animate-spin")} aria-hidden />
          {syncing ? "Bezig…" : "Sync nu"}
        </button>
      </div>

      {!failed && unmatched.length > 0 && (
        <details className="border-t border-border">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text">
            <AlertTriangle className="size-3.5 text-highlight-fg" aria-hidden />
            {unmatched.length} regel{unmatched.length === 1 ? "" : "s"} uit de sheet niet
            gekoppeld aan een event
          </summary>
          <ul className="max-h-72 overflow-y-auto border-t border-border text-xs">
            {unmatched.map((row) => (
              <li
                key={`${row.tab}:${row.row}`}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-border px-3 py-1.5 last:border-b-0 sm:grid-cols-[4.5rem_6rem_minmax(0,12rem)_minmax(0,1fr)]"
              >
                <span className="text-text-dim tabular-nums">
                  {row.tab} r{row.row}
                </span>
                <span className="text-text-dim tabular-nums">{formatDay(row.day)}</span>
                <span className="truncate text-text">{row.name || "—"}</span>
                <span className="col-span-2 text-text-muted sm:col-span-1">{row.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
