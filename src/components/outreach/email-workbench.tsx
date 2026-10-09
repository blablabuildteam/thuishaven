"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  DEFAULT_SENDER_PROFILE_ID,
  OUTREACH_SENDER_PROFILES,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import {
  OUTREACH_VARIANTS,
  type OutreachSubjectArm,
  type OutreachVariantId,
} from "@/lib/outreach/tone";
import type { LeadTier } from "@/lib/outreach/lead-score";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatTemplateStat,
  type TemplateStat,
} from "@/lib/outreach/template-stat-label";

export type WorkbenchProspect = {
  id: string;
  companyName: string;
  email: string;
  contactName: string | null;
  angleId: string;
  suggestedVariantId: OutreachVariantId | null;
  suggestedLabel: string | null;
  score: number;
  tier: LeadTier;
  /** Truly sent (not bakje). */
  mailCount: number;
  queuedCount: number;
  lastSentAt: string | null;
  lastVariantKey: string | null;
  replyCount: number;
};

type Props = {
  prospects: WorkbenchProspect[];
  defaultTestTo?: string;
  templateStats: Record<string, TemplateStat>;
  bestTemplate: string | null;
  preselectIds?: string[];
  /** Template meegenomen vanuit Bedrijven-handoff. */
  handoffVariantId?: OutreachVariantId | null;
  skippedNoEmail?: number;
  /** Nog niet gemaild maar staan al in de Wachtrij — niet in deze lijst. */
  inQueueCount?: number;
  aiConfigured?: boolean;
};

type DraftEdit = {
  emailId: string;
  companyName: string;
  subject: string;
  body: string;
};

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

type Mode = "suggested" | "override";

export function OutreachEmailWorkbench({
  prospects,
  defaultTestTo = "team@blablabuild.com",
  templateStats,
  bestTemplate,
  preselectIds = [],
  handoffVariantId = null,
  skippedNoEmail = 0,
  inQueueCount = 0,
  aiConfigured = true,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const preselected = useMemo(() => new Set(preselectIds), [preselectIds]);
  const [showMailed, setShowMailed] = useState(false);
  const [q, setQ] = useState("");
  const [onlyHandoff, setOnlyHandoff] = useState(false);
  const handoffVariantName = handoffVariantId
    ? OUTREACH_VARIANTS.find((v) => v.id === handoffVariantId)?.name ??
      handoffVariantId
    : null;

  const ready = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return prospects
      .filter((p) => {
        if (onlyHandoff && !preselected.has(p.id)) return false;
        if (!showMailed && p.mailCount > 0) return false;
        if (
          needle &&
          !p.companyName.toLowerCase().includes(needle) &&
          !p.email.toLowerCase().includes(needle)
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.companyName.localeCompare(b.companyName, "nl"),
      );
  }, [prospects, q, showMailed, onlyHandoff, preselected]);

  const mailedTotal = prospects.filter((p) => p.mailCount > 0).length;
  const neverMailedTotal = prospects.filter((p) => p.mailCount === 0).length;

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        prospects
          .filter((p) => preselected.has(p.id) && p.mailCount === 0)
          .map((p) => p.id),
      ),
  );
  const [mode, setMode] = useState<Mode>(
    handoffVariantId ? "override" : "suggested",
  );
  const [overrideVariant, setOverrideVariant] = useState<OutreachVariantId>(
    handoffVariantId ?? "warm_tour",
  );
  const [subjectArm, setSubjectArm] = useState<OutreachSubjectArm | "auto">(
    "auto",
  );
  const [testTo, setTestTo] = useState(defaultTestTo);
  const [lastEmailIds, setLastEmailIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftEdit[]>([]);
  const [senderProfileId, setSenderProfileId] =
    useState<OutreachSenderProfileId>(DEFAULT_SENDER_PROFILE_ID);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const companyVariants = OUTREACH_VARIANTS.filter(
    (v) => v.audience === "company" || v.audience === "both",
  );

  function variantFor(p: WorkbenchProspect): OutreachVariantId {
    if (mode === "override") return overrideVariant;
    return p.suggestedVariantId ?? overrideVariant;
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
    setSelected(
      new Set(ready.filter((p) => p.queuedCount === 0).map((p) => p.id)),
    );
  }

  function selectTop(n: number) {
    setSelected(
      new Set(
        ready
          .filter((p) => p.mailCount === 0 && p.queuedCount === 0)
          .slice(0, n)
          .map((p) => p.id),
      ),
    );
  }

  function templateOption(v: (typeof OUTREACH_VARIANTS)[number], suggestedId?: string | null) {
    const tags = [
      v.id === suggestedId ? "★ voorgesteld" : null,
      v.id === bestTemplate ? "beste reply" : null,
    ].filter(Boolean);
    return `${v.name}${tags.length ? ` (${tags.join(", ")})` : ""} — ${formatTemplateStat(templateStats[v.id])}`;
  }

  const selectedMailed = prospects.filter(
    (p) => selected.has(p.id) && p.mailCount > 0,
  ).length;

  function clearSelection() {
    setSelected(new Set());
  }

  async function generate() {
    setError(null);
    setMessage(null);
    setDrafts([]);
    const picks = prospects.filter((p) => selected.has(p.id));
    if (!picks.length) {
      setError("Selecteer minstens één bedrijf");
      return;
    }

    setBusy(true);
    try {
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
          senderProfileId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Genereren mislukt");
        return;
      }

      const made: DraftEdit[] = data.emailId
        ? [
            {
              emailId: data.emailId,
              companyName: picks[0]?.companyName ?? "",
              subject: data.subject,
              body: data.body,
            },
          ]
        : (
            (data.results ?? []) as Array<{
              prospectId?: string;
              emailId?: string;
              subject?: string;
              body?: string;
            }>
          )
            .filter((r) => r.emailId && r.subject && r.body)
            .map((r) => ({
              emailId: r.emailId!,
              companyName:
                picks.find((p) => p.id === r.prospectId)?.companyName ?? "",
              subject: r.subject!,
              body: r.body!,
            }));

      const failed = Number(data.failed ?? 0);
      const failReasons = [
        ...new Set(
          ((data.results ?? []) as Array<{ error?: string }>)
            .map((r) => r.error)
            .filter((e): e is string => Boolean(e)),
        ),
      ].slice(0, 2);
      const sources = (
        (data.results ?? []) as Array<{ source?: string }>
      ).map((r) => r.source);
      if (data.source && !sources.length) sources.push(data.source);
      const aiOk = sources.filter((s) => s === "ai").length;
      setLastEmailIds(made.map((d) => d.emailId));
      setDrafts(made);
      if (!made.length) {
        setError(
          failed
            ? `Geen drafts gemaakt (${failed} mislukt)${failReasons.length ? `: ${failReasons.join(" · ")}` : ". Probeer opnieuw."}`
            : "Geen drafts gemaakt.",
        );
      } else {
        setMessage(
          `${made.length} persoonlijke AI-mail${made.length === 1 ? "" : "s"} klaar` +
            (aiOk && aiOk !== made.length ? ` · ${aiOk} AI` : "") +
            (failed ? ` · ${failed} mislukt` : "") +
            (failReasons.length ? ` (${failReasons.join(" · ")})` : "") +
            " — ze staan al in de Wachtrij. Lees ze hieronder of daar, en stuur een test.",
        );
        requestAnimationFrame(() => {
          document
            .getElementById("outreach-drafts")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftEdits() {
    for (const draft of drafts) {
      const res = await fetch("/api/outreach/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-draft",
          emailId: draft.emailId,
          subject: draft.subject,
          body: draft.body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Opslaan mislukt voor ${draft.companyName}`);
        return false;
      }
    }
    return true;
  }

  async function sendTests() {
    if (!lastEmailIds.length) {
      setError("Eerst drafts genereren");
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
    if (drafts.length) {
      const saved = await saveDraftEdits();
      if (!saved) return;
    }
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
    } finally {
      setBusy(false);
    }
  }

  async function sendToQueue() {
    if (!lastEmailIds.length) {
      setError("Eerst drafts genereren");
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (drafts.length) {
        const saved = await saveDraftEdits();
        if (!saved) return;
      }
      const res = await fetch("/api/outreach/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote-queue",
          emailIds: lastEmailIds,
          senderProfileId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Naar wachtrij zetten mislukt");
        return;
      }
      setMessage(
        `${data.promoted} mail${data.promoted === 1 ? "" : "s"} in de Wachtrij — daar kun je ze checken en inplannen.`,
      );
      setDrafts([]);
      setLastEmailIds([]);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (!prospects.length) {
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
    <div className={`space-y-6 ${selected.size > 0 ? "mb-28" : "mb-10"}`}>
      {!aiConfigured ? (
        <p
          className="border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-text"
          role="status"
        >
          Geen AI-key op deze omgeving — er worden geen mails gemaakt. Zet
          ANTHROPIC_API_KEY (aanbevolen) of GEMINI_API_KEY op Vercel / in
          .env.local.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMode("suggested")}
            className={
              mode === "suggested"
                ? "border border-accent bg-accent/10 px-3 py-1.5 text-sm"
                : "border border-border px-3 py-1.5 text-sm text-text-muted"
            }
          >
            Invalshoek per bedrijf
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
            Eén invalshoek voor iedereen
          </button>
        </div>

        {mode === "override" ? (
          <label className="block max-w-xs text-xs text-text-dim">
            <span className="sr-only">Invalshoek</span>
            <select
              className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={overrideVariant}
              onChange={(e) =>
                setOverrideVariant(e.target.value as OutreachVariantId)
              }
            >
              {companyVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {templateOption(v)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <details className="ml-auto text-xs text-text-dim">
          <summary className="cursor-pointer py-2 hover:text-text">
            Onderwerp &amp; testadres
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
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
        <label className="min-w-[12rem] flex-1 text-xs text-text-dim sm:max-w-xs">
          Test naar
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="team@blablabuild.com"
          />
        </label>
          </div>
        </details>
      </div>

      <div>
        {preselectIds.length > 0 ? (
          <p className="mb-3 rounded-none border border-border bg-surface px-3 py-2 text-sm text-text-muted">
            {selected.size} meegenomen uit Bedrijven (al aangevinkt)
            {handoffVariantName
              ? ` · template «${handoffVariantName}»`
              : ""}
            .{" "}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => setOnlyHandoff((v) => !v)}
            >
              {onlyHandoff
                ? "Toon alle mailklare"
                : `Toon alleen die ${preselectIds.length}`}
            </button>
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek bedrijf of e-mail…"
            className="w-full max-w-xs border border-border bg-bg px-3 py-1.5 text-sm text-text sm:w-56"
          />
          <label className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={showMailed}
              onChange={(e) => setShowMailed(e.target.checked)}
            />
            Ook al verstuurd ({mailedTotal})
          </label>
          {preselectIds.length > 0 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={onlyHandoff}
                onChange={(e) => setOnlyHandoff(e.target.checked)}
              />
              Alleen selectie uit Bedrijven ({preselectIds.length})
            </label>
          ) : null}
        </div>

        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-text-muted">
          <strong className="text-text">{neverMailedTotal}</strong> klaar om
          te mailen
          {showMailed ? <> · inclusief {mailedTotal} al verstuurd</> : null}
          {q.trim() || onlyHandoff ? <> · {ready.length} in beeld</> : null}
          {inQueueCount > 0 ? (
            <>
              {" "}
              · {inQueueCount} staan al in de{" "}
              <Link href="/outreach/planning" className="text-accent underline">
                Wachtrij
              </Link>
            </>
          ) : null}
        </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              title="Kansrijkste eerst (jubileum, complete gegevens)"
              onClick={() => selectTop(10)}
              className="text-accent underline"
            >
              Top 10
            </button>
            <button
              type="button"
              title="Kansrijkste eerst (jubileum, complete gegevens)"
              onClick={() => selectTop(25)}
              className="text-accent underline"
            >
              Top 25
            </button>
            <button
              type="button"
              onClick={selectAll}
              className="text-accent underline"
            >
              Alles in beeld
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
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="w-10 px-3 py-2">
                  <span className="sr-only">Selecteer</span>
                </th>
                <th className="px-3 py-2 font-medium">Bedrijf</th>
                <th className="px-3 py-2 font-medium">Invalshoek</th>
              </tr>
            </thead>
            <tbody>
              {ready.map((p) => {
                const on = selected.has(p.id);
                const chosen = variantFor(p);
                return (
                  <tr
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface/50 ${
                      on ? "bg-accent/5" : ""
                    }`}
                  >
                    <td
                      className="px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(p.id)}
                        aria-label={`Selecteer ${p.companyName}`}
                      />
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/outreach/crm/${p.id}`}
                        className="font-medium text-text hover:text-accent"
                      >
                        {p.companyName}
                      </Link>
                      <p className="text-xs text-text-dim">
                        {[p.contactName, p.email].filter(Boolean).join(" · ")}
                        {p.queuedCount > 0
                          ? ` · ${p.queuedCount} in wachtrij`
                          : ""}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <StatusBadge tone={chosen === "jubileum" ? "accent" : "neutral"}>
                        {mode === "override"
                          ? companyVariants.find((v) => v.id === overrideVariant)?.name
                          : p.suggestedLabel ??
                            companyVariants.find((v) => v.id === chosen)?.name}
                      </StatusBadge>
                      {p.lastSentAt ? (
                        <span className="mt-1 block text-[11px] text-warn">
                          Verstuurd {fmtDay(p.lastSentAt)}
                          {p.replyCount > 0 ? " · gereageerd" : ""}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMailed > 0 ? (
        <p className="text-sm text-warn">
          Let op: {selectedMailed} van de geselecteerde bedrijven is al eerder
          gemaild.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-text-muted">{message}</p> : null}

      {skippedNoEmail > 0 ? (
        <p className="text-sm text-text-muted">
          {skippedNoEmail} bedrijven niet meegenomen: geen e-mail. Vul die aan
          via Lijst bijwerken.
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <div id="outreach-drafts" className="space-y-6 border-t border-border pt-4">
          <p className="text-xs text-text-dim">
            Lees elke draft na en pas aan vóór je de test stuurt.
          </p>
          {drafts.map((draft) => (
            <article key={draft.emailId} className="border border-border p-4">
              <p className="text-sm font-medium text-text">
                {draft.companyName || "Bedrijf"}
              </p>
              <label className="mt-2 block text-xs text-text-dim">
                Onderwerp
                <input
                  className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
                  value={draft.subject}
                  onChange={(e) =>
                    setDrafts((list) =>
                      list.map((d) =>
                        d.emailId === draft.emailId
                          ? { ...d, subject: e.target.value }
                          : d,
                      ),
                    )
                  }
                />
              </label>
              <label className="mt-3 block text-xs text-text-dim">
                Tekst
                <textarea
                  rows={10}
                  className="mt-1.5 w-full border border-border bg-bg px-3 py-2 font-sans text-sm leading-relaxed text-text"
                  value={draft.body}
                  onChange={(e) =>
                    setDrafts((list) =>
                      list.map((d) =>
                        d.emailId === draft.emailId
                          ? { ...d, body: e.target.value }
                          : d,
                      ),
                    )
                  }
                />
              </label>
            </article>
          ))}
          <button
            type="button"
            disabled={busy || pending}
            onClick={() =>
              void saveDraftEdits().then((ok) => {
                if (ok) setMessage("Drafts opgeslagen.");
              })
            }
            className="border border-border px-3 py-1.5 text-xs tracking-[0.08em] hover:border-accent disabled:opacity-50"
          >
            Wijzigingen opslaan
          </button>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2 border border-border bg-surface px-3 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <p className="text-sm text-text">
              <span className="font-medium">{selected.size}</span> geselecteerd
              {lastEmailIds.length > 0
                ? ` · ${lastEmailIds.length} draft${lastEmailIds.length === 1 ? "" : "s"}`
                : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <label className="flex items-center gap-1.5 text-xs text-text-dim">
                Afzender
                <select
                  className="max-w-[11rem] border border-border bg-bg px-2 py-2 text-sm text-text"
                  value={senderProfileId}
                  disabled={busy}
                  onChange={(e) =>
                    setSenderProfileId(
                      e.target.value as OutreachSenderProfileId,
                    )
                  }
                >
                  {OUTREACH_SENDER_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generate()}
                className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
              >
                {busy ? "Bezig…" : `Genereer ${selected.size} draft${selected.size === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                disabled={busy || !lastEmailIds.length}
                onClick={() => void sendTests()}
                className="border border-border px-3 py-2.5 text-sm hover:border-accent disabled:opacity-50"
              >
                Test
              </button>
              {lastEmailIds.length > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendToQueue()}
                  className="border border-accent bg-accent/10 px-3 py-2.5 text-sm disabled:opacity-50"
                >
                  Naar wachtrij
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={clearSelection}
                className="px-2 py-2 text-xs text-text-dim underline"
              >
                Wis
              </button>
            </div>
            {error ? (
              <p className="w-full text-xs text-danger sm:basis-full" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
