import { snapshotToPromptContext, type InsightsSnapshot } from "./data";

const SYSTEM = `Je bent de data-assistent voor Thuishaven Tools.
Je helpt het team met vragen over e-mailcampagnes (Brevo), edities/tickets (Weeztix) en wat er in de snapshot staat.
Antwoord altijd in het Nederlands, bondig, met cijfers uit de context.
Geen marketingjargon. Geen verzinnen van data die niet in de context staat.
Als iets niet in de data zit, zeg dat eerlijk.`;

export async function askInsightsLlm(input: {
  question: string;
  snapshot: InsightsSnapshot;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY ontbreekt. Zet die in .env.local / Vercel om met de data te chatten.",
    };
  }

  const context = snapshotToPromptContext(input.snapshot);
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM },
    {
      role: "system",
      content: `DATA CONTEXT:\n${context}`,
    },
    ...(input.history ?? []).slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: input.question },
  ];

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        temperature: 0.3,
        messages,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `OpenAI HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return { ok: false, error: "Leeg antwoord van het model" };
    }
    return { ok: true, answer };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "LLM request mislukt",
    };
  }
}
