"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightsChatMessage } from "@/lib/db/schema";

type InsightsChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messages: InsightsChatMessage[];
};

const WELCOME: InsightsChatMessage = {
  role: "assistant",
  content:
    "Vraag naar verkoop, mailings, weer of edities. Ik gebruik alleen live dashboarddata.",
};

const suggestions = [
  "Welke creatives zitten naast de meeste tickets ±48u?",
  "Wat doet koud en nat weer met de verkoop vanaf 2025?",
  "Welke mailings hadden de hoogste open rate?",
  "Vat de recente Instagram-posts samen (offer, artiesten)",
];

type ChatListResponse = { chats?: InsightsChatSummary[]; error?: string };
type ChatAskResponse = {
  answer?: string;
  chat?: InsightsChatSummary | null;
  error?: string;
};

export function InsightsChatPanel({ active = true }: { active?: boolean }) {
  const [chats, setChats] = useState<InsightsChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InsightsChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/insights/chat", {
          cache: "no-store",
        });
        const data = (await res.json()) as ChatListResponse;
        if (cancelled) return;
        const list = data.chats ?? [];
        setChats(list);
        const latest = list[0];
        if (latest) {
          setChatId(latest.id);
          setMessages(latest.messages.length ? latest.messages : [WELCOME]);
        }
      } catch {
        // Offline / first load — start empty.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, hydrated]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  function startNewChat() {
    if (pending) return;
    setChatId(null);
    setMessages([WELCOME]);
    setInput("");
    setError(null);
  }

  function selectChat(id: string) {
    const selected = chats.find((c) => c.id === id);
    if (!selected || pending) return;
    setChatId(selected.id);
    setMessages(selected.messages.length ? selected.messages : [WELCOME]);
    setError(null);
  }

  async function removeChat(id: string) {
    if (pending) return;
    try {
      const res = await fetch(
        `/api/dashboard/insights/chat?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      const next = chats.filter((c) => c.id !== id);
      setChats(next);
      if (chatId === id) {
        const latest = next[0];
        if (latest) {
          setChatId(latest.id);
          setMessages(latest.messages.length ? latest.messages : [WELCOME]);
        } else {
          startNewChat();
        }
      }
    } catch {
      setError("Verwijderen mislukt");
    }
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const history = messages.filter(
      (m) => m.content !== WELCOME.content || m.role !== "assistant",
    );
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/dashboard/insights/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          chatId,
          history,
        }),
      });
      const data = (await res.json()) as ChatAskResponse;
      if (!res.ok) {
        const message =
          data.error ||
          "Kon geen antwoord ophalen. Check GEMINI_API_KEY en of er data gesynchroniseerd is.";
        setError(message);
        setMessages((m) => [...m, { role: "assistant", content: message }]);
        return;
      }

      const answer = data.answer?.trim() || "Geen antwoord ontvangen.";
      const saved = data.chat ?? null;
      if (saved) {
        setChatId(saved.id);
        setMessages(saved.messages.length ? saved.messages : [
          { role: "assistant", content: answer },
        ]);
        setChats((prev) => {
          const rest = prev.filter((c) => c.id !== saved.id);
          return [saved, ...rest];
        });
      } else {
        setMessages((m) => [...m, { role: "assistant", content: answer }]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Netwerkfout";
      setError(message);
      setMessages((m) => [...m, { role: "assistant", content: message }]);
    } finally {
      setPending(false);
    }
  }

  const showSuggestions =
    messages.length <= 1 && messages[0]?.content === WELCOME.content;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <label className="sr-only" htmlFor="insights-chat-history">
          Eerdere gesprekken
        </label>
        <select
          id="insights-chat-history"
          value={chatId ?? ""}
          onChange={(e) => {
            if (e.target.value) selectChat(e.target.value);
            else startNewChat();
          }}
          className="min-w-0 flex-1 border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-text"
        >
          <option value="">Nieuw gesprek</option>
          {chats.map((chat) => (
            <option key={chat.id} value={chat.id}>
              {chat.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={startNewChat}
          disabled={pending}
          className="inline-flex size-8 items-center justify-center border border-border text-text-muted hover:border-text hover:text-text disabled:opacity-50"
          title="Nieuw gesprek"
        >
          <Plus className="size-3.5" />
        </button>
        {chatId ? (
          <button
            type="button"
            onClick={() => removeChat(chatId)}
            disabled={pending}
            className="inline-flex size-8 items-center justify-center border border-border text-text-muted hover:border-danger hover:text-danger disabled:opacity-50"
            title="Gesprek verwijderen"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            className={cn(
              "whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed",
              msg.role === "user"
                ? "ml-10 bg-accent text-accent-contrast"
                : "mr-6 border border-border/70 bg-bg text-text-muted",
            )}
          >
            {msg.content}
          </div>
        ))}
        {pending ? (
          <p className="animate-pulse-soft text-xs text-text-dim">Denkt…</p>
        ) : null}
      </div>

      {error ? (
        <p className="border-t border-border px-3 py-2 text-xs text-danger">{error}</p>
      ) : null}

      <div className="border-t border-border p-3">
        {showSuggestions ? (
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
        ) : null}
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
            disabled={pending || !input.trim()}
            className="inline-flex items-center gap-1.5 bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-50"
          >
            <Send className="size-3.5" />
            Stuur
          </button>
        </form>
        <p className="mt-2 text-[10px] tracking-[0.08em] text-text-dim uppercase">
          Gesprekken blijven 14 dagen bewaard
        </p>
      </div>
    </div>
  );
}
