import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema";

/** Stable UUID-shaped id from email (env bootstrap zonder DB). */
function stableIdFromEmail(email: string): string {
  const hex = createHash("sha256").update(`thuishaven:${email}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, "0") + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}

export type UserRole = "admin" | "member";

export type AppUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
};

const FILE_STORE = path.join(process.cwd(), ".data", "users.json");

async function readFileStore(): Promise<AppUserRecord[]> {
  try {
    const raw = await fs.readFile(FILE_STORE, "utf8");
    return JSON.parse(raw) as AppUserRecord[];
  } catch {
    return [];
  }
}

async function writeFileStore(users: AppUserRecord[]) {
  await fs.mkdir(path.dirname(FILE_STORE), { recursive: true });
  await fs.writeFile(FILE_STORE, JSON.stringify(users, null, 2), "utf8");
}

function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function adminEmailsFromEnv(): Set<string> {
  const admins = parseEmailList(process.env.AUTH_ADMIN_EMAILS);
  if (admins.length) return new Set(admins);
  // Fallback: eerste allowlist-adres is admin
  const allowed = parseEmailList(process.env.AUTH_ALLOWED_EMAILS);
  return new Set(allowed.slice(0, 1));
}

function allowedEmailsFromEnv(): string[] {
  const allowed = parseEmailList(process.env.AUTH_ALLOWED_EMAILS);
  const admins = parseEmailList(process.env.AUTH_ADMIN_EMAILS);
  const merged = [...new Set([...admins, ...allowed])];
  return merged;
}

/** Env-bootstrap users (alleen als er nog geen opgeslagen users zijn). */
function envBootstrapUsers(): AppUserRecord[] {
  const now = new Date().toISOString();
  const admins = adminEmailsFromEnv();
  const password = process.env.AUTH_PASSWORD?.trim();
  const passwordHashEnv = process.env.AUTH_PASSWORD_HASH?.trim();

  const rawJson = process.env.AUTH_USERS_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Array<{
        email: string;
        name?: string;
        password?: string;
        passwordHash?: string;
        role?: UserRole;
      }>;
      return parsed
        .map((u) => {
          const email = u.email.toLowerCase();
          return {
            id: stableIdFromEmail(email),
            email,
            name: u.name ?? email.split("@")[0] ?? email,
            passwordHash:
              u.passwordHash ??
              (u.password
                ? bcrypt.hashSync(u.password, 10)
                : passwordHashEnv ?? ""),
            role:
              u.role ?? (admins.has(email) ? ("admin" as const) : ("member" as const)),
            active: true,
            createdAt: now,
            updatedAt: now,
          };
        })
        .filter((u) => u.passwordHash);
    } catch {
      return [];
    }
  }

  const emails = allowedEmailsFromEnv();
  if (!emails.length || (!password && !passwordHashEnv)) return [];

  const hash = passwordHashEnv ?? bcrypt.hashSync(password!, 10);
  return emails.map((email) => ({
    id: stableIdFromEmail(email),
    email,
    name: email.split("@")[0] ?? email,
    passwordHash: hash,
    role: (admins.has(email) ? "admin" : "member") as UserRole,
    active: true,
    createdAt: now,
    updatedAt: now,
  }));
}

async function listFromDb(): Promise<AppUserRecord[]> {
  const db = getDb();
  const rows = await db.select().from(appUsers);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.passwordHash,
    role: r.role,
    active: r.active,
    createdByEmail: r.createdByEmail,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function listUsers(): Promise<AppUserRecord[]> {
  if (hasDatabase()) {
    try {
      return await listFromDb();
    } catch (e) {
      console.error("listUsers db error", e);
    }
  }
  const fileUsers = await readFileStore();
  if (fileUsers.length) return fileUsers;
  return envBootstrapUsers();
}

export async function findUserByEmail(
  email: string,
): Promise<AppUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const users = await listUsers();
  return users.find((u) => u.email === normalized && u.active) ?? null;
}

export async function verifyUserPassword(
  user: AppUserRecord,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  createdByEmail: string;
}): Promise<{ ok: true; user: AppUserRecord } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Ongeldig e-mailadres" };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Wachtwoord minimaal 8 tekens" };
  }

  const existing = await listUsers();
  if (existing.some((u) => u.email === email)) {
    return { ok: false, error: "Dit e-mailadres bestaat al" };
  }

  const now = new Date().toISOString();
  const record: AppUserRecord = {
    id: randomUUID(),
    email,
    name: input.name.trim() || email.split("@")[0] || email,
    passwordHash: await bcrypt.hash(input.password, 10),
    role: input.role,
    active: true,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    updatedAt: now,
  };

  if (hasDatabase()) {
    try {
      const db = getDb();
      await db.insert(appUsers).values({
        id: record.id,
        email: record.email,
        name: record.name,
        passwordHash: record.passwordHash,
        role: record.role,
        active: true,
        createdByEmail: record.createdByEmail,
      });
      return { ok: true, user: record };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Databasefout bij aanmaken",
      };
    }
  }

  // Lokaal / zonder Postgres: file store
  const next = [...(await readFileStore())];
  if (!next.length) {
    // seed env users first so we don't lose bootstrap admins
    next.push(...envBootstrapUsers().filter((u) => u.email !== email));
  }
  next.push(record);
  await writeFileStore(next);
  return { ok: true, user: record };
}

export async function setUserActive(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (hasDatabase()) {
    try {
      const db = getDb();
      await db
        .update(appUsers)
        .set({ active, updatedAt: new Date() })
        .where(eq(appUsers.id, id));
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Databasefout",
      };
    }
  }

  const users = await readFileStore();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) {
    // might be env-only user — persist all + patch
    const all = await listUsers();
    const i = all.findIndex((u) => u.id === id);
    if (i < 0) return { ok: false, error: "Gebruiker niet gevonden" };
    all[i] = { ...all[i], active, updatedAt: new Date().toISOString() };
    await writeFileStore(all);
    return { ok: true };
  }
  users[idx] = {
    ...users[idx],
    active,
    updatedAt: new Date().toISOString(),
  };
  await writeFileStore(users);
  return { ok: true };
}

export function publicUser(user: AppUserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    createdByEmail: user.createdByEmail ?? null,
  };
}
