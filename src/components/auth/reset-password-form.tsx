"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordSetupForm } from "@/components/auth/password-setup-form";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Ongeldige of ontbrekende resetlink.");
      setLoading(false);
      return;
    }
    fetch(`/api/auth/reset/validate?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Ongeldige resetlink");
        }
      })
      .catch(() => setError("Kon resetlink niet valideren"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-text-muted">
        Link controleren…
      </div>
    );
  }

  if (error) {
    return (
      <PasswordSetupForm
        title="Wachtwoord resetten"
        description=""
        token=""
        submitLabel=""
        errorMessage={error}
        recoveryHref="/forgot-password"
        recoveryLabel="Nieuwe resetlink aanvragen"
        onSubmit={async () => ({ error })}
      />
    );
  }

  return (
    <PasswordSetupForm
      title="Nieuw wachtwoord"
      description="Kies een nieuw wachtwoord. Daarna log je in met dit wachtwoord."
      token={token}
      submitLabel="Wachtwoord opslaan"
      successHref="/login?from=reset"
      successMessage="Je nieuwe wachtwoord is opgeslagen. Je kunt nu inloggen."
      onSubmit={async (password) => {
        const res = await fetch("/api/auth/reset/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error ?? "Reset mislukt" };
        return {};
      }}
    />
  );
}
