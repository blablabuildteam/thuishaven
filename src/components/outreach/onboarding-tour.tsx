"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "thuishaven-outreach-tour-v1";

const STEPS = [
  {
    title: "Zo werkt Outreach",
    body: "Drie stappen: agenda bijwerken → bedrijven bekijken → mails versturen. Resultaten zie je daarna terug.",
  },
  {
    title: "1. Agenda",
    body: "Zet open dagen klaar. Diezelfde agenda stuur je mee in mails naar bedrijven.",
    href: "/outreach/beschikbaarheid",
    cta: "Naar agenda",
  },
  {
    title: "2. Bedrijven",
    body: "Hier staat de lijst. Elk bedrijf heeft een label: Jubileum, Algemeen feest, Past niet, of Niet mailen — zo weet je wat er gebeurt.",
    href: "/outreach/crm",
    cta: "Naar bedrijven",
  },
  {
    title: "3. Mailen",
    body: "Maak gepersonaliseerde mails en verstuur ze. Opens en replies landen onder Resultaten.",
    href: "/outreach/emails",
    cta: "Naar mailen",
  },
] as const;

export function OutreachOnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "done") return;
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function finish() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-tour-title"
        className="w-full max-w-md border border-border bg-surface p-5 shadow-lg"
      >
        <p className="text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
          Rondleiding · {step + 1}/{STEPS.length}
        </p>
        <h2
          id="outreach-tour-title"
          className="mt-2 font-display text-2xl tracking-[0.06em] text-text"
        >
          {current.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          {current.body}
        </p>

        {"href" in current && current.href ? (
          <Link
            href={current.href}
            className="mt-4 inline-flex text-sm text-accent underline-offset-2 hover:underline"
          >
            {current.cta} →
          </Link>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-2">
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
                className="border border-border px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
              >
                Terug
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              {last ? "Aan de slag" : "Volgende"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
