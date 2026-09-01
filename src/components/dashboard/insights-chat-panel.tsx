"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";

const suggestions = [
  "Welke creatives zitten naast de meeste tickets ±48u?",
  "Wat doet koud en nat weer met de verkoop vanaf 2025?",
  "Welke mailings hadden de hoogste open rate?",
  "Vat de recente Instagram-posts samen (offer, artiesten)",
];

export function InsightsChatPanel() {
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([
    {
      role: "assistant",
      content:
        "Vraag naar verkoop, mailings, weer of edities. Ik gebruik alleen live dashboarddata.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function ask(question: string) {
    if (!question.trim() || pending) return;
    const history = messages.filter((m) => m.role === "user" || m.role === "assistant");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/dashboard/insights/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            history: history.slice(-8),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Chat mislukt");
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                data.error ||
                "Kon geen antwoord ophalen. Check OPENAI_API_KEY / GEMINI_API_KEY en of er data gesynchroniseerd is.",
            },
          ]);
          return;
        }
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.answer as string },
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Netwerkfout";
        setError(msg);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: msg },
        ]);
      }
    });
  }

  return (
    <div className="flex h-[min(520px,65vh)] flex-col border border-border bg-surface">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            className={
              msg.role === "user"
                ? "ml-10 bg-accent px-3 py-2 text-sm text-accent-contrast"
                : "mr-6 border border-border/70 bg-bg px-3 py-2 text-sm leading-relaxed text-text-muted"
            }
          >
            {msg.content}
          </div>
        ))}
        {pending && (
          <p className="animate-pulse-soft text-xs text-text-dim">Denkt…</p>
        )}
      </div>

      {error && (
        <p className="border-t border-border px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="border-t border-border p-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="border border-border bg-bg px-2 py-1 text-[11px] text-text-muted hover:border-text hover:text-text"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Vraag over je data…"
            className="flex-1 border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-text-dim focus:border-text"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-50"
          >
            <Send className="size-3.5" />
            Stuur
          </button>
        </form>
      </div>
    </div>
  );
}
