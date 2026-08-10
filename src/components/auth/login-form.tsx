"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        remember: remember ? "true" : "false",
        redirect: false,
      });
      if (result?.error) {
        setError("Ongeldige e-mail of wachtwoord.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    });
  }

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
              Thuishaven Tools
            </h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-text-muted">
          Alleen medewerkers met een bestaand account. Nieuw account nodig?
          Vraag een admin om je toe te voegen — er is geen openbare registratie.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="font-display text-sm tracking-[0.12em] text-text-muted">
              E-mail
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              placeholder="naam@thuishaven.nl"
            />
          </label>

          <label className="block">
            <span className="font-display text-sm tracking-[0.12em] text-text-muted">
              Wachtwoord
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-black dark:accent-yellow-300"
            />
            Onthoud mij op deze computer (90 dagen)
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
            {pending ? "Bezig…" : "Inloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}
