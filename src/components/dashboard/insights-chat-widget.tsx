"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { InsightsChatPanel } from "@/components/dashboard/insights-chat-panel";
import { cn } from "@/lib/utils";

const GEMINI_ICON = "/social-icons/Google_Gemini_icon_2025.svg.webp";

export function InsightsChatWidget({
  comingSoon = false,
}: {
  comingSoon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      <section
        aria-labelledby={titleId}
        aria-hidden={!open}
        hidden={!open}
        className={cn(
          "pointer-events-auto flex w-[min(420px,calc(100vw-2rem))] flex-col border border-border bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.18)]",
          comingSoon
            ? "h-auto"
            : "h-[min(580px,calc(100dvh-7.5rem))]",
          !open && "hidden",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.14em] text-text-dim uppercase">
              AI
            </p>
            <h2 id={titleId} className="font-display text-lg tracking-[0.02em]">
              Vraag de data
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex size-8 items-center justify-center text-text-muted hover:text-text"
            aria-label="Chat sluiten"
          >
            <X className="size-4" />
          </button>
        </header>
        {comingSoon ? (
          <div className="px-4 py-8">
            <p className="font-display text-xl tracking-[0.02em]">Coming soon</p>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              De Gemini-chat komt hier. We zetten hem live zodra hij stabiel
              met de dashboarddata praat.
            </p>
          </div>
        ) : (
          <InsightsChatPanel active={open} />
        )}
      </section>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto inline-flex size-14 items-center justify-center rounded-full bg-[#161616] shadow-[0_8px_24px_rgba(0,0,0,0.28)] ring-1 ring-white/10 transition-transform hover:scale-105",
          open && "ring-2 ring-white/25",
        )}
        aria-expanded={open}
        aria-label={open ? "Chat sluiten" : "Gemini-chat openen"}
      >
        <img
          src={GEMINI_ICON}
          alt=""
          width={28}
          height={28}
          className="size-7 object-contain"
        />
      </button>
    </div>
  );
}
