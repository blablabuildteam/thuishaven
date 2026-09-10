"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter } from "next/navigation";

const STORAGE_KEY = "thuishaven-outreach-tour-v2";

type TourStep = {
  /** Matches data-tour on a real UI element */
  target: string;
  title: string;
  body: string;
  /** Navigate here first so the target exists (optional) */
  go?: string;
};

const STEPS: TourStep[] = [
  {
    target: "nav-bedrijven",
    title: "Bedrijven",
    body: "Start hier. Elk bedrijf heeft een label: Jubileum, Algemeen feest, Past niet, of Niet mailen.",
  },
  {
    target: "crm-mailen",
    title: "Mailen vanaf de lijst",
    body: "Op de bedrijvenpagina kun je met één knop naar Mailen. Labels vertellen welke hoek de mail krijgt.",
    go: "/outreach/crm",
  },
  {
    target: "nav-mailen",
    title: "Mailen",
    body: "Hier maak je gepersonaliseerde mails en verstuur je ze.",
  },
  {
    target: "nav-resultaten",
    title: "Resultaten",
    body: "Opens, replies en leads komen hier terug.",
  },
  {
    target: "nav-agenda",
    title: "Agenda · optioneel",
    body: "Alleen nodig als je open dagen wilt delen in een mail. Geen verplichte stap.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function readRect(tourId: string): Rect | null {
  const nodes = [
    ...document.querySelectorAll<HTMLElement>(`[data-tour="${tourId}"]`),
  ];
  for (const el of nodes) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const pad = 6;
    return {
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    };
  }
  return null;
}

export function OutreachOnboardingTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!pathname.startsWith("/outreach")) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "done") return;
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, [pathname]);

  const current = STEPS[step];

  const measure = useCallback(() => {
    if (!open || !current) return;
    setRect(readRect(current.target));
  }, [open, current]);

  useLayoutEffect(() => {
    if (!open || !current) return;

    let cancelled = false;

    const run = async () => {
      if (current.go && pathname !== current.go) {
        router.push(current.go);
      }

      for (let i = 0; i < 25; i++) {
        if (cancelled) return;
        const next = readRect(current.target);
        if (next) {
          setRect(next);
          return;
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      setRect(null);
    };

    void run();

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step, current, pathname, router, measure]);

  function finish() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open || !pathname.startsWith("/outreach") || !current) return null;

  const last = step === STEPS.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      <div className="pointer-events-auto absolute inset-0" onClick={finish}>
        {rect ? (
          <div
            className="absolute rounded-sm border-2 border-accent bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-200"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/55" />
        )}
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-tour-title"
        className="pointer-events-auto absolute z-[61] w-[min(100%-2rem,22rem)] border border-border bg-surface p-4 shadow-lg"
        style={tooltipPosition(rect)}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
          Rondleiding · {step + 1}/{STEPS.length}
        </p>
        <h2
          id="outreach-tour-title"
          className="mt-1.5 font-display text-xl tracking-[0.06em] text-text"
        >
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {current.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-text-dim hover:text-text"
          >
            Overslaan
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="border border-border px-3 py-1.5 font-display text-sm tracking-[0.1em] hover:border-accent"
              >
                Terug
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
              className="bg-accent px-3 py-1.5 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              {last ? "Klaar" : "Volgende"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function tooltipPosition(rect: Rect | null): CSSProperties {
  const margin = 12;
  const tipW = 352;
  const tipH = 210;

  if (typeof window === "undefined" || !rect) {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const placeBelow = spaceBelow > tipH + margin || rect.top < tipH + margin;

  const left = Math.min(
    Math.max(margin, rect.left),
    window.innerWidth - tipW - margin,
  );
  let top = placeBelow
    ? rect.top + rect.height + margin
    : Math.max(margin, rect.top - tipH - margin);
  top = Math.min(top, window.innerHeight - tipH - margin);

  return { left, top };
}
