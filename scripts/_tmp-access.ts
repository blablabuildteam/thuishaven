import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers as users } from "@/lib/db/schema";
import { writeFileSync, readFileSync } from "node:fs";
const BACKUP = "/tmp/agent-test-access.json";
async function main() {
  const db = getDb();
  const email = "agent-test@blablabuild.com";
  const [u] = await db.select({ toolAccess: users.toolAccess, role: users.role }).from(users).where(eq(users.email, email));
  if (process.argv[2] === "grant") {
    writeFileSync(BACKUP, JSON.stringify(u.toolAccess ?? null));
    const next = { ...(u.toolAccess ?? {}), dashboard: true, outreach: true } as typeof u.toolAccess;
    await db.update(users).set({ toolAccess: next }).where(eq(users.email, email));
    console.log("granted; role", u.role, "before", JSON.stringify(u.toolAccess));
  } else {
    const prev = JSON.parse(readFileSync(BACKUP, "utf8"));
    await db.update(users).set({ toolAccess: prev }).where(eq(users.email, email));
    console.log("restored", JSON.stringify(prev));
  }
  process.exit(0);
}
main();
