"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useId, useState } from "react";
import { radarScoreTopic } from "@/lib/radar/score-copy";

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
  /** Anchor popover to the right (for right-aligned table headers). */
  align?: "start" | "end";
};

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

  if (!tip && !entry) return null;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
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
      {open ? (
        <span
          id={panelId}
          role="note"
          className={`absolute top-full z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] border border-border bg-surface px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal text-text-muted normal-case shadow-sm ${
            align === "end" ? "right-0" : "left-0"
          }`}
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
