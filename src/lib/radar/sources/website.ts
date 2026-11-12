/**
 * Config-driven website program scrapers.
 * Uses regex patterns from radar_venue_source_configs.website_selectors.
 */
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { ingestPartyLineup } from "@/lib/radar/ingest-party";
import { parseLineupText } from "@/lib/radar/parse-lineup";
import {
  listEnabledSourceConfigs,
} from "@/lib/radar/parties";
import {
  radarVenueSourceConfigs,
  type WebsiteSelectors,
} from "@/lib/radar/schema";

export type WebsiteSyncResult = {
  venuesTried: number;
  partiesIngested: number;
  artistsCreated: number;
  errors: string[];
};

type ExtractedEvent = {
  title: string;
  startsAt: Date | null;
  lineupText: string;
};

export async function syncWebsiteVenues(options?: {
  limit?: number;
}): Promise<WebsiteSyncResult> {
  const result: WebsiteSyncResult = {
    venuesTried: 0,
    partiesIngested: 0,
    artistsCreated: 0,
    errors: [],
  };
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }

  const configs = await listEnabledSourceConfigs(options?.limit ?? 8);
  const db = getDb();

  for (const cfg of configs) {
    const url = cfg.websiteProgramUrl?.trim();
    if (!url) continue;
    result.venuesTried += 1;
    try {
      const html = await fetchProgramHtml(url);
      const events = extractEventsFromHtml(
        html,
        (cfg.websiteSelectors ?? {}) as WebsiteSelectors,
        cfg.venueName,
      );
      let createdHere = 0;
      for (const ev of events.slice(0, 12)) {
        if (parseLineupText(ev.lineupText).length === 0) continue;
        const ingested = await ingestPartyLineup({
          venueId: cfg.venueId,
          title: ev.title,
          startsAt: ev.startsAt,
          source: "website",
          externalUrl: url,
          externalId: `web:${cfg.venueId}:${slug(ev.title)}:${ev.startsAt?.toISOString().slice(0, 10) ?? "x"}`,
          lineupText: ev.lineupText,
          alertOnCreate: true,
        });
        if ("error" in ingested) {
          result.errors.push(`${cfg.venueName}: ${ingested.error}`);
          continue;
        }
        result.partiesIngested += ingested.created ? 1 : 0;
        result.artistsCreated += ingested.artistsCreated;
        createdHere += 1;
      }
      await db
        .update(radarVenueSourceConfigs)
        .set({
          lastWebsiteFetchAt: new Date(),
          lastError: createdHere === 0 ? "Geen line-ups gevonden in HTML" : null,
          updatedAt: new Date(),
        })
        .where(eq(radarVenueSourceConfigs.id, cfg.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "website fetch failed";
      result.errors.push(`${cfg.venueName}: ${msg}`);
      await db
        .update(radarVenueSourceConfigs)
        .set({
          lastWebsiteFetchAt: new Date(),
          lastError: msg.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(radarVenueSourceConfigs.id, cfg.id));
    }
    await sleep(400);
  }

  return result;
}

async function fetchProgramHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "ThuishavenRadar/1.0 (+https://tools.blablabuild.com; scouting)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function extractEventsFromHtml(
  html: string,
  selectors: WebsiteSelectors,
  venueName: string,
): ExtractedEvent[] {
  const text = htmlToRoughText(html);
  const blockRe = safeRe(
    selectors.eventBlockPattern,
    /(?:\n|^)([^\n]{8,120})\n([\s\S]{20,800}?)(?=\n[A-Z][^\n]{8,80}\n|$)/g,
  );

  const events: ExtractedEvent[] = [];
  if (blockRe.global) {
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(text)) && events.length < 20) {
      const block = m[0];
      const title =
        firstGroup(block, selectors.titlePattern) ||
        m[1]?.trim() ||
        `${venueName} event`;
      const dateStr = firstGroup(block, selectors.datePattern);
      const lineup =
        firstGroup(block, selectors.lineupPattern) ||
        guessLineupFromBlock(block);
      if (!lineup) continue;
      events.push({
        title: title.slice(0, 200),
        startsAt: parseLooseDate(dateStr),
        lineupText: lineup,
      });
    }
  }

  if (events.length === 0) {
    // Fallback: treat whole page as one blob — look for dense comma/newline artist lists
    const lineup = guessLineupFromBlock(text);
    if (lineup && parseLineupText(lineup).length >= 2) {
      events.push({
        title: `${venueName} programma`,
        startsAt: null,
        lineupText: lineup,
      });
    }
  }

  return events;
}

function htmlToRoughText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function guessLineupFromBlock(block: string): string | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 60);
  const candidates = lines.filter(
    (l) =>
      !/^\d{1,2}[:./-]/.test(l) &&
      !/ticket|doors|age|€|eur|free entry|sold out/i.test(l) &&
      /[a-zA-Z]/.test(l),
  );
  if (candidates.length < 2) {
    // try comma-separated single line
    const dense = lines.find((l) => (l.match(/,/g) ?? []).length >= 2);
    return dense ?? null;
  }
  return candidates.slice(0, 25).join("\n");
}

function firstGroup(text: string, pattern?: string): string | null {
  if (!pattern) return null;
  const re = safeRe(pattern);
  const m = re.exec(text);
  return (m?.[1] ?? m?.[0] ?? null)?.trim() || null;
}

function safeRe(pattern: string | undefined, fallback?: RegExp): RegExp {
  if (!pattern) return fallback ?? /$^/;
  try {
    return new RegExp(pattern, "gim");
  } catch {
    return fallback ?? /$^/;
  }
}

function parseLooseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  // dd-mm-yyyy / dd.mm.yyyy
  const m = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const dt = new Date(Date.UTC(year, month, day, 20, 0));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "event";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
