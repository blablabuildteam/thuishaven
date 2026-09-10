import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { activityEvents } from "@/lib/db/schema";

export type ActivityTool =
  | "outreach"
  | "dashboard"
  | "admin"
  | "shared"
  | "auth";

export type LogActivityInput = {
  userId?: string | null;
  userEmail: string;
  userName?: string | null;
  tool?: ActivityTool;
  action: string;
  summary: string;
  path?: string | null;
  method?: string | null;
  status?: number | null;
  meta?: Record<string, unknown>;
};

export type ActivityEventRow = {
  id: string;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  tool: string;
  action: string;
  summary: string;
  path: string | null;
  method: string | null;
  status: number | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

function stripSecrets(detail?: Record<string, unknown>) {
  if (!detail) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (/token|secret|authorization|password|api[_-]?key/i.test(k)) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function toolFromPath(path: string): ActivityTool {
  if (path.startsWith("/outreach") || path.startsWith("/api/outreach")) {
    return "outreach";
  }
  if (path.startsWith("/dashboard") || path.startsWith("/api/dashboard")) {
    return "dashboard";
  }
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    return "admin";
  }
  if (path.startsWith("/api/auth") || path === "/login") return "auth";
  return "shared";
}

/** Fail-soft activity write. Never throws to callers. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  const email = input.userEmail.trim().toLowerCase();
  if (!email) return;

  if (!hasDatabase()) {
    console.info(
      `[activity] ${email} · ${input.action}: ${input.summary}`,
    );
    return;
  }

  try {
    const db = getDb();
    await db.insert(activityEvents).values({
      userId: input.userId ?? null,
      userEmail: email,
      userName: input.userName?.trim() || null,
      tool: input.tool ?? "shared",
      action: input.action.slice(0, 120),
      summary: input.summary.slice(0, 2000),
      path: input.path?.slice(0, 500) ?? null,
      method: input.method?.slice(0, 16) ?? null,
      status: input.status ?? null,
      meta: stripSecrets(input.meta),
    });

    await db.execute(
      sql`delete from activity_events where created_at < now() - interval '180 days'`,
    );
  } catch (e) {
    console.error("activity log write failed", e);
  }
}

export async function listActivityEvents(options?: {
  limit?: number;
  tool?: string;
  userEmail?: string;
  sinceDays?: number;
}): Promise<ActivityEventRow[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const limit = Math.min(options?.limit ?? 100, 300);
  const sinceDays = options?.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(activityEvents)
    .where(
      and(
        gte(activityEvents.createdAt, since),
        options?.tool ? eq(activityEvents.tool, options.tool) : undefined,
        options?.userEmail
          ? eq(activityEvents.userEmail, options.userEmail.toLowerCase())
          : undefined,
      ),
    )
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.userEmail,
    userName: r.userName,
    tool: r.tool,
    action: r.action,
    summary: r.summary,
    path: r.path,
    method: r.method,
    status: r.status,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
