"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DJ_FEES_CHANGED_EVENT } from "@/lib/dashboard/dj-fee-ranges";
import { cn } from "@/lib/utils";

export function useDjFeesPendingCount(enabled = true) {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/dashboard/dj-fees");
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
    window.addEventListener(DJ_FEES_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(DJ_FEES_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
    };
  }, [pathname, enabled]);

  return count;
}

export function DjFeesNavBadge({
  count,
  active,
}: {
  count: number | null;
  active: boolean;
}) {
  if (!count) return null;

  return (
    <span
      title={`${count} event${count === 1 ? "" : "s"} met een DJ zonder fee`}
      className={cn(
        "th-num inline-flex h-6 min-w-6 items-center justify-center bg-highlight px-1.5 text-[15px] leading-none font-bold text-highlight-fg",
        active && "ring-1 ring-accent-contrast",
      )}
    >
      {count}
    </span>
  );
}
