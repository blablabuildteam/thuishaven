"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  active: boolean;
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

export function AdminUsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

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
        body: JSON.stringify({ email, name, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Uitnodiging mislukt");
        return;
      }
      setEmail("");
      setName("");
      setRole("member");
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
      setSuccess(`Uitnodiging opnieuw verstuurd naar ${user.email}`);
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

  return (
    <div>
      <SectionHeader
        eyebrow="Admin"
        title="Gebruikers"
        description="Nodig medewerkers uit per e-mail. Zij stellen zelf een wachtwoord in via de uitnodigingslink."
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-3 font-medium">Naam</th>
                <th className="pb-3 font-medium">E-mail</th>
                <th className="pb-3 font-medium">Rol</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="py-3 text-text">{u.name}</td>
                  <td className="py-3 text-text-muted">{u.email}</td>
                  <td className="py-3">
                    <StatusBadge
                      tone={u.role === "admin" ? "accent" : "neutral"}
                    >
                      {u.role === "admin" ? "Admin" : "Medewerker"}
                    </StatusBadge>
                  </td>
                  <td className="py-3">
                    <StatusBadge tone={statusTone[u.status]}>
                      {statusLabel[u.status]}
                    </StatusBadge>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {u.status === "pending" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => resendInvite(u)}
                          className="border border-border px-2 py-1 font-display text-xs tracking-[0.1em] hover:border-accent disabled:opacity-50"
                        >
                          Opnieuw uitnodigen
                        </button>
                      )}
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
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
