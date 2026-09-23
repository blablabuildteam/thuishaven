"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  OUTREACH_VARIANTS,
  type OutreachSubjectArm,
  type OutreachVariantId,
} from "@/lib/outreach/tone";

type WorkbenchProspect = {
  id: string;
  type: "company" | "agency";
  companyName: string;
  email: string | null;
  status: string;
  source?: string;
  nonMailing?: boolean;
};

type Props = {
  prospects: WorkbenchProspect[];
  /** Prefill from ?variant= or CRM */
  initialVariantId?: OutreachVariantId;
};

export function OutreachEmailWorkbench({
  prospects,
  initialVariantId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ready = useMemo(
    () =>
      prospects.filter(
        (p) =>
          p.type === "company" &&
          p.source !== "bureau_import" &&
          p.status !== "excluded" &&
          !p.nonMailing &&
          Boolean(p.email),
      ),
    [prospects],
  );

  const [selected, setSelected] = useState<string[]>(() =>
    ready[0] ? [ready[0].id] : [],
  );
  const [variantId, setVariantId] = useState<OutreachVariantId>(
    initialVariantId ?? "seizoen",
  );
  const [subjectArm, setSubjectArm] = useState<OutreachSubjectArm | "auto">(
    "auto",
  );
  const [draft, setDraft] = useState<{
    emailId: string;
    subject: string;
    body: string;
    subjectKey?: string;
  } | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const variant = OUTREACH_VARIANTS.find((v) => v.id === variantId);
  const companyVariants = OUTREACH_VARIANTS.filter(
    (v) => v.audience === "company" || v.audience === "both",
  );

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllReady() {
    setSelected(ready.map((p) => p.id));
  }

  function clearSelection() {
    setSelected([]);
  }

  async function generate() {
    setError(null);
    setMessage(null);
    setBulkResult(null);
    setDraft(null);

    if (selected.length === 0) {
      setError("Selecteer minstens één bedrijf");
      return;
    }

    if (selected.length === 1) {
      const res = await fetch("/api/outreach/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: selected[0],
          variantId,
          subjectArm: subjectArm === "auto" ? undefined : subjectArm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Genereren mislukt");
        return;
      }
      setDraft({
        emailId: data.emailId,
        subject: data.subject,
        body: data.body,
        subjectKey: data.subjectKey,
      });
      setMessage(
        `Draft opgeslagen · A/B-arm ${(data.subjectKey ?? "?").toUpperCase()}`,
      );
      startTransition(() => router.refresh());
      return;
    }

    const res = await fetch("/api/outreach/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectIds: selected,
        variantId,
        subjectArm: subjectArm === "auto" ? undefined : subjectArm,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Bulk genereren mislukt");
      return;
    }
    setBulkResult(
      `${data.ok} drafts met template “${variant?.name ?? variantId}”` +
        (data.failed ? ` · ${data.failed} mislukt` : ""),
    );
    setMessage("Bulk klaar — zie eerdere drafts hieronder.");
    startTransition(() => router.refresh());
  }

  async function sendTest() {
    if (!draft) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-test", emailId: draft.emailId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Testsend mislukt");
      return;
    }
    setMessage(
      `Test naar ${data.deliveredTo?.join(", ")} (bedoeld: ${data.intendedTo}). Check Resultaten na openen.`,
    );
    startTransition(() => router.refresh());
  }

  if (!ready.length) {
    return (
      <p className="border-y border-border py-6 text-sm text-text-muted">
        Geen bedrijven met e-mail klaar. Vul eerst contactmails aan via{" "}
        <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
          Lijst bijwerken
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mb-10">
      <p className="mb-4 text-sm text-text-muted">
        Kies één template voor alle geselecteerde bedrijven. Test alleen naar{" "}
        <code className="text-accent">team@blablabuild.com</code> — live staat
        uit.{" "}
        <Link href="/outreach/templates" className="text-accent underline">
          Templates bewerken
        </Link>
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-text-dim">
              Bedrijven · {selected.length} geselecteerd
            </p>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllReady}
                className="text-accent underline"
              >
                Alles
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-text-dim underline"
              >
                Niets
              </button>
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-border border border-border">
            {ready.map((p) => {
              const on = selected.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface/60">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(p.id)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-text">
                        {p.companyName}
                      </span>
                      <span className="block truncate text-xs text-text-dim">
                        {p.email}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-text-dim">
            Mailtemplate
            <select
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={variantId}
              onChange={(e) =>
                setVariantId(e.target.value as OutreachVariantId)
              }
            >
              {companyVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-text-muted">{variant?.description}</p>
          <label className="block text-xs text-text-dim">
            Onderwerp A/B
            <select
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={subjectArm}
              onChange={(e) =>
                setSubjectArm(e.target.value as OutreachSubjectArm | "auto")
              }
            >
              <option value="auto">Auto (50/50)</option>
              <option value="a">A — {variant?.subjects.a ?? "arm A"}</option>
              <option value="b">B — {variant?.subjects.b ?? "arm B"}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={selected.length === 0 || pending}
          onClick={() => void generate()}
          className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          {selected.length > 1
            ? `Genereer ${selected.length} drafts`
            : "Genereer draft"}
        </button>
        <button
          type="button"
          disabled={!draft || pending}
          onClick={() => void sendTest()}
          className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
        >
          Stuur test (1 draft)
        </button>
        <Link
          href="/outreach/templates"
          className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent"
        >
          Templates →
        </Link>
      </div>

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {message && <p className="mt-3 text-sm text-text-muted">{message}</p>}
      {bulkResult && (
        <p className="mt-2 text-sm font-medium text-text">{bulkResult}</p>
      )}

      {draft && (
        <article className="mt-6 border-t border-border pt-4">
          <p className="text-xs text-text-dim">
            Concept
            {draft.subjectKey
              ? ` · arm ${draft.subjectKey.toUpperCase()}`
              : ""}
          </p>
          <h3 className="mt-1 font-medium text-text">{draft.subject}</h3>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-muted">
            {draft.body}
          </pre>
        </article>
      )}
    </div>
  );
}
