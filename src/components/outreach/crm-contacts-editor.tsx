"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  checkLabel,
  contactTargetTier,
  isOtherCompanyEmail,
  isUndeliverable,
  TARGET_TIER_LABEL,
  type CompanyRef,
  type EmailCheck,
} from "@/lib/outreach/contact-ranking";

export type EditableContact = {
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  emailSource?: string;
};

type Props = {
  prospectId: string;
  initialContacts: EditableContact[];
  primaryEmail: string | null;
  emailChecks: Record<string, EmailCheck>;
  company: CompanyRef;
};

const SOURCE_LABEL: Record<string, string> = {
  apollo: "Apollo",
  hunter: "Hunter",
  website: "Website",
  manual: "Handmatig",
};

function blank(): EditableContact {
  return { name: "", title: "", email: "", linkedinUrl: "" };
}

function ContactStatus({
  contact,
  checks,
  company,
}: {
  contact: EditableContact;
  checks: Record<string, EmailCheck>;
  company: CompanyRef;
}) {
  const email = contact.email?.trim().toLowerCase();
  if (!email) {
    return <p className="text-xs text-text-dim">Geen e-mail — wordt niet gemaild</p>;
  }
  const check = checks[email];
  const tier = contactTargetTier({ ...contact, email }, company);
  const otherCompany = isOtherCompanyEmail({ ...contact, email }, company);
  const dead = isUndeliverable(check);
  const source = contact.emailSource
    ? (SOURCE_LABEL[contact.emailSource] ?? contact.emailSource)
    : null;
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      <span className={tier === 9 ? "text-warning" : "text-text-muted"}>
        {otherCompany
          ? "Adres van ander bedrijf — wordt niet gemaild"
          : tier === 9
            ? "Functie niet relevant — wordt niet gemaild"
            : TARGET_TIER_LABEL[tier]}
      </span>
      <span
        className={
          dead
            ? "text-danger"
            : check?.status === "valid"
              ? "text-emerald-400"
              : "text-text-dim"
        }
      >
        · {checkLabel(check)}
        {dead ? " — wordt niet gemaild" : ""}
      </span>
      {source ? <span className="text-text-dim">· bron: {source}</span> : null}
    </p>
  );
}

export function CrmContactsEditor({
  prospectId,
  initialContacts,
  primaryEmail,
  emailChecks,
  company,
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
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function update(i: number, patch: Partial<EditableContact>) {
    setContacts((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
    setNotice(null);
  }

  function add() {
    setContacts((prev) => [...prev, { ...blank(), emailSource: "manual" }]);
    setNotice(null);
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
    setNotice(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
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
      setNotice("Opgeslagen.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/outreach/crm/verify-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
        checked?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Controle mislukt");
        return;
      }
      setNotice(data.warning ?? `${data.checked ?? 0} adres(sen) gecontroleerd.`);
      router.refresh();
    } finally {
      setVerifying(false);
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
                  {isPrimary ? " · bedrijfsadres" : ""}
                </p>
                <div className="flex gap-2">
                  {!isPrimary ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryIndex(i);
                        setNotice(null);
                      }}
                      className="text-xs text-text-muted underline-offset-2 hover:underline"
                    >
                      Maak bedrijfsadres
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
              <ContactStatus contact={c} checks={emailChecks} company={company} />
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
                  onChange={(e) =>
                    update(i, { email: e.target.value, emailSource: "manual" })
                  }
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
          disabled={verifying}
          onClick={() => void verify()}
          className="border border-border px-3 py-1.5 text-xs text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
        >
          {verifying ? "Controleren…" : "Controleer adressen"}
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
      {notice ? <p className="text-sm text-text-muted">{notice}</p> : null}
      <p className="text-xs text-text-dim">
        Mailen kiest zelf de beste mensen: eerst Events, dan Office/facility,
        dan assistent/communicatie (max 3). Een algemeen adres alleen als er
        niemand persoonlijk is. Adressen worden vlak voor het schrijven
        gecontroleerd; bestaat een adres niet, dan wordt het overgeslagen.
      </p>
    </div>
  );
}
