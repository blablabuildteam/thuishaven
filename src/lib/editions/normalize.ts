/**
 * Editie-extractie + normalisatie over ticketplatforms.
 * Doel: zelf mapping voorstellen op basis van namen/data i.p.v. handmatige spreadsheet.
 */

export type PlatformEventRaw = {
  platform: "weeztix" | "resident_advisor" | "appic" | "ticketswap" | "internal";
  externalId: string;
  name: string;
  startsAt: string;
};

export type CanonicalEdition = {
  id: string;
  name: string;
  slug: string;
  startsAt: string;
};

export type EditionMatch = {
  raw: PlatformEventRaw;
  suggestedEditionId: string | null;
  suggestedEditionName: string | null;
  score: number;
  reasons: string[];
  normalizedName: string;
};

/** Mock “ruwe” namen zoals platforms ze teruggeven */
export const RAW_PLATFORM_EVENTS: PlatformEventRaw[] = [
  {
    platform: "weeztix",
    externalId: "wz-88421",
    name: "THUISHAVEN — Summer Special 2026",
    startsAt: "2026-08-15T16:00:00+02:00",
  },
  {
    platform: "resident_advisor",
    externalId: "ra-2211901",
    name: "Thuishaven: Summer Special",
    startsAt: "2026-08-15T16:00:00+02:00",
  },
  {
    platform: "appic",
    externalId: "ap-5521",
    name: "Summer Special @ Thuishaven",
    startsAt: "2026-08-15T14:00:00+02:00",
  },
  {
    platform: "ticketswap",
    externalId: "ts-90112",
    name: "Thuishaven Summer Special (tickets)",
    startsAt: "2026-08-15T16:00:00+02:00",
  },
  {
    platform: "internal",
    externalId: "int-ss26",
    name: "Summer Special 15 aug",
    startsAt: "2026-08-15T16:00:00+02:00",
  },
  {
    platform: "weeztix",
    externalId: "wz-89102",
    name: "Warehouse Sessions 12",
    startsAt: "2026-09-06T15:00:00+02:00",
  },
  {
    platform: "resident_advisor",
    externalId: "ra-2214500",
    name: "Thuishaven Warehouse Sessions #12",
    startsAt: "2026-09-06T15:00:00+02:00",
  },
  {
    platform: "weeztix",
    externalId: "wz-87001",
    name: "Spring Opening 2026",
    startsAt: "2026-04-19T14:00:00+02:00",
  },
  {
    platform: "appic",
    externalId: "ap-4490",
    name: "ADE Saturday Day — Michel de Hey / Philou",
    startsAt: "2026-10-24T13:00:00+02:00",
  },
];

export function normalizeEditionName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/thuishaven/g, "")
    .replace(/\b(tickets?|passes?|nachtshow|day|night|w\/|with|presents?)\b/g, "")
    .replace(/[@|—–-]+/g, " ")
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(" ").filter((t) => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return ms / (1000 * 60 * 60 * 24);
}

export function matchEditions(
  rawEvents: PlatformEventRaw[],
  editions: CanonicalEdition[],
): EditionMatch[] {
  return rawEvents.map((raw) => {
    const normalizedName = normalizeEditionName(raw.name);
    const rawTokens = tokenSet(normalizedName);
    let best: EditionMatch = {
      raw,
      suggestedEditionId: null,
      suggestedEditionName: null,
      score: 0,
      reasons: [],
      normalizedName,
    };

    for (const ed of editions) {
      const reasons: string[] = [];
      let score = 0;
      const edNorm = normalizeEditionName(ed.name);
      const nameScore = jaccard(rawTokens, tokenSet(edNorm));
      score += nameScore * 0.65;
      if (nameScore >= 0.5) reasons.push(`naam overlap ${Math.round(nameScore * 100)}%`);

      const dayDiff = daysApart(raw.startsAt, ed.startsAt);
      if (dayDiff <= 1) {
        score += 0.35;
        reasons.push("zelfde dag (±1)");
      } else if (dayDiff <= 3) {
        score += 0.15;
        reasons.push(`datum ±${Math.round(dayDiff)}d`);
      }

      if (normalizedName.includes(ed.slug.replace(/-/g, " "))) {
        score += 0.1;
        reasons.push("slug in naam");
      }

      if (score > best.score) {
        best = {
          raw,
          suggestedEditionId: ed.id,
          suggestedEditionName: ed.name,
          score: Math.min(score, 1),
          reasons,
          normalizedName,
        };
      }
    }

    if (best.score < 0.35) {
      best.suggestedEditionId = null;
      best.suggestedEditionName = null;
      best.reasons = ["geen betrouwbare match — handmatig koppelen"];
    }

    return best;
  });
}

export function editionMappingSummary(matches: EditionMatch[]) {
  const linked = matches.filter((m) => m.suggestedEditionId && m.score >= 0.35);
  const needsReview = matches.filter(
    (m) => m.suggestedEditionId && m.score >= 0.35 && m.score < 0.7,
  );
  const unmatched = matches.filter((m) => !m.suggestedEditionId);
  return {
    total: matches.length,
    autoLinked: linked.length - needsReview.length,
    needsReview: needsReview.length,
    unmatched: unmatched.length,
  };
}
