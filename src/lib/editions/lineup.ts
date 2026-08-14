/**
 * Parse Thuishaven editienamen → artiesten, soort, tags.
 * Heuristisch: Weeztix-namen zijn inconsistent over de jaren.
 */

const DUTCH_MONTHS =
  "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december";

const DATE_PREFIX =
  new RegExp(
    `^\\s*(?:\\d{1,2}\\s*[:/]\\s*)*\\d{1,2}(?:\\s*(?:${DUTCH_MONTHS}|JAN|FEB|MRT|APR|MEI|JUN|JUL|AUG|SEP|OKT|NOV|DEC)[^|]*)?\\s*\\|\\s*`,
    "i",
  );

const ROOM_TAGS = new Set([
  "hou",
  "tec",
  "hte",
  "tra",
  "aho",
  "polyamor",
]);

const EVENT_KIND_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "ade", re: /\bADE\b/i },
  { kind: "zomeropening", re: /zomeropening/i },
  { kind: "zomerclosing", re: /zomerclosing/i },
  { kind: "winteropening", re: /winteropening/i },
  { kind: "paasweekender", re: /paas/i },
  { kind: "hollandse_haven", re: /hollandse\s+haven/i },
  { kind: "nachtshow", re: /nachtshow/i },
  { kind: "techno_special", re: /techno\s*special/i },
  { kind: "community", re: /community/i },
];

const NOISE = new Set([
  "thuishaven",
  "thuis",
  "haven",
  "w",
  "with",
  "more",
  "hrs",
  "hr",
  "uur",
  "u",
  "10hrs",
  "5hrs",
  "3hrs",
  "10hr",
  "5hr",
  "10u",
  "5u",
  "nachtshow",
  "day",
  "night",
  "dag",
  "avond",
  "live",
  "friends",
  "presents",
  "invites",
  "invite",
  "special",
  "technospecial",
  "techno",
  "weekender",
  "weekend",
  "opening",
  "closing",
  "last",
  "minute",
  "secret",
  "guest",
  "afterjam",
  "timetable",
  "tickets",
  "show",
  "shows",
  "festival",
  "event",
  "nl",
  "ams",
  "amsterdam",
  "the",
  "and",
  "met",
  "van",
  "de",
  "het",
  "een",
  "our",
  "first",
  "finale",
  "final",
  ...ROOM_TAGS,
]);

export type ParsedLineup = {
  artists: string[];
  kind: string;
  tags: string[];
  headliner: string | null;
  isNachtshow: boolean;
  rooms: string[];
};

function cleanToken(raw: string): string | null {
  let t = raw
    .replace(/\(.*?\)/g, " ")
    .replace(/[\[\]]/g, " ")
    .replace(/[_*🎈🌞]/g, " ")
    .replace(/\b\d+\s*h(?:rs?|r|uuren?)?\b/gi, " ")
    .replace(/\b\d+\s*uur\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  // drop pure numbers / dates
  if (/^[\d.:/-]+$/.test(t)) return null;
  const key = t.toLowerCase().replace(/[^a-z0-9+]/g, "");
  if (!key || NOISE.has(key) || NOISE.has(t.toLowerCase())) return null;
  if (key.length < 2) return null;
  // Title-ish case
  if (t === t.toUpperCase() && t.length > 3) {
    t = t
      .toLowerCase()
      .replace(/(^|[\s/+-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  }
  return t.trim();
}

function splitArtists(chunk: string): string[] {
  const parts = chunk
    .split(/\s*(?:\/|,|:|&|\+| w\/? |\bw\b)\s*/i)
    .map((p) => cleanToken(p))
    .filter((p): p is string => Boolean(p));

  // Dedupe case-insensitive, keep order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export function parseEditionLineup(name: string): ParsedLineup {
  const tags: string[] = [];
  const rooms: string[] = [];
  let kind = "regular";

  for (const p of EVENT_KIND_PATTERNS) {
    if (p.re.test(name)) {
      kind = p.kind;
      tags.push(p.kind);
    }
  }

  const upperBits = name.match(/\b(HOU|TEC|HTE|TRA|AHO)\b/gi) ?? [];
  for (const r of upperBits) {
    rooms.push(r.toUpperCase());
  }

  const isNachtshow = /nachtshow/i.test(name);

  // Strip leading date
  let rest = name.replace(DATE_PREFIX, "").trim();
  // Also strip trailing room codes after |
  rest = rest.replace(/\|\s*(HOU|TEC|HTE|TRA|AHO)(\s+(HOU|TEC|HTE|TRA|AHO))*\s*$/i, "").trim();

  const segments = rest.split("|").map((s) => s.trim()).filter(Boolean);

  let artistChunk = "";
  const wMatch = rest.match(/\bW\/\s*(.+)$/i);
  if (wMatch) {
    artistChunk = wMatch[1]!;
  } else if (segments.length >= 2) {
    // Prefer last non-meta segment
    const candidates = segments.filter(
      (s) =>
        !/^(thuishaven|ade|de zomer|de winter|hollandse)/i.test(s) ||
        /w\//i.test(s),
    );
    artistChunk =
      candidates.find((s) => /w\//i.test(s)) ??
      candidates[candidates.length - 1] ??
      segments[segments.length - 1] ??
      "";
    artistChunk = artistChunk.replace(/^.*?\bW\/\s*/i, "");
  } else {
    artistChunk = rest
      .replace(/^THUISHAVEN\s*/i, "")
      .replace(/^W\/\s*/i, "");
  }

  // Remove kind labels from chunk
  artistChunk = artistChunk
    .replace(/\bADE\b.*$/i, "")
    .replace(/\bDE ZOMEROPENING\b/gi, "")
    .replace(/\bZOMERCLOSING\b/gi, "")
    .replace(/\bHOLLANDSE HAVEN\b/gi, "")
    .replace(/\bNACHTSHOW\b/gi, "")
    .replace(/\bLAST MINUTE\b/gi, "")
    .trim();

  let artists = splitArtists(artistChunk);

  // Older format without W/: "Ben Klock, Oguz, Allignment"
  if (!artists.length && segments.length) {
    const last = segments[segments.length - 1]!;
    if (!/thuishaven/i.test(last)) {
      artists = splitArtists(last);
    }
  }

  // Filter remaining noise kinds
  artists = artists.filter((a) => {
    const k = a.toLowerCase();
    return (
      !EVENT_KIND_PATTERNS.some((p) => p.re.test(a) && a.length < 20) &&
      !ROOM_TAGS.has(k)
    );
  });

  return {
    artists,
    kind,
    tags: [...new Set(tags)],
    headliner: artists[0] ?? null,
    isNachtshow,
    rooms: [...new Set(rooms)],
  };
}

/** Normalize for fuzzy matching between campaign ↔ artist */
export function normalizeArtistKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
