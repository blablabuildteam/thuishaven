import { eq, isNull, desc, and } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  marketingPosts,
  type MarketingVisualFeatures,
} from "@/lib/db/schema";
import { logIntegration } from "@/lib/integrations/log";

const OFFER_VALUES = [
  "lineup",
  "early_bird",
  "sold_out",
  "aftermovie",
  "recap",
  "door",
  "other",
] as const;

type Offer = (typeof OFFER_VALUES)[number];

const ANALYSIS_PROMPT = `Je analyseert één Thuishaven social post (beeld + caption).
Antwoord ALLEEN met geldige JSON, geen markdown.
Schema:
{
  "subjects": string[],
  "textInImage": string | null,
  "artists": string[],
  "offer": "lineup" | "early_bird" | "sold_out" | "aftermovie" | "recap" | "door" | "other",
  "mood": string | null,
  "palette": string[],
  "format": string | null,
  "hasTextOverlay": boolean,
  "composition": string | null,
  "editionGuess": string | null,
  "dominantColors": string[]
}
Regels:
- artists: DJ/artiestnamen die je herkent in beeld of caption (max 8)
- offer: wat de post vooral promoot
- palette/dominantColors: hex kleuren (#RRGGBB), max 5
- editionGuess: editienaam/datum als die duidelijk is, anders null
- Wees conservatief: liever "other" / lege arrays dan verzinnen`;

function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence?.[1]?.trim() ?? trimmed;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1)) as Record<
          string,
          unknown
        >;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asStringArray(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 80))
    .slice(0, max);
}

function asHexList(v: unknown, max = 5): string[] {
  return asStringArray(v, max).filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c));
}

function normalizeOffer(v: unknown): Offer {
  if (typeof v === "string" && (OFFER_VALUES as readonly string[]).includes(v)) {
    return v as Offer;
  }
  return "other";
}

function normalizeFeatures(
  raw: Record<string, unknown>,
  existing?: MarketingVisualFeatures | null,
): MarketingVisualFeatures {
  return {
    format:
      (typeof raw.format === "string" && raw.format) ||
      existing?.format ||
      undefined,
    composition:
      typeof raw.composition === "string" ? raw.composition.slice(0, 160) : null,
    hasTextOverlay: Boolean(raw.hasTextOverlay),
    subjects: asStringArray(raw.subjects),
    textInImage:
      typeof raw.textInImage === "string"
        ? raw.textInImage.slice(0, 240)
        : null,
    artists: asStringArray(raw.artists),
    offer: normalizeOffer(raw.offer),
    mood: typeof raw.mood === "string" ? raw.mood.slice(0, 80) : null,
    palette: asHexList(raw.palette),
    dominantColors: asHexList(raw.dominantColors ?? raw.palette),
    editionGuess:
      typeof raw.editionGuess === "string"
        ? raw.editionGuess.slice(0, 120)
        : null,
  };
}

async function fetchImageAsBase64(
  url: string,
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(
      ";",
    )[0];
    if (!mimeType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 200 || buf.byteLength > 8_000_000) return null;
    return { mimeType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

export async function analyzeMarketingPostImage(input: {
  imageUrl: string | null;
  caption: string | null;
  existing?: MarketingVisualFeatures | null;
}): Promise<
  | { ok: true; features: MarketingVisualFeatures; usedImage: boolean }
  | { ok: false; error: string }
> {
  const key = geminiKey();
  if (!key) {
    return { ok: false, error: "GEMINI_API_KEY ontbreekt" };
  }

  const parts: Array<Record<string, unknown>> = [
    {
      text: `${ANALYSIS_PROMPT}\n\nCaption:\n${input.caption?.trim() || "(geen caption)"}`,
    },
  ];

  let usedImage = false;
  if (input.imageUrl) {
    const image = await fetchImageAsBase64(input.imageUrl);
    if (image) {
      parts.push({
        inlineData: { mimeType: image.mimeType, data: image.data },
      });
      usedImage = true;
    }
  }

  if (!usedImage) {
    parts[0] = {
      text: `${ANALYSIS_PROMPT}\n\nGeen bruikbaar beeld — baseer je alleen op de caption.\n\nCaption:\n${input.caption?.trim() || "(geen caption)"}`,
    };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `Gemini HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) return { ok: false, error: "Lege Gemini-response" };

    const parsed = parseJsonObject(text);
    if (!parsed) return { ok: false, error: "Gemini JSON parse mislukt" };

    return {
      ok: true,
      features: normalizeFeatures(parsed, input.existing),
      usedImage,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Vision request mislukt",
    };
  }
}

export type AnalyzePendingResult = {
  ok: boolean;
  attempted: number;
  analyzed: number;
  skipped: number;
  error?: string;
  errors: string[];
};

/** Analyze posts without analyzedAt. Prefer storedMediaUrl, then thumbnail/media. */
export async function analyzePendingMarketingPosts(options?: {
  limit?: number;
  force?: boolean;
  channel?: "instagram" | "tiktok" | "youtube";
}): Promise<AnalyzePendingResult> {
  if (!hasDatabase()) {
    return {
      ok: false,
      attempted: 0,
      analyzed: 0,
      skipped: 0,
      error: "DATABASE_URL ontbreekt",
      errors: [],
    };
  }
  if (!geminiKey()) {
    return {
      ok: false,
      attempted: 0,
      analyzed: 0,
      skipped: 0,
      error: "GEMINI_API_KEY ontbreekt",
      errors: [],
    };
  }

  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 20);
  const channelFilter = options?.channel
    ? eq(marketingPosts.channel, options.channel)
    : null;
  const pendingFilter = options?.force
    ? channelFilter
    : channelFilter
      ? and(isNull(marketingPosts.analyzedAt), channelFilter)
      : isNull(marketingPosts.analyzedAt);

  const rows = pendingFilter
    ? await db
        .select()
        .from(marketingPosts)
        .where(pendingFilter)
        .orderBy(desc(marketingPosts.publishedAt))
        .limit(limit)
    : await db
        .select()
        .from(marketingPosts)
        .orderBy(desc(marketingPosts.publishedAt))
        .limit(limit);

  let analyzed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const imageUrl =
      row.storedMediaUrl || row.thumbnailUrl || row.mediaUrl || null;
    if (!imageUrl && !row.caption) {
      skipped += 1;
      continue;
    }

    const result = await analyzeMarketingPostImage({
      imageUrl,
      caption: row.caption,
      existing: row.visualFeatures,
    });

    if (!result.ok) {
      errors.push(`${row.externalId ?? row.id}: ${result.error}`);
      continue;
    }

    const merged: MarketingVisualFeatures = {
      ...(row.visualFeatures ?? {}),
      ...result.features,
      format: result.features.format ?? row.visualFeatures?.format,
    };

    await db
      .update(marketingPosts)
      .set({
        visualFeatures: merged,
        analyzedAt: new Date(),
      })
      .where(eq(marketingPosts.id, row.id));
    analyzed += 1;
  }

  const logSource = options?.channel ?? "instagram";
  const ok = analyzed > 0 || (rows.length === 0 && errors.length === 0);
  await logIntegration({
    source: logSource,
    level: ok || analyzed > 0 ? "info" : "error",
    event: analyzed > 0 ? "vision.ok" : "vision.failed",
    message:
      analyzed > 0
        ? `Vision: ${analyzed}/${rows.length} posts geanalyseerd`
        : errors[0] ?? "Geen posts geanalyseerd",
    detail: {
      attempted: rows.length,
      analyzed,
      skipped,
      channel: options?.channel ?? null,
      errors: errors.slice(0, 5),
    },
    throttleMs: 0,
  }).catch(() => null);

  return {
    ok: analyzed > 0 || rows.length === 0,
    attempted: rows.length,
    analyzed,
    skipped,
    error:
      analyzed === 0 && rows.length > 0
        ? errors[0] ?? "Geen posts geanalyseerd"
        : undefined,
    errors: errors.slice(0, 5),
  };
}

/** Convenience: unanalyzed count for UI. */
export async function countUnanalyzedMarketingPosts(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const rows = await db
    .select({ id: marketingPosts.id })
    .from(marketingPosts)
    .where(and(isNull(marketingPosts.analyzedAt)))
    .limit(500);
  return rows.length;
}
