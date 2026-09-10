import type { Session } from "next-auth";
import { logActivity, toolFromPath, type ActivityTool } from "@/lib/audit/activity";

/** Log a successful (or failed) tools API action for the admin activity feed. */
export async function logSessionActivity(
  session: Session | null,
  input: {
    action: string;
    summary: string;
    path?: string;
    method?: string;
    status?: number;
    tool?: ActivityTool;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const email = session?.user?.email;
  if (!email) return;
  const path = input.path ?? "";
  await logActivity({
    userId: session?.user?.id,
    userEmail: email,
    userName: session?.user?.name,
    tool: input.tool ?? (path ? toolFromPath(path) : "shared"),
    action: input.action,
    summary: input.summary,
    path: input.path,
    method: input.method,
    status: input.status,
    meta: input.meta,
  });
}
