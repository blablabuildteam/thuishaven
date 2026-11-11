import { MONITORS } from "./monitors";
import type { HealthIssueKind, MonitorHealth, SystemHealth } from "./types";

/**
 * Local testing only: fake problems so the notice and page warnings can be
 * seen without breaking a real integration. Spec examples:
 *   "weeztix"                    → Weeztix down (last sync failed)
 *   "weeztix:down,instagram:stale"
 *   "brevo:token_expiring"
 * Kinds: down (= sync_failed), auth, stale, partial, token_expiring, token_expired.
 */
const KIND_MAP: Record<string, { kind: HealthIssueKind; severity: "down" | "degraded"; detail: string }> = {
  down: { kind: "sync_failed", severity: "down", detail: "Laatste sync mislukt: HTTP 401 (gesimuleerd)." },
  auth: { kind: "auth", severity: "down", detail: "Live check mislukt: token geweigerd (gesimuleerd)." },
  token_expired: { kind: "token_expired", severity: "down", detail: "Token verlopen (gesimuleerd)." },
  stale: { kind: "stale", severity: "degraded", detail: "Geen geslaagde sync sinds 2 slots (gesimuleerd)." },
  partial: { kind: "sync_partial", severity: "degraded", detail: "Laatste sync deels gelukt (gesimuleerd)." },
  token_expiring: { kind: "token_expiring", severity: "degraded", detail: "Token verloopt over 5 dagen (gesimuleerd)." },
};

export function simulateHealth(spec: string): SystemHealth {
  const now = Date.now();
  const issues: MonitorHealth[] = [];
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, kindKey = "down"] = part.split(":");
    const def = MONITORS.find((m) => m.id === id);
    const kind = KIND_MAP[kindKey];
    if (!def || !kind) continue;
    issues.push({
      id: def.id,
      label: def.label,
      severity: kind.severity,
      kind: kind.kind,
      impact: def.impact,
      detail: kind.detail,
      action: "Controleer of herstel de koppeling via Systeem → Bronnen.",
      pages: def.pages,
      lastSuccessAt: new Date(now - 5 * 3600_000).toISOString(),
      lastRunAt: new Date(now - 20 * 60_000).toISOString(),
    });
  }
  return {
    checkedAt: new Date(now).toISOString(),
    severity: issues.some((i) => i.severity === "down")
      ? "down"
      : issues.length
        ? "degraded"
        : "ok",
    issues,
    freshness: {},
  };
}
