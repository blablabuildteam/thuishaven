"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  QUEUE_STATUS_NL,
  QUEUE_STATUS_TONE,
  QueueMailPanel,
} from "@/components/outreach/queue-mail-panel";
import type { LiveSendQuota } from "@/lib/outreach/batches";
import type { QueueItem } from "@/lib/outreach/queue";

type Props = {
  items: QueueItem[];
  liveSendBlockReason: string | null;
  liveSendQuota: LiveSendQuota | null;
  aiConfigured?: boolean;
  /** Default inbox for test sends (never the prospect). */
  defaultTestTo?: string;
  testSendBlockReason?: string | null;
};

type Filter = "all" | "review" | "gepland" | "verlopen";

export function QueueList({
  items,
  liveSendBlockReason,
  aiConfigured = true,
  defaultTestTo = "team@blablabuild.com",
  testSendBlockReason = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState(false);
  const [testTo, setTestTo] = useState(defaultTestTo);

  const testUnlocked = !testSendBlockReason;

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "review") {
      return items.filter(
        (i) => i.statusLabel === "review" || i.statusLabel === "concept",
      );
    }
    return items.filter((i) => i.statusLabel === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const c = { all: items.length, review: 0, gepland: 0, verlopen: 0 };
    for (const i of items) {
      c[i.statusLabel === "concept" ? "review" : i.statusLabel] += 1;
    }
    return c;
  }, [items]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function post(
    body: Record<string, unknown>,
    opts?: { refresh?: boolean },
  ) {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Actie mislukt");
      return null;
    }
    if (opts?.refresh !== false) {
      startTransition(() => router.refresh());
    }
    return data;
  }

  async function scheduleSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    const data = await post({ action: "schedule-queue", emailIds: ids });
    setConfirmPlan(false);
    if (data) {
      setMessage(
        `${data.scheduled} gepland` +
          (data.firstAt
            ? `, vanaf ${new Date(data.firstAt).toLocaleString("nl-NL", {
                timeZone: "Europe/Amsterdam",
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""),
      );
    }
  }

  async function clearScheduleSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    const data = await post({ action: "clear-queue-schedule", emailIds: ids });
    if (data) setMessage(`Planning geannuleerd voor ${data.cleared} mails`);
  }

  async function testSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    if (!testUnlocked) {
      setError(testSendBlockReason ?? "Testmail staat uit");
      return;
    }
    const data = await post({ action: "send-test", emailIds: ids, testTo });
    if (data) {
      const to = Array.isArray(data.deliveredTo)
        ? data.deliveredTo.join(", ")
        : testTo;
      setMessage(
        `${data.ok ?? ids.length} testmail${(data.ok ?? ids.length) === 1 ? "" : "s"} naar ${to}` +
          (data.failed ? ` · ${data.failed} mislukt` : ""),
      );
    }
  }

  async function regenerateSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    let ok = 0;
    let failed = 0;
    for (const emailId of ids) {
      const item = items.find((i) => i.emailId === emailId);
      const data = await post(
        {
          action: "regenerate-queue",
          emailId,
          variantId: item?.variantKey ?? "warm_tour",
        },
        { refresh: false },
      );
      if (data) ok += 1;
      else failed += 1;
    }
    startTransition(() => router.refresh());
    setMessage(
      `${ok} opnieuw geschreven` + (failed ? ` · ${failed} mislukt` : ""),
    );
  }

  if (!items.length) {
    return (
      <p className="border-y border-border py-6 text-sm text-text-muted">
        Nog geen mails in de wachtrij. Schrijf ze via{" "}
        <Link href="/outreach/crm?stap=nog" className="text-accent underline">
          Bedrijven
        </Link>
        ; ze verschijnen hier dan vanzelf.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {[
          ["Lees en pas aan", "Klik op een bedrijf. Pas tekst of afzender aan."],
          ["Stuur een test", "Je krijgt precies die mail in je eigen inbox."],
          [
            "Plan in of verstuur nu",
            "Plan een groep gespreid in, of kies per mail zelf een moment.",
          ],
        ].map(([title, text], i) => (
          <li key={title} className="border border-border px-3 py-2">
            <span className="font-display tabular-nums text-text-dim">{i + 1}</span>{" "}
            <span className="font-medium text-text">{title}</span>
            <p className="mt-0.5 text-xs text-text-muted">{text}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
          {(
            [
              ["all", "Alles"],
              ["review", "Te checken"],
              ["gepland", "Gepland"],
              ["verlopen", "Verlopen"],
            ] as const
          ).map(([key, label]) => {
            const n = counts[key];
            if (key === "verlopen" && n === 0) return null;
            const on = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={on ? "text-text" : "text-text-muted hover:text-text"}
              >
                <span className="font-display tabular-nums tracking-wide">{n}</span>
                <span className="ml-1.5">{label}</span>
              </button>
            );
          })}
        </div>
        <label className="min-w-[12rem] text-xs text-text-dim sm:w-72">
          Testmails naar (nooit naar het bedrijf)
          <input
            className="mt-1 w-full border border-border bg-bg px-3 py-1.5 text-sm text-text"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="team@blablabuild.com"
            disabled={!testUnlocked}
          />
        </label>
      </div>
      {!testUnlocked && testSendBlockReason ? (
        <p className="text-xs text-warn-fg">{testSendBlockReason}</p>
      ) : null}

      {!aiConfigured ? (
        <p
          className="border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-text"
          role="status"
        >
          Geen AI-key ingesteld, dus opnieuw laten schrijven vult alleen de
          standaardtekst. Zet ANTHROPIC_API_KEY of GEMINI_API_KEY voor
          persoonlijke mails.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-text-muted">{message}</p> : null}

      {picked.size > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border border-border bg-bg px-3 py-2">
          <span className="text-sm text-text-dim">{picked.size} geselecteerd</span>
          <button
            type="button"
            className="text-xs text-text-dim underline"
            onClick={() => {
              setPicked(new Set());
              setConfirmPlan(false);
            }}
          >
            Wis
          </button>
          <button
            type="button"
            disabled={pending || !testUnlocked}
            className="border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
            onClick={() => void testSelected()}
            title={`Stuur de geselecteerde mails als test naar ${testTo}`}
          >
            Stuur test
          </button>
          {confirmPlan ? (
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-text">
                {picked.size} mail{picked.size === 1 ? "" : "s"} gespreid
                inplannen op de vaste verzenddagen?
              </span>
              <button
                type="button"
                disabled={pending}
                className="bg-accent px-2 py-1 text-accent-contrast disabled:opacity-50"
                onClick={() => void scheduleSelected()}
              >
                Ja, plan in
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => setConfirmPlan(false)}
              >
                Nee
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              className="bg-accent px-2 py-1 text-xs text-accent-contrast disabled:opacity-50"
              onClick={() => setConfirmPlan(true)}
            >
              Plan in
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className="text-xs underline"
            onClick={() => void clearScheduleSelected()}
          >
            Planning annuleren
          </button>
          <details className="relative text-xs">
            <summary className="cursor-pointer text-text-dim hover:text-text">
              Meer
            </summary>
            <div className="absolute left-0 z-20 mt-1 flex w-56 flex-col items-start gap-1 border border-border bg-bg p-2">
              <button
                type="button"
                disabled={pending}
                className="hover:text-accent"
                onClick={() => void regenerateSelected()}
              >
                Opnieuw laten schrijven
              </button>
            </div>
          </details>
        </div>
      ) : (
        <button
          type="button"
          className="text-xs text-text-muted underline"
          onClick={() => setPicked(new Set(visible.map((i) => i.emailId)))}
        >
          Selecteer zichtbare ({visible.length})
        </button>
      )}

      <div className="max-w-full overflow-x-auto border-y border-border">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-dim">
            <tr>
              <th className="w-8 py-2 pr-2 font-medium">
                <span className="sr-only">Selecteer</span>
              </th>
              <th className="py-2 pr-3 font-medium">Bedrijf</th>
              <th className="py-2 pr-3 font-medium">Invalshoek</th>
              <th className="py-2 pr-3 font-medium">Afzender</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Verzendmoment</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const on = picked.has(item.emailId);
              const open = openId === item.emailId;
              const blocked = item.emailQuality.level === "block";
              return (
                <tr
                  key={item.emailId}
                  onClick={open ? undefined : () => setOpenId(item.emailId)}
                  className={`border-b border-border/70 last:border-0 ${
                    on ? "bg-accent/5" : ""
                  } ${open ? "bg-surface" : "cursor-pointer hover:bg-surface/60"}`}
                >
                  <td
                    className="py-3 pr-2 align-top"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(item.emailId)}
                      aria-label={`Selecteer ${item.companyName}`}
                    />
                  </td>
                  <td className="py-3 pr-3 align-top" colSpan={open ? 5 : 1}>
                    <button
                      type="button"
                      className="text-left font-medium text-text hover:text-accent"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setOpenId((id) =>
                          id === item.emailId ? null : item.emailId,
                        );
                      }}
                    >
                      {item.companyName}
                    </button>
                    <p className="text-xs text-text-dim">
                      {[item.toName, item.toEmail ?? "geen e-mail"]
                        .filter(Boolean)
                        .join(" · ")}
                      {!open ? ` · ${item.subject}` : ""}
                    </p>
                    {!open && item.emailQuality.issues.length > 0 ? (
                      <p
                        className={`mt-0.5 text-[11px] ${
                          blocked ? "text-danger" : "text-warn-fg"
                        }`}
                      >
                        {blocked ? "Wordt niet verstuurd: " : ""}
                        {item.emailQuality.issues.map((i) => i.label).join(" · ")}
                      </p>
                    ) : null}
                    {open ? (
                      <div className="mt-3">
                        <QueueMailPanel
                          item={item}
                          testTo={testTo}
                          testSendBlockReason={testSendBlockReason}
                          liveSendBlockReason={liveSendBlockReason}
                          aiConfigured={aiConfigured}
                          onClose={() => setOpenId(null)}
                        />
                      </div>
                    ) : null}
                  </td>
                  {!open ? (
                    <>
                      <td className="py-3 pr-3 align-top text-xs text-text-muted">
                        {item.variantLabel ?? "—"}
                      </td>
                      <td className="py-3 pr-3 align-top text-xs text-text-muted">
                        {item.senderProfileLabel}
                      </td>
                      <td className="py-3 pr-3 align-top">
                        <StatusBadge tone={QUEUE_STATUS_TONE[item.statusLabel]}>
                          {QUEUE_STATUS_NL[item.statusLabel]}
                        </StatusBadge>
                      </td>
                      <td className="py-3 align-top text-xs tabular-nums text-text-dim">
                        {item.scheduledLabel ?? "—"}
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
