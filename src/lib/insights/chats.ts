import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  insightsChats,
  type InsightsChatMessage,
} from "@/lib/db/schema";

export const INSIGHTS_CHAT_TTL_DAYS = 14;
export const INSIGHTS_CHAT_HISTORY_LIMIT = 16;

export type InsightsChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messages: InsightsChatMessage[];
};

function ttlCutoff(): Date {
  return new Date(Date.now() - INSIGHTS_CHAT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function toSummary(row: {
  id: string;
  title: string;
  updatedAt: Date;
  messages: InsightsChatMessage[] | null;
}): InsightsChatSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages ?? [],
  };
}

export function titleFromQuestion(question: string): string {
  const trimmed = question.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69).trimEnd()}…`;
}

export function isPersistableUserId(userId: string | undefined): boolean {
  return Boolean(userId && /^[0-9a-f-]{36}$/i.test(userId));
}

export async function expireInsightsChats(): Promise<void> {
  if (!hasDatabase()) return;
  const db = getDb();
  await db.delete(insightsChats).where(lt(insightsChats.updatedAt, ttlCutoff()));
}

export async function listInsightsChats(
  userId: string,
): Promise<InsightsChatSummary[]> {
  if (!hasDatabase() || !isPersistableUserId(userId)) return [];
  const db = getDb();
  await expireInsightsChats();
  const rows = await db
    .select({
      id: insightsChats.id,
      title: insightsChats.title,
      updatedAt: insightsChats.updatedAt,
      messages: insightsChats.messages,
    })
    .from(insightsChats)
    .where(eq(insightsChats.userId, userId))
    .orderBy(desc(insightsChats.updatedAt))
    .limit(30);
  return rows.map(toSummary);
}

export async function getInsightsChat(
  userId: string,
  chatId: string,
): Promise<InsightsChatSummary | null> {
  if (!hasDatabase() || !isPersistableUserId(userId)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: insightsChats.id,
      title: insightsChats.title,
      updatedAt: insightsChats.updatedAt,
      messages: insightsChats.messages,
    })
    .from(insightsChats)
    .where(
      and(eq(insightsChats.id, chatId), eq(insightsChats.userId, userId)),
    )
    .limit(1);
  if (!row) return null;
  if (row.updatedAt < ttlCutoff()) {
    await db.delete(insightsChats).where(eq(insightsChats.id, chatId));
    return null;
  }
  return toSummary(row);
}

export async function saveInsightsChatTurn(input: {
  userId: string;
  chatId?: string;
  question: string;
  answer: string;
  history?: InsightsChatMessage[];
}): Promise<InsightsChatSummary | null> {
  if (!hasDatabase() || !isPersistableUserId(input.userId)) return null;

  const db = getDb();
  const existing = input.chatId
    ? await getInsightsChat(input.userId, input.chatId)
    : null;

  const prior =
    existing?.messages ??
    (input.history ?? []).filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        m.content.trim().length > 0,
    );

  const messages: InsightsChatMessage[] = [
    ...prior,
    { role: "user", content: input.question },
    { role: "assistant", content: input.answer },
  ];

  const now = new Date();

  if (existing) {
    const [row] = await db
      .update(insightsChats)
      .set({ messages, updatedAt: now })
      .where(
        and(
          eq(insightsChats.id, existing.id),
          eq(insightsChats.userId, input.userId),
        ),
      )
      .returning({
        id: insightsChats.id,
        title: insightsChats.title,
        updatedAt: insightsChats.updatedAt,
        messages: insightsChats.messages,
      });
    return row ? toSummary(row) : existing;
  }

  const [row] = await db
    .insert(insightsChats)
    .values({
      userId: input.userId,
      title: titleFromQuestion(input.question),
      messages,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: insightsChats.id,
      title: insightsChats.title,
      updatedAt: insightsChats.updatedAt,
      messages: insightsChats.messages,
    });
  return row ? toSummary(row) : null;
}

export async function deleteInsightsChat(
  userId: string,
  chatId: string,
): Promise<boolean> {
  if (!hasDatabase() || !isPersistableUserId(userId)) return false;
  const db = getDb();
  const deleted = await db
    .delete(insightsChats)
    .where(
      and(eq(insightsChats.id, chatId), eq(insightsChats.userId, userId)),
    )
    .returning({ id: insightsChats.id });
  return deleted.length > 0;
}
