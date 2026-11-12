/**
 * Alert when an artist on a watched RA label is strong / newly interesting.
 */
import { and, desc, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { createRadarAlert } from "@/lib/radar/alerts";
import {
  radarAlerts,
  radarArtistProfiles,
  radarArtists,
} from "@/lib/radar/schema";
import { loadRadarSettings } from "@/lib/radar/settings";

export type LabelWatchResult = {
  watched: number;
  checked: number;
  alerts: number;
  errors: string[];
};

const COOLDOWN_DAYS = 21;

function norm(s: string) {
  return s.trim().toLowerCase();
}

export async function detectLabelWatchAlerts(options?: {
  limit?: number;
  minScore?: number;
}): Promise<LabelWatchResult> {
  const result: LabelWatchResult = {
    watched: 0,
    checked: 0,
    alerts: 0,
    errors: [],
  };
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }

  const settings = await loadRadarSettings();
  const watched = settings.labelWatchlist.map(norm).filter(Boolean);
  result.watched = watched.length;
  if (watched.length === 0) return result;

  const db = getDb();
  const minScore =
    options?.minScore ?? Math.max(40, settings.alerts.newOnRadarMinScore);
  const limit = Math.min(options?.limit ?? 300, 500);

  const rows = await db
    .select({
      id: radarArtists.id,
      name: radarArtists.name,
      growthScore: radarArtists.growthScore,
      status: radarArtists.status,
      raw: radarArtistProfiles.raw,
    })
    .from(radarArtists)
    .innerJoin(
      radarArtistProfiles,
      and(
        sql`${radarArtistProfiles.artistId} = ${radarArtists.id}`,
        sql`${radarArtistProfiles.platform} = 'resident_advisor'`,
      ),
    )
    .where(
      and(
        sql`${radarArtists.status} not in ('passed', 'not_relevant', 'booked')`,
        sql`coalesce(${radarArtists.growthScore}, 0)::numeric >= ${minScore}`,
        sql`jsonb_typeof(${radarArtistProfiles.raw}->'labels') = 'array'`,
        sql`jsonb_array_length(${radarArtistProfiles.raw}->'labels') > 0`,
      ),
    )
    .orderBy(desc(radarArtists.growthScore))
    .limit(limit);

  const cooldownSince = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const artistIds = rows.map((r) => r.id);
  const recent =
    artistIds.length === 0
      ? []
      : await db
          .select({ artistId: radarAlerts.artistId })
          .from(radarAlerts)
          .where(
            and(
              sql`${radarAlerts.kind} = 'label_watch'`,
              sql`${radarAlerts.triggeredAt} >= ${cooldownSince}`,
              inArray(radarAlerts.artistId, artistIds),
            ),
          );
  const cooled = new Set(
    recent.map((r) => r.artistId).filter((id): id is string => Boolean(id)),
  );

  for (const row of rows) {
    result.checked += 1;
    if (cooled.has(row.id)) continue;
    const labels = Array.isArray((row.raw as { labels?: unknown })?.labels)
      ? ((row.raw as { labels: unknown[] }).labels)
      : [];
    const names = labels
      .map((l) => {
        if (typeof l === "string") return l;
        if (l && typeof l === "object" && "name" in l) {
          return String((l as { name: unknown }).name ?? "");
        }
        return "";
      })
      .map(norm)
      .filter(Boolean);
    const hit = names.find((n) => watched.some((w) => n === w || n.includes(w) || w.includes(n)));
    if (!hit) continue;

    const displayLabel =
      labels
        .map((l) =>
          typeof l === "string"
            ? l
            : l && typeof l === "object" && "name" in l
              ? String((l as { name: unknown }).name ?? "")
              : "",
        )
        .find((n) => norm(n) === hit) ?? hit;

    const score = row.growthScore != null ? Number(row.growthScore) : null;
    try {
      await createRadarAlert({
        kind: "label_watch",
        artistId: row.id,
        title: `${row.name} op ${displayLabel}`,
        body: `Staat op je label-watchlist (${displayLabel})${
          score != null ? ` · score ${Math.round(score)}` : ""
        }. Check dossier → Volgen of Shortlist.`,
        payload: { label: displayLabel, score },
      });
      result.alerts += 1;
      cooled.add(row.id);
    } catch (e) {
      result.errors.push(
        `${row.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
