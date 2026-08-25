"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
            <h1 className="font-display text-3xl tracking-[0.04em]">
              Wachtwoord vergeten
            </h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-text-muted">
          Vul je werk-e-mailadres in. Als het bij ons bekend is, sturen we een
          resetlink.
        </p>

        {message ? (
          <p className="border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            {message}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const res = await fetch("/api/auth/forgot-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setError(data.error ?? "Verzoek mislukt");
                  return;
                }
                setMessage(
                  data.message ??
                    "Als dit e-mailadres bij ons bekend is, ontvang je een resetlink.",
                );
              });
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="font-display text-sm tracking-[0.12em] text-text-muted">
                E-mail
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                placeholder="naam@thuishaven.nl"
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
              {pending ? "Bezig…" : "Resetlink sturen"}
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-6 inline-block text-sm text-text-muted underline hover:text-text"
        >
          Terug naar inloggen
        </Link>
      </div>
    </div>
  );
}
