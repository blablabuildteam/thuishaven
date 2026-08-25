"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";

type Props = {
  title: string;
  description: string;
  token: string;
  submitLabel: string;
  onSubmit: (password: string) => Promise<{ error?: string }>;
  successHref?: string;
  successMessage?: string;
};

export function PasswordSetupForm({
  title,
  description,
  token,
  submitLabel,
  onSubmit,
  successHref = "/login",
  successMessage = "Je kunt nu inloggen.",
}: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!token) {
    return (
      <AuthShell title={title}>
        <p className="text-sm text-danger">Ongeldige of ontbrekende link.</p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={title}>
        <p className="text-sm text-text-muted">{successMessage}</p>
        <Link
          href={successHref}
          className="mt-4 inline-block bg-accent px-4 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
        >
          Naar inloggen
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={title}>
      <p className="mb-6 text-sm text-text-muted">{description}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirm) {
            setError("Wachtwoorden komen niet overeen.");
            return;
          }
          startTransition(async () => {
            const result = await onSubmit(password);
            if (result.error) {
              setError(result.error);
              return;
            }
            setDone(true);
          });
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="font-display text-sm tracking-[0.12em] text-text-muted">
            Nieuw wachtwoord
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="font-display text-sm tracking-[0.12em] text-text-muted">
            Bevestig wachtwoord
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        {error && (
          <p className="border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-accent px-3 py-2.5 font-display text-sm tracking-[0.12em] text-accent-contrast disabled:opacity-50"
        >
          {pending ? "Bezig…" : submitLabel}
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-0 flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="hub-glow pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative w-full max-w-md border border-border bg-surface p-6 sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/brand/logo-mark.png"
            alt=""
            width={48}
            height={48}
            className="object-contain"
            priority
          />
          <div>
            <p className="font-display text-xs tracking-[0.2em] text-text-muted">
              Medewerkers
            </p>
            <h1 className="font-display text-3xl tracking-[0.04em]">{title}</h1>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
