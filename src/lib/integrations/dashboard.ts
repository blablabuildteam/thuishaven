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
  const { syncInstagramReadOnly } = await import(
    "@/lib/integrations/instagram/sync"
  );
  const result = await syncInstagramReadOnly();
  return {
    source: "instagram",
    ok: result.ok,
    records: result.upserted || result.fetched,
    error: result.error,
  };
}

export async function syncTikTok(): Promise<SyncResult> {
  const { syncTikTokReadOnly } = await import(
    "@/lib/integrations/tiktok/sync"
  );
  const result = await syncTikTokReadOnly();
  return {
    source: "tiktok",
    ok: result.ok,
    records: result.upserted || result.fetched,
    error: result.error,
  };
}

export async function syncYouTube(): Promise<SyncResult> {
  const { syncYouTubeReadOnly } = await import(
    "@/lib/integrations/youtube/sync"
  );
  const result = await syncYouTubeReadOnly();
  return {
    source: "youtube",
    ok: result.ok,
    records: result.upserted || result.fetched,
    error: result.error,
  };
}
