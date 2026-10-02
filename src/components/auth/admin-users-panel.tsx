"use client";

import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DASHBOARD_AREA_LABELS,
  DEFAULT_TOOL_ACCESS,
  OUTREACH_AREA_LABELS,
  type DashboardArea,
  type OutreachArea,
  type ToolAccess,
} from "@/lib/auth/tool-access";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  active: boolean;
  toolAccess: ToolAccess;
  status: "active" | "pending" | "inactive";
  inviteSentAt: string | null;
  createdAt: string;
  createdByEmail: string | null;
};

const statusLabel: Record<UserRow["status"], string> = {
  active: "Actief",
  pending: "Uitnodiging verstuurd",
  inactive: "Gedeactiveerd",
};

const statusTone: Record<UserRow["status"], "success" | "neutral" | "danger"> = {
  active: "success",
  pending: "neutral",
  inactive: "danger",
};

function ToolAccessEditor({
  value,
  disabled,
  onChange,
}: {
  value: ToolAccess;
  disabled?: boolean;
  onChange: (next: ToolAccess) => void;
}) {
  function setTool(key: "dashboard" | "outreach", on: boolean) {
    onChange({ ...value, [key]: on });
  }

  function setDashArea(key: DashboardArea, on: boolean) {
    onChange({
      ...value,
      dashboardAreas: { ...value.dashboardAreas, [key]: on },
    });
  }

  function setOutreachArea(key: OutreachArea, on: boolean) {
    onChange({
      ...value,
      outreachAreas: { ...value.outreachAreas, [key]: on },
    });
  }

  return (
    <div className={`space-y-3 text-sm ${disabled ? "opacity-60" : ""}`}>
      {disabled ? (
        <p className="text-xs text-text-dim">
          Admins zien altijd alle tools — toggles gelden alleen voor
          medewerkers.
        </p>
      ) : null}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.dashboard}
          disabled={disabled}
          onChange={(e) => setTool("dashboard", e.target.checked)}
        />
        <span className="font-medium text-text">Dashboard</span>
      </label>
      {value.dashboard ? (
        <div className="ml-6 space-y-1.5 border-l border-border pl-3">
          {(Object.keys(DASHBOARD_AREA_LABELS) as DashboardArea[]).map(
            (key) => (
              <label key={key} className="flex items-start gap-2 text-text-muted">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={value.dashboardAreas[key]}
                  disabled={disabled}
                  onChange={(e) => setDashArea(key, e.target.checked)}
                />
                <span>{DASHBOARD_AREA_LABELS[key]}</span>
              </label>
            ),
          )}
        </div>
      ) : null}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.outreach}
          disabled={disabled}
          onChange={(e) => setTool("outreach", e.target.checked)}
        />
        <span className="font-medium text-text">Outreach</span>
      </label>
      {value.outreach ? (
        <div className="ml-6 space-y-1.5 border-l border-border pl-3">
          {(Object.keys(OUTREACH_AREA_LABELS) as OutreachArea[]).map((key) => (
            <label key={key} className="flex items-start gap-2 text-text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={value.outreachAreas[key]}
                disabled={disabled}
                onChange={(e) => setOutreachArea(key, e.target.checked)}
              />
              <span>{OUTREACH_AREA_LABELS[key]}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function accessSummary(u: UserRow): string {
  if (u.role === "admin") return "Alles (admin)";
  const parts: string[] = [];
  if (u.toolAccess.dashboard) parts.push("Dashboard");
  if (u.toolAccess.outreach) parts.push("Outreach");
  return parts.length ? parts.join(" · ") : "Geen tools";
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [inviteAccess, setInviteAccess] = useState<ToolAccess>(DEFAULT_TOOL_ACCESS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState<ToolAccess>(DEFAULT_TOOL_ACCESS);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 403) {
      setError("Alleen admins hebben toegang tot gebruikersbeheer.");
      return;
    }
    if (!res.ok) throw new Error("Gebruikers laden mislukt");
    const data = await res.json();
    setUsers(data.users);
    setError(null);
  }, []);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "Fout bij laden"),
    );
  }, [load]);

  function inviteUser(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          role,
          toolAccess: role === "admin" ? DEFAULT_TOOL_ACCESS : inviteAccess,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Uitnodiging mislukt");
        return;
      }
      setEmail("");
      setName("");
      setRole("member");
      setInviteAccess(DEFAULT_TOOL_ACCESS);
      setSuccess(`Uitnodiging verstuurd naar ${data.user.email}`);
      await load();
    });
  }

  function resendInvite(user: UserRow) {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_invite", id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Opnieuw versturen mislukt");
        return;
      }
      const verb = user.inviteSentAt ? "Opnieuw verstuurd" : "Verstuurd";
      setSuccess(
        `${verb} naar ${user.email}. Zij stellen zelf een wachtwoord in via de mail.`,
      );
      await load();
    });
  }

  function toggleActive(user: UserRow) {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_active",
          id: user.id,
          active: !user.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Bijwerken mislukt");
        return;
      }
      await load();
    });
  }

  function openAccess(user: UserRow) {
    setExpandedId((id) => (id === user.id ? null : user.id));
    setDraftAccess(user.toolAccess ?? DEFAULT_TOOL_ACCESS);
  }

  function saveAccess(user: UserRow) {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_tool_access",
          id: user.id,
          toolAccess: draftAccess,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Toegang opslaan mislukt");
        return;
      }
      setSuccess(
        `Toegang voor ${user.name} opgeslagen. ${data.note ?? "Opnieuw inloggen om te activeren."}`,
      );
      setExpandedId(null);
      await load();
    });
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Admin"
        title="Gebruikers"
        description="Nodig medewerkers uit en kies per persoon welke tools en onderdelen ze mogen zien."
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

      <section className="mb-8 border border-border bg-surface p-4">
        <h2 className="font-display text-2xl tracking-[0.06em]">
          Medewerker uitnodigen
        </h2>
        <form onSubmit={inviteUser} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Naam
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              E-mail
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              placeholder="naam@thuishaven.nl"
            />
          </label>
          <label className="block text-sm">
            <span className="font-display tracking-[0.1em] text-text-muted">
              Rol
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className="mt-1 w-full border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
            >
              <option value="member">Medewerker</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <p className="mb-2 font-display text-xs tracking-[0.1em] text-text-muted">
              Toegang tot tools
            </p>
            <ToolAccessEditor
              value={inviteAccess}
              disabled={role === "admin"}
              onChange={setInviteAccess}
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-accent px-4 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
            >
              {pending ? "Bezig…" : "Uitnodiging versturen"}
            </button>
          </div>
        </form>
      </section>

      <section className="border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Alle accounts
        </h2>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-3 font-medium">Naam</th>
                <th className="pb-3 font-medium">E-mail</th>
                <th className="pb-3 font-medium">Rol</th>
                <th className="pb-3 font-medium">Tools</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-border last:border-0">
                    <td className="py-3 text-text">{u.name}</td>
                    <td className="py-3 text-text-muted">{u.email}</td>
                    <td className="py-3">
                      <StatusBadge
                        tone={u.role === "admin" ? "accent" : "neutral"}
                      >
                        {u.role === "admin" ? "Admin" : "Medewerker"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 text-text-muted">{accessSummary(u)}</td>
                    <td className="py-3">
                      <StatusBadge tone={statusTone[u.status]}>
                        {statusLabel[u.status]}
                      </StatusBadge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {u.role === "member" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => openAccess(u)}
                            className="border border-border px-2 py-1 font-display text-xs tracking-[0.1em] hover:border-accent disabled:opacity-50"
                          >
                            {expandedId === u.id ? "Sluiten" : "Toegang"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => resendInvite(u)}
                          className="border border-border px-2 py-1 font-display text-xs tracking-[0.1em] hover:border-accent disabled:opacity-50"
                        >
                          {u.inviteSentAt
                            ? "Opnieuw uitnodigen"
                            : "Uitnodigen"}
                        </button>
                        {u.status !== "pending" && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => toggleActive(u)}
                            className="border border-border px-2 py-1 font-display text-xs tracking-[0.1em] hover:border-accent disabled:opacity-50"
                          >
                            {u.active ? "Deactiveren" : "Activeren"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === u.id ? (
                    <tr className="border-b border-border bg-bg/50">
                      <td colSpan={6} className="px-3 py-4">
                        <p className="mb-3 text-xs text-text-dim">
                          Wat mag {u.name} openen? Na opslaan opnieuw inloggen.
                        </p>
                        <ToolAccessEditor
                          value={draftAccess}
                          onChange={setDraftAccess}
                        />
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => saveAccess(u)}
                          className="mt-4 bg-accent px-3 py-1.5 font-display text-xs tracking-[0.1em] text-accent-contrast disabled:opacity-50"
                        >
                          {pending ? "Bezig…" : "Toegang opslaan"}
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
