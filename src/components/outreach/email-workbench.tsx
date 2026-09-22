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
};

export function OutreachEmailWorkbench({ prospects }: Props) {
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

  const [prospectId, setProspectId] = useState(ready[0]?.id ?? "");
  const [variantId, setVariantId] = useState<OutreachVariantId>("seizoen");
  const [subjectArm, setSubjectArm] = useState<OutreachSubjectArm | "auto">(
    "auto",
  );
  const [draft, setDraft] = useState<{
    emailId: string;
    subject: string;
    body: string;
    subjectKey?: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const variant = OUTREACH_VARIANTS.find((v) => v.id === variantId);

  async function generate() {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectId,
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
        Alleen test naar{" "}
        <code className="text-accent">team@blablabuild.com</code> — live naar
        prospects staat uit.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-text-dim">
          Bedrijf
          <select
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={prospectId}
            onChange={(e) => setProspectId(e.target.value)}
          >
            {ready.map((p) => (
              <option key={p.id} value={p.id}>
                {p.companyName} · {p.email}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-dim">
          Invalshoek
          <select
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={variantId}
            onChange={(e) =>
              setVariantId(e.target.value as OutreachVariantId)
            }
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
        <label className="text-xs text-text-dim">
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!prospectId || pending}
          onClick={() => void generate()}
          className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          Genereer draft
        </button>
        <button
          type="button"
          disabled={!draft || pending}
          onClick={() => void sendTest()}
          className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
        >
          Stuur test
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {message && <p className="mt-3 text-sm text-text-muted">{message}</p>}

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
