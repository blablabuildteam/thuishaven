import { unstable_cache, revalidateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { integrationCredentials } from "@/lib/db/schema";
import {
  listIntegrationStatusSnapshot,
  verifyIntegration,
} from "@/lib/integrations/verify";
import { amsterdamHour } from "@/lib/integrations/cron";
import {
  MONITORS,
  cronSourceOf,
  type MonitorDef,
  type MonitorSchedule,
} from "./monitors";
import type {
  HealthIssueKind,
  HealthSeverity,
  MonitorHealth,
  SystemHealth,
} from "./types";

/** Live API probes are the expensive part; ask each service at most this often. */
const PROBE_REVALIDATE_SEC = 15 * 60;
/** DB-derived state (cron runs, tokens) is cheap. */
const HEALTH_REVALIDATE_SEC = 2 * 60;
/** Allow a cron this long after its slot before we count the slot as due. */
const SLOT_GRACE_MS = 30 * 60 * 1000;
const TOKEN_WARN_DAYS = 14;
const KOPPELINGEN = "Controleer of herstel de koppeling via Systeem → Bronnen.";

type ProbeRow = { id: string; status: string; message: string };
type RunRow = {
  source: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};
type CredRow = {
  provider: string;
  hasRefresh: boolean;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
};

/* ─── Inputs ──────────────────────────────────────────────────────────── */

async function runProbes(): Promise<ProbeRow[]> {
  const snapshot = listIntegrationStatusSnapshot();
  const configured = new Set(
    snapshot
      .filter((r) => !["missing", "manual", "on_hold"].includes(r.status))
      .map((r) => r.id),
  );
  const ids = MONITORS.map((m) => m.integrationId).filter(
    (id): id is string => Boolean(id && configured.has(id)),
  );
  return Promise.all(
    ids.map(async (id) => {
      try {
        const r = await verifyIntegration(id);
        return { id, status: r.status, message: r.message };
      } catch (e) {
        return {
          id,
          status: "error",
          message: e instanceof Error ? e.message : "Check crashte",
        };
      }
    }),
  );
}

const cachedProbes = unstable_cache(runProbes, ["system-health-probes-v1"], {
  revalidate: PROBE_REVALIDATE_SEC,
  tags: ["system-health"],
});

async function loadRuns(): Promise<{ recent: RunRow[]; lastSuccess: Map<string, string> }> {
  const db = getDb();
  const recent = (await db.execute(sql`
    select source, status, started_at, finished_at, error from (
      select source, status, started_at, finished_at, error,
        row_number() over (partition by source order by started_at desc) as rn
      from sync_jobs
      where started_at > now() - interval '30 days'
    ) t
    where rn <= 3
    order by source, started_at desc
  `)) as unknown as Array<Record<string, unknown>>;
  const success = (await db.execute(sql`
    select source, max(coalesce(finished_at, started_at)) as at
    from sync_jobs
    where status in ('ok', 'partial')
    group by source
  `)) as unknown as Array<Record<string, unknown>>;

  const iso = (v: unknown) =>
    v == null ? null : new Date(v as string | Date).toISOString();
  return {
    recent: recent.map((r) => ({
      source: String(r.source),
      status: String(r.status),
      startedAt: iso(r.started_at),
      finishedAt: iso(r.finished_at),
      error: (r.error as string | null) ?? null,
    })),
    lastSuccess: new Map(
      success.map((r) => [String(r.source), iso(r.at) ?? ""]),
    ),
  };
}

async function loadCredentials(): Promise<CredRow[]> {
  const rows = await getDb()
    .select({
      provider: integrationCredentials.provider,
      refreshToken: integrationCredentials.refreshToken,
      accessToken: integrationCredentials.accessToken,
      accessExpiresAt: integrationCredentials.accessExpiresAt,
      refreshExpiresAt: integrationCredentials.refreshExpiresAt,
    })
    .from(integrationCredentials);
  return rows
    .filter((r) => r.accessToken || r.refreshToken)
    .map((r) => ({
      provider: r.provider,
      hasRefresh: Boolean(r.refreshToken),
      accessExpiresAt: r.accessExpiresAt?.toISOString() ?? null,
      refreshExpiresAt: r.refreshExpiresAt?.toISOString() ?? null,
    }));
}

/* ─── Schedule maths ─────────────────────────────────────────────────── */

/**
 * The n-th most recent moment this job should have run (n=1: latest slot).
 * Hours are Europe/Amsterdam local hours, so this is DST-proof.
 */
export function nthPreviousSlot(
  schedule: MonitorSchedule,
  now: Date,
  n: number,
): Date {
  const ref = now.getTime() - SLOT_GRACE_MS;
  if (schedule.kind === "interval") {
    return new Date(ref - (n - 1) * schedule.minutes * 60_000);
  }
  const t = new Date(ref);
  t.setUTCMinutes(0, 0, 0);
  let found = 0;
  for (let i = 0; i < 24 * 4; i++) {
    if ((schedule.hours as readonly number[]).includes(amsterdamHour(t))) {
      found++;
      if (found === n) return t;
    }
    t.setTime(t.getTime() - 3600_000);
  }
  return t;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/* ─── Evaluation ─────────────────────────────────────────────────────── */

type Finding = {
  severity: Exclude<HealthSeverity, "ok">;
  kind: HealthIssueKind;
  detail: string;
  action: string;
};

export function evaluateMonitor(
  def: MonitorDef,
  now: Date,
  probe: ProbeRow | undefined,
  runs: RunRow[],
  lastSuccessAt: string | null,
  cred: CredRow | undefined,
): MonitorHealth {
  const findings: Finding[] = [];

  if (probe?.status === "error") {
    findings.push({
      severity: "down",
      kind: "auth",
      detail: `Live check mislukt: ${probe.message}`,
      action: KOPPELINGEN,
    });
  }

  if (cred) {
    const expiry = cred.hasRefresh ? cred.refreshExpiresAt : cred.accessExpiresAt;
    // Epoch 0 = "never expires" (Meta long-lived page tokens).
    if (expiry && new Date(expiry).getTime() > 0) {
      const days = Math.floor(
        (new Date(expiry).getTime() - now.getTime()) / 86_400_000,
      );
      if (days < 0) {
        findings.push({
          severity: "down",
          kind: "token_expired",
          detail: `Token verlopen op ${fmtTime(expiry)}.`,
          action: "Koppel opnieuw via Systeem → Bronnen.",
        });
      } else if (days <= (def.tokenWarnDays ?? TOKEN_WARN_DAYS)) {
        findings.push({
          severity: "degraded",
          kind: "token_expiring",
          detail: `Token verloopt over ${days} ${days === 1 ? "dag" : "dagen"} (${fmtTime(expiry)}).`,
          action: "Koppel opnieuw via Systeem → Bronnen voordat het token verloopt.",
        });
      }
    }
  }

  // Latest finished run; a "running" row past maxDuration was killed by a timeout.
  const timeoutMs = ((def.maxDurationSec ?? 300) + 120) * 1000;
  let latest: (RunRow & { timedOut?: boolean }) | undefined;
  for (const run of runs) {
    if (run.status === "running") {
      const started = run.startedAt ? new Date(run.startedAt).getTime() : 0;
      if (now.getTime() - started > timeoutMs) {
        latest = { ...run, timedOut: true };
        break;
      }
      continue; // still running: judge by the run before it
    }
    latest = run;
    break;
  }

  if (latest?.timedOut || latest?.status === "failed") {
    const reason = latest.timedOut
      ? `Run van ${fmtTime(latest.startedAt)} is niet afgerond (time-out na ${def.maxDurationSec ?? 300}s).`
      : `Laatste sync (${fmtTime(latest.finishedAt ?? latest.startedAt)}) mislukt: ${latest.error ?? "geen foutmelding"}`;
    findings.push({
      severity: "down",
      kind: "sync_failed",
      detail: reason,
      action: `${KOPPELINGEN} Details staan in Systeem → Log.`,
    });
  } else if (latest?.status === "partial") {
    findings.push({
      severity: "degraded",
      kind: "sync_partial",
      detail: `Laatste sync (${fmtTime(latest.finishedAt)}) deels gelukt: ${latest.error ?? ""}`.trim(),
      action: "Bekijk Systeem → Log voor de mislukte onderdelen.",
    });
  }

  // Stale: two scheduled slots passed without a successful run. Only judged
  // once the job has history, so a fresh deploy doesn't light up everything.
  if (def.schedule && runs.length > 0) {
    const due = nthPreviousSlot(def.schedule, now, 2);
    const last = lastSuccessAt ? new Date(lastSuccessAt) : null;
    if (!last || last < due) {
      findings.push({
        severity: "degraded",
        kind: "stale",
        detail: last
          ? `Geen geslaagde sync sinds ${fmtTime(lastSuccessAt)}; er zijn sindsdien minstens twee runs gemist of mislukt.`
          : "Nog nooit een geslaagde sync.",
        action: "Controleer of de cron in Vercel draait en kijk in Systeem → Log.",
      });
    }
  }

  const worst =
    findings.find((f) => f.severity === "down") ?? findings[0] ?? null;

  return {
    id: def.id,
    label: def.label,
    severity: worst?.severity ?? "ok",
    kind: worst?.kind ?? null,
    impact: def.impact,
    detail: findings.map((f) => f.detail).join(" "),
    action: worst?.action,
    pages: def.pages,
    lastSuccessAt,
    lastRunAt: runs[0]?.startedAt ?? null,
  };
}

async function computeHealth(): Promise<SystemHealth> {
  const now = new Date();
  const checkedAt = now.toISOString();

  if (!hasDatabase()) {
    return { checkedAt, severity: "ok", issues: [], freshness: {} };
  }

  let dbError: string | null = null;
  const [probes, runs, creds] = await Promise.all([
    cachedProbes().catch(() => [] as ProbeRow[]),
    loadRuns().catch((e) => {
      dbError = e instanceof Error ? e.message : String(e);
      return { recent: [] as RunRow[], lastSuccess: new Map<string, string>() };
    }),
    loadCredentials().catch(() => [] as CredRow[]),
  ]);

  const probeById = new Map(probes.map((p) => [p.id, p]));
  if (dbError && !probeById.get("database")) {
    probeById.set("database", { id: "database", status: "error", message: dbError });
  }
  const credByProvider = new Map(creds.map((c) => [c.provider, c]));

  // Not configured / parked integrations are a setup task (see Bronnen),
  // not an outage: their crons fail by design until keys are added.
  const inactive = new Set(
    listIntegrationStatusSnapshot()
      .filter((r) => ["missing", "manual", "on_hold"].includes(r.status))
      .map((r) => r.id),
  );

  const monitors = MONITORS.filter(
    (def) => !def.integrationId || !inactive.has(def.integrationId),
  ).map((def) => {
    const source = cronSourceOf(def);
    return evaluateMonitor(
      def,
      now,
      def.integrationId ? probeById.get(def.integrationId) : undefined,
      def.schedule ? runs.recent.filter((r) => r.source === source) : [],
      def.schedule ? (runs.lastSuccess.get(source) ?? null) : null,
      def.credentialProvider ? credByProvider.get(def.credentialProvider) : undefined,
    );
  });

  const issues = monitors.filter((m) => m.severity !== "ok");
  const severity: HealthSeverity = issues.some((m) => m.severity === "down")
    ? "down"
    : issues.length
      ? "degraded"
      : "ok";

  const freshness: SystemHealth["freshness"] = {};
  for (const m of monitors) {
    if (m.lastRunAt || m.lastSuccessAt) {
      freshness[m.id] = { label: m.label, lastSuccessAt: m.lastSuccessAt };
    }
  }

  return { checkedAt, severity, issues, freshness };
}

const cachedHealth = unstable_cache(computeHealth, ["system-health-v1"], {
  revalidate: HEALTH_REVALIDATE_SEC,
  tags: ["system-health"],
});

/** Cached system health. Never throws. */
export async function getSystemHealth(options?: { fresh?: boolean }): Promise<SystemHealth> {
  try {
    if (options?.fresh) {
      revalidateTag("system-health", { expire: 0 });
      return await computeHealth();
    }
    return await cachedHealth();
  } catch (e) {
    console.error("system health check crashed", e);
    return {
      checkedAt: new Date().toISOString(),
      severity: "ok",
      issues: [],
      freshness: {},
    };
  }
}
