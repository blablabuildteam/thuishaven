import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { syncJobs } from "@/lib/db/schema";
import { logIntegration } from "@/lib/integrations/log";

export type CronRunStatus = "ok" | "partial" | "failed";

export type CronOutcome = {
  status: CronRunStatus;
  error?: string | null;
  meta?: Record<string, unknown>;
};

type Options<T> = {
  /** Map the job's result to ok / partial / failed. Default: result.ok. */
  outcome?: (result: T) => CronOutcome;
  /**
   * Also write a cron.failed line to integration_logs for a failed result.
   * Off for routes that already log their own result.
   */
  logFailure?: boolean;
  /** integration_logs source (defaults to the cron source). */
  logSource?: string;
};

export type CronRun<T> =
  | { ok: true; result: T; outcome: CronOutcome }
  | { ok: false; result: null; outcome: CronOutcome };

function defaultOutcome(result: unknown): CronOutcome {
  const r = result as { ok?: boolean; error?: string | null };
  return r?.ok === false
    ? { status: "failed", error: r.error ?? "Mislukt zonder foutmelding" }
    : { status: "ok" };
}

async function startRow(source: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  try {
    const [row] = await getDb()
      .insert(syncJobs)
      .values({ source, status: "running", startedAt: new Date() })
      .returning({ id: syncJobs.id });
    return row?.id ?? null;
  } catch (e) {
    console.error(`[cron-run] could not record start for ${source}`, e);
    return null;
  }
}

async function finishRow(id: string | null, outcome: CronOutcome) {
  if (!id) return;
  try {
    await getDb()
      .update(syncJobs)
      .set({
        status: outcome.status,
        finishedAt: new Date(),
        error: outcome.error ? outcome.error.slice(0, 2000) : null,
        meta: outcome.meta ?? {},
      })
      .where(eq(syncJobs.id, id));
  } catch (e) {
    console.error(`[cron-run] could not record finish`, e);
  }
}

/**
 * Runs one cron job and records it in sync_jobs, so the health check can
 * tell "last run failed", "timed out" (row stuck on running) and "has not run
 * for too long" apart. Never throws: a crash becomes a failed run.
 */
export async function runCron<T>(
  source: string,
  job: () => Promise<T>,
  options: Options<T> = {},
): Promise<CronRun<T>> {
  const id = await startRow(source);
  const logSource = options.logSource ?? source;
  try {
    const result = await job();
    const outcome = (options.outcome ?? defaultOutcome)(result);
    await finishRow(id, outcome);
    if (outcome.status === "failed" && options.logFailure) {
      await logIntegration({
        source: logSource,
        level: "error",
        event: "cron.failed",
        message: outcome.error ?? `Cron ${source} mislukt`,
        detail: { trigger: "vercel-cron", ...outcome.meta },
      });
    }
    return { ok: true, result, outcome };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const outcome: CronOutcome = { status: "failed", error: message };
    await finishRow(id, outcome);
    await logIntegration({
      source: logSource,
      level: "error",
      event: "cron.crashed",
      message: `Cron ${source} crashte: ${message}`,
      detail: { trigger: "vercel-cron" },
    });
    console.error(`[${source}] cron.crashed`, e);
    return { ok: false, result: null, outcome };
  }
}

/** Standard 500 for a crashed run. */
export function cronCrashResponse(source: string, outcome: CronOutcome) {
  return NextResponse.json(
    { ok: false, trigger: "vercel-cron", source, error: outcome.error },
    { status: 500 },
  );
}
