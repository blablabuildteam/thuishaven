"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Silent page-view logger for tools. Visible only in admin activity log. */
export function ActivityTracker() {
  const pathname = usePathname();
  const last = useRef<string>("");

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    if (pathname.startsWith("/admin/activiteit")) return;
    last.current = pathname;

    const ctrl = new AbortController();
    void fetch("/api/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        action: "page_view",
        summary: `Pagina · ${pathname}`,
      }),
      signal: ctrl.signal,
      keepalive: true,
    }).catch(() => undefined);

    return () => ctrl.abort();
  }, [pathname]);

  return null;
}
