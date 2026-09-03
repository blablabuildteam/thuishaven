/**
 * Organic social impact for an edition — same pattern as competition:
 * score each promo/eventdag post, combine, map to 1–5 impact level.
 * Aftermovies do not count toward sales impact.
 */

import type { SalesImpactRole } from "@/lib/marketing/sales-impact";

export type OrganicImpactLevel = 1 | 2 | 3 | 4 | 5;
/** Per-post heaviness (like compete small/medium/large). */
export type OrganicPostWeight = "light" | "medium" | "heavy";

export type OrganicImpactPost = {
  channel: string;
  salesImpactRole: SalesImpactRole;
  impressions: number;
  reach: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  engagement: number;
  ticketLiftSold: number | null;
};

export type OrganicPostScore = {
  points: number;
  weight: OrganicPostWeight;
};

export type OrganicVariantSnapshot = {
  postId: string;
  title: string | null;
  engagement: number;
  impressions: number;
  reach: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  permalink: string | null;
  publishedAt: string | null;
};

/** Fields needed to collapse TikTok/IG creative variants (same caption, different ids). */
export type OrganicDedupeable = OrganicImpactPost & {
  postId: string;
  title: string | null;
  publishedAt: string | null;
  permalink: string | null;
  variants?: OrganicVariantSnapshot[];
};

function viewsOf(p: Pick<OrganicImpactPost, "impressions" | "reach">): number {
  if (p.impressions > 0) return p.impressions;
  if (p.reach > 0) return p.reach;
  return 0;
}

function interactionsOf(p: OrganicImpactPost): number {
  const parts = p.likeCount + p.commentCount + p.shareCount;
  if (parts > 0) return parts;
  return Math.max(0, p.engagement);
}

function toOrganicVariant(p: OrganicDedupeable): OrganicVariantSnapshot {
  return {
    postId: p.postId,
    title: p.title,
    engagement: p.engagement,
    impressions: p.impressions,
    reach: p.reach,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    shareCount: p.shareCount,
    permalink: p.permalink,
    publishedAt: p.publishedAt,
  };
}

/** Normalize caption so near-identical TikTok variants share one Insights row. */
export function normalizeOrganicTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[@#]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

/**
 * Collapse same-channel posts with the same caption into one row.
 * Metrics are summed (total campaign push); ticket lift keeps the max
 * so overlapping ±48u windows are not triple-counted.
 * Individual uploads stay on `variants` for an expandable UI.
 */
export function dedupeOrganicCreativeVariants<T extends OrganicDedupeable>(
  posts: T[],
): T[] {
  if (posts.length <= 1) {
    return posts.map((p) => ({ ...p, variants: [] }));
  }

  const groups = new Map<string, T[]>();
  for (const p of posts) {
    const norm = normalizeOrganicTitle(p.title);
    const key = norm
      ? `${p.channel}::${norm}`
      : `${p.channel}::id:${p.postId}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  const roleRank = (r: SalesImpactRole) =>
    r === "promo" ? 0 : r === "same_day" ? 1 : 2;

  const out: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push({ ...group[0]!, variants: [] });
      continue;
    }

    const sorted = [...group].sort((a, b) => {
      const rr = roleRank(a.salesImpactRole) - roleRank(b.salesImpactRole);
      if (rr !== 0) return rr;
      return viewsOf(b) - viewsOf(a);
    });
    const primary = sorted[0]!;
    const publishedAt =
      sorted
        .map((p) => p.publishedAt)
        .filter((d): d is string => Boolean(d))
        .sort()[0] ?? primary.publishedAt;

    let ticketLiftSold: number | null = null;
    for (const p of group) {
      if (p.ticketLiftSold == null) continue;
      ticketLiftSold =
        ticketLiftSold == null
          ? p.ticketLiftSold
          : Math.max(ticketLiftSold, p.ticketLiftSold);
    }

    out.push({
      ...primary,
      impressions: group.reduce((s, p) => s + (p.impressions || 0), 0),
      reach: group.reduce((s, p) => s + (p.reach || 0), 0),
      likeCount: group.reduce((s, p) => s + (p.likeCount || 0), 0),
      commentCount: group.reduce((s, p) => s + (p.commentCount || 0), 0),
      shareCount: group.reduce((s, p) => s + (p.shareCount || 0), 0),
      engagement: group.reduce((s, p) => s + (p.engagement || 0), 0),
      ticketLiftSold,
      publishedAt,
      permalink: primary.permalink,
      variants: sorted.map(toOrganicVariant),
    });
  }

  return out;
}

/**
 * Individual post score (0+). Role-scaled; after → 0.
 * Mixes reach/views, interactions, and optional ticket-lift correlation.
 */
export function scoreOrganicPost(p: OrganicImpactPost): OrganicPostScore {
  if (p.salesImpactRole === "after") {
    return { points: 0, weight: "light" };
  }

  const views = viewsOf(p);
  const interactions = interactionsOf(p);
  const lift = p.ticketLiftSold ?? 0;

  let points = 0;

  if (views >= 50_000) points += 4;
  else if (views >= 15_000) points += 3;
  else if (views >= 5_000) points += 2;
  else if (views >= 1_000) points += 1;

  if (interactions >= 500) points += 3;
  else if (interactions >= 100) points += 2;
  else if (interactions >= 20) points += 1;
  else if (interactions >= 5) points += 0.5;

  if (lift >= 100) points += 3;
  else if (lift >= 30) points += 2;
  else if (lift >= 10) points += 1;

  if (p.salesImpactRole === "same_day") {
    points *= 0.25;
  }

  points = Math.round(points * 10) / 10;

  const weight: OrganicPostWeight =
    points >= 6 ? "heavy" : points >= 3 ? "medium" : "light";

  return { points, weight };
}

export function organicPostWeightLabel(weight: OrganicPostWeight): string {
  if (weight === "heavy") return "zwaar";
  if (weight === "medium") return "middel";
  return "licht";
}

/**
 * Combine per-post scores into edition-level organic impact.
 * Uses top posts with mild diminishing returns so duplicate creatives
 * don't auto-max the score.
 */
export function summarizeOrganicImpact(posts: OrganicImpactPost[]): {
  level: OrganicImpactLevel | null;
  score: number;
  promoCount: number;
  heavyCount: number;
} {
  const scored = posts
    .map((p) => ({ post: p, ...scoreOrganicPost(p) }))
    .filter((s) => s.post.salesImpactRole !== "after");

  if (scored.length === 0) {
    return { level: null, score: 0, promoCount: 0, heavyCount: 0 };
  }

  const ranked = [...scored].sort((a, b) => b.points - a.points);
  const top = ranked.slice(0, 8);

  let score = 0;
  top.forEach((s, i) => {
    const fade = 1 - i * 0.08;
    score += s.points * Math.max(0.4, fade);
  });

  const channels = new Set(scored.map((s) => s.post.channel));
  if (channels.size >= 3) score += 2;
  else if (channels.size === 2) score += 1;

  if (scored.length >= 12) score += 2;
  else if (scored.length >= 5) score += 1;

  score = Math.round(score * 10) / 10;
  const heavyCount = scored.filter((s) => s.weight === "heavy").length;

  let level: OrganicImpactLevel;
  if (score >= 22) level = 5;
  else if (score >= 15) level = 4;
  else if (score >= 8) level = 3;
  else if (score >= 4) level = 2;
  else level = 1;

  return {
    level,
    score,
    promoCount: scored.length,
    heavyCount,
  };
}

export function organicImpactLevelLabel(level: OrganicImpactLevel): string {
  if (level === 5) return "zeer hoge organic impact";
  if (level === 4) return "hoge organic impact";
  if (level === 3) return "middel organic impact";
  if (level === 2) return "lage organic impact";
  return "zeer lage organic impact";
}
