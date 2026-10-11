"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type EditableContact = {
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
};

type Props = {
  prospectId: string;
  initialContacts: EditableContact[];
  primaryEmail: string | null;
};

function blank(): EditableContact {
  return { name: "", title: "", email: "", linkedinUrl: "" };
}

export function CrmContactsEditor({
  prospectId,
  initialContacts,
  primaryEmail,
}: Props) {
  const router = useRouter();
  const [contacts, setContacts] = useState<EditableContact[]>(
    initialContacts.length ? initialContacts : [blank()],
  );
  const [primaryIndex, setPrimaryIndex] = useState(() => {
    const idx = initialContacts.findIndex(
      (c) =>
        c.email &&
        primaryEmail &&
        c.email.toLowerCase() === primaryEmail.toLowerCase(),
    );
    return idx >= 0 ? idx : 0;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<EditableContact>) {
    setContacts((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
    setSaved(false);
  }

  function add() {
    setContacts((prev) => [...prev, blank()]);
    setSaved(false);
  }

  function remove(i: number) {
    setContacts((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [blank()];
    });
    setPrimaryIndex((p) => {
      if (i === p) return 0;
      if (i < p) return Math.max(0, p - 1);
      return p;
    });
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const cleaned = contacts
        .map((c) => ({
          name: c.name.trim(),
          title: c.title?.trim() || undefined,
          email: c.email?.trim() || undefined,
          linkedinUrl: c.linkedinUrl?.trim() || undefined,
        }))
        .filter((c) => c.name.length >= 2);
      const res = await fetch("/api/outreach/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          contacts: cleaned,
          primaryIndex: Math.min(primaryIndex, Math.max(0, cleaned.length - 1)),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {contacts.map((c, i) => {
          const isPrimary = i === primaryIndex;
          return (
            <li
              key={i}
              className={`space-y-2 border p-3 ${
                isPrimary ? "border-accent bg-accent/5" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider text-text-dim">
                  Contact {i + 1}
                  {isPrimary ? " · mail naar" : ""}
                </p>
                <div className="flex gap-2">
                  {!isPrimary ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryIndex(i);
                        setSaved(false);
                      }}
                      className="text-xs text-text-muted underline-offset-2 hover:underline"
                    >
                      Mail naar deze
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-xs text-danger underline-offset-2 hover:underline"
                  >
                    Verwijder
                  </button>
                </div>
              </div>
              <label className="block">
                <span className="sr-only">Naam</span>
                <input
                  value={c.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Naam"
                  className="block w-full border border-border bg-bg px-2 py-1.5 text-sm text-text"
                />
              </label>
              <label className="block">
                <span className="sr-only">Functie</span>
                <input
                  value={c.title ?? ""}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder="Functie"
                  className="block w-full border border-border bg-bg px-2 py-1.5 text-sm text-text"
                />
              </label>
              <label className="block">
                <span className="sr-only">E-mail</span>
                <input
                  type="email"
                  value={c.email ?? ""}
                  onChange={(e) => update(i, { email: e.target.value })}
                  placeholder="naam@bedrijf.nl"
                  className="block w-full border border-border bg-bg px-2 py-1.5 text-sm text-text"
                />
              </label>
              <label className="block">
                <span className="sr-only">LinkedIn</span>
                <input
                  value={c.linkedinUrl ?? ""}
                  onChange={(e) => update(i, { linkedinUrl: e.target.value })}
                  placeholder="https://linkedin.com/in/…"
                  className="block w-full border border-border bg-bg px-2 py-1.5 text-sm text-text"
                />
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={add}
          className="border border-border px-3 py-1.5 text-xs text-text-muted hover:border-accent hover:text-text"
        >
          + Contact
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="bg-accent px-3 py-1.5 text-xs font-display tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          {busy ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-text-muted">Opgeslagen.</p>
      ) : null}
      <p className="text-xs text-text-dim">
        “Mail naar deze” bepaalt welk adres als eerste wordt gebruikt bij
        Mailen. Je kunt later ook een ander contact kiezen.
      </p>
    </div>
  );
}
