"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  LiveSendQuota,
  OutreachBatchSummary,
} from "@/lib/outreach/batches";
import {
  OUTREACH_SENDER_PROFILES,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import { LIVE_SEND_CONFIRM_PHRASE } from "@/lib/outreach/live-send-constants";

type Props = {
  batches: OutreachBatchSummary[];
  liveSendBlockReason: string | null;
  liveSendQuota: LiveSendQuota | null;
};

export function BatchQueue({
  batches,
  liveSendBlockReason,
  liveSendQuota,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmBatchId, setConfirmBatchId] = useState<string | null>(null);
  /** immediate = verstuur nu; arm = zet auto-send aan */
  const [confirmMode, setConfirmMode] = useState<"immediate" | "arm">(
    "immediate",
  );
  const [confirmText, setConfirmText] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, { subject: string; body: string }>>(
    {},
  );
  const liveUnlocked = !liveSendBlockReason;
  const bouncePaused = Boolean(liveSendQuota?.bouncePause);
  const remainingToday = liveSendQuota?.remainingToday;
  const dayCapHit =
    liveSendQuota != null && liveSendQuota.remainingToday <= 0;

  const active = batches.filter((b) => b.status !== "sent");
  const sent = batches.filter((b) => b.status === "sent");

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

  async function dequeue(emailId: string) {
    const data = await post({ action: "dequeue", emailIds: [emailId] });
    if (data) setMessage("Mail uit bakje gehaald — staat weer als draft.");
  }

  async function saveEdit(emailId: string) {
    const edit = editing[emailId];
    if (!edit) return;
    const data = await post({
      action: "update-draft",
      emailId,
      subject: edit.subject,
      body: edit.body,
    });
    if (data) {
      setMessage("Mail opgeslagen.");
      setEditing((prev) => {
        const next = { ...prev };
        delete next[emailId];
        return next;
      });
    }
  }

  async function renameBatch(batch: OutreachBatchSummary, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === batch.name) return;
    const data = await post({
      action: "update-batch",
      batchId: batch.id,
      name: trimmed,
    });
    if (data) setMessage("Bakje hernoemd.");
  }

  async function saveNotes(batch: OutreachBatchSummary, notes: string) {
    const data = await post({
      action: "update-batch",
      batchId: batch.id,
      notes,
    });
    if (data) setMessage("Notitie opgeslagen.");
  }

  async function changeSender(
    batch: OutreachBatchSummary,
    senderProfileId: OutreachSenderProfileId,
  ) {
    if (senderProfileId === batch.senderProfileId) return;
    const data = await post({
      action: "update-batch",
      batchId: batch.id,
      senderProfileId,
    });
    if (data) setMessage("Afzender bijgewerkt.");
  }

  async function planBatch(batchId: string) {
    const data = await post({ action: "schedule-batch", batchId });
    if (data) {
      setMessage(
        `${data.scheduled} mails ingepland` +
          (data.firstAt
            ? ` · vanaf ${new Date(data.firstAt).toLocaleString("nl-NL", {
                timeZone: "Europe/Amsterdam",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""),
      );
    }
  }

  async function tryArm(batch: OutreachBatchSummary) {
    const data = await post({
      action: "arm-batch",
      batchId: batch.id,
      confirmText,
    });
    if (data) {
      setConfirmBatchId(null);
      setConfirmText("");
      setMessage(
        `Auto-send aan voor ${data.armed} mail${data.armed === 1 ? "" : "s"} — cron stuurt op gepland tijdstip.`,
      );
    }
  }

  async function disarmBatch(batchId: string) {
    const data = await post({ action: "disarm-batch", batchId });
    if (data) setMessage("Auto-send uitgeschakeld voor dit bakje.");
  }

  async function trySend(batch: OutreachBatchSummary) {
    const data = await post({
      action: "send-batch",
      batchId: batch.id,
      confirmText,
    });
    if (data) {
      setConfirmBatchId(null);
      setConfirmText("");
      setMessage(
        `${data.ok} verstuurd` +
          (data.failed ? ` · ${data.failed} mislukt` : "") +
          (data.skippedCap
            ? ` · ${data.skippedCap} bewaard voor morgen (daglimiet)`
            : "") +
          (typeof data.sentToday === "number" && data.dailyCap
            ? ` · vandaag ${data.sentToday}/${data.dailyCap}`
            : ""),
      );
    }
  }

  return (
    <div className="space-y-8">
      <div
        className={`border px-4 py-3 text-sm text-text-muted ${
          liveUnlocked && !bouncePaused
            ? "border-accent/40 bg-accent/5"
            : "border-danger/40 bg-danger/5"
        }`}
      >
        <p className="font-medium text-text">
          {bouncePaused
            ? "Live send gepauzeerd (bounces)"
            : liveUnlocked
              ? "Live versturen staat aan"
              : "Live versturen staat uit"}
        </p>
        <p className="mt-1">
          {bouncePaused
            ? `${liveSendQuota?.recentBounces ?? 0} bounces in 24u — check Brevo/lijst voor je doorgaat.`
            : liveSendBlockReason ??
              "Bakjes versturen gaat écht naar prospects. Bevestig met bakjenaam."}
        </p>
        {liveSendQuota ? (
          <p className="mt-2 text-xs text-text-dim">
            Daglimiet: {liveSendQuota.sentToday}/{liveSendQuota.dailyCap} vandaag
            · nog {liveSendQuota.remainingToday} · afzender per bakje
          </p>
        ) : (
          <p className="mt-2 text-xs text-text-dim">
            Afzender kies je per bakje (Evenementen / Reiner / Yoram).
          </p>
        )}
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-text-muted">{message}</p> : null}

      {active.length === 0 ? (
        <p className="border border-border px-4 py-6 text-sm text-text-muted">
          Nog geen bakjes. Genereer drafts in{" "}
          <Link href="/outreach/emails" className="text-accent underline">
            Mailen
          </Link>{" "}
          en kies “Zet in bakje”.
        </p>
      ) : (
        active.map((batch) => (
          <article
            key={batch.id}
            className="border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <input
                  className="w-full max-w-md border-0 bg-transparent font-display text-xl tracking-[0.04em] text-text outline-none focus:underline"
                  defaultValue={batch.name}
                  disabled={pending}
                  onBlur={(e) => void renameBatch(batch, e.target.value)}
                  aria-label="Bakjenaam"
                />
                <p className="mt-1 text-xs text-text-dim">
                  {batch.mailCount} mail
                  {batch.mailCount === 1 ? "" : "s"}
                  {batch.scheduledCount
                    ? ` · ${batch.scheduledCount} gepland`
                    : ""}
                  {batch.variantKeys.length
                    ? ` · ${batch.variantKeys.join(", ")}`
                    : ""}
                  {` · ${batch.senderProfileLabel}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {batch.autoSend ? (
                  <StatusBadge tone="success">Auto-send aan</StatusBadge>
                ) : null}
                <StatusBadge
                  tone={batch.status === "ready" ? "accent" : "neutral"}
                >
                  {batch.status === "ready" ? "Klaar" : "Open"}
                </StatusBadge>
              </div>
            </div>

            <label className="mt-3 block text-xs text-text-dim">
              Notitie
              <textarea
                rows={2}
                className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
                defaultValue={batch.notes ?? ""}
                placeholder="Optioneel — wat zit er in dit bakje?"
                disabled={pending}
                onBlur={(e) => void saveNotes(batch, e.target.value)}
              />
            </label>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block text-xs text-text-dim">
                Afzender
                <select
                  className="mt-1.5 block border border-border bg-bg px-3 py-2 text-sm text-text"
                  value={batch.senderProfileId}
                  disabled={pending}
                  onChange={(e) =>
                    void changeSender(
                      batch,
                      e.target.value as OutreachSenderProfileId,
                    )
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
                Start plannen vanaf
                <input
                  type="date"
                  className="mt-1.5 block border border-border bg-bg px-3 py-2 text-sm text-text"
                  defaultValue={batch.plannedStartDay ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    void post({
                      action: "update-batch",
                      batchId: batch.id,
                      plannedStartDay: e.target.value || null,
                    }).then((data) => {
                      if (data) setMessage("Startdatum bijgewerkt.");
                    })
                  }
                />
              </label>
              {batch.mailCount > 0 ? (
                <p className="max-w-xl text-sm text-text-muted">
                  <span className="font-medium text-text">
                    Suggestie dit bakje:{" "}
                  </span>
                  {batch.sendSuggestionLabel}
                </p>
              ) : null}
            </div>

            {batch.emails.length === 0 ? (
              <p className="mt-4 text-sm text-text-muted">
                Leeg bakje — voeg drafts toe vanuit Mailen.
              </p>
            ) : (
              <div className="mt-4 max-w-full overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="text-[11px] tracking-wider text-text-dim uppercase">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">Gepland</th>
                      <th className="pb-2 pr-3 font-medium">Naar</th>
                      <th className="pb-2 pr-3 font-medium">Van</th>
                      <th className="pb-2 pr-3 font-medium">Template</th>
                      <th className="pb-2 pr-3 font-medium">Onderwerp</th>
                      <th className="pb-2 font-medium text-right">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.emails.map((mail) => {
                      const open = expanded[mail.emailId];
                      const edit = editing[mail.emailId];
                      return (
                        <tr
                          key={mail.emailId}
                          className="border-t border-border/60 align-top"
                        >
                          <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-text-muted">
                            {mail.suggestedLabel ?? "—"}
                          </td>
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-text">
                              {mail.companyName}
                            </p>
                            <p className="text-xs text-text-dim">
                              {mail.email ?? "geen e-mail"}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-text-muted">
                            <p className="text-text">{batch.senderName}</p>
                            <p className="text-text-dim">{batch.senderEmail}</p>
                          </td>
                          <td className="py-2.5 pr-3 text-text-muted">
                            <p>{mail.variantLabel ?? mail.variantKey ?? "—"}</p>
                            <p className="text-xs text-text-dim">
                              {mail.templateAdapted
                                ? "aangepast"
                                : "standaard template"}
                            </p>
                          </td>
                          <td className="max-w-[18rem] py-2.5 pr-3">
                            {edit ? (
                              <div className="space-y-2">
                                <input
                                  className="w-full border border-border bg-bg px-2 py-1.5 text-sm"
                                  value={edit.subject}
                                  onChange={(e) =>
                                    setEditing((prev) => ({
                                      ...prev,
                                      [mail.emailId]: {
                                        ...edit,
                                        subject: e.target.value,
                                      },
                                    }))
                                  }
                                />
                                <textarea
                                  rows={6}
                                  className="w-full border border-border bg-bg px-2 py-1.5 text-sm"
                                  value={edit.body}
                                  onChange={(e) =>
                                    setEditing((prev) => ({
                                      ...prev,
                                      [mail.emailId]: {
                                        ...edit,
                                        body: e.target.value,
                                      },
                                    }))
                                  }
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="text-xs text-accent underline"
                                    disabled={pending}
                                    onClick={() => void saveEdit(mail.emailId)}
                                  >
                                    Opslaan
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-text-dim underline"
                                    onClick={() =>
                                      setEditing((prev) => {
                                        const next = { ...prev };
                                        delete next[mail.emailId];
                                        return next;
                                      })
                                    }
                                  >
                                    Annuleer
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="truncate">{mail.subject}</p>
                                {open ? (
                                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border border-border bg-bg p-2 text-xs text-text-muted">
                                    {mail.body}
                                  </pre>
                                ) : null}
                                <button
                                  type="button"
                                  className="mt-1 text-[11px] text-accent underline"
                                  onClick={() =>
                                    setExpanded((prev) => ({
                                      ...prev,
                                      [mail.emailId]: !open,
                                    }))
                                  }
                                >
                                  {open ? "Tekst inklappen" : "Tekst tonen"}
                                </button>
                              </>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              {!edit ? (
                                <button
                                  type="button"
                                  className="text-xs text-accent underline"
                                  onClick={() =>
                                    setEditing((prev) => ({
                                      ...prev,
                                      [mail.emailId]: {
                                        subject: mail.subject,
                                        body: mail.body,
                                      },
                                    }))
                                  }
                                >
                                  Bewerken
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="text-xs text-text-dim underline"
                                disabled={pending}
                                onClick={() => void dequeue(mail.emailId)}
                              >
                                Uit bakje
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              {confirmBatchId === batch.id ? (
                <div className="max-w-lg space-y-2 border border-danger/40 bg-danger/5 px-3 py-3">
                  <p className="text-sm font-medium text-text">
                    {confirmMode === "arm"
                      ? `Auto-send aanzetten · ${batch.scheduledCount} gepland`
                      : `Nu live versturen · ${batch.mailCount} mail${batch.mailCount === 1 ? "" : "s"}`}
                    {remainingToday != null && confirmMode === "immediate"
                      ? ` · max ${Math.min(batch.mailCount, remainingToday)} vandaag`
                      : ""}
                  </p>
                  <p className="text-xs text-text-dim">
                    Typ exact “{batch.name}” of “{LIVE_SEND_CONFIRM_PHRASE}”.
                    {confirmMode === "arm"
                      ? " Cron stuurt daarna automatisch op de geplande tijden."
                      : ""}
                  </p>
                  <input
                    className="w-full border border-border bg-bg px-3 py-2 text-sm"
                    value={confirmText}
                    disabled={pending}
                    autoFocus
                    placeholder={batch.name}
                    onChange={(e) => setConfirmText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (confirmMode === "arm") void tryArm(batch);
                        else void trySend(batch);
                      }
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        pending ||
                        !confirmText.trim() ||
                        bouncePaused ||
                        (confirmMode === "immediate" && dayCapHit)
                      }
                      className="bg-accent px-4 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
                      onClick={() =>
                        confirmMode === "arm"
                          ? void tryArm(batch)
                          : void trySend(batch)
                      }
                    >
                      {pending
                        ? "Bezig…"
                        : confirmMode === "arm"
                          ? "Auto-send bevestigen"
                          : "Nu live versturen"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="border border-border px-3 py-2 text-sm"
                      onClick={() => {
                        setConfirmBatchId(null);
                        setConfirmText("");
                      }}
                    >
                      Annuleer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending || batch.mailCount === 0}
                    className="border border-border px-3 py-2.5 text-sm hover:border-accent disabled:opacity-50"
                    onClick={() => void planBatch(batch.id)}
                  >
                    Plan in
                  </button>
                  {batch.autoSend ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="border border-border px-3 py-2.5 text-sm disabled:opacity-50"
                      onClick={() => void disarmBatch(batch.id)}
                    >
                      Auto-send uit
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        pending ||
                        Boolean(liveSendBlockReason) ||
                        bouncePaused ||
                        batch.scheduledCount === 0
                      }
                      title={
                        batch.scheduledCount === 0
                          ? "Eerst Plan in"
                          : (liveSendBlockReason ?? "Zet automatische verzending aan")
                      }
                      className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
                      onClick={() => {
                        setConfirmMode("arm");
                        setConfirmBatchId(batch.id);
                        setConfirmText("");
                        setError(null);
                      }}
                    >
                      Auto-send aan
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      pending ||
                      Boolean(liveSendBlockReason) ||
                      bouncePaused ||
                      dayCapHit ||
                      batch.mailCount === 0
                    }
                    className="border border-border px-3 py-2.5 text-sm disabled:opacity-50"
                    onClick={() => {
                      setConfirmMode("immediate");
                      setConfirmBatchId(batch.id);
                      setConfirmText("");
                      setError(null);
                    }}
                  >
                    Nu versturen
                  </button>
                  <p className="w-full max-w-lg text-xs text-text-dim">
                    {batch.autoSend
                      ? "Auto-send aan — mails gaan op gepland tijdstip (cron ±10 min)."
                      : liveSendBlockReason ??
                        "1) Plan in · 2) Auto-send aan (bevestigen) · of direct “Nu versturen”."}
                  </p>
                </div>
              )}
            </div>
          </article>
        ))
      )}

      {sent.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-lg tracking-[0.04em]">
            Al verstuurd
          </h2>
          <ul className="space-y-2 text-sm text-text-muted">
            {sent.map((b) => (
              <li key={b.id} className="border border-border px-3 py-2">
                {b.name}
                <span className="ml-2 text-text-dim">
                  · {b.mailCount} mails
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
