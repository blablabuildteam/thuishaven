import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInsightsSnapshot } from "@/lib/insights/data";
import { askInsightsLlm } from "@/lib/insights/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    question?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  } | null;

  const question = body?.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Vraag ontbreekt" }, { status: 400 });
  }

  const snapshot = await getInsightsSnapshot();
  const result = await askInsightsLlm({
    question,
    snapshot,
    history: body?.history,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, snapshotAt: snapshot.generatedAt },
      { status: 502 },
    );
  }

  return NextResponse.json({
    answer: result.answer,
    snapshotAt: snapshot.generatedAt,
  });
}
