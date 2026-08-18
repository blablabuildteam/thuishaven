import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { integrationLogs } from "@/lib/db/schema";

export type IntegrationLogLevel = "info" | "error";

export type IntegrationLogInput = {
  source: string;
  level: IntegrationLogLevel;
  event: string;
  message: string;
  detail?: Record<string, unknown>;
  /** Skip duplicate error within this window (ms). Default 10 min for errors. */
  throttleMs?: number;
};

export type IntegrationLogRow = {
  id: string;
  source: string;
  level: IntegrationLogLevel;
  event: string;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: Date;
};

function stripSecrets(detail?: Record<string, unknown>) {
  if (!detail) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (/token|secret|authorization|password/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Schrijft een koppelingsevent. Faalt nooit de caller. */
export async function logIntegration(
  input: IntegrationLogInput,
): Promise<void> {
  if (!hasDatabase()) {
    const line = `[${input.source}] ${input.event}: ${input.message}`;
    if (input.level === "error") console.error(line);
    else console.info(line);
    return;
  }

  try {
    const db = getDb();
    const throttle =
      input.throttleMs ?? (input.level === "error" ? 10 * 60 * 1000 : 0);
    if (throttle > 0) {
      const since = new Date(Date.now() - throttle);
      const dup = await db
        .select({ id: integrationLogs.id })
        .from(integrationLogs)
        .where(
          and(
            eq(integrationLogs.source, input.source),
            eq(integrationLogs.event, input.event),
            eq(integrationLogs.message, input.message),
            gte(integrationLogs.createdAt, since),
          ),
        )
        .limit(1);
      if (dup[0]) return;
    }

    await db.insert(integrationLogs).values({
      source: input.source,
      level: input.level,
      event: input.event,
      message: input.message.slice(0, 2000),
      detail: stripSecrets(input.detail),
    });

    await db.execute(
      sql`delete from integration_logs where created_at < now() - interval '90 days'`,
    );
  } catch (e) {
    console.error("integration log write failed", e);
  }
}

export async function listIntegrationLogs(options?: {
  limit?: number;
  source?: string;
  level?: IntegrationLogLevel;
}): Promise<IntegrationLogRow[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const limit = Math.min(options?.limit ?? 80, 200);

  const rows = await db
    .select()
    .from(integrationLogs)
    .where(
      and(
        options?.source ? eq(integrationLogs.source, options.source) : undefined,
        options?.level ? eq(integrationLogs.level, options.level) : undefined,
      ),
    )
    .orderBy(desc(integrationLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    level: r.level,
    event: r.event,
    message: r.message,
    detail: r.detail ?? null,
    createdAt: r.createdAt,
  }));
}

export async function countRecentIntegrationErrors(hours = 24): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(integrationLogs)
    .where(
      and(
        eq(integrationLogs.level, "error"),
        gte(integrationLogs.createdAt, since),
      ),
    );
  return rows[0]?.n ?? 0;
}
