import { assertExternalReadOnly } from "@/lib/integrations/read-only";

const BREVO_API = "https://api.brevo.com/v3";

function getBrevoKey(): string | null {
  return process.env.BREVO_API_KEY?.trim() || null;
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
}) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const qs = new URLSearchParams({
    type: "classic",
    limit: String(limit),
    offset: String(offset),
    sort: "desc",
  });
  return brevoGet<CampaignListResponse>(`/emailCampaigns?${qs}`);
}
