import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { appUsers, authTokens } from "@/lib/db/schema";

export type AuthTokenType = "invite" | "password_reset";

export type AuthTokenRecord = {
  id: string;
  userId: string;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

const FILE_STORE = ".data/auth-tokens.json";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function ttlHours(type: AuthTokenType): number {
  if (type === "invite") {
    const raw = Number(process.env.AUTH_INVITE_TTL_HOURS ?? "168");
    return Number.isFinite(raw) && raw > 0 ? raw : 168;
  }
  const raw = Number(process.env.AUTH_RESET_TTL_HOURS ?? "1");
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

async function readFileTokens(): Promise<AuthTokenRecord[]> {
  try {
    const { promises: fs } = await import("fs");
    const path = await import("path");
    const raw = await fs.readFile(
      path.join(process.cwd(), FILE_STORE),
      "utf8",
    );
    return JSON.parse(raw) as AuthTokenRecord[];
  } catch {
    return [];
  }
}

async function writeFileTokens(tokens: AuthTokenRecord[]) {
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const file = path.join(process.cwd(), FILE_STORE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(tokens, null, 2), "utf8");
}

export async function invalidateAuthTokens(
  userId: string,
  type: AuthTokenType,
): Promise<void> {
  const now = new Date();
  if (hasDatabase()) {
    const db = getDb();
    await db
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.type, type),
          isNull(authTokens.usedAt),
        ),
      );
    return;
  }
  const tokens = await readFileTokens();
  const next = tokens.map((t) =>
    t.userId === userId && t.type === type && !t.usedAt
      ? { ...t, usedAt: now.toISOString() }
      : t,
  );
  await writeFileTokens(next);
}

export async function createAuthToken(input: {
  userId: string;
  type: AuthTokenType;
}): Promise<{ rawToken: string; expiresAt: Date }> {
  await invalidateAuthTokens(input.userId, input.type);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlHours(input.type) * 60 * 60 * 1000);
  const now = new Date();

  if (hasDatabase()) {
    const db = getDb();
    await db.insert(authTokens).values({
      userId: input.userId,
      type: input.type,
      tokenHash,
      expiresAt,
    });
    return { rawToken, expiresAt };
  }

  const tokens = await readFileTokens();
  tokens.push({
    id: randomBytes(16).toString("hex"),
    userId: input.userId,
    type: input.type,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
    createdAt: now.toISOString(),
  });
  await writeFileTokens(tokens);
  return { rawToken, expiresAt };
}

export async function consumeAuthToken(
  rawToken: string,
  type: AuthTokenType,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: "invalid" | "expired" | "used" }
> {
  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  if (hasDatabase()) {
    const db = getDb();
    const rows = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.type, type)))
      .limit(1);
    const row = rows[0];
    if (!row) return { ok: false, error: "invalid" };
    if (row.usedAt) return { ok: false, error: "used" };
    if (row.expiresAt.getTime() < now.getTime()) {
      return { ok: false, error: "expired" };
    }
    await db
      .update(authTokens)
      .set({ usedAt: now })
      .where(eq(authTokens.id, row.id));
    return { ok: true, userId: row.userId };
  }

  const tokens = await readFileTokens();
  const idx = tokens.findIndex(
    (t) => t.tokenHash === tokenHash && t.type === type,
  );
  if (idx < 0) return { ok: false, error: "invalid" };
  const row = tokens[idx];
  if (row.usedAt) return { ok: false, error: "used" };
  if (new Date(row.expiresAt).getTime() < now.getTime()) {
    return { ok: false, error: "expired" };
  }
  tokens[idx] = { ...row, usedAt: now.toISOString() };
  await writeFileTokens(tokens);
  return { ok: true, userId: row.userId };
}

export async function peekAuthToken(
  rawToken: string,
  type: AuthTokenType,
): Promise<
  | { ok: true; userId: string; userEmail: string; userName: string }
  | { ok: false; error: "invalid" | "expired" | "used" }
> {
  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  let userId: string | null = null;
  let usedAt: Date | null = null;
  let expiresAt: Date | null = null;

  if (hasDatabase()) {
    const db = getDb();
    const rows = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.type, type)))
      .limit(1);
    const row = rows[0];
    if (!row) return { ok: false, error: "invalid" };
    userId = row.userId;
    usedAt = row.usedAt;
    expiresAt = row.expiresAt;
  } else {
    const tokens = await readFileTokens();
    const row = tokens.find(
      (t) => t.tokenHash === tokenHash && t.type === type,
    );
    if (!row) return { ok: false, error: "invalid" };
    userId = row.userId;
    usedAt = row.usedAt ? new Date(row.usedAt) : null;
    expiresAt = new Date(row.expiresAt);
  }

  if (usedAt) return { ok: false, error: "used" };
  if (!expiresAt || expiresAt.getTime() < now.getTime()) {
    return { ok: false, error: "expired" };
  }

  if (hasDatabase()) {
    const db = getDb();
    const users = await db
      .select({ email: appUsers.email, name: appUsers.name })
      .from(appUsers)
      .where(eq(appUsers.id, userId!))
      .limit(1);
    const user = users[0];
    if (!user) return { ok: false, error: "invalid" };
    return {
      ok: true,
      userId: userId!,
      userEmail: user.email,
      userName: user.name,
    };
  }

  const { findUserById } = await import("@/lib/auth/users");
  const user = await findUserById(userId!);
  if (!user) return { ok: false, error: "invalid" };
  return {
    ok: true,
    userId: userId!,
    userEmail: user.email,
    userName: user.name,
  };
}
