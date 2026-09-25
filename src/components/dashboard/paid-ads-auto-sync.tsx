"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STALE_AFTER_MS = 15 * 60 * 1000;

export type PaidAdsChannel = "meta" | "tiktok" | "youtube" | "google";

const SYNC_PATH: Record<PaidAdsChannel, string> = {
  meta: "/api/integrations/meta-ads/sync",
  tiktok: "/api/integrations/tiktok-ads/sync",
  youtube: "/api/integrations/youtube-ads/sync",
  google: "/api/integrations/google-ads/sync",
};

const CHANNEL_LABEL: Record<PaidAdsChannel, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  youtube: "YouTube",
  google: "Google Ads",
};

type Props = {
  channel: PaidAdsChannel;
  lastSyncedAt: string | null;
  enabled?: boolean;
  className?: string;
};

/** Stale-while-revalidate for paid channel pages. */
export function PaidAdsAutoSync({
  channel,
  lastSyncedAt,
  enabled = true,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const lightRan = useRef(false);
  const backfillRan = useRef(false);
  const label = CHANNEL_LABEL[channel];

  useEffect(() => {
    if (!enabled) return;

    const stale =
      !lastSyncedAt ||
      Date.now() - new Date(lastSyncedAt).getTime() >= STALE_AFTER_MS;
    const shouldBackfill = !lastSyncedAt && !backfillRan.current;
    const shouldLight = !shouldBackfill && stale && !lightRan.current;
    if (!shouldBackfill && !shouldLight) return;

    if (shouldBackfill) backfillRan.current = true;
    else lightRan.current = true;

    const light = !shouldBackfill;
    setStatus("syncing");
    setMessage(
      shouldBackfill
        ? `${label} ads laden (6 maanden)…`
        : `${label} ads verversen…`,
    );

    void (async () => {
      try {
        const res = await fetch(SYNC_PATH[channel], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ light }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          upserted?: number;
          fetched?: number;
        };
        if (!res.ok || data.ok === false) {
          if (shouldBackfill) backfillRan.current = false;
          else lightRan.current = false;
          setStatus("error");
          setMessage(data.error?.slice(0, 220) || `${label} ads sync mislukt`);
          return;
        }
        setMessage(
          data.fetched != null
            ? `${label} ads bijgewerkt · ${data.fetched} ads opgehaald`
            : `${label} ads bijgewerkt`,
        );
        startTransition(() => {
          router.refresh();
        });
        setStatus("idle");
        window.setTimeout(() => setMessage(null), 3500);
      } catch (e) {
        if (shouldBackfill) backfillRan.current = false;
        else lightRan.current = false;
        setStatus("error");
        setMessage(
          e instanceof Error ? e.message : `${label} ads sync mislukt`,
        );
      }
    })();
  }, [channel, enabled, label, lastSyncedAt, router]);

  if (status === "idle" && !message && !pending) return null;

  const syncing = status === "syncing" || pending;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mb-6 flex items-center gap-2 border px-4 py-3 text-sm",
        status === "error"
          ? "border-danger/50 text-danger"
          : "border-border bg-surface text-text-muted",
        className,
      )}
    >
      {syncing && (
        <LoaderCircle
          className="size-4 shrink-0 animate-spin text-text"
          aria-hidden
        />
      )}
      <span>{message ?? `${label} ads verversen…`}</span>
    </div>
  );
}
