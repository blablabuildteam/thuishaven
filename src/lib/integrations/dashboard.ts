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
  const { syncWeeztixReadOnly } = await import("@/lib/integrations/weeztix/sync");
  const result = await syncWeeztixReadOnly();
  return {
    source: "weeztix",
    ok: result.ok,
    records: result.editionsUpserted || result.eventsFetched,
    error: result.error,
  };
}

export async function syncResidentAdvisor(): Promise<SyncResult> {
  const { syncResidentAdvisorReadOnly } = await import(
    "@/lib/integrations/ra/sync"
  );
  const result = await syncResidentAdvisorReadOnly();
  return {
    source: "resident_advisor",
    ok: result.ok,
    records: result.upserted,
    error: result.error,
  };
}

export async function syncAppic(): Promise<SyncResult> {
  if (!process.env.APPIC_API_KEY) {
    return { source: "appic", ok: false, error: "APPIC_API_KEY ontbreekt" };
  }
  return { source: "appic", ok: false, error: "Nog niet geïmplementeerd" };
}

export async function syncTicketSwap(): Promise<SyncResult> {
  const { syncTicketSwapReadOnly } = await import(
    "@/lib/integrations/ticketswap/sync"
  );
  const result = await syncTicketSwapReadOnly();
  return {
    source: "ticketswap",
    ok: result.ok,
    records: result.upserted,
    error: result.error,
  };
}

export async function syncBrevoCampaigns(): Promise<SyncResult> {
  const { syncBrevoCampaignsReadOnly } = await import(
    "@/lib/integrations/brevo/sync"
  );
  const result = await syncBrevoCampaignsReadOnly();
  return {
    source: "brevo",
    ok: result.ok,
    records: result.metricsUpserted || result.campaignsFetched,
    error: result.error,
  };
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
