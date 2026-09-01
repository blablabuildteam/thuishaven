/**
 * RA genre helpers — broad electronic umbrella for competition matching.
 * RA is already electronic-leaning; we drop clear non-electronic tags when present.
 */

const ELECTRONIC_TOKENS = [
  "house",
  "techno",
  "trance",
  "disco",
  "electro",
  "acid",
  "hardcore",
  "hardstyle",
  "gabber",
  "dnb",
  "drumandbass",
  "jungle",
  "garage",
  "ambient",
  "idm",
  "breakbeat",
  "breaks",
  "dubstep",
  "bassline",
  "footwork",
  "edm",
  "electronic",
  "minimal",
  "industrial",
  "psytrance",
  "frenchcore",
  "ghettotech",
  "ukbass",
  "bass",
  "jersey",
  "melodic",
  "progressive",
  "afro",
  "organic",
  "deephouse",
  "techhouse",
  "hardtechno",
  "dubtechno",
  "nudisco",
] as const;

function normalizeGenre(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Single RA genre name under the electronic umbrella. */
export function isElectronicGenre(name: string): boolean {
  const n = normalizeGenre(name);
  if (!n) return false;
  return ELECTRONIC_TOKENS.some((t) => n.includes(t) || t.includes(n));
}

/**
 * Broad electronic umbrella.
 * Empty genres → keep (common on RA; platform context is electronic).
 * Otherwise keep if any listed genre matches the umbrella.
 */
export function isElectronicUmbrella(genres: string[]): boolean {
  if (genres.length === 0) return true;
  return genres.some(isElectronicGenre);
}

export function encodeRaImpactNote(
  attending: number,
  genres: string[],
): string {
  const clean = genres.map((g) => g.trim()).filter(Boolean);
  if (clean.length === 0) return `attending:${attending}`;
  return `attending:${attending}|genres:${clean.join(",")}`;
}

export function parseRaImpactNote(note: string | null | undefined): {
  attending: number | null;
  genres: string[];
} {
  if (!note) return { attending: null, genres: [] };
  const attendingMatch = /(?:^|\|)attending:(\d+)/.exec(note);
  const genresMatch = /(?:^|\|)genres:([^|]+)/.exec(note);
  const attending = attendingMatch ? Number(attendingMatch[1]) : null;
  const genres = genresMatch
    ? genresMatch[1]
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  return {
    attending: Number.isFinite(attending) ? attending : null,
    genres,
  };
}

/** Short label for UI chips — primary genre, or top two. */
export function genreLabel(genres: string[]): string | null {
  if (genres.length === 0) return null;
  if (genres.length === 1) return genres[0]!;
  return `${genres[0]} · ${genres[1]}`;
}

export type CompeteSize = "small" | "medium" | "large";

/**
 * Relative size from RA “attending” (interest), not real headcount.
 * Festivals default at least medium — RA under-reports festival interest.
 */
export function competeSizeFromAttending(
  attending: number | null | undefined,
  kind: "festival" | "holiday" | "party" | "other",
): CompeteSize | null {
  if (kind === "holiday") return null;
  const n = attending ?? 0;
  if (kind === "festival") {
    if (n >= 600) return "large";
    return "medium";
  }
  if (n >= 800) return "large";
  if (n >= 400) return "medium";
  if (n >= 200) return "small";
  return n > 0 ? "small" : null;
}

export function competeSizeLabel(size: CompeteSize): string {
  if (size === "large") return "groot";
  if (size === "medium") return "middel";
  return "klein";
}

export type CompetitionLevel = "low" | "medium" | "high";

export type CompeteLike = {
  kind: "festival" | "holiday" | "party";
  size: CompeteSize | null;
};

/**
 * Overall same-day competition pressure from listed RA/curated events.
 * Weighted: festivals > large parties > smaller nights. Not true market share.
 */
export function summarizeCompetition(events: CompeteLike[]): {
  level: CompetitionLevel | null;
  score: number;
} {
  if (events.length === 0) return { level: null, score: 0 };

  let score = 0;
  let festivals = 0;
  for (const e of events) {
    if (e.kind === "holiday") {
      score += 1;
      continue;
    }
    if (e.kind === "festival") {
      festivals += 1;
      score += e.size === "large" ? 6 : 4;
      continue;
    }
    if (e.size === "large") score += 3;
    else if (e.size === "medium") score += 2;
    else score += 1;
  }

  // Dense nights (ADE-style) escalate even if individual RA sizes are modest.
  if (events.length >= 8 || festivals >= 2) score += 4;
  else if (events.length >= 4) score += 2;

  if (score >= 8) return { level: "high", score };
  if (score >= 3) return { level: "medium", score };
  return { level: "low", score };
}

export function competitionLevelLabel(level: CompetitionLevel): string {
  if (level === "high") return "hoge concurrentie";
  if (level === "medium") return "middel concurrentie";
  return "lage concurrentie";
}
