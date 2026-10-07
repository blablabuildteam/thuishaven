"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Daily outreach routes — warm the RSC cache so sidebar clicks feel instant. */
const OUTREACH_ROUTES = [
  "/outreach/uitleg",
  "/outreach/juridisch",
  "/outreach/lijst-bijwerken",
  "/outreach/crm",
  "/outreach/emails",
  "/outreach/planning",
  "/outreach/analytics",
  "/outreach/leads",
  "/outreach/templates",
  "/outreach/uitsluitingen",
  "/outreach/instellingen",
  "/outreach/beschikbaarheid",
  "/outreach/kosten",
  "/outreach/pipeline",
] as const;

export function PrefetchOutreachNav() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const href of OUTREACH_ROUTES) {
        void router.prefetch(href);
      }
    };
    // After first paint — don't compete with the current page's data.
    const t = window.setTimeout(run, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [router]);

  return null;
}
