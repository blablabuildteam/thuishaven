import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, marketingPosts, raListings } from "@/lib/db/schema";
import {
  normalizeArtistKey,
  parseEditionLineup,
} from "@/lib/editions/lineup";

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mrt: 3,
  maart: 3,
  apr: 4,
  april: 4,
  mei: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  aug: 8,
  augustus: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export type PostEditionLink = {
  postId: string;
  channel: string;
  title: string | null;
  editionId: string | null;
  editionName: string | null;
  confidence: number;
  reasons: string[];
};

type EditionIndex = {
  id: string;
  name: string;
  startsAt: Date;
  lineup: ReturnType<typeof parseEditionLineup>;
  artistKeys: Set<string>;
  nameNorm: string;
};

function extractMonthDayHints(
  text: string,
  yearHint: number,
): Array<{ y: number; m: number; d: number }> {
  const out: Array<{ y: number; m: number; d: number }> = [];
  const lower = text.toLowerCase();

  const multi = [
    ...lower.matchAll(
      /(\d{1,2})\s*[&/]\s*(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|sept|okt|nov|dec)\b/g,
    ),
  ];
  for (const m of multi) {
    const month = MONTHS[m[3]!];
    if (!month) continue;
    out.push({ y: yearHint, m: month, d: Number(m[1]) });
    out.push({ y: yearHint, m: month, d: Number(m[2]) });
  }

  const single = [
    ...lower.matchAll(
      /\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|sept|okt|nov|dec)\b/g,
    ),
  ];
  for (const m of single) {
    const month = MONTHS[m[2]!];
    if (!month) continue;
    out.push({ y: yearHint, m: month, d: Number(m[1]) });
  }

  return out;
}

function sameCalendarDay(
  editionStart: Date,
  hint: { y: number; m: number; d: number },
): boolean {
  return (
    editionStart.getUTCFullYear() === hint.y &&
    editionStart.getUTCMonth() + 1 === hint.m &&
    editionStart.getUTCDate() === hint.d
  );
}

function jaccardTokens(a: string, b: string): number {
  const ta = new Set(
    a
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
  const tb = new Set(
    b
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

function offerWindow(offer: string | undefined, text: string): { before: number; after: number } {
  if (
    offer === "aftermovie" ||
    offer === "recap" ||
    offer === "door" ||
    /\b(set|aftermovie|recap|relive|full set|outdoor & indoor)\b/i.test(text)
  ) {
    return { before: 14, after: 60 };
  }
  if (offer === "early_bird") return { before: 120, after: 0 };
  if (offer === "sold_out") return { before: 60, after: 3 };
  return { before: 90, after: 14 };
}

function scorePostAgainstEditions(input: {
  text: string;
  publishedAt: Date | null;
  artists: string[];
  editionGuess: string | null;
  offer: string | undefined;
  editionIndex: EditionIndex[];
}): { editionId: string | null; confidence: number; reasons: string[] } {
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const bump = (editionId: string, add: number, reason: string) => {
    const cur = scores.get(editionId) ?? { score: 0, reasons: [] };
    cur.score += add;
    cur.reasons.push(reason);
    scores.set(editionId, cur);
  };

  const yearHint = (input.publishedAt ?? new Date()).getFullYear();
  const textNorm = normalizeArtistKey(input.text);
  const window = offerWindow(input.offer, input.text);

  for (const hint of extractMonthDayHints(input.text, yearHint)) {
    for (const ed of input.editionIndex) {
      for (const y of [hint.y, hint.y + 1]) {
        if (sameCalendarDay(ed.startsAt, { ...hint, y })) {
          bump(ed.id, 0.7, `Datum in post ≈ ${y}-${hint.m}-${hint.d}`);
        }
      }
    }
  }

  if (input.editionGuess?.trim()) {
    const guess = input.editionGuess.trim();
    for (const ed of input.editionIndex) {
      const jac = jaccardTokens(guess, ed.name);
      if (jac >= 0.35) {
        bump(ed.id, 0.55 * jac + 0.2, `editionGuess ≈ “${ed.name.slice(0, 40)}”`);
      }
    }
  }

  const artistPool = [
    ...input.artists,
    ...input.text
      .split(/[^a-zA-Z0-9+]+/)
      .map((t) => normalizeArtistKey(t))
      .filter((t) => t.length >= 4),
  ];

  for (const ed of input.editionIndex) {
    if (input.publishedAt) {
      const deltaDays =
        (ed.startsAt.getTime() - input.publishedAt.getTime()) / 86400000;
      if (deltaDays < -window.after || deltaDays > window.before) continue;

      if (deltaDays >= 0 && deltaDays <= 14) {
        bump(ed.id, 0.15, "Publicatie ≤14d vóór event");
      } else if (deltaDays > 14 && deltaDays <= 45) {
        bump(ed.id, 0.08, "Publicatie 2–6 weken vóór event");
      } else if (deltaDays < 0 && deltaDays >= -7) {
        bump(ed.id, 0.12, "Publicatie kort ná event");
      }
    }

    for (const artist of ed.lineup.artists) {
      const key = normalizeArtistKey(artist);
      if (key.length < 4) continue;
      if (
        textNorm.includes(key) ||
        artistPool.some((a) => a === key || a.includes(key) || key.includes(a))
      ) {
        bump(
          ed.id,
          artist === ed.lineup.headliner ? 0.55 : 0.4,
          `Artiest “${artist}” in post`,
        );
      }
    }

    if (ed.lineup.kind === "ade" && /\bADE\b/i.test(input.text)) {
      bump(ed.id, 0.35, "ADE-post ↔ ADE-editie");
    }
    if (
      ed.lineup.kind === "nachtshow" &&
      /nachtshow/i.test(input.text)
    ) {
      bump(ed.id, 0.3, "Nachtshow-signaal");
    }
    if (
      ed.lineup.kind === "hollandse_haven" &&
      /hollandse\s+haven/i.test(input.text)
    ) {
      bump(ed.id, 0.4, "Hollandse Haven");
    }
  }

  // Maandnaam in post (AUGUST / september kalender) → soft link naar edities die maand
  const monthHit = input.text
    .toLowerCase()
    .match(
      /\b(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|sept|okt|nov|dec)\b/,
    );
  if (monthHit) {
    const monthKey = monthHit[1]!.toLowerCase();
    const monthAliases: Record<string, number> = {
      ...MONTHS,
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    };
    const month = monthAliases[monthKey];
    if (month && input.publishedAt) {
      for (const ed of input.editionIndex) {
        if (ed.startsAt.getUTCMonth() + 1 !== month) continue;
        const y = ed.startsAt.getUTCFullYear();
        if (Math.abs(y - yearHint) > 1) continue;
        const deltaDays =
          (ed.startsAt.getTime() - input.publishedAt.getTime()) / 86400000;
        if (deltaDays < -45 || deltaDays > 90) continue;
        bump(ed.id, 0.25, `Maand “${monthKey}” in post`);
      }
    }
  }

  let bestId: string | null = null;
  let bestScore = 0;
  let bestReasons: string[] = [];
  for (const [id, v] of scores) {
    if (v.score > bestScore) {
      bestScore = v.score;
      bestId = id;
      bestReasons = v.reasons;
    }
  }

  return {
    editionId: bestId,
    confidence: Math.min(1, Math.round(bestScore * 100) / 100),
    reasons: bestReasons.slice(0, 4),
  };
}

/**
 * Link unlinked marketing posts → editions using caption, visual tags, and dates.
 * Same confidence style as Brevo campaign linker (≥0.55).
 */
export async function linkPostsToEditions(options?: {
  persist?: boolean;
  minConfidence?: number;
  limit?: number;
  onlyUnlinked?: boolean;
}): Promise<{
  ok: boolean;
  linked: number;
  reviewed: number;
  links: PostEditionLink[];
  error?: string;
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      linked: 0,
      reviewed: 0,
      links: [],
      error: "DATABASE_URL ontbreekt",
    };
  }

  const persist = options?.persist ?? true;
  const minConfidence = options?.minConfidence ?? 0.55;
  // High enough to clear backlog; sync used to pass 40 and starved older matches.
  const limit = Math.min(Math.max(options?.limit ?? 250, 1), 500);
  const onlyUnlinked = options?.onlyUnlinked !== false;
  const db = getDb();

  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
    })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));

  const raRows = await db
    .select({
      editionId: raListings.editionId,
      artists: raListings.artists,
    })
    .from(raListings)
    .where(isNotNull(raListings.editionId));

  const raArtistsByEdition = new Map<string, string[]>();
  for (const row of raRows) {
    if (!row.editionId) continue;
    const existing = raArtistsByEdition.get(row.editionId) ?? [];
    for (const a of row.artists ?? []) {
      if (a?.trim() && !existing.includes(a)) existing.push(a);
    }
    raArtistsByEdition.set(row.editionId, existing);
  }

  const editionIndex: EditionIndex[] = eds
    .filter((e) => !/TEMPLATE/i.test(e.name))
    .map((e) => {
      const parsed = parseEditionLineup(e.name);
      const raArtists = raArtistsByEdition.get(e.id) ?? [];
      // Prefer RA lineup when present; keep parsed Weeztix-name artists as extras.
      const artists =
        raArtists.length > 0
          ? [
              ...raArtists,
              ...parsed.artists.filter(
                (a) =>
                  !raArtists.some(
                    (r) => normalizeArtistKey(r) === normalizeArtistKey(a),
                  ),
              ),
            ]
          : parsed.artists;
      const lineup = {
        ...parsed,
        artists,
        headliner: raArtists[0] ?? parsed.headliner,
      };
      return {
        ...e,
        lineup,
        artistKeys: new Set(
          artists.map((a) => normalizeArtistKey(a)).filter(Boolean),
        ),
        nameNorm: normalizeArtistKey(e.name),
      };
    });

  const posts = onlyUnlinked
    ? await (async () => {
        // Mix newest + oldest so a pile of unmatched recent posts can't starve
        // older matches (e.g. June Toman TikToks behind 100+ newer unlinked).
        const half = Math.ceil(limit / 2);
        const [newest, oldest] = await Promise.all([
          db
            .select()
            .from(marketingPosts)
            .where(
              and(
                isNull(marketingPosts.editionId),
                isNotNull(marketingPosts.publishedAt),
              ),
            )
            .orderBy(desc(marketingPosts.publishedAt))
            .limit(half),
          db
            .select()
            .from(marketingPosts)
            .where(
              and(
                isNull(marketingPosts.editionId),
                isNotNull(marketingPosts.publishedAt),
              ),
            )
            .orderBy(asc(marketingPosts.publishedAt))
            .limit(half),
        ]);
        const seen = new Set<string>();
        const merged = [];
        for (const p of [...newest, ...oldest]) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          merged.push(p);
        }
        return merged;
      })()
    : await db
        .select()
        .from(marketingPosts)
        .orderBy(desc(marketingPosts.publishedAt))
        .limit(limit);

  const links: PostEditionLink[] = [];
  let linked = 0;

  for (const post of posts) {
    if (onlyUnlinked && post.editionId) continue;

    const text = [
      post.title ?? "",
      post.caption ?? "",
      post.visualFeatures?.textInImage ?? "",
      post.visualFeatures?.editionGuess ?? "",
      ...(post.visualFeatures?.artists ?? []),
    ]
      .filter(Boolean)
      .join("\n");

    const scored = scorePostAgainstEditions({
      text,
      publishedAt: post.publishedAt,
      artists: post.visualFeatures?.artists ?? [],
      editionGuess: post.visualFeatures?.editionGuess ?? null,
      offer: post.visualFeatures?.offer,
      editionIndex,
    });

    const edition =
      scored.editionId && scored.confidence >= minConfidence
        ? editionIndex.find((e) => e.id === scored.editionId)
        : null;

    const link: PostEditionLink = {
      postId: post.id,
      channel: post.channel,
      title: post.title,
      editionId: edition?.id ?? null,
      editionName: edition?.name ?? null,
      confidence: scored.confidence,
      reasons: edition
        ? scored.reasons
        : scored.reasons.length
          ? [`Zwakke match (${scored.confidence})`, ...scored.reasons.slice(0, 2)]
          : ["Geen match"],
    };
    links.push(link);

    if (persist && link.editionId) {
      await db
        .update(marketingPosts)
        .set({ editionId: link.editionId })
        .where(eq(marketingPosts.id, post.id));
      linked += 1;
    } else if (!persist && link.editionId) {
      linked += 1;
    }
  }

  return {
    ok: true,
    linked,
    reviewed: posts.length,
    links: links
      .filter((l) => l.editionId || l.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 80),
  };
}
