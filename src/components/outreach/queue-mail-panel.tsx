"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { QueueItem } from "@/lib/outreach/queue";
import {
  applySenderSignature,
  getSenderProfile,
  OUTREACH_SENDER_PROFILES,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";
import { amsterdamClock, amsterdamDay, shiftIsoDay } from "@/lib/time/amsterdam";

type Props = {
  item: QueueItem;
  testTo: string;
  testSendBlockReason?: string | null;
  liveSendBlockReason?: string | null;
  aiConfigured?: boolean;
  onClose?: () => void;
};

type Edit = {
  subject: string;
  body: string;
  senderProfileId: OutreachSenderProfileId;
  variantKey: string;
};

function initialEdit(item: QueueItem): Edit {
  return {
    subject: item.subject,
    body: item.body,
    senderProfileId: item.senderProfileId,
    variantKey: item.variantKey ?? "warm_tour",
  };
}

function initialSlot(item: QueueItem): { day: string; time: string } {
  if (item.scheduledAt && item.statusLabel === "gepland") {
    const at = new Date(item.scheduledAt);
    return { day: amsterdamDay(at), time: amsterdamClock(at) };
  }
  return { day: shiftIsoDay(amsterdamDay(new Date()), 1), time: "09:00" };
}

const inputClass =
  "mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text";

export function QueueMailPanel({
  item,
  testTo,
  testSendBlockReason = null,
  liveSendBlockReason = null,
  aiConfigured = true,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Edit>(() => initialEdit(item));
  const [dirty, setDirty] = useState(false);
  const [slot, setSlot] = useState(() => initialSlot(item));
  const [confirmSend, setConfirmSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = busy || pending;
  const testUnlocked = !testSendBlockReason;
  const liveUnlocked = !liveSendBlockReason;
  const planned = item.statusLabel === "gepland";
  const overdue = item.statusLabel === "verlopen";
  const blocked = item.emailQuality.level === "block";
  const isTemplate =
    item.generationSource === "template" ||
    item.generationSource === "template_fallback";

  function change(patch: Partial<Edit>) {
    setEdit((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function post(body: Record<string, unknown>, refresh = true) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
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
      if (refresh) startTransition(() => router.refresh());
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function saveIfDirty(): Promise<boolean> {
    if (!dirty) return true;
    const data = await post(
      {
        action: "update-queue-item",
        emailId: item.emailId,
        subject: edit.subject,
        body: edit.body,
        senderProfileId: edit.senderProfileId,
        variantKey: edit.variantKey,
      },
      false,
    );
    if (!data) return false;
    setDirty(false);
    return true;
  }

  async function save() {
    if (!(await saveIfDirty())) return;
    startTransition(() => router.refresh());
    setMessage("Opgeslagen");
  }

  async function sendTest() {
    if (!(await saveIfDirty())) return;
    const data = await post({
      action: "send-test",
      emailId: item.emailId,
      testTo,
    });
    if (data) {
      const to = Array.isArray(data.deliveredTo)
        ? data.deliveredTo.join(", ")
        : testTo;
      setMessage(`Test verstuurd naar ${to}. Het bedrijf ziet dit niet.`);
    }
  }

  async function reschedule() {
    if (!(await saveIfDirty())) return;
    const data = await post({
      action: "reschedule-queue-item",
      emailId: item.emailId,
      day: slot.day,
      time: slot.time,
    });
    if (data?.scheduledAt) {
      setMessage(
        `Gepland op ${new Date(data.scheduledAt).toLocaleString("nl-NL", {
          timeZone: "Europe/Amsterdam",
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
    }
  }

  async function cancelPlanning() {
    const data = await post({
      action: "clear-queue-schedule",
      emailIds: [item.emailId],
    });
    if (data) setMessage("Planning geannuleerd. De mail blijft in de lijst.");
  }

  async function sendNow() {
    if (!(await saveIfDirty())) return;
    const data = await post({
      action: "send-now-queue-item",
      emailId: item.emailId,
      confirm: true,
    });
    setConfirmSend(false);
    if (data) setMessage(`Verstuurd naar ${item.toEmail ?? "het bedrijf"}`);
  }

  async function regenerate() {
    const data = await post(
      {
        action: "regenerate-queue",
        emailId: item.emailId,
        variantId: edit.variantKey,
      },
      false,
    );
    if (!data) return;
    setEdit((prev) => ({
      ...prev,
      subject: data.subject ?? prev.subject,
      body: data.body ?? prev.body,
      variantKey: data.variantId ?? prev.variantKey,
    }));
    setDirty(false);
    startTransition(() => router.refresh());
    setMessage(
      data.source === "ai"
        ? "Opnieuw geschreven"
        : `Opnieuw gevuld met de standaardtekst${
            data.fallbackReason ? ` (${data.fallbackReason})` : ""
          }`,
    );
  }

  return (
    <div className="grid gap-6 border border-border bg-bg p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-3">
        <label className="block text-xs text-text-dim">
          Onderwerp
          <input
            className={inputClass}
            value={edit.subject}
            onChange={(ev) => change({ subject: ev.target.value })}
          />
        </label>
        <label className="block text-xs text-text-dim">
          Tekst
          <textarea
            rows={18}
            className={`${inputClass} leading-relaxed`}
            value={edit.body}
            onChange={(ev) => change({ body: ev.target.value })}
          />
        </label>
        {isTemplate ? (
          <p className="text-xs text-warn-fg">
            Standaardtekst, niet persoonlijk geschreven. Lees hem goed na of
            laat hem opnieuw schrijven.
          </p>
        ) : null}
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <p className="text-xs text-text-dim">Aan</p>
          <p className="text-text">{item.toName ?? "Geen naam"}</p>
          <p className="break-all text-text-muted">
            {item.toEmail ?? "Geen e-mailadres"}
          </p>
          {item.emailQuality.issues.length > 0 ? (
            <p
              className={`mt-1 text-xs ${blocked ? "text-danger" : "text-warn-fg"}`}
            >
              {blocked ? "Wordt niet verstuurd: " : ""}
              {item.emailQuality.issues.map((i) => i.label).join(" · ")}
            </p>
          ) : null}
        </div>

        <label className="block text-xs text-text-dim">
          Afzender
          <select
            className={inputClass}
            value={edit.senderProfileId}
            onChange={(ev) =>
              change({
                senderProfileId: ev.target.value as OutreachSenderProfileId,
                body: applySenderSignature(
                  edit.body,
                  getSenderProfile(ev.target.value),
                ),
              })
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
            className={inputClass}
            value={edit.variantKey}
            onChange={(ev) => change({ variantKey: ev.target.value })}
          >
            {OUTREACH_VARIANTS.filter(
              (v) => v.audience === "company" || v.audience === "both",
            ).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {edit.variantKey === "jubileum" ? (
          <p className="text-xs text-text-muted">
            Het jubileum komt uit de KvK-inschrijving en klopt niet altijd.
            Noem geen aantal jaren, tenzij je het zeker weet.
          </p>
        ) : null}
        {edit.variantKey !== (item.variantKey ?? "warm_tour") ? (
          <p className="text-xs text-warn-fg">
            Andere invalshoek gekozen. Laat de mail opnieuw schrijven om de
            tekst daarop aan te passen.
          </p>
        ) : null}

        <div className="border-t border-border pt-3">
          <p className="text-xs text-text-dim">Verzendmoment</p>
          <p className={overdue ? "text-warn-fg" : "text-text"}>
            {planned
              ? item.scheduledLabel
              : overdue
                ? `Tijdstip verlopen (${item.scheduledLabel}), plan opnieuw`
                : "Nog niet gepland"}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              aria-label="Datum"
              className="w-full border border-border bg-bg px-2 py-1.5 text-sm text-text"
              value={slot.day}
              onChange={(ev) => setSlot((s) => ({ ...s, day: ev.target.value }))}
            />
            <input
              type="time"
              aria-label="Tijd"
              className="w-28 border border-border bg-bg px-2 py-1.5 text-sm text-text"
              value={slot.time}
              onChange={(ev) =>
                setSlot((s) => ({ ...s, time: ev.target.value }))
              }
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={disabled || !slot.day || !slot.time}
              className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
              onClick={() => void reschedule()}
            >
              {planned ? "Tijdstip aanpassen" : "Plan op dit moment"}
            </button>
            {planned || overdue ? (
              <button
                type="button"
                disabled={disabled}
                className="text-sm text-text-muted underline hover:text-text"
                onClick={() => void cancelPlanning()}
              >
                Planning annuleren
              </button>
            ) : null}
          </div>
          {planned && !liveUnlocked ? (
            <p className="mt-2 text-xs text-text-dim">
              Echt versturen staat uit, dus deze mail blijft liggen tot een
              admin dat aanzet.
            </p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              className="bg-accent px-3 py-1.5 text-sm text-accent-contrast disabled:opacity-50"
              onClick={() => void save()}
            >
              Opslaan
            </button>
            <button
              type="button"
              disabled={disabled || !testUnlocked}
              className="border border-border px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
              onClick={() => void sendTest()}
              title={
                testUnlocked
                  ? `Stuur precies deze mail naar ${testTo}`
                  : (testSendBlockReason ?? "Testmail staat uit")
              }
            >
              Stuur test
            </button>
          </div>

          {confirmSend ? (
            <div className="space-y-2 border border-danger/40 p-2">
              <p className="text-xs text-text">
                Nu echt versturen naar {item.toEmail ?? "het bedrijf"}?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  className="bg-danger px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  onClick={() => void sendNow()}
                >
                  Ja, verstuur
                </button>
                <button
                  type="button"
                  className="text-sm text-text-muted underline"
                  onClick={() => setConfirmSend(false)}
                >
                  Nee
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled || !liveUnlocked || blocked}
              className="border border-danger/40 px-3 py-1.5 text-sm text-danger disabled:opacity-50"
              onClick={() => setConfirmSend(true)}
              title={liveSendBlockReason ?? undefined}
            >
              Verstuur nu
            </button>
          )}
          {!liveUnlocked ? (
            <p className="text-xs text-text-dim">
              Verstuur nu werkt zodra echt versturen aan staat.
            </p>
          ) : null}

          <details className="text-sm">
            <summary className="cursor-pointer text-text-dim hover:text-text">
              Meer
            </summary>
            <div className="mt-2 flex flex-col items-start gap-1.5">
              <button
                type="button"
                disabled={disabled}
                className="text-left hover:text-accent disabled:opacity-50"
                onClick={() => void regenerate()}
                title={
                  aiConfigured
                    ? "Nieuwe persoonlijke versie laten schrijven"
                    : "Zonder AI-key wordt de standaardtekst opnieuw gevuld"
                }
              >
                Opnieuw laten schrijven
              </button>
              <Link
                href={`/outreach/crm/${item.prospectId}`}
                className="text-accent underline"
              >
                Dossier van {item.companyName}
              </Link>
            </div>
          </details>
        </div>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : message ? (
          <p className="text-sm text-success">{message}</p>
        ) : null}

        {onClose ? (
          <button
            type="button"
            className="text-sm text-text-dim underline"
            onClick={onClose}
          >
            Sluiten
          </button>
        ) : null}
      </div>
    </div>
  );
}
