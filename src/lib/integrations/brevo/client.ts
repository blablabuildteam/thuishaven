import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const BREVO_API = "https://api.brevo.com/v3";

function getBrevoKey(): string | null {
  const direct = process.env.BREVO_API_KEY?.trim();
  if (direct) return direct;
  const mcp = process.env.BREVO_MCP_TOKEN?.trim();
  if (!mcp) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(mcp, "base64").toString("utf8"),
    ) as { api_key?: string };
    return parsed.api_key?.trim() || null;
  } catch {
    return null;
  }
}

async function brevoGet<T>(path: string): Promise<
  { ok: true; data: T } | { ok: false; error: string; status: number }
> {
  const key = getBrevoKey();
  if (!key) return { ok: false, error: "BREVO_API_KEY ontbreekt", status: 0 };

  const url = path.startsWith("http") ? path : `${BREVO_API}${path}`;
  assertExternalReadOnly("GET", url);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": key,
      },
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Brevo HTTP ${res.status}`,
      };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export type BrevoAccount = {
  email?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
};

export async function getBrevoAccount() {
  return brevoGet<BrevoAccount>("/account");
}

export type BrevoEmailCampaign = {
  id?: number;
  name?: string;
  status?: string;
  subject?: string;
  scheduledAt?: string;
  sentDate?: string;
  statistics?: {
    globalStats?: {
      sent?: number;
      delivered?: number;
      uniqueOpens?: number;
      uniqueClicks?: number;
      viewed?: number;
      clickers?: number;
    };
  };
};

type CampaignListResponse = {
  campaigns?: BrevoEmailCampaign[];
  count?: number;
};

/** Read-only: e-mailcampagnes ophalen. */
export async function listBrevoEmailCampaigns(options?: {
  limit?: number;
  offset?: number;
  type?: "classic" | "trigger";
}) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const qs = new URLSearchParams({
    type: options?.type ?? "classic",
    limit: String(limit),
    offset: String(offset),
    sort: "desc",
    statistics: "globalStats",
  });
  return brevoGet<CampaignListResponse>(`/emailCampaigns?${qs}`);
}

function defaultSender() {
  return {
    email:
      process.env.BREVO_SENDER_EMAIL?.trim() || "evenement@thuishaven.nl",
    name: process.env.BREVO_SENDER_NAME?.trim() || "Thuishaven Events",
  };
}

export function alertSender() {
  return {
    email:
      process.env.ALERT_FROM_EMAIL?.trim() || "noreply@thuishaven.nl",
    name: process.env.ALERT_FROM_NAME?.trim() || "Thuishaven Alerts",
  };
}

/** Transactional e-mail (alerts / interne notificaties). */
export async function sendBrevoTransactionalEmail(input: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  sender?: { email: string; name: string };
}): Promise<
  { ok: true; messageId: string | null } | { ok: false; error: string }
> {
  const key = getBrevoKey();
  if (!key) return { ok: false, error: "BREVO_API_KEY ontbreekt" };
  const recipients = input.to
    .flatMap((t) => t.split(","))
    .map((t) => t.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, error: "Geen ontvangers" };
  }

  const url = `${BREVO_API}/smtp/email`;
  assertExternalReadOnly("POST", url, { allowTransactionalEmailPost: true });
  const sender = input.sender ?? defaultSender();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": key,
      },
      body: JSON.stringify({
        sender,
        to: recipients.map((email) => ({ email })),
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.message ?? `Brevo HTTP ${res.status}`,
      };
    }
    return { ok: true, messageId: data.messageId ?? null };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}
