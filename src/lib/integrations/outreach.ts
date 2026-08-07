/**
 * Outreach integration stubs — KvK, Brevo, AI generation.
 */

export type EnrichmentResult = {
  companyName: string;
  email?: string;
  employeeCount?: number;
  foundedAt?: string;
  ok: boolean;
  error?: string;
};

export async function searchKvkCompanies(_params: {
  city?: string;
  minEmployees?: number;
  maxEmployees?: number;
}): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!process.env.KVK_API_KEY) {
    return { ok: false, error: "KVK_API_KEY ontbreekt" };
  }
  return { ok: false, error: "Nog niet geïmplementeerd" };
}

export async function generateOutreachEmail(_input: {
  type: "company" | "agency";
  companyName: string;
  sector?: string;
  anniversaryYears?: number;
  availabilitySummary?: string;
  toneExamples?: string[];
}): Promise<{ subject: string; body: string } | { error: string }> {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return { error: "OPENAI_API_KEY of ANTHROPIC_API_KEY ontbreekt" };
  }
  return { error: "Nog niet geïmplementeerd — prompt + tone calibratie volgt" };
}

export async function sendViaBrevo(_input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ messageId?: string; error?: string }> {
  if (!process.env.BREVO_API_KEY) {
    return { error: "BREVO_API_KEY ontbreekt" };
  }
  return { error: "Nog niet geïmplementeerd" };
}

export async function notifySalesTeam(_input: {
  companyName: string;
  summary: string;
  email?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.SALES_NOTIFY_EMAIL) {
    return { ok: false, error: "SALES_NOTIFY_EMAIL ontbreekt" };
  }
  return { ok: false, error: "Nog niet geïmplementeerd" };
}
