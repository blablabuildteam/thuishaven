"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordSetupForm } from "@/components/auth/password-setup-form";

export function InviteAcceptForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`/api/auth/invite/validate?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Ongeldige uitnodiging");
          return;
        }
        setMeta({ name: data.name, email: data.email });
      })
      .catch(() => setError("Kon uitnodiging niet valideren"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-text-muted">
        Uitnodiging laden…
      </div>
    );
  }

  if (error) {
    return (
      <PasswordSetupForm
        title="Uitnodiging"
        description=""
        token=""
        submitLabel=""
        onSubmit={async () => ({ error })}
      />
    );
  }

  return (
    <PasswordSetupForm
      title="Account activeren"
      description={
        meta
          ? `Welkom ${meta.name}. Stel een wachtwoord in voor ${meta.email}.`
          : "Stel je wachtwoord in om Thuishaven Tools te gebruiken."
      }
      token={token}
      submitLabel="Account activeren"
      onSubmit={async (password) => {
        const res = await fetch("/api/auth/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error ?? "Activeren mislukt" };
        return {};
      }}
    />
  );
}
