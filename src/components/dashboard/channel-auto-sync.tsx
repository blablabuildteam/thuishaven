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

/** Skip auto-sync if data is fresher than this (cron covers 4×/day). */
const STALE_AFTER_MS = 15 * 60 * 1000;

type Props = {
  channel: SocialChannel;
  /** ISO timestamp of newest post sync, or null if empty. */
  lastSyncedAt: string | null;
  /** False when credentials are missing — skip the request. */
  enabled?: boolean;
  className?: string;
};

/**
 * Stale-while-revalidate for channel pages: show cached posts, refresh in
 * the background when data is older than 15 minutes (or empty).
 */
export function ChannelAutoSync({
  channel,
  lastSyncedAt,
  enabled = true,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;

    const stale =
      !lastSyncedAt ||
      Date.now() - new Date(lastSyncedAt).getTime() >= STALE_AFTER_MS;
    if (!stale) return;

    ran.current = true;
    setStatus("syncing");
    setMessage(`${CHANNEL_LABEL[channel]}-posts verversen…`);

    void (async () => {
      try {
        const res = await fetch(SYNC_PATH[channel], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ light: true }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          upserted?: number;
          fetched?: number;
        };
        if (!res.ok || data.ok === false) {
          setStatus("error");
          setMessage(
            data.error?.slice(0, 160) ||
              `${CHANNEL_LABEL[channel]} sync mislukt`,
          );
          return;
        }
        setMessage(
          data.upserted != null
            ? `${CHANNEL_LABEL[channel]} bijgewerkt · ${data.upserted} posts`
            : `${CHANNEL_LABEL[channel]} bijgewerkt`,
        );
        startTransition(() => {
          router.refresh();
        });
        setStatus("idle");
        window.setTimeout(() => setMessage(null), 2500);
      } catch (e) {
        setStatus("error");
        setMessage(
          e instanceof Error
            ? e.message
            : `${CHANNEL_LABEL[channel]} sync mislukt`,
        );
      }
    })();
  }, [channel, enabled, lastSyncedAt, router]);

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
