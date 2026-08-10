"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function UserMenu() {
  const { data } = useSession();
  if (!data?.user) return null;

  const isAdmin = data.user.role === "admin";

  return (
    <div className="space-y-2">
      <div>
        <p className="truncate text-xs text-text-muted">
          {data.user.name || data.user.email}
        </p>
        <p className="truncate font-mono text-[10px] text-text-dim">
          {isAdmin ? "admin" : "medewerker"} · sessie ·{" "}
          {(data.sessionId || "").slice(0, 8)}
        </p>
      </div>
      {isAdmin && (
        <Link
          href="/admin/gebruikers"
          className="block w-full border border-border px-2 py-1.5 text-center font-display text-xs tracking-[0.12em] text-text-muted transition-colors hover:border-accent hover:text-text"
        >
          Gebruikers
        </Link>
      )}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="w-full border border-border px-2 py-1.5 font-display text-xs tracking-[0.12em] text-text-muted transition-colors hover:border-accent hover:text-text"
      >
        Uitloggen
      </button>
    </div>
  );
}
