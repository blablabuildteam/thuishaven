"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonitorHealth, SystemHealth } from "@/lib/system/types";

const POLL_MS = 5 * 60 * 1000;
/** How long the banner stays open before it folds into the "!" button. */
const BANNER_MS = 8000;
const SEEN_KEY = "th-system-notice-seen";

/* ─── Data ────────────────────────────────────────────────────────────── */

const HealthContext = createContext<SystemHealth | null>(null);

export function useSystemHealth() {
  return useContext(HealthContext);
}

/** Polls /api/system/health; refreshes on focus so a fix shows up quickly. */
export function SystemHealthProvider({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/health", { cache: "no-store" });
      if (!res.ok) return;
      setHealth((await res.json()) as SystemHealth);
    } catch {
      // Offline or server hiccup: keep the last known state.
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  return <HealthContext.Provider value={health}>{children}</HealthContext.Provider>;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function fmtWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function pageMatches(pathname: string, pages: string[]): boolean {
  return pages.some(
    (p) => p === "/" || pathname === p || pathname.startsWith(`${p}/`),
  );
}

function headline(issues: MonitorHealth[]): string {
  const down = issues.filter((i) => i.severity === "down");
  const list = down.length ? down : issues;
  const names = list.map((i) => i.label);
  const joined =
    names.length <= 2
      ? names.join(" en ")
      : `${names.slice(0, -1).join(", ")} en ${names.at(-1)}`;
  return down.length
    ? `${joined} ${down.length === 1 ? "werkt" : "werken"} niet goed`
    : `Let op: ${joined}`;
}

function signatureOf(issues: MonitorHealth[]): string {
  return issues
    .map((i) => `${i.id}:${i.severity}:${i.kind}`)
    .sort()
    .join("|");
}

function readSeen(): string | null {
  try {
    return window.sessionStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(sig: string) {
  try {
    window.sessionStorage.setItem(SEEN_KEY, sig);
  } catch {
    // Storage blocked: the banner just shows again next load.
  }
}

/* ─── Issue list (shared by panel and banner) ─────────────────────────── */

function IssueRow({ issue, isAdmin }: { issue: MonitorHealth; isAdmin: boolean }) {
  const last = fmtWhen(issue.lastSuccessAt);
  return (
    <li className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-2 shrink-0",
            issue.severity === "down" ? "bg-danger" : "bg-warn",
          )}
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-text">
            {issue.label}
            <span className="ml-2 text-xs font-normal text-text-dim">
              {issue.severity === "down" ? "Storing" : "Waarschuwing"}
            </span>
          </p>
          <p className="text-sm text-text-muted">{issue.impact}</p>
          {last ? (
            <p className="text-xs text-text-dim">Laatst bijgewerkt: {last}</p>
          ) : null}
          {isAdmin && issue.detail ? (
            <p className="break-words text-xs text-text-dim">{issue.detail}</p>
          ) : null}
          {isAdmin && issue.action ? (
            <p className="text-xs text-text">{issue.action}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/* ─── App-wide notice ─────────────────────────────────────────────────── */

/**
 * One notice for the whole app. When something is down, a banner shows for
 * a few seconds (once per problem set per session), then folds into a "!"
 * button that stays until the problem is gone.
 */
export function SystemStatusNotice({ isAdmin }: { isAdmin: boolean }) {
  const health = useSystemHealth();
  const issues = health?.issues ?? [];
  const signature = signatureOf(issues);
  const hasDown = issues.some((i) => i.severity === "down");
  const [bannerOpen, setBannerOpen] = useState(false);
  // The panel belongs to one problem set: when that changes or clears, it closes.
  const [panelSig, setPanelSig] = useState<string | null>(null);
  const panelOpen = panelSig !== null && panelSig === signature;
  const setPanelOpen = (open: boolean) => setPanelSig(open ? signature : null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Show the banner once per new set of outages.
  useEffect(() => {
    if (!hasDown || !signature) return;
    if (readSeen() === signature) return;
    writeSeen(signature);
    const show = window.setTimeout(() => setBannerOpen(true), 400);
    const hide = window.setTimeout(() => setBannerOpen(false), 400 + BANNER_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [hasDown, signature]);

  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPanelSig(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelSig(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  if (issues.length === 0) return null;

  const tone = hasDown ? "danger" : "warn";

  return (
    <div
      ref={rootRef}
      className="fixed right-3 bottom-4 z-40 flex flex-col items-end gap-2 lg:top-3 lg:bottom-auto lg:flex-col-reverse"
    >
      {bannerOpen && !panelOpen ? (
        <div
          role="status"
          className="system-notice-in w-[min(24rem,calc(100vw-1.5rem))] border border-danger/50 bg-bg-elevated shadow-lg"
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{headline(issues)}</p>
              <p className="mt-0.5 text-sm text-text-muted">
                {issues.find((i) => i.severity === "down")?.impact}
              </p>
              <button
                type="button"
                onClick={() => {
                  setBannerOpen(false);
                  setPanelOpen(true);
                }}
                className="mt-2 text-xs tracking-[0.08em] text-text underline underline-offset-2"
              >
                Details bekijken
              </button>
            </div>
            <button
              type="button"
              aria-label="Melding sluiten"
              onClick={() => setBannerOpen(false)}
              className="inline-flex size-6 shrink-0 items-center justify-center text-text-muted hover:text-text"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      {panelOpen ? (
        <div
          role="dialog"
          aria-label="Systeemstatus"
          className="system-notice-in w-[min(26rem,calc(100vw-1.5rem))] border border-border bg-bg-elevated shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="font-display text-xs tracking-[0.12em] text-text-dim uppercase">
              Systeemstatus
            </p>
            <button
              type="button"
              aria-label="Sluiten"
              onClick={() => setPanelOpen(false)}
              className="inline-flex size-6 items-center justify-center text-text-muted hover:text-text"
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} isAdmin={isAdmin} />
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-xs">
            {isAdmin ? (
              <>
                <Link href="/koppelingen" className="text-text underline underline-offset-2">
                  Bronnen
                </Link>
                <Link href="/dashboard/logs" className="text-text underline underline-offset-2">
                  Log
                </Link>
              </>
            ) : (
              <p className="text-text-dim">
                Het team is op de hoogte. Deze melding verdwijnt vanzelf zodra het is opgelost.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setBannerOpen(false);
          setPanelOpen(!panelOpen);
        }}
        aria-expanded={panelOpen}
        aria-label={`Systeemstatus: ${headline(issues)}`}
        title={headline(issues)}
        className={cn(
          "inline-flex size-9 items-center justify-center border font-display text-base shadow-md transition-colors",
          tone === "danger"
            ? "border-danger bg-danger text-white hover:bg-danger/90"
            : "border-warn bg-warn text-black hover:bg-warn/90",
        )}
      >
        !
      </button>
    </div>
  );
}

/* ─── Per-page warning ────────────────────────────────────────────────── */

/**
 * Inline strip at the top of a page whose data comes from a broken source,
 * so "no sales today" and "Weeztix is down" never look the same.
 */
export function PageHealthWarning({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const health = useSystemHealth();
  const relevant = (health?.issues ?? []).filter((i) =>
    pageMatches(pathname, i.pages),
  );
  if (relevant.length === 0) return null;
  const hasDown = relevant.some((i) => i.severity === "down");

  return (
    <div
      role="status"
      className={cn(
        "mb-4 border px-3 py-2.5 text-sm",
        hasDown ? "border-danger/40 bg-danger/10" : "border-warn/50 bg-warn/10",
      )}
    >
      <ul className="space-y-1.5">
        {relevant.map((issue) => {
          const last = fmtWhen(issue.lastSuccessAt);
          return (
            <li key={issue.id} className="flex items-start gap-2">
              <AlertTriangle
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  issue.severity === "down" ? "text-danger" : "text-warn-fg",
                )}
              />
              <p className="min-w-0">
                <strong className="font-medium">{issue.label}:</strong>{" "}
                {issue.impact}
                {last ? (
                  <span className="text-text-muted"> Laatst bijgewerkt {last}.</span>
                ) : null}
                {isAdmin && issue.action ? (
                  <span className="text-text-muted"> {issue.action}</span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
