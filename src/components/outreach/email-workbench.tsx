"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  OUTREACH_VARIANTS,
  type OutreachSubjectArm,
  type OutreachVariantId,
} from "@/lib/outreach/tone";
import { StatusBadge } from "@/components/ui/status-badge";
import { leadTierTone, type LeadTier } from "@/lib/outreach/lead-score";
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
  mailCount: number;
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
  skippedNoEmail?: number;
};

type DraftEdit = {
  emailId: string;
  companyName: string;
  subject: string;
  body: string;
};

const ANGLE_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "Alles" },
  { id: "jubileum", label: "Jubileum" },
  { id: "seizoen", label: "Seizoen" },
  { id: "algemeen", label: "Algemeen" },
];

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
  skippedNoEmail = 0,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const preselected = useMemo(() => new Set(preselectIds), [preselectIds]);
  const [showMailed, setShowMailed] = useState(false);
  const [angleFilter, setAngleFilter] = useState("all");
  const [q, setQ] = useState("");
  const [onlyHandoff, setOnlyHandoff] = useState(preselectIds.length > 0);

  const ready = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return prospects
      .filter((p) => {
        if (onlyHandoff && !preselected.has(p.id)) return false;
        if (!showMailed && p.mailCount > 0) return false;
        if (angleFilter !== "all" && p.angleId !== angleFilter) return false;
        if (
          needle &&
          !p.companyName.toLowerCase().includes(needle) &&
          !p.email.toLowerCase().includes(needle)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.score - a.score || a.companyName.localeCompare(b.companyName, "nl"));
  }, [prospects, q, angleFilter, showMailed, onlyHandoff, preselected]);

  const mailedTotal = prospects.filter((p) => p.mailCount > 0).length;

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        prospects
          .filter((p) => preselected.has(p.id) && p.mailCount === 0)
          .map((p) => p.id),
      ),
  );
  const [mode, setMode] = useState<Mode>("suggested");
  const [overrideVariant, setOverrideVariant] =
    useState<OutreachVariantId>("warm_tour");
  const [perRow, setPerRow] = useState<Record<string, OutreachVariantId>>({});
  const [subjectArm, setSubjectArm] = useState<OutreachSubjectArm | "auto">(
    "auto",
  );
  const [testTo, setTestTo] = useState(defaultTestTo);
  const [lastEmailIds, setLastEmailIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftEdit[]>([]);
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

  function selectTop(n: number) {
    setSelected(
      new Set(
        ready
          .filter((p) => p.mailCount === 0)
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
    setLastEmailIds(made.map((d) => d.emailId));
    setDrafts(made);
    setMessage(
      made.length
        ? `${made.length} draft${made.length === 1 ? "" : "s"} — lees ze na, pas aan, stuur dan de test.`
        : "Geen drafts gemaakt.",
    );
    startTransition(() => router.refresh());
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
                {templateOption(v)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {bestTemplate ? (
        <p className="text-xs text-text-dim">
          Beste reply-ratio tot nu toe:{" "}
          <span className="text-text">
            {companyVariants.find((v) => v.id === bestTemplate)?.name ?? bestTemplate}
          </span>{" "}
          · {formatTemplateStat(templateStats[bestTemplate])}
        </p>
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek bedrijf of e-mail…"
            className="w-full max-w-xs border border-border bg-bg px-3 py-1.5 text-sm text-text sm:w-56"
          />
          {ANGLE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAngleFilter(f.id)}
              className={
                angleFilter === f.id
                  ? "border border-accent bg-accent/10 px-2.5 py-1 text-xs"
                  : "border border-border px-2.5 py-1 text-xs text-text-muted hover:border-accent"
              }
            >
              {f.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={showMailed}
              onChange={(e) => setShowMailed(e.target.checked)}
            />
            Toon ook al gemaild ({mailedTotal})
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-text-dim">
            {selected.size} geselecteerd · {ready.length} in beeld · hoogste
            score eerst
          </p>
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={() => selectTop(10)}
              className="text-accent underline"
            >
              Top 10
            </button>
            <button
              type="button"
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
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 w-10" />
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Bedrijf</th>
                <th className="px-3 py-2 font-medium">Invalshoek</th>
                <th className="px-3 py-2 font-medium">Eerder gemaild</th>
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
                      <StatusBadge tone={leadTierTone(p.tier)}>{p.score}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/outreach/crm/${p.id}`}
                        className="font-medium text-text hover:text-accent"
                      >
                        {p.companyName}
                      </Link>
                      <p className="text-xs text-text-dim">
                        {[p.contactName, p.email].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted">
                      {p.suggestedLabel ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.lastSentAt ? (
                        <span className="text-warn">
                          {fmtDay(p.lastSentAt)}
                          {p.lastVariantKey
                            ? ` · ${companyVariants.find((v) => v.id === p.lastVariantKey)?.name ?? p.lastVariantKey}`
                            : ""}
                          {p.replyCount > 0 ? " · gereageerd" : ""}
                        </span>
                      ) : (
                        <span className="text-text-dim">Nee</span>
                      )}
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
                              {templateOption(v, p.suggestedVariantId)}
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

      {selectedMailed > 0 ? (
        <p className="text-sm text-warn">
          Let op: {selectedMailed} van de geselecteerde bedrijven is al eerder
          gemaild.
        </p>
      ) : null}

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

      {skippedNoEmail > 0 ? (
        <p className="text-sm text-text-muted">
          {skippedNoEmail} bedrijven niet meegenomen: geen e-mail. Vul die aan
          via Lijst bijwerken.
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <div className="space-y-6 border-t border-border pt-4">
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
            disabled={pending}
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
    </div>
  );
}
