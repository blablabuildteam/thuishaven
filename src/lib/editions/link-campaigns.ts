import { eq, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, emailCampaignMetrics } from "@/lib/db/schema";
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

export type CampaignLink = {
  campaignId: string;
  campaignName: string;
  editionId: string | null;
  editionName: string | null;
  confidence: number;
  reasons: string[];
};

function extractMonthDayHints(
  text: string,
  yearHint: number,
): Array<{ y: number; m: number; d: number }> {
  const out: Array<{ y: number; m: number; d: number }> = [];
  const lower = text.toLowerCase();

  // 8&9 aug / 8/9 augustus
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

  // 22 november / 30 augustus
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

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
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

/**
 * Koppelt Brevo-campagnes aan edities (heuristisch) en schrijft editionId weg.
 */
export async function linkCampaignsToEditions(options?: {
  persist?: boolean;
  minConfidence?: number;
}): Promise<{
  ok: boolean;
  linked: number;
  reviewed: number;
  links: CampaignLink[];
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
  const db = getDb();

  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
    })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));

  const editionIndex = eds
    .filter((e) => !/TEMPLATE/i.test(e.name))
    .map((e) => {
      const lineup = parseEditionLineup(e.name);
      return {
        ...e,
        lineup,
        artistKeys: new Set(
          lineup.artists.map((a) => normalizeArtistKey(a)).filter(Boolean),
        ),
      };
    });

  const camps = await db.select().from(emailCampaignMetrics);
  const links: CampaignLink[] = [];
  let linked = 0;

  for (const c of camps) {
    const name = c.name;
    if (/^test$/i.test(name.trim()) || /logo/i.test(name)) {
      links.push({
        campaignId: c.id,
        campaignName: name,
        editionId: null,
        editionName: null,
        confidence: 0,
        reasons: ["Genegeerd (test/noise)"],
      });
      continue;
    }

    const sentAt = c.sentAt ?? c.syncedAt;
    const yearHint = sentAt.getFullYear();
    const reasons: string[] = [];
    const scores = new Map<string, { score: number; reasons: string[] }>();

    const bump = (editionId: string, add: number, reason: string) => {
      const cur = scores.get(editionId) ?? { score: 0, reasons: [] };
      cur.score += add;
      cur.reasons.push(reason);
      scores.set(editionId, cur);
    };

    // Date hints in campaign name
    const hints = extractMonthDayHints(name, yearHint);
    for (const hint of hints) {
      for (const ed of editionIndex) {
        // try yearHint and yearHint+1 (presale for future shows)
        for (const y of [hint.y, hint.y + 1]) {
          if (sameCalendarDay(ed.startsAt, { ...hint, y })) {
            bump(ed.id, 0.7, `Datum in mail ≈ ${y}-${hint.m}-${hint.d}`);
          }
        }
      }
    }

    // ADE
    if (/\bADE\b/i.test(name)) {
      const adeDay = /vrijdag|friday/i.test(name)
        ? "friday"
        : /zaterdag|saturday/i.test(name)
          ? "saturday"
          : /zondag|sunday/i.test(name)
            ? "sunday"
            : null;
      for (const ed of editionIndex) {
        if (ed.lineup.kind !== "ade") continue;
        if (daysBetween(ed.startsAt, sentAt) > 150) continue;
        let add = 0.35;
        const n = ed.name.toLowerCase();
        if (adeDay === "friday" && /friday|vrijdag/.test(n)) add += 0.35;
        if (adeDay === "saturday" && /saturday|zaterdag/.test(n)) add += 0.35;
        if (adeDay === "sunday" && /sunday|zondag/.test(n)) add += 0.35;
        bump(ed.id, add, "ADE-campagne ↔ ADE-editie");
      }
    }

    // "dit weekend" / "aankomend weekend"
    if (/weekend/i.test(name) || /aankomend/i.test(name)) {
      for (const ed of editionIndex) {
        const delta =
          (ed.startsAt.getTime() - sentAt.getTime()) / 86400000;
        if (delta >= -1 && delta <= 4) {
          bump(ed.id, 0.45, "Weekend-mail dicht op event");
        }
      }
    }

    // Artist overlap
    const campKeys = name
      .split(/[^a-zA-Z0-9+]+/)
      .map((t) => normalizeArtistKey(t))
      .filter((t) => t.length >= 4);

    // Also try multi-word artists from editions against campaign string
    const campNorm = normalizeArtistKey(name);
    for (const ed of editionIndex) {
      // only if temporally plausible: mail before or shortly after event, or within 120d before
      const deltaDays =
        (ed.startsAt.getTime() - sentAt.getTime()) / 86400000;
      if (deltaDays < -14 || deltaDays > 180) continue;

      for (const artist of ed.lineup.artists) {
        const key = normalizeArtistKey(artist);
        if (key.length < 4) continue;
        if (campNorm.includes(key) || campKeys.includes(key)) {
          bump(
            ed.id,
            artist === ed.lineup.headliner ? 0.55 : 0.4,
            `Artiest “${artist}” in mail`,
          );
        }
      }
    }

    // Kalender mails: softer link to all editions in that month after send
    const kal = name.match(
      /\b(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+kalender\b/i,
    );
    if (kal) {
      const month = MONTHS[kal[1]!.toLowerCase()];
      if (month) {
        for (const ed of editionIndex) {
          if (
            ed.startsAt.getUTCMonth() + 1 === month &&
            Math.abs(ed.startsAt.getUTCFullYear() - yearHint) <= 1
          ) {
            bump(ed.id, 0.2, "Maandkalender");
          }
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

    // Cap confidence
    const confidence = Math.min(1, Math.round(bestScore * 100) / 100);
    const edition = bestId
      ? editionIndex.find((e) => e.id === bestId)
      : null;

    const link: CampaignLink = {
      campaignId: c.id,
      campaignName: name,
      editionId:
        confidence >= minConfidence && edition ? edition.id : null,
      editionName:
        confidence >= minConfidence && edition ? edition.name : null,
      confidence,
      reasons:
        confidence >= minConfidence
          ? bestReasons.slice(0, 4)
          : bestReasons.length
            ? [`Zwakke match (${confidence})`, ...bestReasons.slice(0, 2)]
            : ["Geen match"],
    };
    links.push(link);

    if (persist && link.editionId) {
      await db
        .update(emailCampaignMetrics)
        .set({ editionId: link.editionId })
        .where(eq(emailCampaignMetrics.id, c.id));
      linked += 1;
    } else if (!persist && link.editionId) {
      linked += 1;
    }
  }

  return {
    ok: true,
    linked,
    reviewed: camps.length,
    links: links
      .filter((l) => l.editionId || l.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 80),
  };
}
