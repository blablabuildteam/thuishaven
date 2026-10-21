"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshControl } from "@/components/dashboard/refresh-control";

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
 * Stale-while-revalidate for channel pages, plus a manual refresh button.
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
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lightRan = useRef(false);
  const backfillRan = useRef(false);
  const label = CHANNEL_LABEL[channel];

  const runSync = useCallback(
    async (backfill: boolean) => {
      setSyncing(true);
      setError(null);
      setMessage(
        backfill
          ? `${label}-geschiedenis laden (6 maanden)…`
          : `${label}-posts verversen…`,
      );
      try {
        const res = await fetch(SYNC_PATH[channel], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ light: !backfill }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          upserted?: number;
          fetched?: number;
        };
        if (!res.ok || data.ok === false) {
          // Allow retry on next mount/navigation.
          if (backfill) backfillRan.current = false;
          else lightRan.current = false;
          setMessage(null);
          setError(data.error?.slice(0, 160) || `${label} sync mislukt`);
          return;
        }
        setMessage(
          data.fetched != null
            ? `${label} bijgewerkt · ${data.fetched} posts opgehaald`
            : `${label} bijgewerkt`,
        );
        startTransition(() => {
          router.refresh();
        });
        window.setTimeout(() => setMessage(null), 3500);
      } catch (e) {
        if (backfill) backfillRan.current = false;
        else lightRan.current = false;
        setMessage(null);
        setError(e instanceof Error ? e.message : `${label} sync mislukt`);
      } finally {
        setSyncing(false);
      }
    },
    [channel, label, router],
  );

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
    void runSync(shouldBackfill);
  }, [backfillHistory, enabled, lastSyncedAt, runSync]);

  if (!enabled) return null;

  return (
    <RefreshControl
      onRefresh={() => void runSync(false)}
      spinning={syncing || pending}
      refreshedAt={lastSyncedAt}
      label={`${label}-posts verversen`}
      message={message}
      error={error}
      className={className}
    />
  );
}
