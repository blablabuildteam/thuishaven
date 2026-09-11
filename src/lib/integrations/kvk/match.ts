/**
 * Score how well a KvK hit name matches the prospect we searched for.
 * 1 = exact (normalized), 0 = unrelated.
 */

export function normalizeCompanyName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(b\.?\s*v\.?|n\.?\s*v\.?|v\.?\s*o\.?\s*f\.?|inc\.?|ltd\.?|group|holding|netherlands|nederland)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function scoreCompanyNameMatch(
  query: string,
  hitName: string,
): { score: number; exact: boolean } {
  const a = normalizeCompanyName(query);
  const b = normalizeCompanyName(hitName);
  if (!a || !b) return { score: 0, exact: false };
  if (a === b) return { score: 1, exact: true };
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return { score: 0.75 + 0.2 * ratio, exact: false };
  }
  const ta = new Set(a.split(" ").filter((t) => t.length > 1));
  const tb = new Set(b.split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return { score: 0, exact: false };
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  const score = overlap / Math.max(ta.size, tb.size);
  return { score, exact: false };
}

/** Below this we still attach KvK data but flag it for review. */
export const KVK_MATCH_WEAK_THRESHOLD = 0.55;
