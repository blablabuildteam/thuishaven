import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInsightsSnapshot } from "@/lib/insights/data";
import { askInsightsLlm } from "@/lib/insights/llm";
import {
  deleteInsightsChat,
  getInsightsChat,
  listInsightsChats,
  saveInsightsChatTurn,
} from "@/lib/insights/chats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const userId = session.user.id;
  const chatId = new URL(req.url).searchParams.get("id")?.trim();

  try {
    if (chatId) {
      const chat = await getInsightsChat(userId, chatId);
      if (!chat) {
        return NextResponse.json({ error: "Gesprek niet gevonden" }, { status: 404 });
      }
      return NextResponse.json({ chat });
    }

    const chats = await listInsightsChats(userId);
    return NextResponse.json({ chats });
  } catch (e) {
    console.error("[insights/chat] list failed", e);
    return NextResponse.json({ chats: [] });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const body = (await req.json().catch(() => null)) as {
    question?: string;
    chatId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  } | null;

  const question = body?.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Vraag ontbreekt" }, { status: 400 });
  }

  const chatId = body?.chatId?.trim() || undefined;
  const stored = chatId
    ? await getInsightsChat(session.user.id, chatId).catch(() => null)
    : null;
  const history = stored?.messages ?? body?.history ?? [];

  const snapshot = await getInsightsSnapshot();
  const result = await askInsightsLlm({
    question,
    snapshot,
    history,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, snapshotAt: snapshot.generatedAt },
      { status: 502 },
    );
  }

  let chat = stored;
  try {
    chat = await saveInsightsChatTurn({
      userId: session.user.id,
      chatId: stored?.id,
      question,
      answer: result.answer,
      history,
    });
  } catch (e) {
    console.error("[insights/chat] save failed", e);
  }

  return NextResponse.json({
    answer: result.answer,
    snapshotAt: snapshot.generatedAt,
    chat,
  });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const chatId = new URL(req.url).searchParams.get("id")?.trim();
  if (!chatId) {
    return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });
  }

  const ok = await deleteInsightsChat(session.user.id, chatId);
  if (!ok) {
    return NextResponse.json({ error: "Gesprek niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
