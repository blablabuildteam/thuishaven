"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshControl } from "@/components/dashboard/refresh-control";

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

/** Stale-while-revalidate for paid channel pages, plus a manual refresh button. */
export function PaidAdsAutoSync({
  channel,
  lastSyncedAt,
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
        backfill ? `${label} ads laden (6 maanden)…` : `${label} ads verversen…`,
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
          if (backfill) backfillRan.current = false;
          else lightRan.current = false;
          setMessage(null);
          setError(data.error?.slice(0, 220) || `${label} ads sync mislukt`);
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
        window.setTimeout(() => setMessage(null), 3500);
      } catch (e) {
        if (backfill) backfillRan.current = false;
        else lightRan.current = false;
        setMessage(null);
        setError(e instanceof Error ? e.message : `${label} ads sync mislukt`);
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
    const shouldBackfill = !lastSyncedAt && !backfillRan.current;
    const shouldLight = !shouldBackfill && stale && !lightRan.current;
    if (!shouldBackfill && !shouldLight) return;

    if (shouldBackfill) backfillRan.current = true;
    else lightRan.current = true;
    void runSync(shouldBackfill);
  }, [enabled, lastSyncedAt, runSync]);

  if (!enabled) return null;

  return (
    <RefreshControl
      onRefresh={() => void runSync(!lastSyncedAt)}
      spinning={syncing || pending}
      refreshedAt={lastSyncedAt}
      label={`${label} ads verversen`}
      message={message}
      error={error}
      className={className}
    />
  );
}
