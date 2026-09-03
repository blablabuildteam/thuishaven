import { snapshotToPromptContext, type InsightsSnapshot } from "./data";
import { INSIGHTS_CHAT_HISTORY_LIMIT } from "./chats";

const SYSTEM = `Je bent de data-assistent voor Thuishaven Tools.
Je helpt het team met vragen over e-mailcampagnes (Brevo), edities/tickets (Weeztix), social creatives (Instagram + visual tags) en wat er in de snapshot staat.
Antwoord altijd in het Nederlands, bondig, met cijfers uit de context.
Geen marketingjargon. Geen verzinnen van data die niet in de context staat.
Ticketlift rond posts is correlatie (±48u), geen bewezen causaliteit — zeg dat erbij.
Als iets niet in de data zit, zeg dat eerlijk.`;

const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

export async function askInsightsLlm(input: {
  question: string;
  snapshot: InsightsSnapshot;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!openaiKey && !geminiKey) {
    return {
      ok: false,
      error:
        "GEMINI_API_KEY of OPENAI_API_KEY ontbreekt. Zet die in .env.local / Vercel om met de data te chatten.",
    };
  }

  const context = snapshotToPromptContext(input.snapshot);
  const history = sanitizeHistory(input.history);

  if (geminiKey) {
    return askGemini({
      key: geminiKey,
      context,
      question: input.question,
      history,
    });
  }

  return askOpenAi({
    key: openaiKey!,
    context,
    question: input.question,
    history,
  });
}

function sanitizeHistory(
  history: Array<{ role: "user" | "assistant"; content: string }> | undefined,
): Array<{ role: "user" | "assistant"; content: string }> {
  const cleaned = (history ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-INSIGHTS_CHAT_HISTORY_LIMIT);

  // Gemini requires user/model turns to alternate and prefers starting with user.
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of cleaned) {
    const last = turns[turns.length - 1];
    if (last?.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`;
      continue;
    }
    turns.push({ role: message.role, content: message.content });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}

function geminiModelsToTry(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const models = preferred
    ? [preferred, ...GEMINI_MODEL_FALLBACKS]
    : GEMINI_MODEL_FALLBACKS;
  return [...new Set(models)];
}

function isMissingModelError(status: number, body: string): boolean {
  if (status === 404) return true;
  return (
    status === 400 &&
    /not found|not supported|unknown model|invalid model/i.test(body)
  );
}

async function askOpenAi(input: {
  key: string;
  context: string;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM },
    { role: "system", content: `DATA CONTEXT:\n${input.context}` },
    ...input.history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: input.question },
  ];

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.key}`,
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

async function askGemini(input: {
  key: string;
  context: string;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const contents = [
    ...input.history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: input.question }] },
  ];

  const body = {
    systemInstruction: {
      parts: [{ text: `${SYSTEM}\n\nDATA CONTEXT:\n${input.context}` }],
    },
    contents,
    generationConfig: { temperature: 0.3 },
  };

  let lastError = "Gemini request mislukt";

  try {
    for (const model of geminiModelsToTry()) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        },
      );

      const text = await res.text();
      if (!res.ok) {
        lastError = `Gemini HTTP ${res.status}: ${text.slice(0, 200)}`;
        if (isMissingModelError(res.status, text)) continue;
        return { ok: false, error: lastError };
      }

      const data = JSON.parse(text) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          finishReason?: string;
        }>;
        promptFeedback?: { blockReason?: string };
      };

      const blocked = data.promptFeedback?.blockReason;
      if (blocked) {
        return { ok: false, error: `Gemini blokkeerde het verzoek (${blocked})` };
      }

      const answer = data.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!answer) {
        const reason = data.candidates?.[0]?.finishReason ?? "leeg";
        lastError = `Leeg antwoord van het model (${reason})`;
        continue;
      }
      return { ok: true, answer };
    }

    return { ok: false, error: lastError };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "LLM request mislukt",
    };
  }
}
