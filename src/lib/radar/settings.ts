import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarSettings } from "@/lib/radar/schema";

/** Configureerbare Groeiscore + alert + digest defaults. */
export type RadarSettingsValue = {
  weights: {
    spotify: number;
    instagram: number;
    tiktok: number;
    soundcloud: number;
    resident_advisor: number;
  };
  /** Recente delta weegt zwaarder dan absolute omvang. */
  velocityShare: number;
  /** Absolute plafonds: daaronder telt iemand als “relatief onbekend”. */
  unknownCeilings: {
    spotifyFollowers: number;
    spotifyPopularity: number;
    instagramFollowers: number;
    tiktokFollowers: number;
    soundcloudFollowers: number;
    raFavorites: number;
  };
  alerts: {
    velocityThreshold: number;
    newOnRadarMinScore: number;
  };
  digest: {
    enabled: boolean;
    /** ISO weekday 1=ma … 7=zo */
    weekday: number;
    hourAmsterdam: number;
    recipients: string[];
  };
  refresh: {
    /** Hours between full metric refreshes. */
    spotifyHours: number;
    socialHours: number;
    raHours: number;
  };
  discovery: {
    maxHops: number;
    venueSuggestMinScore: number;
  };
};

export const DEFAULT_RADAR_SETTINGS: RadarSettingsValue = {
  weights: {
    /** RA-first: Spotify/social bevestigen, boeken niet sturen. */
    spotify: 0.15,
    instagram: 0.1,
    tiktok: 0.1,
    soundcloud: 0.05,
    resident_advisor: 0.6,
  },
  velocityShare: 0.7,
  unknownCeilings: {
    spotifyFollowers: 80_000,
    spotifyPopularity: 55,
    instagramFollowers: 40_000,
    tiktokFollowers: 50_000,
    soundcloudFollowers: 20_000,
    raFavorites: 2_500,
  },
  alerts: {
    velocityThreshold: 12,
    newOnRadarMinScore: 35,
  },
  digest: {
    enabled: true,
    weekday: 1,
    hourAmsterdam: 8,
    recipients: [],
  },
  refresh: {
    spotifyHours: 24,
    socialHours: 48,
    raHours: 24,
  },
  discovery: {
    maxHops: 2,
    venueSuggestMinScore: 40,
  },
};

const SETTINGS_KEY = "defaults";

function mergeSettings(raw: unknown): RadarSettingsValue {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const weights = {
    ...DEFAULT_RADAR_SETTINGS.weights,
    ...((src.weights as object) ?? {}),
  } as RadarSettingsValue["weights"];
  const unknownCeilings = {
    ...DEFAULT_RADAR_SETTINGS.unknownCeilings,
    ...((src.unknownCeilings as object) ?? {}),
  } as RadarSettingsValue["unknownCeilings"];
  const alerts = {
    ...DEFAULT_RADAR_SETTINGS.alerts,
    ...((src.alerts as object) ?? {}),
  } as RadarSettingsValue["alerts"];
  const digest = {
    ...DEFAULT_RADAR_SETTINGS.digest,
    ...((src.digest as object) ?? {}),
  } as RadarSettingsValue["digest"];
  const refresh = {
    ...DEFAULT_RADAR_SETTINGS.refresh,
    ...((src.refresh as object) ?? {}),
  } as RadarSettingsValue["refresh"];
  const discovery = {
    ...DEFAULT_RADAR_SETTINGS.discovery,
    ...((src.discovery as object) ?? {}),
  } as RadarSettingsValue["discovery"];

  return {
    weights,
    velocityShare:
      typeof src.velocityShare === "number"
        ? src.velocityShare
        : DEFAULT_RADAR_SETTINGS.velocityShare,
    unknownCeilings,
    alerts,
    digest: {
      ...digest,
      recipients: Array.isArray(digest.recipients)
        ? digest.recipients.filter((e) => typeof e === "string")
        : [],
    },
    refresh,
    discovery,
  };
}

export async function loadRadarSettings(): Promise<RadarSettingsValue> {
  if (!hasDatabase()) return DEFAULT_RADAR_SETTINGS;
  const db = getDb();
  const [row] = await db
    .select()
    .from(radarSettings)
    .where(eq(radarSettings.key, SETTINGS_KEY))
    .limit(1);
  return mergeSettings(row?.value);
}

export async function saveRadarSettings(
  value: RadarSettingsValue,
  userId?: string | null,
): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const merged = mergeSettings(value);
  const sum =
    merged.weights.spotify +
    merged.weights.instagram +
    merged.weights.tiktok +
    merged.weights.soundcloud +
    merged.weights.resident_advisor;
  if (sum <= 0) return { error: "Gewichten moeten samen > 0 zijn" };

  const db = getDb();
  await db
    .insert(radarSettings)
    .values({
      key: SETTINGS_KEY,
      value: merged,
      updatedAt: new Date(),
      updatedByUserId: userId ?? null,
    })
    .onConflictDoUpdate({
      target: radarSettings.key,
      set: {
        value: merged,
        updatedAt: new Date(),
        updatedByUserId: userId ?? null,
      },
    });
  return { ok: true };
}
