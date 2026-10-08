/**
 * Short-lived handoff of selected prospect IDs (+ optional template)
 * from Bedrijven → Mailen. Stored in an httpOnly cookie.
 */

import { cookies } from "next/headers";
import {
  OUTREACH_VARIANTS,
  type OutreachVariantId,
} from "@/lib/outreach/tone";

export const HANDOFF_COOKIE = "outreach_handoff";
export const HANDOFF_MAX_IDS = 80;
const HANDOFF_MAX_AGE_SEC = 60 * 60; // 1 hour

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VARIANT_IDS = new Set(OUTREACH_VARIANTS.map((v) => v.id));

export type HandoffPayload = {
  prospectIds: string[];
  variantId?: OutreachVariantId;
};

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

function parseVariant(raw: unknown): OutreachVariantId | undefined {
  if (typeof raw !== "string") return undefined;
  return VARIANT_IDS.has(raw as OutreachVariantId)
    ? (raw as OutreachVariantId)
    : undefined;
}

export function parseHandoffCookie(raw: string): HandoffPayload {
  const trimmed = raw.trim();
  if (!trimmed) return { prospectIds: [] };
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as {
        prospectIds?: unknown;
        variantId?: unknown;
      };
      return {
        prospectIds: normalizeHandoffIds(json.prospectIds),
        variantId: parseVariant(json.variantId),
      };
    } catch {
      return { prospectIds: [] };
    }
  }
  // Legacy: comma-separated UUIDs
  return { prospectIds: normalizeHandoffIds(trimmed.split(",")) };
}

export async function setHandoffCookie(input: {
  prospectIds: string[];
  variantId?: OutreachVariantId | null;
}): Promise<number> {
  const clean = normalizeHandoffIds(input.prospectIds);
  const jar = await cookies();
  if (clean.length === 0) {
    jar.delete(HANDOFF_COOKIE);
    return 0;
  }
  const payload: HandoffPayload = {
    prospectIds: clean,
    variantId: parseVariant(input.variantId) ?? undefined,
  };
  jar.set(HANDOFF_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: HANDOFF_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  });
  return clean.length;
}

/** @deprecated use setHandoffCookie({ prospectIds }) */
export async function setHandoffIds(ids: string[]): Promise<number> {
  return setHandoffCookie({ prospectIds: ids });
}

export async function peekHandoff(): Promise<HandoffPayload> {
  const jar = await cookies();
  const raw = jar.get(HANDOFF_COOKIE)?.value ?? "";
  if (!raw.trim()) return { prospectIds: [] };
  return parseHandoffCookie(raw);
}

/** Read handoff IDs without clearing (legacy helpers). */
export async function peekHandoffIds(): Promise<string[]> {
  return (await peekHandoff()).prospectIds;
}

/** Clear handoff cookie (call from a Route Handler, not a Server Component). */
export async function clearHandoffCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(HANDOFF_COOKIE);
}
