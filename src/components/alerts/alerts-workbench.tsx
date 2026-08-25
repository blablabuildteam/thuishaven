"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";

export type AlertRuleView = {
  id: string;
  name: string;
  enabled: boolean;
  recipients: string[];
  soldThreshold: number | null;
  checkRa: boolean;
  checkTicketswap: boolean;
  checkAppic: boolean;
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
};

type FormState = {
  name: string;
  recipients: string;
  soldThreshold: string;
  checkRa: boolean;
  checkTicketswap: boolean;
  checkAppic: boolean;
};

const emptyForm: FormState = {
  name: "",
  recipients: "",
  soldThreshold: "3000",
  checkRa: true,
  checkTicketswap: true,
  checkAppic: false,
};

function ruleToForm(rule: AlertRuleView): FormState {
  return {
    name: rule.name,
    recipients: rule.recipients.join(", "),
    soldThreshold: rule.soldThreshold != null ? String(rule.soldThreshold) : "",
    checkRa: rule.checkRa,
    checkTicketswap: rule.checkTicketswap,
    checkAppic: rule.checkAppic,
  };
}

function channelLabel(type: string): string {
  if (type === "weeztix_soldout_ra_open") return "Resident Advisor";
  if (type === "ticketswap_after_soldout") return "TicketSwap";
  if (type === "custom") return "Appic";
  return type;
}

export function AlertsWorkbench({
  initialRules,
  initialNotifications,
  meta,
  canSendTest,
}: {
  initialRules: AlertRuleView[];
  initialNotifications: AlertNotificationView[];
  meta: AlertMeta;
  canSendTest: boolean;
}) {
  const [rules, setRules] = useState(initialRules);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allowHint = useMemo(
    () => meta.allowlist.join(", ") || meta.hardDomains.map((d) => `@${d}`).join(", "),
    [meta],
  );

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
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
      if (soldThreshold != null && (!Number.isFinite(soldThreshold) || soldThreshold <= 0)) {
        setError("Sold-drempel moet leeg of een getal groter dan 0 zijn");
        return;
      }
      const payload = {
        name: form.name,
        recipients: form.recipients,
        soldThreshold,
        checkRa: form.checkRa,
        checkTicketswap: form.checkTicketswap,
        checkAppic: form.checkAppic,
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

  return (
    <div>
      <SectionHeader
        eyebrow="Zelf instellen"
        title="Alerts"
        description="Maak een alert: ontvangers, Weeztix-drempel, en welke kanalen we checken op restaanbod. Meldingen staan daaronder, nieuwste eerst."
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
          Weeztix is de trigger. Mail gaat uit als die drempel (of sold-out) is
          bereikt én een aangevinkt kanaal nog tickets verkoopt. Alleen{" "}
          {allowHint}.
          {!meta.enabled ? " Mail staat nu uit (ALERT_EMAIL_ENABLED)." : ""}
        </p>

        <form onSubmit={saveRule} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Naam
            </span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              placeholder="Bijv. Marketing · TicketSwap"
            />
          </label>
          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Ontvangers
            </span>
            <input
              required
              value={form.recipients}
              onChange={(e) =>
                setForm((f) => ({ ...f, recipients: e.target.value }))
              }
              className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              placeholder="naam@thuishaven.nl, team@blablabuild.com"
            />
          </label>
          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Weeztix sold-drempel
            </span>
            <input
              type="number"
              min={1}
              value={form.soldThreshold}
              onChange={(e) =>
                setForm((f) => ({ ...f, soldThreshold: e.target.value }))
              }
              className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              placeholder="3000"
            />
            <span className="mt-1 block text-xs text-text-dim">
              Leeg = alleen als Weeztix officieel uitverkocht is.
            </span>
          </label>
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
                Appic
              </label>
            </div>
          </fieldset>
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
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      {rule.recipients.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-text-dim">
                      Drempel{" "}
                      {rule.soldThreshold != null
                        ? `${rule.soldThreshold.toLocaleString("nl-NL")} sold`
                        : "alleen sold-out"}
                      {" · "}
                      {[
                        rule.checkRa && "RA",
                        rule.checkTicketswap && "TicketSwap",
                        rule.checkAppic && "Appic",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
              return (
                <article
                  key={alert.id}
                  className={
                    alert.isActive
                      ? isOverbooking
                        ? "border border-danger/40 bg-danger/5 p-5"
                        : "border border-warn/40 bg-warn/10 p-5"
                      : "border border-border bg-surface p-5 opacity-70"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={
                        alert.isActive
                          ? isOverbooking
                            ? "danger"
                            : "warn"
                          : "success"
                      }
                      pulse={alert.isActive}
                    >
                      {alert.isActive ? "Actief" : "Opgelost"}
                    </StatusBadge>
                    <StatusBadge tone="neutral">
                      {channelLabel(alert.type)}
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
          Sync loopt 4× per dag via Weeztix / RA / TicketSwap.{" "}
          <Link href="/koppelingen" className="underline hover:text-text">
            Koppelingen
          </Link>
        </p>
      </section>
    </div>
  );
}
