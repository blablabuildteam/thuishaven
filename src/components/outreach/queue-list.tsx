"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LiveSendQuota } from "@/lib/outreach/batches";
import { LIVE_SEND_CONFIRM_PHRASE } from "@/lib/outreach/live-send-constants";
import type { QueueItem } from "@/lib/outreach/queue";
import {
  OUTREACH_SENDER_PROFILES,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";

type Props = {
  items: QueueItem[];
  liveSendBlockReason: string | null;
  liveSendQuota: LiveSendQuota | null;
  aiConfigured?: boolean;
};

const STATUS_TONE: Record<
  QueueItem["statusLabel"],
  "neutral" | "accent" | "success" | "warn" | "info"
> = {
  concept: "neutral",
  review: "info",
  gepland: "accent",
  actief: "success",
};

const STATUS_NL: Record<QueueItem["statusLabel"], string> = {
  concept: "Concept",
  review: "Te checken",
  gepland: "Gepland",
  actief: "Actief (stuurt)",
};

export function QueueList({
  items,
  liveSendBlockReason,
  liveSendQuota,
  aiConfigured = true,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | QueueItem["statusLabel"]>("all");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmArm, setConfirmArm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [edits, setEdits] = useState<
    Record<
      string,
      {
        subject: string;
        body: string;
        senderProfileId: OutreachSenderProfileId;
        variantKey: string;
      }
    >
  >({});

  const liveUnlocked = !liveSendBlockReason;
  const dayCapHit =
    liveSendQuota != null && liveSendQuota.remainingToday <= 0;

  const visible = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.statusLabel === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const c = { all: items.length, concept: 0, review: 0, gepland: 0, actief: 0 };
    for (const i of items) c[i.statusLabel] += 1;
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

  function selectVisible() {
    setPicked(new Set(visible.map((i) => i.emailId)));
  }

  function editFor(item: QueueItem) {
    return (
      edits[item.emailId] ?? {
        subject: item.subject,
        body: item.body,
        senderProfileId: item.senderProfileId,
        variantKey: item.variantKey ?? "warm_tour",
      }
    );
  }

  async function post(body: Record<string, unknown>) {
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
    startTransition(() => router.refresh());
    return data;
  }

  async function saveItem(item: QueueItem) {
    const e = editFor(item);
    const data = await post({
      action: "update-queue-item",
      emailId: item.emailId,
      subject: e.subject,
      body: e.body,
      senderProfileId: e.senderProfileId,
      variantKey: e.variantKey,
    });
    if (data) {
      setMessage(`Opgeslagen · ${item.companyName}`);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[item.emailId];
        return next;
      });
    }
  }

  async function promoteSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    const data = await post({
      action: "promote-queue",
      emailIds: ids,
    });
    if (data) setMessage(`${data.promoted} in wachtrij gezet om te checken`);
  }

  async function scheduleSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    const data = await post({
      action: "schedule-queue",
      emailIds: ids,
    });
    if (data) {
      setMessage(
        `${data.scheduled} gepland` +
          (data.firstAt
            ? ` · vanaf ${new Date(data.firstAt).toLocaleString("nl-NL")}`
            : ""),
      );
      setConfirmArm(false);
    }
  }

  async function clearScheduleSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    const data = await post({
      action: "clear-queue-schedule",
      emailIds: ids,
    });
    if (data) setMessage(`Planning gewist voor ${data.cleared} mails`);
  }

  async function armSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    const data = await post({
      action: "arm-queue",
      emailIds: ids,
      confirmText,
    });
    if (data) {
      setMessage(
        `${data.armed} geactiveerd — cron stuurt op gepland moment` +
          (data.skipped
            ? ` · ${data.skipped} overgeslagen (nog niet gepland)`
            : ""),
      );
      setConfirmArm(false);
      setConfirmText("");
    }
  }

  async function disarmSelected() {
    const ids = [...picked];
    if (!ids.length) return;
    const data = await post({
      action: "disarm-queue",
      emailIds: ids,
    });
    if (data) {
      setMessage(
        `Auto-send uit voor ${data.disarmed} mails` +
          (data.batchesDisarmed
            ? ` · ${data.batchesDisarmed} bakje-auto-send gestopt`
            : ""),
      );
    }
  }

  async function regenerateItem(item: QueueItem) {
    setError(null);
    setMessage(null);
    const e = editFor(item);
    const data = await post({
      action: "regenerate-queue",
      emailId: item.emailId,
      variantId: e.variantKey,
    });
    if (data) {
      setEdits((prev) => ({
        ...prev,
        [item.emailId]: {
          subject: data.subject ?? e.subject,
          body: data.body ?? e.body,
          senderProfileId: e.senderProfileId,
          variantKey: data.variantId ?? e.variantKey,
        },
      }));
      const src =
        data.source === "ai"
          ? "AI"
          : data.source === "template_fallback"
            ? "template (AI faalde)"
            : "template";
      setMessage(
        `Opnieuw gegenereerd · ${src}` +
          (data.fallbackReason ? ` — ${data.fallbackReason}` : ""),
      );
    }
  }

  if (!items.length) {
    return (
      <p className="border-y border-border py-6 text-sm text-text-muted">
        Nog geen mails in de wachtrij. Genereer drafts via{" "}
        <Link href="/outreach/emails" className="text-accent underline">
          Mailen
        </Link>{" "}
        — die verschijnen hier automatisch als concept.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border pb-3 text-sm">
        {(
          [
            ["all", "Alles"],
            ["concept", "Concept"],
            ["review", "Te checken"],
            ["gepland", "Gepland"],
            ["actief", "Actief"],
          ] as const
        ).map(([key, label]) => {
          const n = key === "all" ? counts.all : counts[key];
          const on = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={
                on ? "text-text" : "text-text-muted hover:text-text"
              }
            >
              <span className="font-display tabular-nums tracking-wide">{n}</span>
              <span className="ml-1.5">{label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-text-muted">
        Klik een rij om te lezen en te wijzigen. Selecteer meerdere voor bulk:
        inplannen of activeren. Afzender is per mail.
      </p>

      {!aiConfigured ? (
        <p
          className="border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-text"
          role="status"
        >
          Geen AI-key gezet (OPENAI/GEMINI) — drafts komen uit vaste templates.
          Zet een key op Vercel voor persoonlijke mails. Je kunt hier wel
          herschrijven of later “Regenereer met AI” gebruiken.
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
            onClick={() => setPicked(new Set())}
          >
            Wis
          </button>
          <button
            type="button"
            disabled={pending}
            className="border border-border px-2 py-1 text-xs hover:border-accent"
            onClick={() => void promoteSelected()}
          >
            Zet op te checken
          </button>
          <button
            type="button"
            disabled={pending}
            className="bg-accent px-2 py-1 text-xs text-accent-contrast disabled:opacity-50"
            onClick={() => void scheduleSelected()}
          >
            Plan in (bulk)
          </button>
          <button
            type="button"
            disabled={pending}
            className="border border-border px-2 py-1 text-xs"
            onClick={() => void clearScheduleSelected()}
          >
            Wis planning
          </button>
          {liveUnlocked ? (
            confirmArm ? (
              <span className="flex flex-wrap items-center gap-2">
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`wachtrij of ${LIVE_SEND_CONFIRM_PHRASE}`}
                  className="border border-border bg-bg px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={pending || !confirmText.trim() || dayCapHit}
                  className="bg-danger px-2 py-1 text-xs text-white disabled:opacity-50"
                  onClick={() => void armSelected()}
                >
                  Activeer verzenden
                </button>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => {
                    setConfirmArm(false);
                    setConfirmText("");
                  }}
                >
                  Annuleer
                </button>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending || dayCapHit}
                  className="border border-danger/40 px-2 py-1 text-xs text-danger"
                  onClick={() => setConfirmArm(true)}
                >
                  Activeer verzenden…
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs underline"
                  onClick={() => void disarmSelected()}
                >
                  Deactiveer
                </button>
              </>
            )
          ) : (
            <span className="text-xs text-text-dim">Live send nog uit</span>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="text-xs text-text-muted underline"
          onClick={selectVisible}
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
              <th className="py-2 font-medium">Gepland</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const on = picked.has(item.emailId);
              const open = openId === item.emailId;
              const e = editFor(item);
              return (
                <tr
                  key={item.emailId}
                  className={`border-b border-border/70 last:border-0 ${
                    on ? "bg-accent/5" : ""
                  } ${open ? "bg-surface" : ""}`}
                >
                  <td className="py-3 pr-2 align-top">
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
                      onClick={() =>
                        setOpenId((id) =>
                          id === item.emailId ? null : item.emailId,
                        )
                      }
                    >
                      {item.companyName}
                    </button>
                    <p className="text-xs text-text-dim">
                      {item.toEmail ?? "geen e-mail"}
                      {!open ? ` · ${item.subject}` : ""}
                      {item.generationSource === "template" ||
                      item.generationSource === "template_fallback"
                        ? " · template"
                        : item.generationSource === "ai"
                          ? " · AI"
                          : ""}
                    </p>

                    {open ? (
                      <div className="mt-3 max-w-2xl space-y-3">
                        <label className="block text-xs text-text-dim">
                          Onderwerp
                          <input
                            className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
                            value={e.subject}
                            onChange={(ev) =>
                              setEdits((prev) => ({
                                ...prev,
                                [item.emailId]: {
                                  ...e,
                                  subject: ev.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="block text-xs text-text-dim">
                          Tekst
                          <textarea
                            rows={10}
                            className="mt-1 w-full border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
                            value={e.body}
                            onChange={(ev) =>
                              setEdits((prev) => ({
                                ...prev,
                                [item.emailId]: {
                                  ...e,
                                  body: ev.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <div className="flex flex-wrap gap-3">
                          <label className="block text-xs text-text-dim">
                            Afzender
                            <select
                              className="mt-1 block border border-border bg-bg px-3 py-2 text-sm text-text"
                              value={e.senderProfileId}
                              onChange={(ev) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.emailId]: {
                                    ...e,
                                    senderProfileId: ev.target
                                      .value as OutreachSenderProfileId,
                                  },
                                }))
                              }
                            >
                              {OUTREACH_SENDER_PROFILES.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label} · {p.email}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs text-text-dim">
                            Invalshoek
                            <select
                              className="mt-1 block border border-border bg-bg px-3 py-2 text-sm text-text"
                              value={e.variantKey}
                              onChange={(ev) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.emailId]: {
                                    ...e,
                                    variantKey: ev.target.value,
                                  },
                                }))
                              }
                            >
                              {OUTREACH_VARIANTS.filter(
                                (v) =>
                                  v.audience === "company" ||
                                  v.audience === "both",
                              ).map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            className="bg-accent px-3 py-1.5 text-sm text-accent-contrast disabled:opacity-50"
                            onClick={() => void saveItem(item)}
                          >
                            Opslaan
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
                            onClick={() => void regenerateItem(item)}
                            title={
                              aiConfigured
                                ? "Nieuwe persoonlijke AI-draft"
                                : "Zonder AI-key wordt de standaardtemplate opnieuw gevuld"
                            }
                          >
                            Regenereer met AI
                          </button>
                          {item.generationSource ? (
                            <StatusBadge
                              tone={
                                item.generationSource === "ai"
                                  ? "success"
                                  : "warn"
                              }
                            >
                              {item.generationSource === "ai"
                                ? "AI"
                                : item.generationSource === "template_fallback"
                                  ? "Template fallback"
                                  : "Template"}
                            </StatusBadge>
                          ) : null}
                          <button
                            type="button"
                            className="text-sm text-text-dim underline"
                            onClick={() => setOpenId(null)}
                          >
                            Sluiten
                          </button>
                          <Link
                            href={`/outreach/crm/${item.prospectId}`}
                            className="text-sm text-accent underline"
                          >
                            Dossier →
                          </Link>
                        </div>
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
                        <StatusBadge tone={STATUS_TONE[item.statusLabel]}>
                          {STATUS_NL[item.statusLabel]}
                        </StatusBadge>
                      </td>
                      <td className="py-3 align-top font-mono text-xs text-text-dim">
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
