/**
 * Short-lived handoff of selected prospect IDs from Bedrijven → Mailen.
 * Stored in an httpOnly cookie so we don't stuff dozens of UUIDs in the URL.
 */

import { cookies } from "next/headers";

export const HANDOFF_COOKIE = "outreach_handoff";
export const HANDOFF_MAX_IDS = 80;
const HANDOFF_MAX_AGE_SEC = 60 * 60; // 1 hour

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeHandoffIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= HANDOFF_MAX_IDS) break;
  }
  return out;
}

export async function setHandoffCookie(ids: string[]): Promise<number> {
  const clean = normalizeHandoffIds(ids);
  const jar = await cookies();
  if (clean.length === 0) {
    jar.delete(HANDOFF_COOKIE);
    return 0;
  }
  jar.set(HANDOFF_COOKIE, clean.join(","), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: HANDOFF_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  });
  return clean.length;
}

/** Read handoff IDs without clearing (legacy ?ids= can merge). */
export async function peekHandoffIds(): Promise<string[]> {
  const jar = await cookies();
  const raw = jar.get(HANDOFF_COOKIE)?.value ?? "";
  if (!raw.trim()) return [];
  return normalizeHandoffIds(raw.split(","));
}

/** Clear handoff cookie (call from a Route Handler, not a Server Component). */
export async function clearHandoffCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(HANDOFF_COOKIE);
}
