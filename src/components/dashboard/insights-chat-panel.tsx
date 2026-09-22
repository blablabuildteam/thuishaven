"use client";

import { useEffect, useId, useRef, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Check, ChevronDown, Plus, Send, Trash2 } from "lucide-react";
import { ChatMarkdown } from "@/components/dashboard/chat-markdown";
import { cn } from "@/lib/utils";
import type { InsightsChatMessage } from "@/lib/db/schema";

const AGENT_MARK = "/brand/logo-mark.png";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyListId = useId();

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

  useEffect(() => {
    if (!historyOpen) return;
    function onPointer(event: PointerEvent) {
      if (!historyRef.current?.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setHistoryOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [historyOpen]);

  function startNewChat() {
    if (pending) return;
    setChatId(null);
    setMessages([WELCOME]);
    setInput("");
    setError(null);
    setHistoryOpen(false);
  }

  function selectChat(id: string) {
    const selected = chats.find((c) => c.id === id);
    if (!selected || pending) return;
    setChatId(selected.id);
    setMessages(selected.messages.length ? selected.messages : [WELCOME]);
    setError(null);
    setHistoryOpen(false);
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
        const message = presentAssistantMessage(
          data.error ||
            "Kon geen antwoord ophalen. Check GEMINI_API_KEY en of er data gesynchroniseerd is.",
        );
        setError(null);
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
      setError(null);
      setMessages((m) => [...m, { role: "assistant", content: message }]);
    } finally {
      setPending(false);
    }
  }

  const showSuggestions =
    messages.length <= 1 && messages[0]?.content === WELCOME.content;
  const currentChat = chats.find((chat) => chat.id === chatId);
  const historyLabel = currentChat?.title ?? "Nieuw gesprek";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-10 flex items-center gap-2 border-b border-border px-3 py-2">
        <div ref={historyRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            id="insights-chat-history"
            aria-haspopup="listbox"
            aria-expanded={historyOpen}
            aria-controls={historyListId}
            aria-label={`Eerdere gesprekken, huidig: ${historyLabel}`}
            disabled={pending}
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex w-full min-w-0 items-center justify-between gap-2 border border-border bg-bg px-2.5 py-1.5 text-left text-xs text-text outline-none hover:border-text focus:border-text disabled:opacity-50"
          >
            <span className="truncate">{historyLabel}</span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-text-dim transition-transform duration-200 motion-reduce:transition-none",
                historyOpen && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "collapse-panel absolute top-full right-0 left-0 z-20",
              historyOpen && "shadow-[0_16px_40px_rgba(0,0,0,0.14)]",
              !historyOpen && "pointer-events-none",
            )}
            data-open={historyOpen}
          >
            <div className="collapse-inner">
              <div
                id={historyListId}
                role="listbox"
                aria-label="Eerdere gesprekken"
                aria-hidden={!historyOpen}
                inert={!historyOpen}
                className="mt-1 max-h-72 overflow-y-auto border border-border bg-surface"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!chatId}
                  onClick={startNewChat}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs hover:bg-surface-hover",
                    !chatId && "bg-accent-soft shadow-[inset_2px_0_0_0_var(--highlight)]",
                  )}
                >
                  <span className="font-medium text-text">Nieuw gesprek</span>
                  {!chatId ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
                {chats.length ? (
                  chats.map((chat) => {
                    const active = chat.id === chatId;
                    return (
                      <button
                        key={chat.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => selectChat(chat.id)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 border-t border-border px-3 py-2.5 text-left hover:bg-surface-hover",
                          active &&
                            "bg-accent-soft shadow-[inset_2px_0_0_0_var(--highlight)]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs text-text">
                            {chat.title}
                          </span>
                          <span className="mt-0.5 block text-[10px] tracking-[0.08em] text-text-dim uppercase">
                            {formatChatWhen(chat.updatedAt)}
                          </span>
                        </span>
                        {active ? (
                          <Check className="mt-0.5 size-3.5 shrink-0" />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="border-t border-border px-3 py-3 text-xs text-text-dim">
                    Nog geen eerdere gesprekken
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
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
        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div
                key={`${msg.role}-${i}`}
                className="chat-message-in flex justify-end"
              >
                <div className="max-w-[85%] whitespace-pre-wrap bg-accent px-3 py-2 text-sm leading-relaxed text-accent-contrast">
                  {msg.content}
                </div>
              </div>
            );
          }
          return (
            <div
              key={`${msg.role}-${i}`}
              className="chat-message-in flex items-start gap-2.5"
            >
              <AgentMark />
              <div className="min-w-0 max-w-[calc(100%-2.5rem)] border border-border/70 bg-bg px-3 py-2.5 text-sm leading-relaxed text-text">
                <ChatMarkdown content={presentAssistantMessage(msg.content)} />
              </div>
            </div>
          );
        })}
        {pending ? (
          <div className="chat-message-in flex items-start gap-2.5" aria-live="polite">
            <AgentMark />
            <div className="border border-border/70 bg-bg px-3 py-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-end gap-1" aria-hidden>
                  <span className="chat-dot size-1.5 bg-text" />
                  <span className="chat-dot size-1.5 bg-text" />
                  <span className="chat-dot size-1.5 bg-text" />
                </span>
                <span className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
                  Zoekt in de data
                </span>
              </div>
              <div className="mt-3 space-y-1.5" aria-hidden>
                <div className="skeleton-bone h-2 w-44" />
                <div className="skeleton-bone h-2 w-32" />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error &&
      !messages.some(
        (message) =>
          presentAssistantMessage(message.content) === presentAssistantMessage(error),
      ) ? (
        <p className="border-t border-border px-3 py-2 text-xs text-danger">
          {presentAssistantMessage(error)}
        </p>
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

function AgentMark() {
  return (
    <img
      src={AGENT_MARK}
      alt=""
      width={28}
      height={28}
      className="size-7 shrink-0 bg-black object-contain"
    />
  );
}

function presentAssistantMessage(content: string) {
  if (!/^(Gemini|OpenAI) HTTP \d+/i.test(content.trim())) return content;
  if (/503|429|UNAVAILABLE|high demand|overloaded/i.test(content)) {
    return "Gemini is even overbelast. Probeer het zo nog een keer.";
  }
  return "Geen antwoord van Gemini. Probeer het nog een keer.";
}

function formatChatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMM · HH:mm", { locale: nl });
}
