/**
 * Split pasted / scraped lineup text into artist names.
 * Handles commas, middots, newlines, b2b, presents, &.
 */

const NOISE = /^(dj|live|all\s*night|tba|tbc|support|local|support\s*tba)$/i;

export function parseLineupText(raw: string): string[] {
  if (!raw?.trim()) return [];

  let text = raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00b7|\u2022|•/g, ",")
    .replace(/\s+presents?:?\s+/gi, ", ")
    .replace(/\s+b2b\s+/gi, " b2b ")
    .replace(/\s+&\s+/g, ", ")
    .replace(/\s+x\s+/gi, ", ")
    .replace(/\s+w\/\s+/gi, ", ")
    .replace(/\s+with\s+/gi, ", ");

  const chunks = text
    .split(/[\n,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const names: string[] = [];
  for (const chunk of chunks) {
    // Keep b2b pairs as two artists when written "A b2b B"
    if (/\bb2b\b/i.test(chunk)) {
      const parts = chunk.split(/\bb2b\b/i).map((p) => p.trim()).filter(Boolean);
      for (const p of parts) pushName(names, p);
      continue;
    }
    pushName(names, chunk);
  }

  // Dedupe case-insensitive, preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function pushName(out: string[], raw: string) {
  let name = raw
    .replace(/^[\d.#*)\-\s]+/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length < 2 || name.length > 80) return;
  if (NOISE.test(name)) return;
  if (/^\d{1,2}[:.]\d{2}/.test(name)) return;
  out.push(name);
}
