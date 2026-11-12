/** Compute follower growth from radar_metric_snapshots. */

export type MetricPoint = {
  platform: string;
  capturedAt: string | Date;
  metrics: Record<string, number | string | null>;
};

export type FollowerDelta = {
  platform: string;
  latest: number;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  latestAt: Date;
  previousAt: Date | null;
};

function followersOf(m: MetricPoint): number | null {
  const v = m.metrics.followers ?? m.metrics.followerCount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

/**
 * Latest vs oldest snapshot older than ~5 days (prefer ~7–30d lookback).
 */
export function followerDeltas(
  points: MetricPoint[],
  platforms: string[] = ["resident_advisor", "instagram", "soundcloud", "spotify"],
): FollowerDelta[] {
  const out: FollowerDelta[] = [];
  const minAgeMs = 5 * 24 * 60 * 60 * 1000;

  for (const platform of platforms) {
    const rows = points
      .filter((p) => p.platform === platform)
      .map((p) => ({
        at: new Date(p.capturedAt),
        followers: followersOf(p),
      }))
      .filter((r): r is { at: Date; followers: number } => r.followers != null)
      .sort((a, b) => b.at.getTime() - a.at.getTime());

    if (rows.length === 0) continue;
    const latest = rows[0]!;
    const older = rows.find(
      (r) => latest.at.getTime() - r.at.getTime() >= minAgeMs,
    );
    const previous = older ?? (rows.length > 1 ? rows[rows.length - 1]! : null);
    const samePoint = previous && previous.at.getTime() === latest.at.getTime();
    const prev = samePoint ? null : previous;

    const delta =
      prev != null ? latest.followers - prev.followers : null;
    const deltaPct =
      delta != null && prev && prev.followers > 0
        ? (delta / prev.followers) * 100
        : null;

    out.push({
      platform,
      latest: latest.followers,
      previous: prev?.followers ?? null,
      delta,
      deltaPct,
      latestAt: latest.at,
      previousAt: prev?.at ?? null,
    });
  }

  return out;
}

export function formatDelta(d: FollowerDelta): string {
  if (d.delta == null) {
    return `${d.latest.toLocaleString("nl-NL")} volgers`;
  }
  const sign = d.delta > 0 ? "+" : "";
  const pct =
    d.deltaPct != null ? ` (${sign}${d.deltaPct.toFixed(1)}%)` : "";
  return `${d.latest.toLocaleString("nl-NL")} · ${sign}${d.delta.toLocaleString("nl-NL")}${pct}`;
}

export function labelsFromProfiles(
  profiles: Array<{ platform: string; raw?: Record<string, unknown> | null }>,
): string[] {
  const ra = profiles.find((p) => p.platform === "resident_advisor");
  const labels = ra?.raw?.labels;
  if (!Array.isArray(labels)) return [];
  return labels
    .map((l) => {
      if (typeof l === "string") return l;
      if (l && typeof l === "object" && "name" in l) {
        return String((l as { name: unknown }).name ?? "");
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 8);
}
