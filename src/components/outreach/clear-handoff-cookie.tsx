"use client";

import { useEffect } from "react";

/** Clears the Bedrijven→Mailen handoff cookie after the page has read it. */
export function ClearHandoffCookie() {
  useEffect(() => {
    void fetch("/api/outreach/handoff", { method: "DELETE" }).catch(() => {
      /* ignore */
    });
  }, []);
  return null;
}
