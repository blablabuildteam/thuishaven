import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, marketingPosts, raListings } from "@/lib/db/schema";
import {
  normalizeArtistKey,
  parseEditionLineup,
} from "@/lib/editions/lineup";

export const MONTHS: Record<string, number> = {
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
  // English, as used in RA-style captions and Google campaign names.
  january: 1,
  february: 2,
  march: 3,
  mar: 3,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  oct: 10,
  october: 10,
};

const MONTH_WORDS = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

export type PostEditionLink = {
  postId: string;
  channel: string;
  title: string | null;
  editionId: string | null;
  editionName: string | null;
  confidence: number;
  reasons: string[];
};

export type LinkChange = {
  id: string;
  title: string | null;
  from: string | null;
  to: string | null;
  reasons: string[];
};

export type EditionIndex = {
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
      new RegExp(
        `(\\d{1,2})\\s*[&/]\\s*(\\d{1,2})\\s*(${MONTH_WORDS})\\b`,
        "g",
      ),
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
      new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_WORDS})\\b`, "g"),
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
    /\b(set|aftermovie|recap|relive|full set|outdoor & indoor|throwback|liveset)\b/i.test(text)
  ) {
    return { before: 14, after: 150 };
  }
  if (offer === "early_bird") return { before: 120, after: 0 };
  if (offer === "sold_out") return { before: 60, after: 3 };
  return { before: 90, after: 14 };
}

/** Lowercase words, accents stripped, padded so `includes(" x ")` is a whole-word test. */
function wordString(s: string): string {
  const words = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${words} `;
}

/** Day/night split of one date (ADE Friday Day vs Night, 10HRS vs Nachtshow). */
const NIGHT_RE = /\b(nacht|nachtshow|night|afterjam)\b/i;
const DAY_AND_NIGHT_RE = /\b(day|dag)\s*(&|\+|and|en)\s*(night|nacht)\b/i;

/**
 * Caption cues that a post looks back at a night (set on YouTube, aftermovie).
 * Read from the caption, not the image analysis: that tags promos as recap too.
 */
const LOOKBACK_RE =
  /\b(aftermovie|recap|relive|full set|throwback|liveset|youtube|terug te zien|out now|stream)\b/i;

/** Lineup strings parsed from old edition names that aren't artists. */
const NOT_ARTISTS = new Set([
  "house",
  "deep house",
  "tech house",
  "techhouse",
  "techno",
  "hard techno",
  "melodic techno",
  "trance",
  "hard trance",
  "hard house",
  "afro house",
  "minimal",
  "disco",
  "progressive",
  "secret guest",
  "special guest",
  "friends",
  "more",
]);

/** Recurring nights whose name alone identifies the edition. */
const SERIES = [
  "nieuwjaarsdans",
  "zomerclosing",
  "zomeropening",
  "paasweekender",
  "hollandse haven",
  "technoweekender",
];

const ADE_WEEKDAYS: Array<{ re: RegExp; day: string }> = [
  { re: /\b(woensdag|wednesday)\b/i, day: "wednesday" },
  { re: /\b(donderdag|thursday)\b/i, day: "thursday" },
  { re: /\b(vrijdag|friday)\b/i, day: "friday" },
  { re: /\b(zaterdag|saturday)\b/i, day: "saturday" },
  { re: /\b(zondag|sunday)\b/i, day: "sunday" },
];

export function scorePostAgainstEditions(input: {
  text: string;
  publishedAt: Date | null;
  artists: string[];
  editionGuess: string | null;
  offer: string | undefined;
  editionIndex: EditionIndex[];
}): { editionId: string | null; confidence: number; reasons: string[] } {
  const scores = new Map<string, { score: number; reasons: string[] }>();
  /**
   * Editions with a signal that names this event: a date, an edition guess,
   * an artist, or a named series. Timing, "ADE" or a month alone fit any
   * event that week, so they only add to editions that are already here.
   */
  const specific = new Set<string>();
  const bump = (
    editionId: string,
    add: number,
    reason: string,
    isSpecific = false,
  ) => {
    const cur = scores.get(editionId) ?? { score: 0, reasons: [] };
    cur.score += add;
    cur.reasons.push(reason);
    scores.set(editionId, cur);
    if (isSpecific) specific.add(editionId);
  };

  const yearHint = (input.publishedAt ?? new Date()).getFullYear();
  const textWords = wordString(input.text);
  // Hashtags and handles as one key: #diffrent, @lukefono, @realadambeyer.
  const tokens = input.text.split(/\s+/);
  const tokenKeys = new Set(tokens.map((t) => normalizeArtistKey(t)));
  const handleKeys = tokens
    .filter((t) => t.startsWith("@"))
    .map((t) => normalizeArtistKey(t))
    .filter((t) => t.length >= 4);
  const taggedArtists = new Set(input.artists.map((a) => normalizeArtistKey(a)));
  const window = offerWindow(input.offer, input.text);
  // "Day & Night" promotes both, so only a night-only text leans to the night edition.
  const nightText =
    NIGHT_RE.test(input.text) && !DAY_AND_NIGHT_RE.test(input.text);
  const adeText = /\bADE\b/i.test(input.text);
  const lookback = LOOKBACK_RE.test(input.text);

  // Whole words only: "lens" must not hit Olivia Lensen, "special" not Special Request.
  const mentionsArtist = (artist: string): boolean => {
    const bare = artist.replace(/\([^)]*\)/g, " ");
    const words = wordString(bare);
    if (NOT_ARTISTS.has(words.trim())) return false;
    const key = normalizeArtistKey(bare);
    if (key.length < 4) return false;
    if (taggedArtists.has(key) || tokenKeys.has(key)) return true;
    if (key.length >= 5 && handleKeys.some((h) => h.includes(key))) return true;
    return textWords.includes(words);
  };

  for (const hint of extractMonthDayHints(input.text, yearHint)) {
    for (const ed of input.editionIndex) {
      for (const y of [hint.y, hint.y + 1]) {
        if (sameCalendarDay(ed.startsAt, { ...hint, y })) {
          bump(ed.id, 0.7, `Datum in post ≈ ${y}-${hint.m}-${hint.d}`, true);
        }
      }
    }
  }

  if (input.editionGuess?.trim()) {
    const guess = input.editionGuess.trim();
    for (const ed of input.editionIndex) {
      const jac = jaccardTokens(guess, ed.name);
      if (jac >= 0.35) {
        bump(
          ed.id,
          0.55 * jac + 0.2,
          `editionGuess ≈ “${ed.name.slice(0, 40)}”`,
          true,
        );
      }
    }
  }

  for (const ed of input.editionIndex) {
    let inWindow = true;
    let deltaDays = 0;
    if (input.publishedAt) {
      deltaDays =
        (ed.startsAt.getTime() - input.publishedAt.getTime()) / 86400000;
      const maxAfter = Math.max(window.after, 21);
      const maxBefore = Math.max(window.before, 120);
      if (deltaDays < -maxAfter || deltaDays > maxBefore) continue;
      inWindow = !(deltaDays < -window.after || deltaDays > window.before);

      if (inWindow) {
        if (deltaDays >= 0 && deltaDays <= 14) {
          bump(ed.id, 0.15, "Publicatie ≤14d vóór event");
        } else if (deltaDays > 14 && deltaDays <= 45) {
          bump(ed.id, 0.08, "Publicatie 2–6 weken vóór event");
        } else if (deltaDays < 0 && deltaDays >= -7) {
          bump(ed.id, 0.12, "Publicatie kort ná event");
        }
      }
    }

    // A recap or liveset is about a night that already happened: an artist
    // only ties it to an edition around that night, not to their next booking.
    const artistsCount = !lookback || inWindow;
    for (const artist of artistsCount ? ed.lineup.artists : []) {
      if (mentionsArtist(artist)) {
        const headliner = artist === ed.lineup.headliner;
        bump(
          ed.id,
          headliner ? 0.55 : 0.5,
          `Artiest “${artist}” in post`,
          true,
        );
      }
    }

    const adeEdition = ed.lineup.kind === "ade" || /\bADE\b/i.test(ed.name);
    if (adeEdition && adeText) {
      bump(ed.id, 0.35, "ADE-post ↔ ADE-editie");
      const edName = ed.name.toLowerCase();
      for (const { re, day } of ADE_WEEKDAYS) {
        if (re.test(input.text) && edName.includes(day)) {
          bump(ed.id, 0.4, `ADE ${day}`, true);
        }
      }
    }
    if (nightText && NIGHT_RE.test(ed.name)) {
      bump(ed.id, 0.3, "Nacht-signaal");
    }
    const edWords = wordString(ed.name);
    for (const series of SERIES) {
      if (textWords.includes(` ${series} `) && edWords.includes(` ${series} `)) {
        bump(ed.id, 0.7, `Serie “${series}”`, true);
      }
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

  const byId = new Map(input.editionIndex.map((e) => [e.id, e]));
  /** Ties: the day edition of one date, then the edition nearest the post. */
  const tieRank = (id: string): [number, number] => {
    const ed = byId.get(id)!;
    const night = !nightText && NIGHT_RE.test(ed.name) ? 1 : 0;
    const distance = input.publishedAt
      ? Math.abs(ed.startsAt.getTime() - input.publishedAt.getTime())
      : 0;
    return [night, distance];
  };
  let bestId: string | null = null;
  let bestScore = 0;
  let bestReasons: string[] = [];
  for (const [id, v] of scores) {
    if (!specific.has(id)) continue;
    const better = v.score > bestScore + 1e-9;
    let tieWins = false;
    if (!better && bestId != null && Math.abs(v.score - bestScore) <= 1e-9) {
      const [n, d] = tieRank(id);
      const [bn, bd] = tieRank(bestId);
      tieWins = n < bn || (n === bn && d < bd);
    }
    if (better || tieWins) {
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

/** Weeztix editions with their lineup (RA artists first), for scoring posts and ads. */
export async function loadEditionIndex(): Promise<EditionIndex[]> {
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

  return eds
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
  /** Also score posts already linked to an edition that hasn't happened yet. */
  recheckUpcoming?: boolean;
}): Promise<{
  ok: boolean;
  linked: number;
  reviewed: number;
  links: PostEditionLink[];
  /** Existing links that moved to another edition or were dropped. */
  changes: LinkChange[];
  error?: string;
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      linked: 0,
      reviewed: 0,
      links: [],
      changes: [],
      error: "DATABASE_URL ontbreekt",
    };
  }

  const persist = options?.persist ?? true;
  const minConfidence = options?.minConfidence ?? 0.55;
  // High enough to clear backlog; sync used to pass 40 and starved older matches.
  const limit = Math.min(Math.max(options?.limit ?? 250, 1), 2000);
  const onlyUnlinked = options?.onlyUnlinked !== false;
  const recheckUpcoming = options?.recheckUpcoming !== false;
  const db = getDb();

  const editionIndex = await loadEditionIndex();

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
        // Links to events still ahead get scored again: new editions and
        // lineups land after a post was first linked.
        const upcomingIds = editionIndex
          .filter((e) => e.startsAt.getTime() >= Date.now() - 86400000)
          .map((e) => e.id);
        const linkedUpcoming =
          recheckUpcoming && upcomingIds.length > 0
            ? await db
                .select()
                .from(marketingPosts)
                .where(inArray(marketingPosts.editionId, upcomingIds))
            : [];
        const seen = new Set<string>();
        const merged = [];
        for (const p of [...newest, ...oldest, ...linkedUpcoming]) {
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
  const changes: LinkChange[] = [];
  let linked = 0;
  const editionName = (id: string | null) =>
    id ? (editionIndex.find((e) => e.id === id)?.name ?? id) : null;

  for (const post of posts) {

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

    if (link.editionId === post.editionId) continue;
    if (post.editionId) {
      changes.push({
        id: post.id,
        title: post.title,
        from: editionName(post.editionId),
        to: link.editionName,
        reasons: link.reasons,
      });
    } else {
      linked += 1;
    }
    if (persist) {
      await db
        .update(marketingPosts)
        .set({ editionId: link.editionId })
        .where(eq(marketingPosts.id, post.id));
    }
  }

  return {
    ok: true,
    linked,
    reviewed: posts.length,
    changes,
    links: links
      .filter((l) => l.editionId || l.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 80),
  };
}
