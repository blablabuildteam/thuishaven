"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { chatSuggestions } from "@/lib/mock/dashboard";

const canned: Record<string, string> = {
  default:
    "Op basis van de huidige (mock) data: Summer Special loopt ~18% voor op Spring Opening op hetzelfde moment in de verkoopcyclus. TikTok walkthrough (30 jul) correleert met +248 tickets in 48u. Let op: attributie is near-correlation, geen harde causaliteit — we labelen bronnen in v1.",
};

export function AiChatPanel() {
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([
    {
      role: "assistant",
      content:
        "Stel een vraag over campagnes, edities of ticketverkoop. Antwoorden gebruiken dashboarddata (nu: mock).",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  function ask(question: string) {
    if (!question.trim()) return;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 600));
      setMessages((m) => [
        ...m,
        { role: "assistant", content: canned.default },
      ]);
    });
  }

  return (
    <div className="flex h-[min(560px,70vh)] flex-col rounded-sm border border-border bg-surface">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            className={
              msg.role === "user"
                ? "ml-8 rounded-sm bg-accent-soft px-3 py-2 text-sm text-accent"
                : "mr-8 rounded-sm bg-bg px-3 py-2 text-sm leading-relaxed text-text-muted"
            }
          >
            {msg.content}
          </div>
        ))}
        {pending && (
          <p className="animate-pulse-soft text-xs text-text-dim">Denkt…</p>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chatSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-sm border border-border bg-bg px-2 py-1 text-[11px] text-text-muted transition-colors hover:border-accent/40 hover:text-accent"
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
            placeholder="Vraag in gewone taal…"
            className="flex-1 rounded-sm border border-border bg-bg px-3 py-2 text-sm text-text outline-none placeholder:text-text-dim focus:border-accent/50"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send className="size-3.5" />
            Stuur
          </button>
        </form>
      </div>
    </div>
  );
}
