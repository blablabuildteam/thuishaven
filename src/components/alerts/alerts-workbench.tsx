"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AlertRuleKind } from "@/lib/integrations/alerts/types";
import {
  ALERT_WEATHER_KINDS,
  alertWeatherKindLabel,
  type AlertWeatherKind,
} from "@/lib/weather/alert-kinds";

export type AlertRuleView = {
  id: string;
  name: string;
  kind: AlertRuleKind;
  enabled: boolean;
  recipients: string[];
  editionId: string | null;
  soldThreshold: number | null;
  checkRa: boolean;
  checkTicketswap: boolean;
  checkAppic: boolean;
  weatherKinds: AlertWeatherKind[];
};

export type AlertNotificationView = {
  id: string;
  type: string;
  ruleId: string | null;
  title: string;
  message: string;
  isActive: boolean;
  createdAt: string;
  notifiedAt: string | null;
  resolvedAt: string | null;
};

export type AlertMeta = {
  enabled: boolean;
  allowlist: string[];
  hardDomains: string[];
  partnerContacts?: {
    appic: string;
    residentAdvisor: string;
  };
  partnerCc?: string[];
};

export type AlertEditionOption = {
  id: string;
  label: string;
};

type FormState = {
  name: string;
  kind: AlertRuleKind;
  recipients: string[];
  editionId: string;
  soldThreshold: string;
  checkRa: boolean;
  checkTicketswap: boolean;
  checkAppic: boolean;
  weatherKinds: AlertWeatherKind[];
};

const KIND_OPTIONS: Array<{
  id: AlertRuleKind;
  label: string;
  hint: string;
}> = [
  {
    id: "soldout_mismatch",
    label: "Sold-out mismatch",
    hint: "Weeztix vol, elders nog tickets",
  },
  {
    id: "sales_threshold",
    label: "Verkoopdrempel",
    hint: "Mail bij N tickets of sold-out",
  },
  {
    id: "weather",
    label: "Slecht weer",
    hint: "Forecast op de eventdag",
  },
];

const DEFAULT_WEATHER_KINDS: AlertWeatherKind[] = [...ALERT_WEATHER_KINDS];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function defaultNameForKind(kind: AlertRuleKind): string {
  return KIND_OPTIONS.find((option) => option.id === kind)?.label ?? kind;
}

function starterRecipients(email: string): string[] {
  const normalized = normalizeEmail(email);
  return normalized ? [normalized] : [];
}

function emptyForm(currentUserEmail: string): FormState {
  return {
    name: defaultNameForKind("sales_threshold"),
    kind: "sales_threshold",
    recipients: starterRecipients(currentUserEmail),
    editionId: "",
    soldThreshold: "1500",
    checkRa: true,
    checkTicketswap: true,
    checkAppic: true,
    weatherKinds: DEFAULT_WEATHER_KINDS,
  };
}

function ruleToForm(rule: AlertRuleView): FormState {
  return {
    name: rule.name,
    kind: rule.kind,
    recipients: rule.recipients.map(normalizeEmail).filter(Boolean),
    editionId: rule.editionId ?? "",
    soldThreshold: rule.soldThreshold != null ? String(rule.soldThreshold) : "",
    checkRa: rule.checkRa,
    checkTicketswap: rule.checkTicketswap,
    checkAppic: rule.checkAppic,
    weatherKinds:
      rule.weatherKinds.length > 0 ? rule.weatherKinds : DEFAULT_WEATHER_KINDS,
  };
}

function kindLabel(kind: AlertRuleKind): string {
  return KIND_OPTIONS.find((k) => k.id === kind)?.label ?? kind;
}

function typeLabel(type: string): string {
  if (type === "weeztix_soldout_ra_open") return "Resident Advisor";
  if (type === "ticketswap_after_soldout") return "TicketSwap";
  if (type === "custom") return "Appic Game";
  if (type === "sales_threshold") return "Verkoopdrempel";
  if (type === "weather") return "Weer";
  return type;
}

function ruleSummary(
  rule: AlertRuleView,
  editions: AlertEditionOption[],
): string {
  const edition =
    rule.editionId == null
      ? "alle komende edities"
      : (editions.find((e) => e.id === rule.editionId)?.label ?? "één editie");
  if (rule.kind === "weather") {
    const kinds =
      rule.weatherKinds.length > 0
        ? rule.weatherKinds.map(alertWeatherKindLabel).join(", ").toLowerCase()
        : "slecht weer";
    return `${edition} · ${kinds}`;
  }
  if (rule.kind === "sales_threshold") {
    const n =
      rule.soldThreshold != null
        ? `${rule.soldThreshold.toLocaleString("nl-NL")} sold`
        : "sold-out";
    return `${edition} · drempel ${n}`;
  }
  const channels = [
    rule.checkRa && "RA",
    rule.checkTicketswap && "TicketSwap",
    rule.checkAppic && "Appic Game",
  ]
    .filter(Boolean)
    .join(" · ");
  const threshold =
    rule.soldThreshold != null
      ? `${rule.soldThreshold.toLocaleString("nl-NL")} sold`
      : "alleen sold-out";
  return `${edition} · drempel ${threshold} · ${channels}`;
}

function notificationTone(type: string, isActive: boolean) {
  if (!isActive) return "success" as const;
  if (type === "weeztix_soldout_ra_open") return "danger" as const;
  if (type === "sales_threshold") return "success" as const;
  if (type === "weather") return "info" as const;
  return "warn" as const;
}

export function AlertsWorkbench({
  initialRules,
  initialNotifications,
  editions,
  meta,
  currentUserEmail,
  canSendTest,
}: {
  initialRules: AlertRuleView[];
  initialNotifications: AlertNotificationView[];
  editions: AlertEditionOption[];
  meta: AlertMeta;
  currentUserEmail: string;
  canSendTest: boolean;
}) {
  const [rules, setRules] = useState(initialRules);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [form, setForm] = useState<FormState>(() => emptyForm(currentUserEmail));
  const [recipientDraft, setRecipientDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setRecipientDraft("");
    setForm(emptyForm(currentUserEmail));
  }

  function addRecipient(raw: string): boolean {
    const email = normalizeEmail(raw);
    if (!email) return true;
    if (!EMAIL_RE.test(email)) {
      setError("Vul een geldig e-mailadres in");
      return false;
    }
    setError(null);
    setForm((f) =>
      f.recipients.includes(email)
        ? f
        : { ...f, recipients: [...f.recipients, email] },
    );
    setRecipientDraft("");
    return true;
  }

  function removeRecipient(email: string) {
    setForm((f) => ({
      ...f,
      recipients: f.recipients.filter((item) => item !== email),
    }));
  }

  function commitRecipientDraft(): boolean {
    if (!recipientDraft.trim()) return true;
    return addRecipient(recipientDraft);
  }

  async function refreshLists() {
    const res = await fetch("/api/integrations/alerts/rules");
    if (res.ok) {
      const data = (await res.json()) as { rules: AlertRuleView[] };
      setRules(data.rules);
    }
    const noteRes = await fetch("/api/integrations/alerts/notifications");
    if (noteRes.ok) {
      const data = (await noteRes.json()) as {
        notifications: AlertNotificationView[];
      };
      setNotifications(data.notifications);
    }
  }

  function saveRule(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const thresholdRaw = form.soldThreshold.trim();
      const soldThreshold =
        thresholdRaw === "" ? null : Number(thresholdRaw);
      if (
        form.kind !== "weather" &&
        soldThreshold != null &&
        (!Number.isFinite(soldThreshold) || soldThreshold <= 0)
      ) {
        setError("Sold-drempel moet leeg of een getal groter dan 0 zijn");
        return;
      }
      if (form.kind === "sales_threshold" && soldThreshold == null) {
        setError("Verkoopdrempel is verplicht");
        return;
      }
      if (form.kind === "weather" && form.weatherKinds.length === 0) {
        setError("Kies minstens één weersoort");
        return;
      }
      const draft = recipientDraft.trim();
      const extra = draft ? [normalizeEmail(draft)] : [];
      if (draft && !EMAIL_RE.test(extra[0])) {
        setError("Vul een geldig e-mailadres in");
        return;
      }
      const recipients = [...form.recipients];
      for (const email of extra) {
        if (email && !recipients.includes(email)) recipients.push(email);
      }
      if (recipients.length === 0) {
        setError("Voeg minstens één ontvanger toe");
        return;
      }
      const payload = {
        name: form.name.trim() || defaultNameForKind(form.kind),
        kind: form.kind,
        recipients,
        editionId: form.editionId === "" ? null : form.editionId,
        soldThreshold: form.kind === "weather" ? null : soldThreshold,
        checkRa: form.checkRa,
        checkTicketswap: form.checkTicketswap,
        checkAppic: form.checkAppic,
        weatherKinds: form.weatherKinds,
      };
      const res = await fetch("/api/integrations/alerts/rules", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      setSuccess(editingId ? "Alert bijgewerkt" : "Alert aangemaakt");
      resetForm();
      await refreshLists();
    });
  }

  function toggleRule(rule: AlertRuleView) {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/integrations/alerts/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Bijwerken mislukt");
        return;
      }
      await refreshLists();
    });
  }

  function removeRule(rule: AlertRuleView) {
    if (!confirm(`Alert “${rule.name}” verwijderen?`)) return;
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/integrations/alerts/rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Verwijderen mislukt");
        return;
      }
      if (editingId === rule.id) resetForm();
      await refreshLists();
    });
  }

  function sendTest(ruleId?: string) {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/integrations/alerts/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ruleId ? { ruleId } : {}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        to?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Testmail mislukt");
        return;
      }
      setSuccess(`Testmail verstuurd naar ${(data.to ?? []).join(", ")}`);
    });
  }

  function toggleWeatherKind(kind: AlertWeatherKind, checked: boolean) {
    setForm((f) => ({
      ...f,
      weatherKinds: checked
        ? [...new Set([...f.weatherKinds, kind])]
        : f.weatherKinds.filter((k) => k !== kind),
    }));
  }

  const formHint =
    form.kind === "weather"
      ? "We kijken naar de forecast voor de eventdag (Open-Meteo, tot ~16 dagen vooruit). Als het weer meevalt, sluit de melding vanzelf."
      : form.kind === "sales_threshold"
        ? "Mail zodra Weeztix dit aantal tickets heeft verkocht, of het event officieel uitverkocht is."
        : "Weeztix is de trigger. De interne mail gaat naar de ontvangers die je hier instelt. Staat Appic of RA nog open, dan gaat er ook een takedown-verzoek naar het partnercontact.";

  return (
    <div>
      <SectionHeader
        eyebrow="Zelf instellen"
        title="Alerts"
        description="Drie soorten: sold-out mismatch (andere platforms), verkoopdrempel, of slecht weer op de eventdag. Kies een editie of alle komende events."
      />

      {error && (
        <p className="mb-4 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {success}
        </p>
      )}

      <section className="mb-10 border border-border bg-surface p-5">
        <h2 className="font-display text-2xl tracking-[0.04em]">
          {editingId ? "Alert bewerken" : "Nieuwe alert"}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          {formHint}
          {!meta.enabled ? " Mail staat nu uit (ALERT_EMAIL_ENABLED)." : ""}
        </p>

        <form onSubmit={saveRule} className="mt-5 grid gap-4 sm:grid-cols-2">
          <fieldset className="sm:col-span-2">
            <legend className="font-display tracking-[0.1em] text-text-muted">
              Soort
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {KIND_OPTIONS.map((option) => {
                const selected = form.kind === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        kind: option.id,
                        name:
                          !f.name.trim() || f.name === defaultNameForKind(f.kind)
                            ? defaultNameForKind(option.id)
                            : f.name,
                      }))
                    }
                    className={
                      selected
                        ? "bg-accent px-3 py-2 text-left text-sm text-accent-contrast"
                        : "border border-border px-3 py-2 text-left text-sm hover:border-text"
                    }
                  >
                    <span className="block font-medium">{option.label}</span>
                    <span
                      className={
                        selected
                          ? "block text-xs opacity-80"
                          : "block text-xs text-text-dim"
                      }
                    >
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Naam van de alert
            </span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              placeholder={defaultNameForKind(form.kind)}
            />
          </label>
          <div className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Ontvangers
            </span>
            <div className="mt-1 flex min-h-[42px] flex-wrap items-center gap-1.5 border border-border bg-bg px-2 py-1.5 focus-within:border-accent">
              {form.recipients.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 border border-border bg-surface px-2 py-0.5 text-xs"
                >
                  {email}
                  <button
                    type="button"
                    aria-label={`Verwijder ${email}`}
                    onClick={() => removeRecipient(email)}
                    className="text-text-dim hover:text-text"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                inputMode="email"
                value={recipientDraft}
                onChange={(e) => setRecipientDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitRecipientDraft();
                  }
                  if (
                    e.key === "Backspace" &&
                    !recipientDraft &&
                    form.recipients.length > 0
                  ) {
                    removeRecipient(form.recipients[form.recipients.length - 1]);
                  }
                }}
                onBlur={() => {
                  commitRecipientDraft();
                }}
                className="min-w-[14ch] flex-1 bg-transparent py-0.5 text-sm outline-none"
                placeholder={
                  form.recipients.length > 0
                    ? "Nog een e-mail…"
                    : "naam@thuishaven.nl"
                }
                autoComplete="email"
              />
            </div>
            <span className="mt-1 block text-xs text-text-dim">
              Enter voegt een extra ontvanger toe.
            </span>
          </div>
          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Editie
            </span>
            <select
              value={form.editionId}
              onChange={(e) =>
                setForm((f) => ({ ...f, editionId: e.target.value }))
              }
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              <option value="">Alle komende edities</option>
              {editions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.label}
                </option>
              ))}
            </select>
          </label>

          {form.kind !== "weather" && (
            <label className="block text-sm">
              <span className="font-display tracking-[0.1em] text-text-muted">
                Weeztix sold-drempel
              </span>
              <input
                type="number"
                min={1}
                required={form.kind === "sales_threshold"}
                value={form.soldThreshold}
                onChange={(e) =>
                  setForm((f) => ({ ...f, soldThreshold: e.target.value }))
                }
                className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
                placeholder={form.kind === "sales_threshold" ? "1500" : "3000"}
              />
              <span className="mt-1 block text-xs text-text-dim">
                {form.kind === "sales_threshold"
                  ? "Verplicht. Ook als Weeztix eerder uitverkocht is."
                  : "Leeg = alleen als Weeztix officieel uitverkocht is."}
              </span>
            </label>
          )}

          {form.kind === "soldout_mismatch" && (
            <fieldset className="text-sm">
              <legend className="font-display tracking-[0.1em] text-text-muted">
                Check beschikbaarheid
              </legend>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.checkRa}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, checkRa: e.target.checked }))
                    }
                  />
                  Resident Advisor
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.checkTicketswap}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        checkTicketswap: e.target.checked,
                      }))
                    }
                  />
                  TicketSwap
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.checkAppic}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, checkAppic: e.target.checked }))
                    }
                  />
                  Appic Game
                </label>
              </div>
            </fieldset>
          )}

          {form.kind === "weather" && (
            <fieldset className="text-sm sm:col-span-2">
              <legend className="font-display tracking-[0.1em] text-text-muted">
                Waarschuw bij
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ALERT_WEATHER_KINDS.map((kind) => (
                  <label key={kind} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.weatherKinds.includes(kind)}
                      onChange={(e) =>
                        toggleWeatherKind(kind, e.target.checked)
                      }
                    />
                    {alertWeatherKindLabel(kind)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-accent px-4 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
            >
              {pending ? "Bezig…" : editingId ? "Opslaan" : "Alert maken"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="border border-border px-4 py-2 text-sm hover:border-text"
              >
                Annuleren
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-2xl tracking-[0.04em]">
          Jouw alerts
        </h2>
        {rules.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            Nog geen alerts. Maak hierboven de eerste.
          </p>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <article
                key={rule.id}
                className="border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-medium text-text">
                        {rule.name}
                      </h3>
                      <StatusBadge tone={rule.enabled ? "success" : "neutral"}>
                        {rule.enabled ? "Aan" : "Uit"}
                      </StatusBadge>
                      <StatusBadge tone="neutral">
                        {kindLabel(rule.kind)}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      {rule.recipients.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-text-dim">
                      {ruleSummary(rule, editions)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleRule(rule)}
                      className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
                    >
                      {rule.enabled ? "Uitzetten" : "Aanzetten"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(rule.id);
                        setRecipientDraft("");
                        setForm(ruleToForm(rule));
                      }}
                      className="border border-border px-3 py-1.5 text-sm hover:border-text"
                    >
                      Bewerken
                    </button>
                    {canSendTest && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => sendTest(rule.id)}
                        className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
                      >
                        Testmail
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeRule(rule)}
                      className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
                    >
                      Verwijderen
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl tracking-[0.04em]">
          Meldingen
        </h2>
        {notifications.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            Nog geen meldingen. Die verschijnen hier na een sync, nieuwste eerst.
          </p>
        ) : (
          <div className="space-y-3">
            {notifications.map((alert) => {
              const isOverbooking = alert.type === "weeztix_soldout_ra_open";
              const isSales = alert.type === "sales_threshold";
              const isWeather = alert.type === "weather";
              return (
                <article
                  key={alert.id}
                  className={
                    alert.isActive
                      ? isOverbooking
                        ? "border border-danger/40 bg-danger/5 p-5"
                        : isSales
                          ? "border border-success/40 bg-success/5 p-5"
                          : isWeather
                            ? "border border-info/40 bg-info/5 p-5"
                            : "border border-warn/40 bg-warn/10 p-5"
                      : "border border-border bg-surface p-5 opacity-70"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={notificationTone(alert.type, alert.isActive)}
                      pulse={alert.isActive}
                    >
                      {alert.isActive ? "Actief" : "Opgelost"}
                    </StatusBadge>
                    <StatusBadge tone="neutral">
                      {typeLabel(alert.type)}
                    </StatusBadge>
                  </div>
                  <h3 className="mt-3 font-display text-xl tracking-tight text-text">
                    {alert.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
                    {alert.message}
                  </p>
                  <p className="mt-4 text-xs text-text-dim">
                    {format(new Date(alert.createdAt), "d MMMM yyyy · HH:mm", {
                      locale: nl,
                    })}
                    {alert.notifiedAt
                      ? ` · mail ${format(new Date(alert.notifiedAt), "d MMM HH:mm", { locale: nl })}`
                      : " · nog geen mail"}
                    {alert.resolvedAt
                      ? ` · opgelost ${format(new Date(alert.resolvedAt), "d MMM HH:mm", { locale: nl })}`
                      : ""}
                  </p>
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-text-dim">
          Sync loopt 4× per dag via Weeztix / RA / TicketSwap. Weerforecast wordt
          daarbij meegenomen.{" "}
          <Link href="/koppelingen" className="underline hover:text-text">
            Koppelingen
          </Link>
        </p>
      </section>
    </div>
  );
}
