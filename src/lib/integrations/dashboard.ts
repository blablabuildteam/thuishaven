/**
 * Integration stubs — implement once credentials are available.
 * Keep adapters thin so we can swap mock ↔ live without UI changes.
 */

export type SyncResult = {
  source: string;
  ok: boolean;
  records?: number;
  error?: string;
};

export async function syncWeeztix(): Promise<SyncResult> {
  if (!process.env.WEEZTIX_API_KEY) {
    return { source: "weeztix", ok: false, error: "WEEZTIX_API_KEY ontbreekt" };
  }
  // TODO: implement Weeztix API client
  return { source: "weeztix", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncResidentAdvisor(): Promise<SyncResult> {
  if (!process.env.RA_API_KEY) {
    return { source: "resident_advisor", ok: false, error: "RA_API_KEY ontbreekt" };
  }
  return { source: "resident_advisor", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncAppic(): Promise<SyncResult> {
  if (!process.env.APPIC_API_KEY) {
    return { source: "appic", ok: false, error: "APPIC_API_KEY ontbreekt" };
  }
  return { source: "appic", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncTicketSwap(): Promise<SyncResult> {
  if (!process.env.TICKETSWAP_API_KEY) {
    return { source: "ticketswap", ok: false, error: "TICKETSWAP_API_KEY ontbreekt" };
  }
  return { source: "ticketswap", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncBrevoCampaigns(): Promise<SyncResult> {
  if (!process.env.BREVO_API_KEY) {
    return { source: "brevo", ok: false, error: "BREVO_API_KEY ontbreekt" };
  }
  return { source: "brevo", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncInstagram(): Promise<SyncResult> {
  if (!process.env.META_ACCESS_TOKEN) {
    return { source: "instagram", ok: false, error: "META_ACCESS_TOKEN ontbreekt" };
  }
  return { source: "instagram", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncTikTok(): Promise<SyncResult> {
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    return { source: "tiktok", ok: false, error: "TIKTOK_ACCESS_TOKEN ontbreekt" };
  }
  return { source: "tiktok", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncYouTube(): Promise<SyncResult> {
  if (!process.env.YOUTUBE_API_KEY) {
    return { source: "youtube", ok: false, error: "YOUTUBE_API_KEY ontbreekt" };
  }
  return { source: "youtube", ok: false, error: "Nog niet geïmplementeerd" };
}
