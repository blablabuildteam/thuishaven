"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type SocialChannel = "instagram" | "tiktok" | "youtube";

const SYNC_PATH: Record<SocialChannel, string> = {
  instagram: "/api/integrations/instagram/sync",
  tiktok: "/api/integrations/tiktok/sync",
  youtube: "/api/integrations/youtube/sync",
};

const CHANNEL_LABEL: Record<SocialChannel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/** Skip light auto-sync if data is fresher than this (cron covers 4×/day). */
const STALE_AFTER_MS = 15 * 60 * 1000;

type Props = {
  channel: SocialChannel;
  /** ISO timestamp of newest post sync, or null if empty. */
  lastSyncedAt: string | null;
  /** True when DB lacks ~6 months of history — trigger one deep sync. */
  backfillHistory?: boolean;
  /** False when credentials are missing — skip the request. */
  enabled?: boolean;
  className?: string;
};

/**
 * Stale-while-revalidate for channel pages.
 * When history is shallow, runs a full ~6-month sync (not the light 24-post refresh).
 */
export function ChannelAutoSync({
  channel,
  lastSyncedAt,
  backfillHistory = false,
  enabled = true,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const lightRan = useRef(false);
  const backfillRan = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const stale =
      !lastSyncedAt ||
      Date.now() - new Date(lastSyncedAt).getTime() >= STALE_AFTER_MS;

    const shouldBackfill = backfillHistory && !backfillRan.current;
    const shouldLight = !shouldBackfill && stale && !lightRan.current;
    if (!shouldBackfill && !shouldLight) return;

    if (shouldBackfill) backfillRan.current = true;
    else lightRan.current = true;

    const light = !shouldBackfill;
    setStatus("syncing");
    setMessage(
      shouldBackfill
        ? `${CHANNEL_LABEL[channel]}-geschiedenis laden (6 maanden)…`
        : `${CHANNEL_LABEL[channel]}-posts verversen…`,
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
          // Allow retry on next mount/navigation.
          if (shouldBackfill) backfillRan.current = false;
          else lightRan.current = false;
          setStatus("error");
          setMessage(
            data.error?.slice(0, 160) ||
              `${CHANNEL_LABEL[channel]} sync mislukt`,
          );
          return;
        }
        setMessage(
          data.fetched != null
            ? `${CHANNEL_LABEL[channel]} bijgewerkt · ${data.fetched} posts opgehaald`
            : `${CHANNEL_LABEL[channel]} bijgewerkt`,
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
          e instanceof Error
            ? e.message
            : `${CHANNEL_LABEL[channel]} sync mislukt`,
        );
      }
    })();
  }, [backfillHistory, channel, enabled, lastSyncedAt, router]);

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
      <span>{message ?? `${CHANNEL_LABEL[channel]}-posts verversen…`}</span>
    </div>
  );
}
