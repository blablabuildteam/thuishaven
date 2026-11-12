"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { radarScoreTopic } from "@/lib/radar/score-copy";
import { cn } from "@/lib/utils";

type Props = {
  /** Key from RADAR_SCORE_TOPICS, of custom short text via `text`. */
  topic?: string;
  /** Override short tooltip text. */
  text?: string;
  /** Show “meer uitleg” link to /radar/uitleg#id */
  hrefTopic?: string;
  className?: string;
  /** Larger clickable “Wat is dit?” style */
  withLabel?: boolean;
  /** Preferred side; flips automatically near the viewport edge. */
  align?: "start" | "end";
};

type PanelPos = { top: number; left: number; width: number };

export function RadarInfoTip({
  topic,
  text,
  hrefTopic,
  className = "",
  withLabel = false,
  align = "start",
}: Props) {
  const entry = topic ? radarScoreTopic(topic) : undefined;
  const tip = text ?? entry?.short ?? "";
  const anchor = hrefTopic ?? topic;
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const hasContent = Boolean(tip || entry);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    function place() {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      const gap = 6;
      let left = align === "end" ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = r.bottom + gap;
      const estimatedHeight = 140;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, r.top - gap - estimatedHeight);
      }
      setPos({ top, left, width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  if (!hasContent) return null;

  return (
    <span ref={rootRef} className={cn("relative inline-flex items-center", className)}>
      <button
        ref={btnRef}
        type="button"
        title={tip}
        aria-label={tip || entry?.title || "Uitleg"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 text-text-dim hover:text-text"
      >
        <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        {withLabel ? (
          <span className="text-xs normal-case tracking-normal">
            Wat is dit?
          </span>
        ) : null}
      </button>
      {open && pos ? (
        <span
          ref={panelRef}
          id={panelId}
          role="dialog"
          className="fixed z-50 border border-border bg-surface px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal text-text-muted normal-case shadow-md"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {entry ? (
            <>
              <span className="block font-medium text-text">{entry.title}</span>
              <span className="mt-1 block">{entry.short}</span>
            </>
          ) : (
            <span className="block">{tip}</span>
          )}
          {anchor ? (
            <Link
              href={`/radar/uitleg#${anchor}`}
              className="mt-2 inline-block underline hover:text-text"
              onClick={() => setOpen(false)}
            >
              Volledige uitleg →
            </Link>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
