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
  suggestedVariantId: OutreachVariantId | null;
  suggestedLabel: string | null;
};

type Props = {
  prospects: WorkbenchProspect[];
  defaultTestTo?: string;
};

type Mode = "suggested" | "override";

export function OutreachEmailWorkbench({
  prospects,
  defaultTestTo = "team@blablabuild.com",
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
          Boolean(p.email) &&
          Boolean(p.suggestedVariantId),
      ),
    [prospects],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<Mode>("suggested");
  const [overrideVariant, setOverrideVariant] =
    useState<OutreachVariantId>("warm_tour");
  const [perRow, setPerRow] = useState<Record<string, OutreachVariantId>>({});
  const [subjectArm, setSubjectArm] = useState<OutreachSubjectArm | "auto">(
    "auto",
  );
  const [testTo, setTestTo] = useState(defaultTestTo);
  const [lastEmailIds, setLastEmailIds] = useState<string[]>([]);
  const [draftPreview, setDraftPreview] = useState<{
    emailId: string;
    subject: string;
    body: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companyVariants = OUTREACH_VARIANTS.filter(
    (v) => v.audience === "company" || v.audience === "both",
  );

  function variantFor(p: WorkbenchProspect): OutreachVariantId {
    if (mode === "override") return overrideVariant;
    return (
      perRow[p.id] ??
      p.suggestedVariantId ??
      overrideVariant
    );
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(ready.map((p) => p.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function generate() {
    setError(null);
    setMessage(null);
    setDraftPreview(null);
    const picks = ready.filter((p) => selected.has(p.id));
    if (!picks.length) {
      setError("Selecteer minstens één bedrijf");
      return;
    }

    const items = picks.map((p) => ({
      prospectId: p.id,
      variantId: variantFor(p),
    }));

    const res = await fetch("/api/outreach/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        subjectArm: subjectArm === "auto" ? undefined : subjectArm,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Genereren mislukt");
      return;
    }

    if (data.emailId) {
      setLastEmailIds([data.emailId]);
      setDraftPreview({
        emailId: data.emailId,
        subject: data.subject,
        body: data.body,
      });
      setMessage("1 draft klaar — stuur een test of selecteer meer.");
    } else {
      const ids = (data.results ?? [])
        .map((r: { emailId?: string }) => r.emailId)
        .filter(Boolean) as string[];
      setLastEmailIds(ids);
      setMessage(
        `${data.ok} drafts gemaakt` +
          (data.failed ? ` · ${data.failed} mislukt` : "") +
          " — hieronder kun je tests sturen.",
      );
    }
    startTransition(() => router.refresh());
  }

  async function sendTests() {
    if (!lastEmailIds.length) {
      setError("Eerst drafts genereren");
      return;
    }
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send-test",
        emailIds: lastEmailIds,
        testTo,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Testsend mislukt");
      return;
    }
    const delivered = Array.isArray(data.deliveredTo)
      ? data.deliveredTo.join(", ")
      : testTo;
    if (typeof data.ok === "number") {
      setMessage(
        `${data.ok} testmails naar ${delivered}` +
          (data.failed ? ` · ${data.failed} mislukt` : ""),
      );
    } else {
      setMessage(`Test naar ${delivered}`);
    }
    startTransition(() => router.refresh());
  }

  if (!ready.length) {
    return (
      <p className="border-y border-border py-6 text-sm text-text-muted">
        Geen bedrijven klaar om te mailen (e-mail + mailkans). Vul aan via{" "}
        <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
          Lijst bijwerken
        </Link>{" "}
        of filter op{" "}
        <Link href="/outreach/crm" className="text-accent underline">
          Bedrijven
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mb-10 space-y-6">
      <p className="text-sm text-text-muted">
        Vink bedrijven aan, kies template (suggested of zelf), genereer drafts,
        stuur tests. Live naar prospects blijft dicht.{" "}
        <Link href="/outreach/templates" className="text-accent underline">
          Templates bewerken
        </Link>
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("suggested")}
          className={
            mode === "suggested"
              ? "border border-accent bg-accent/10 px-3 py-1.5 text-sm"
              : "border border-border px-3 py-1.5 text-sm text-text-muted"
          }
        >
          Suggested per bedrijf
        </button>
        <button
          type="button"
          onClick={() => setMode("override")}
          className={
            mode === "override"
              ? "border border-accent bg-accent/10 px-3 py-1.5 text-sm"
              : "border border-border px-3 py-1.5 text-sm text-text-muted"
          }
        >
          Eén template voor selectie
        </button>
      </div>

      {mode === "override" ? (
        <label className="block max-w-sm text-xs text-text-dim">
          Template voor alle geselecteerden
          <select
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={overrideVariant}
            onChange={(e) =>
              setOverrideVariant(e.target.value as OutreachVariantId)
            }
          >
            {companyVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-text-dim">
          Onderwerp A/B
          <select
            className="mt-1.5 block border border-border bg-bg px-3 py-2 text-sm text-text"
            value={subjectArm}
            onChange={(e) =>
              setSubjectArm(e.target.value as OutreachSubjectArm | "auto")
            }
          >
            <option value="auto">Auto</option>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </label>
        <label className="min-w-[14rem] flex-1 text-xs text-text-dim">
          Test naar (alleen @blablabuild.com / @thuishaven.nl)
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="team@blablabuild.com"
          />
        </label>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-text-dim">
            Bedrijven · {selected.size} geselecteerd / {ready.length}
          </p>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
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

        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 w-10" />
                <th className="px-3 py-2 font-medium">Bedrijf</th>
                <th className="px-3 py-2 font-medium">Suggested</th>
                <th className="px-3 py-2 font-medium">Template</th>
              </tr>
            </thead>
            <tbody>
              {ready.map((p) => {
                const on = selected.has(p.id);
                const chosen = variantFor(p);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0 hover:bg-surface/50"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(p.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-text">{p.companyName}</p>
                      <p className="text-xs text-text-dim">{p.email}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted">
                      {p.suggestedLabel ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {mode === "suggested" ? (
                        <select
                          className="w-full max-w-[12rem] border border-border bg-bg px-2 py-1.5 text-sm text-text"
                          value={chosen}
                          onChange={(e) =>
                            setPerRow((prev) => ({
                              ...prev,
                              [p.id]: e.target.value as OutreachVariantId,
                            }))
                          }
                        >
                          {companyVariants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                              {v.id === p.suggestedVariantId ? " ★" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-text-dim">
                          {
                            companyVariants.find((v) => v.id === overrideVariant)
                              ?.name
                          }
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={selected.size === 0 || pending}
          onClick={() => void generate()}
          className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          Genereer {selected.size || ""} draft
          {selected.size === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          disabled={!lastEmailIds.length || pending}
          onClick={() => void sendTests()}
          className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
        >
          Stuur test
          {lastEmailIds.length > 1 ? ` (${lastEmailIds.length})` : ""}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-text-muted">{message}</p> : null}

      {draftPreview ? (
        <article className="border-t border-border pt-4">
          <p className="text-xs text-text-dim">Laatste concept</p>
          <h3 className="mt-1 font-medium text-text">{draftPreview.subject}</h3>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-muted">
            {draftPreview.body}
          </pre>
        </article>
      ) : null}
    </div>
  );
}
