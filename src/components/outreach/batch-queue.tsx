"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  OutreachBatchSummary,
  UnbatchedDraft,
} from "@/lib/outreach/batches";

type Props = {
  batches: OutreachBatchSummary[];
  unbatchedDrafts: UnbatchedDraft[];
  liveSendBlockReason: string | null;
};

export function BatchQueue({
  batches,
  unbatchedDrafts,
  liveSendBlockReason,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, { subject: string; body: string }>>(
    {},
  );

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

  async function trySend(batchId: string) {
    const data = await post({ action: "send-batch", batchId });
    if (data) {
      setMessage(
        `${data.ok} verstuurd` +
          (data.failed ? ` · ${data.failed} mislukt` : ""),
      );
    }
  }

  return (
    <div className="space-y-8">
      <div className="border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-text-muted">
        <p className="font-medium text-text">Live versturen staat uit.</p>
        <p className="mt-1">
          {liveSendBlockReason ??
            "Je kunt bakjes vullen en reviewen; versturen volgt later."}
        </p>
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
                  {batch.variantKeys.length
                    ? ` · ${batch.variantKeys.join(", ")}`
                    : ""}
                </p>
              </div>
              <StatusBadge
                tone={batch.status === "ready" ? "accent" : "neutral"}
              >
                {batch.status === "ready" ? "Klaar voor review" : "Open"}
              </StatusBadge>
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
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-[11px] tracking-wider text-text-dim uppercase">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">Gepland</th>
                      <th className="pb-2 pr-3 font-medium">Bedrijf</th>
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
                          <td className="py-2.5 pr-3 text-text-muted">
                            {mail.variantLabel ?? mail.variantKey ?? "—"}
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

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <button
                type="button"
                disabled={pending || Boolean(liveSendBlockReason) || batch.mailCount === 0}
                title={liveSendBlockReason ?? "Verstuur alle mails in dit bakje"}
                className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void trySend(batch.id)}
              >
                Verstuur bakje ({batch.mailCount})
              </button>
              <p className="max-w-md text-xs text-text-dim">
                {liveSendBlockReason ??
                  "Live send is aan — dit stuurt écht naar de prospects."}
              </p>
            </div>
          </article>
        ))
      )}

      {unbatchedDrafts.length > 0 ? (
        <section className="border border-border p-4">
          <h2 className="font-display text-lg tracking-[0.04em]">
            Nog niet in een bakje
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {unbatchedDrafts.length} draft
            {unbatchedDrafts.length === 1 ? "" : "s"} zonder bakje. Open Mailen
            om ze in een bakje te zetten.
          </p>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {unbatchedDrafts.slice(0, 12).map((d) => (
              <li
                key={d.emailId}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {d.companyName}
                  <span className="text-text-dim">
                    {" "}
                    · {d.variantLabel ?? d.variantKey ?? "—"}
                  </span>
                </span>
                <span className="truncate text-text-muted">{d.subject}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/outreach/emails"
            className="mt-3 inline-block text-sm text-accent underline"
          >
            Naar Mailen →
          </Link>
        </section>
      ) : null}

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
