"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const OMZET_CHANGED_EVENT = "thuishaven:omzet-changed";

export function notifyOmzetChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OMZET_CHANGED_EVENT));
}

export function useOmzetPendingCount(enabled = true) {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/dashboard/omzet");
        const data = (await res.json().catch(() => ({}))) as {
          count?: number;
        };
        if (!cancelled && res.ok && typeof data.count === "number") {
          setCount(data.count);
        }
      } catch {
        if (!cancelled) setCount(null);
      }
    }

    void load();
    function onChanged() {
      void load();
    }
    window.addEventListener(OMZET_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(OMZET_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
    };
  }, [pathname, enabled]);

  return count;
}

export function OmzetNavBadge({
  count,
  active,
}: {
  count: number | null;
  active: boolean;
}) {
  if (!count) return null;

  return (
    <span
      title={`${count} event${count === 1 ? "" : "s"} mist nog bar of keuken`}
      className={cn(
        "th-num inline-flex h-6 min-w-6 items-center justify-center bg-highlight px-1.5 text-[15px] leading-none font-bold text-highlight-fg",
        active && "ring-1 ring-accent-contrast",
      )}
    >
      {count}
    </span>
  );
}
