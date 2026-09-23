"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import type { EditableTemplate } from "@/lib/outreach/templates";
import type { OutreachVariantId } from "@/lib/outreach/tone";

type Props = {
  initial: EditableTemplate[];
  brochureUrl: string;
};

export function TemplatesWorkbench({ initial, brochureUrl }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [templates, setTemplates] = useState(initial);
  const [activeId, setActiveId] = useState<OutreachVariantId>(
    initial[0]?.id ?? "warm_tour",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Voorbeeld BV");
  const [subjectArm, setSubjectArm] = useState<"a" | "b">("a");

  const active = useMemo(
    () => templates.find((t) => t.id === activeId) ?? templates[0],
    [templates, activeId],
  );

  function patch(partial: Partial<EditableTemplate>) {
    if (!active) return;
    setTemplates((list) =>
      list.map((t) => (t.id === active.id ? { ...t, ...partial } : t)),
    );
  }

  async function save() {
    if (!active) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        id: active.id,
        name: active.name,
        description: active.description,
        guidance: active.guidance,
        subjectA: active.subjects.a,
        subjectB: active.subjects.b,
        bodyTemplate: active.bodyTemplate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Opslaan mislukt");
      return;
    }
    setMessage("Opgeslagen — geldt voor nieuwe drafts.");
    startTransition(() => router.refresh());
  }

  async function reset() {
    if (!active) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset", id: active.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Reset mislukt");
      return;
    }
    setMessage("Teruggezet naar standaard.");
    startTransition(() => router.refresh());
  }

  async function sendTest() {
    if (!active) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "test",
        id: active.id,
        subjectArm,
        companyName,
        subject: subjectArm === "a" ? active.subjects.a : active.subjects.b,
        bodyTemplate: active.bodyTemplate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Test mislukt");
      return;
    }
    setMessage(
      `Test verstuurd naar ${
        Array.isArray(data.deliveredTo)
          ? data.deliveredTo.join(", ")
          : "team@"
      }.`,
    );
  }

  if (!active) {
    return (
      <p className="text-sm text-text-muted">Geen templates beschikbaar.</p>
    );
  }

  const previewBody = active.bodyTemplate
    .replaceAll("{{companyName}}", companyName)
    .replaceAll("{{availabilityUrl}}", "https://…/agenda")
    .replaceAll("{{brochureUrl}}", brochureUrl);

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
      <nav className="space-y-1">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-text-dim">
          Templates
        </p>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveId(t.id)}
            className={
              t.id === active.id
                ? "block w-full border border-accent bg-accent/10 px-3 py-2 text-left text-sm text-text"
                : "block w-full border border-transparent px-3 py-2 text-left text-sm text-text-muted hover:border-border hover:text-text"
            }
          >
            <span className="font-medium">{t.name}</span>
            {t.overridden ? (
              <span className="ml-1 text-[10px] text-accent">aangepast</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl tracking-[0.06em]">
              {active.name}
            </h2>
            <p className="mt-1 text-sm text-text-muted">{active.description}</p>
          </div>
          <StatusBadge tone={active.overridden ? "info" : "neutral"}>
            {active.overridden ? "Aangepast" : "Standaard"}
          </StatusBadge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-text-dim">
            Naam
            <input
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={active.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label className="block text-xs text-text-dim">
            Korte uitleg
            <input
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={active.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          <label className="block text-xs text-text-dim sm:col-span-2">
            AI-guidance (toon)
            <textarea
              rows={3}
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={active.guidance}
              onChange={(e) => patch({ guidance: e.target.value })}
            />
          </label>
          <label className="block text-xs text-text-dim">
            Onderwerp A
            <input
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={active.subjects.a}
              onChange={(e) =>
                patch({ subjects: { ...active.subjects, a: e.target.value } })
              }
            />
          </label>
          <label className="block text-xs text-text-dim">
            Onderwerp B
            <input
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={active.subjects.b}
              onChange={(e) =>
                patch({ subjects: { ...active.subjects, b: e.target.value } })
              }
            />
          </label>
          <label className="block text-xs text-text-dim sm:col-span-2">
            Body-template
            <span className="ml-2 font-normal normal-case tracking-normal text-text-dim">
              Placeholders: {"{{companyName}}"} {"{{availabilityUrl}}"}{" "}
              {"{{brochureUrl}}"}
            </span>
            <textarea
              rows={14}
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 font-mono text-sm leading-relaxed text-text"
              value={active.bodyTemplate}
              onChange={(e) => patch({ bodyTemplate: e.target.value })}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <label className="text-xs text-text-dim">
            Testbedrijf
            <input
              className="mt-1.5 block w-44 border border-border bg-bg px-3 py-2 text-sm text-text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label className="text-xs text-text-dim">
            Arm
            <select
              className="mt-1.5 block border border-border bg-bg px-3 py-2 text-sm text-text"
              value={subjectArm}
              onChange={(e) => setSubjectArm(e.target.value as "a" | "b")}
            >
              <option value="a">A</option>
              <option value="b">B</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => void save()}
            className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            Opslaan
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void sendTest()}
            className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
          >
            Stuur testmail
          </button>
          <button
            type="button"
            disabled={pending || !active.overridden}
            onClick={() => void reset()}
            className="border border-border px-4 py-2.5 text-sm text-text-muted hover:border-accent disabled:opacity-40"
          >
            Reset standaard
          </button>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-text-muted">{message}</p>
        ) : null}

        <section className="mt-8 border-t border-border pt-6">
          <h3 className="font-display text-lg tracking-[0.06em]">Preview</h3>
          <p className="mt-1 text-xs text-text-dim">
            Onderwerp:{" "}
            {subjectArm === "a" ? active.subjects.a : active.subjects.b}
          </p>
          <pre className="mt-3 whitespace-pre-wrap border border-border bg-bg px-4 py-3 font-sans text-sm leading-relaxed text-text-muted">
            {previewBody}
          </pre>
          {active.id === "brochure" ? (
            <p className="mt-3 text-xs text-text-dim">
              Brochure-link (geen PDF-bijlage):{" "}
              <a
                href={brochureUrl}
                className="text-accent underline"
                target="_blank"
                rel="noreferrer"
              >
                {brochureUrl}
              </a>
              . Zet <code>OUTREACH_BROCHURE_URL</code> om te wijzigen.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
