import { createHash, randomBytes, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authEmailDomainError, isAllowedAuthEmail } from "@/lib/auth/domains";
import { createAuthToken } from "@/lib/auth/tokens";
import { sendInviteEmail } from "@/lib/auth/mail";
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
  emailVerifiedAt: string | null;
  inviteSentAt: string | null;
  passwordSetAt: string | null;
  createdByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
};

const FILE_STORE = path.join(process.cwd(), ".data", "users.json");

async function readFileStore(): Promise<AppUserRecord[]> {
  try {
    const raw = await fs.readFile(FILE_STORE, "utf8");
    const parsed = JSON.parse(raw) as AppUserRecord[];
    return parsed.map((u) => ({
      ...u,
      emailVerifiedAt: u.emailVerifiedAt ?? (u.active ? u.createdAt : null),
      inviteSentAt: u.inviteSentAt ?? null,
      passwordSetAt: u.passwordSetAt ?? null,
    }));
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
    .map((e) => e.trim().toLowerCase().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function adminEmailsFromEnv(): Set<string> {
  const admins = parseEmailList(process.env.AUTH_ADMIN_EMAILS);
  if (admins.length) return new Set(admins);
  const allowed = parseEmailList(process.env.AUTH_ALLOWED_EMAILS);
  return new Set(allowed.slice(0, 1));
}

function allowedEmailsFromEnv(): string[] {
  const allowed = parseEmailList(process.env.AUTH_ALLOWED_EMAILS);
  const admins = parseEmailList(process.env.AUTH_ADMIN_EMAILS);
  return [...new Set([...admins, ...allowed])];
}

function mapDbRow(r: typeof appUsers.$inferSelect): AppUserRecord {
  const createdAt = r.createdAt.toISOString();
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.passwordHash,
    role: r.role,
    active: r.active,
    emailVerifiedAt:
      r.emailVerifiedAt?.toISOString() ?? (r.active ? createdAt : null),
    inviteSentAt: r.inviteSentAt?.toISOString() ?? null,
    passwordSetAt: r.passwordSetAt?.toISOString() ?? null,
    createdByEmail: r.createdByEmail,
    createdAt,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function randomPlaceholderHash(): string {
  return bcrypt.hashSync(randomBytes(32).toString("hex"), 10);
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
            emailVerifiedAt: now,
            inviteSentAt: null,
            passwordSetAt: now,
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
    emailVerifiedAt: now,
    inviteSentAt: null,
    passwordSetAt: now,
    createdAt: now,
    updatedAt: now,
  }));
}

async function listFromDb(): Promise<AppUserRecord[]> {
  const db = getDb();
  const rows = await db.select().from(appUsers);
  return rows.map(mapDbRow);
}

async function seedEnvUsersToDb(): Promise<AppUserRecord[]> {
  const bootstrap = envBootstrapUsers();
  if (!bootstrap.length) return [];

  const db = getDb();
  const now = new Date();
  for (const user of bootstrap) {
    await db
      .insert(appUsers)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        role: user.role,
        active: true,
        emailVerifiedAt: now,
        passwordSetAt: now,
        createdByEmail: "env-bootstrap",
      })
      .onConflictDoNothing({ target: appUsers.email });
  }
  return listFromDb();
}

export async function syncEnvPasswordToDb(): Promise<number> {
  if (!hasDatabase()) return 0;
  const password = process.env.AUTH_PASSWORD?.trim();
  if (!password) return 0;
  const emails = allowedEmailsFromEnv();
  if (!emails.length) return 0;

  const hash = await bcrypt.hash(password, 10);
  const db = getDb();
  let updated = 0;
  for (const email of emails) {
    const result = await db
      .update(appUsers)
      .set({
        passwordHash: hash,
        updatedAt: new Date(),
        active: true,
        emailVerifiedAt: new Date(),
        passwordSetAt: new Date(),
      })
      .where(eq(appUsers.email, email))
      .returning({ id: appUsers.id });
    updated += result.length;
  }
  return updated;
}

export async function listUsers(): Promise<AppUserRecord[]> {
  if (hasDatabase()) {
    try {
      const rows = await listFromDb();
      if (rows.length) return rows;
      const seeded = await seedEnvUsersToDb();
      if (seeded.length) return seeded;
    } catch (e) {
      console.error("listUsers db error", e);
    }
  }
  const fileUsers = await readFileStore();
  if (fileUsers.length) return fileUsers;
  return envBootstrapUsers();
}

export async function findUserById(id: string): Promise<AppUserRecord | null> {
  const users = await listUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function findUserByEmailIncludingInactive(
  email: string,
): Promise<AppUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const users = await listUsers();
  return users.find((u) => u.email === normalized) ?? null;
}

export async function findUserByEmail(
  email: string,
): Promise<AppUserRecord | null> {
  const user = await findUserByEmailIncludingInactive(email);
  if (!user || !user.active || !user.emailVerifiedAt) return null;
  return user;
}

export function isUserLoginReady(user: AppUserRecord): boolean {
  return user.active && Boolean(user.emailVerifiedAt);
}

export async function verifyUserPassword(
  user: AppUserRecord,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

async function persistUser(record: AppUserRecord): Promise<void> {
  if (hasDatabase()) {
    const db = getDb();
    await db
      .insert(appUsers)
      .values({
        id: record.id,
        email: record.email,
        name: record.name,
        passwordHash: record.passwordHash,
        role: record.role,
        active: record.active,
        emailVerifiedAt: record.emailVerifiedAt
          ? new Date(record.emailVerifiedAt)
          : null,
        inviteSentAt: record.inviteSentAt
          ? new Date(record.inviteSentAt)
          : null,
        passwordSetAt: record.passwordSetAt
          ? new Date(record.passwordSetAt)
          : null,
        createdByEmail: record.createdByEmail,
      })
      .onConflictDoUpdate({
        target: appUsers.email,
        set: {
          name: record.name,
          passwordHash: record.passwordHash,
          role: record.role,
          active: record.active,
          emailVerifiedAt: record.emailVerifiedAt
            ? new Date(record.emailVerifiedAt)
            : null,
          inviteSentAt: record.inviteSentAt
            ? new Date(record.inviteSentAt)
            : null,
          passwordSetAt: record.passwordSetAt
            ? new Date(record.passwordSetAt)
            : null,
          updatedAt: new Date(),
        },
      });
    return;
  }

  const next = [...(await readFileStore())];
  const idx = next.findIndex((u) => u.id === record.id || u.email === record.email);
  if (idx >= 0) next[idx] = { ...next[idx], ...record };
  else next.push(record);
  await writeFileStore(next);
}

export async function inviteUser(input: {
  email: string;
  name: string;
  role: UserRole;
  createdByEmail: string;
}): Promise<{ ok: true; user: AppUserRecord } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!isAllowedAuthEmail(email)) {
    return { ok: false, error: authEmailDomainError() };
  }

  const existing = await findUserByEmailIncludingInactive(email);
  if (existing?.emailVerifiedAt && existing.active) {
    return { ok: false, error: "Dit account is al actief" };
  }
  if (existing && !existing.emailVerifiedAt) {
    return resendInvite(existing.id, input.createdByEmail);
  }

  const now = new Date().toISOString();
  const record: AppUserRecord = {
    id: randomUUID(),
    email,
    name: input.name.trim() || email.split("@")[0] || email,
    passwordHash: randomPlaceholderHash(),
    role: input.role,
    active: false,
    emailVerifiedAt: null,
    inviteSentAt: null,
    passwordSetAt: null,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await persistUser(record);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Opslaan mislukt",
    };
  }

  return sendInviteForUser(record);
}

async function sendInviteForUser(
  user: AppUserRecord,
): Promise<{ ok: true; user: AppUserRecord } | { ok: false; error: string }> {
  const { rawToken } = await createAuthToken({ userId: user.id, type: "invite" });
  const mail = await sendInviteEmail({
    to: user.email,
    name: user.name,
    rawToken,
  });
  if (!mail.ok) return { ok: false, error: mail.error };

  const now = new Date().toISOString();
  const updated: AppUserRecord = {
    ...user,
    inviteSentAt: now,
    updatedAt: now,
  };
  await persistUser(updated);
  return { ok: true, user: updated };
}

export async function resendInvite(
  userId: string,
  _requestedByEmail: string,
): Promise<{ ok: true; user: AppUserRecord } | { ok: false; error: string }> {
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "Gebruiker niet gevonden" };
  if (user.emailVerifiedAt && user.active) {
    return { ok: false, error: "Account is al actief" };
  }
  return sendInviteForUser(user);
}

export async function acceptInvite(input: {
  rawToken: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.password.length < 8) {
    return { ok: false, error: "Wachtwoord minimaal 8 tekens" };
  }

  const { consumeAuthToken } = await import("@/lib/auth/tokens");
  const consumed = await consumeAuthToken(input.rawToken, "invite");
  if (!consumed.ok) {
    const msg =
      consumed.error === "expired"
        ? "Uitnodiging verlopen — vraag admin om opnieuw uit te nodigen"
        : consumed.error === "used"
          ? "Uitnodiging al gebruikt"
          : "Ongeldige uitnodiging";
    return { ok: false, error: msg };
  }

  const user = await findUserById(consumed.userId);
  if (!user) return { ok: false, error: "Gebruiker niet gevonden" };

  const now = new Date().toISOString();
  const updated: AppUserRecord = {
    ...user,
    passwordHash: await bcrypt.hash(input.password, 10),
    active: true,
    emailVerifiedAt: now,
    passwordSetAt: now,
    updatedAt: now,
  };
  await persistUser(updated);
  return { ok: true };
}

export async function setUserPassword(input: {
  userId: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.password.length < 8) {
    return { ok: false, error: "Wachtwoord minimaal 8 tekens" };
  }
  const user = await findUserById(input.userId);
  if (!user) return { ok: false, error: "Gebruiker niet gevonden" };

  const now = new Date().toISOString();
  const updated: AppUserRecord = {
    ...user,
    passwordHash: await bcrypt.hash(input.password, 10),
    passwordSetAt: now,
    updatedAt: now,
  };
  await persistUser(updated);
  return { ok: true };
}

export async function setUserActive(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await findUserById(id);
  if (!user) return { ok: false, error: "Gebruiker niet gevonden" };

  const updated: AppUserRecord = {
    ...user,
    active,
    updatedAt: new Date().toISOString(),
  };
  await persistUser(updated);
  return { ok: true };
}

export function userStatus(user: AppUserRecord): "active" | "pending" | "inactive" {
  if (!user.emailVerifiedAt) return "pending";
  if (!user.active) return "inactive";
  return "active";
}

export function publicUser(user: AppUserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    status: userStatus(user),
    emailVerifiedAt: user.emailVerifiedAt,
    inviteSentAt: user.inviteSentAt,
    createdAt: user.createdAt,
    createdByEmail: user.createdByEmail ?? null,
  };
}

/** Dev-only: direct create with password when AUTH_ALLOW_ADMIN_PASSWORD=true */
export async function createUserWithPassword(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  createdByEmail: string;
}): Promise<{ ok: true; user: AppUserRecord } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!isAllowedAuthEmail(email)) {
    return { ok: false, error: authEmailDomainError() };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Wachtwoord minimaal 8 tekens" };
  }
  const existing = await findUserByEmailIncludingInactive(email);
  if (existing) return { ok: false, error: "Dit e-mailadres bestaat al" };

  const now = new Date().toISOString();
  const record: AppUserRecord = {
    id: randomUUID(),
    email,
    name: input.name.trim() || email.split("@")[0] || email,
    passwordHash: await bcrypt.hash(input.password, 10),
    role: input.role,
    active: true,
    emailVerifiedAt: now,
    inviteSentAt: null,
    passwordSetAt: now,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await persistUser(record);
    return { ok: true, user: record };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Databasefout bij aanmaken",
    };
  }
}
