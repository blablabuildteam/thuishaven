"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshControl } from "@/components/dashboard/refresh-control";

export function MailsRefresh({ refreshedAt }: { refreshedAt: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownAt, setShownAt] = useState(refreshedAt);

  const onRefresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/mails/refresh", {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        refreshedAt?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error?.slice(0, 160) || "Verversen mislukt");
        return;
      }
      if (body.refreshedAt) setShownAt(body.refreshedAt);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Verversen mislukt");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const spinning = busy || pending;

  return (
    <RefreshControl
      onRefresh={() => void onRefresh()}
      spinning={spinning}
      refreshedAt={shownAt}
      label="Mailings en ticketeffect verversen"
      message={spinning ? "Brevo en Weeztix ophalen…" : null}
      error={error}
    />
  );
}
