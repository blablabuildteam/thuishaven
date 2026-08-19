"use client";

import { useState } from "react";

export function AlertTestMailButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/alerts/test-email", {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        to?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus("err");
        setMessage(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setStatus("ok");
      setMessage(`Verstuurd naar ${(data.to ?? []).join(", ")}`);
    } catch (e) {
      setStatus("err");
      setMessage(e instanceof Error ? e.message : "Mislukt");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={send}
        disabled={status === "loading"}
        className="border border-border px-3 py-2 text-sm hover:border-text disabled:opacity-50"
      >
        {status === "loading" ? "Versturen…" : "Stuur testmail"}
      </button>
      {message && (
        <p
          className={`text-xs ${status === "err" ? "text-danger" : "text-text-muted"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
