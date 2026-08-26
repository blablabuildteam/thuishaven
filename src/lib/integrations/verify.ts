import { INTEGRATIONS, getEnvPresence, type IntegrationStatus } from "./registry";

export type VerifyResult = {
  id: string;
  name: string;
  status: IntegrationStatus;
  message: string;
  checkedAt: string;
  detail?: Record<string, unknown>;
};

function base(
  id: string,
  name: string,
  status: IntegrationStatus,
  message: string,
  detail?: Record<string, unknown>,
): VerifyResult {
  return {
    id,
    name,
    status,
    message,
    checkedAt: new Date().toISOString(),
    detail,
  };
}

async function verifyBrevo(): Promise<VerifyResult> {
  const def = INTEGRATIONS.find((i) => i.id === "brevo")!;
  const { getBrevoKey } = await import("@/lib/integrations/brevo/client");
  const key = getBrevoKey();
  if (!key) {
    return base(
      "brevo",
      def.name,
      "missing",
      "Ontbreekt: BREVO_API_KEY (of BREVO_MCP_TOKEN)",
    );
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: {
        accept: "application/json",
        "api-key": key,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return base("brevo", def.name, "error", `HTTP ${res.status}`, {
        body: text.slice(0, 200),
      });
    }
    const data = (await res.json()) as {
      email?: string;
      companyName?: string;
      plan?: unknown[];
    };
    return base("brevo", def.name, "verified", "Account bereikbaar", {
      email: data.email,
      companyName: data.companyName,
    });
  } catch (e) {
    return base(
      "brevo",
      def.name,
      "error",
      e instanceof Error ? e.message : "Network error",
    );
  }
}

async function verifyOpenAI(): Promise<VerifyResult> {
  const name = "AI (Gemini)";
  const openai = process.env.OPENAI_API_KEY?.trim();
  const gemini = process.env.GEMINI_API_KEY?.trim();
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openai && !gemini && !anthropic) {
    return base("ai", name, "missing", "Geen AI-key gezet (GEMINI_API_KEY)");
  }

  if (gemini) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(gemini)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        return base("ai", name, "error", `Gemini HTTP ${res.status}`);
      }
      const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
      return base("ai", name, "verified", `Gemini · ${model}`);
    } catch (e) {
      return base(
        "ai",
        name,
        "error",
        e instanceof Error ? e.message : "Network error",
      );
    }
  }

  if (openai) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${openai}` },
        cache: "no-store",
      });
      if (!res.ok) {
        return base("ai", name, "error", `OpenAI HTTP ${res.status}`);
      }
      const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
      return base("ai", name, "verified", `OpenAI · ${model}`);
    } catch (e) {
      return base(
        "ai",
        name,
        "error",
        e instanceof Error ? e.message : "Network error",
      );
    }
  }

  return base(
    "ai",
    name,
    "configured",
    "Anthropic key aanwezig — live verify volgt bij eerste generate",
  );
}

async function verifyDatabase(): Promise<VerifyResult> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return base("database", "PostgreSQL", "missing", "DATABASE_URL ontbreekt");
  }
  try {
    // Lazy import so build without DB still works
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 1, connect_timeout: 5 });
    await sql`select 1 as ok`;
    await sql.end({ timeout: 2 });
    return base("database", "PostgreSQL", "verified", "Connectie OK");
  } catch (e) {
    return base(
      "database",
      "PostgreSQL",
      "error",
      e instanceof Error ? e.message : "Connectie mislukt",
    );
  }
}

async function verifyKvk(): Promise<VerifyResult> {
  const key = process.env.KVK_API_KEY?.trim();
  if (!key) {
    return base("kvk", "KvK API", "missing", "KVK_API_KEY ontbreekt");
  }
  const baseUrl = (process.env.KVK_API_URL || "https://api.kvk.nl").replace(
    /\/$/,
    "",
  );
  // Soft check: many KvK plans need specific paths; treat 401/403 as "key rejected",
  // 404 as "configured but endpoint pad nog finetunen".
  try {
    const res = await fetch(`${baseUrl}/api/v2/zoeken?naam=Thuishaven&resultatenPerPagina=1`, {
      headers: {
        apikey: key,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return base("kvk", "KvK API", "error", `Auth geweigerd (${res.status})`);
    }
    if (res.ok) {
      return base("kvk", "KvK API", "verified", "Zoek-call geslaagd");
    }
    return base(
      "kvk",
      "KvK API",
      "configured",
      `Key aanwezig · endpoint gaf ${res.status} (pad/abonnement checken)`,
    );
  } catch (e) {
    return base(
      "kvk",
      "KvK API",
      "configured",
      `Key aanwezig · netwerk/endpoint nog valideren (${e instanceof Error ? e.message : "error"})`,
    );
  }
}

/** Presence-only checks for providers we wire after docs arrive */
function presenceCheck(
  id: string,
  name: string,
  keys: string[],
  optional: string[] = [],
): VerifyResult {
  const required = getEnvPresence(keys);
  if (required.missing.length) {
    return base(id, name, "missing", `Ontbreekt: ${required.missing.join(", ")}`);
  }
  const opt = getEnvPresence(optional);
  return base(
    id,
    name,
    "configured",
    optional.length && opt.missing.length
      ? `Sleutels gezet · optioneel nog: ${opt.missing.join(", ")}`
      : "Sleutels gezet · klaar om live endpoint te koppelen",
  );
}

async function verifyOpenMeteo(): Promise<VerifyResult> {
  const { pingOpenMeteo } = await import("@/lib/weather/open-meteo");
  const ping = await pingOpenMeteo();
  return base(
    "open_meteo",
    "Open-Meteo (weer)",
    ping.ok ? "verified" : "error",
    ping.message,
  );
}

async function verifyWeeztix(): Promise<VerifyResult> {
  const hasCreds =
    Boolean(process.env.WEEZTIX_ACCESS_TOKEN?.trim()) ||
    Boolean(process.env.WEEZTIX_API_KEY?.trim()) ||
    Boolean(process.env.WEEZTIX_REFRESH_TOKEN?.trim()) ||
    Boolean(process.env.WEEZTIX_CLIENT_ID?.trim());
  if (!hasCreds) {
    return base(
      "weeztix",
      "Weeztix",
      "missing",
      "WEEZTIX_CLIENT_ID ontbreekt — maak een OAuth-client en koppel via Koppelingen",
    );
  }

  try {
    const { weeztixWhoAmI, listWeeztixEvents } = await import(
      "@/lib/integrations/weeztix/client"
    );
    const me = await weeztixWhoAmI();
    if (!me.ok) {
      const hint =
        me.status === 401 || /verlop/i.test(me.error)
          ? " — klik Opnieuw koppelen (refresh token is éénmalig)"
          : "";
      return base("weeztix", "Weeztix", "error", `${me.error}${hint}`, {
        status: me.status,
      });
    }
    const events = await listWeeztixEvents();
    if (!events.ok) {
      const { logIntegration } = await import("@/lib/integrations/log");
      await logIntegration({
        source: "weeztix",
        level: "error",
        event: "verify.events_failed",
        message: events.error,
        detail: { status: events.status },
      });
      return base(
        "weeztix",
        "Weeztix",
        "error",
        `Token OK, events: ${events.error}`,
        { user: me.user.email ?? me.user.guid },
      );
    }
    return base(
      "weeztix",
      "Weeztix",
      "verified",
      `Read-only OK · ${events.events.length} events · ${me.user.email ?? me.user.guid ?? "user"}`,
      {
        company: me.user.default_company,
        eventSample: events.events.slice(0, 5).map((e) => ({
          guid: e.guid,
          name: e.name,
        })),
      },
    );
  } catch (e) {
    return base(
      "weeztix",
      "Weeztix",
      "error",
      e instanceof Error ? e.message : "Verify mislukt",
    );
  }
}

async function verifyResidentAdvisor(): Promise<VerifyResult> {
  try {
    const { getRaVenue, listRaVenueEvents } = await import(
      "@/lib/integrations/ra/client"
    );
    const venue = await getRaVenue();
    if (!venue.ok) {
      return base("resident_advisor", "Resident Advisor", "error", venue.error, {
        status: venue.status,
      });
    }
    const events = await listRaVenueEvents({ type: "LATEST", limit: 8 });
    if (!events.ok) {
      return base(
        "resident_advisor",
        "Resident Advisor",
        "error",
        `Venue OK, listings: ${events.error}`,
        { venue: venue.venue.name },
      );
    }
    return base(
      "resident_advisor",
      "Resident Advisor",
      "verified",
      `Read-only listings · ${venue.venue.name} · ${events.events.length} upcoming (attending ≠ sold)`,
      {
        venueId: venue.venue.id,
        sample: events.events.slice(0, 3).map((e) => ({
          title: e.title,
          attending: e.attending,
        })),
      },
    );
  } catch (e) {
    return base(
      "resident_advisor",
      "Resident Advisor",
      "error",
      e instanceof Error ? e.message : "Verify mislukt",
    );
  }
}

async function verifyTicketSwap(): Promise<VerifyResult> {
  try {
    const { listTicketswapLocationEvents, ticketswapVenueUrl } = await import(
      "@/lib/integrations/ticketswap/client"
    );
    const events = await listTicketswapLocationEvents();
    if (!events.ok) {
      return base(
        "ticketswap",
        "TicketSwap",
        "error",
        `${events.error} · check ${ticketswapVenueUrl()}`,
        { venueUrl: ticketswapVenueUrl() },
      );
    }
    const withStock = events.events.filter((e) => e.availableCount > 0).length;
    return base(
      "ticketswap",
      "TicketSwap",
      "verified",
      `Read-only listings · ${events.events.length} events · ${withStock} met aanbod`,
      {
        venueUrl: ticketswapVenueUrl(),
        sample: events.events.slice(0, 3).map((e) => ({
          title: e.title,
          available: e.availableCount,
        })),
      },
    );
  } catch (e) {
    return base(
      "ticketswap",
      "TicketSwap",
      "error",
      e instanceof Error ? e.message : "Verify mislukt",
    );
  }
}

async function verifyGooglePlaces(): Promise<VerifyResult> {
  const name = "Google Places";
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    return base("google_places", name, "missing", "GOOGLE_PLACES_API_KEY ontbreekt");
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
      },
      body: JSON.stringify({
        textQuery: "kantoor Amsterdam",
        maxResultCount: 1,
        languageCode: "nl",
        regionCode: "NL",
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return base(
        "google_places",
        name,
        "error",
        `Places HTTP ${res.status}: ${text.slice(0, 160)}`,
      );
    }

    const data = (await res.json()) as {
      places?: Array<{ displayName?: { text?: string } }>;
    };
    const sample = data.places?.[0]?.displayName?.text;
    return base(
      "google_places",
      name,
      "verified",
      sample ? `Text Search OK · voorbeeld: ${sample}` : "Text Search OK",
    );
  } catch (e) {
    return base(
      "google_places",
      name,
      "error",
      e instanceof Error ? e.message : "Network error",
    );
  }
}

/** youtube.com/@Thuishaven — public channel id, not a secret. */
const THUISHAVEN_YOUTUBE_CHANNEL_ID = "UC2KhiKAhm8wIkjt2chtIUTA";

async function verifyYouTube(): Promise<VerifyResult> {
  const name = "YouTube";
  const key = process.env.YOUTUBE_API_KEY?.trim();
  const channelId =
    process.env.YOUTUBE_CHANNEL_ID?.trim() || THUISHAVEN_YOUTUBE_CHANNEL_ID;
  if (!key) {
    return base("youtube", name, "missing", "YOUTUBE_API_KEY ontbreekt");
  }

  try {
    const qs = new URLSearchParams({
      part: "snippet,statistics",
      id: channelId,
      key,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${qs}`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      const text = await res.text();
      return base(
        "youtube",
        name,
        "error",
        `YouTube HTTP ${res.status}: ${text.slice(0, 160)}`,
      );
    }

    const data = (await res.json()) as {
      items?: Array<{
        snippet?: { title?: string };
        statistics?: { subscriberCount?: string; videoCount?: string };
      }>;
    };
    const channel = data.items?.[0];
    if (!channel) {
      return base(
        "youtube",
        name,
        "error",
        "Kanaal niet gevonden — check YOUTUBE_CHANNEL_ID",
      );
    }

    const title = channel.snippet?.title ?? "Onbekend kanaal";
    const subs = channel.statistics?.subscriberCount;
    const videos = channel.statistics?.videoCount;
    const stats =
      subs != null && videos != null
        ? ` · ${Number(subs).toLocaleString("nl-NL")} subs · ${videos} video's`
        : "";
    return base("youtube", name, "verified", `${title}${stats}`);
  } catch (e) {
    return base(
      "youtube",
      name,
      "error",
      e instanceof Error ? e.message : "Network error",
    );
  }
}

async function verifyTikTok(): Promise<VerifyResult> {
  const name = "TikTok";
  const token = process.env.TIKTOK_ACCESS_TOKEN?.trim();
  if (!token) {
    return base("tiktok", name, "missing", "TIKTOK_ACCESS_TOKEN ontbreekt");
  }

  try {
    const qs = new URLSearchParams({
      fields:
        "open_id,display_name,username,follower_count,video_count,likes_count",
    });
    const res = await fetch(
      `https://open.tiktokapis.com/v2/user/info/?${qs}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );

    const data = (await res.json()) as {
      data?: {
        user?: {
          display_name?: string;
          username?: string;
          follower_count?: number;
          video_count?: number;
          likes_count?: number;
        };
      };
      error?: { code?: string; message?: string };
    };

    const errCode = data.error?.code;
    if (!res.ok || (errCode && errCode !== "ok")) {
      const msg = data.error?.message || `TikTok HTTP ${res.status}`;
      return base("tiktok", name, "error", msg.slice(0, 180));
    }

    const user = data.data?.user;
    if (!user) {
      return base("tiktok", name, "error", "Geen user-object in TikTok-response");
    }

    const handle = user.username
      ? `@${user.username}`
      : user.display_name ?? "TikTok";
    const followers =
      user.follower_count != null
        ? ` · ${user.follower_count.toLocaleString("nl-NL")} volgers`
        : "";
    const videos =
      user.video_count != null ? ` · ${user.video_count} video's` : "";
    return base("tiktok", name, "verified", `${handle}${followers}${videos}`, {
      username: user.username,
      displayName: user.display_name,
      followerCount: user.follower_count,
      videoCount: user.video_count,
      likesCount: user.likes_count,
    });
  } catch (e) {
    return base(
      "tiktok",
      name,
      "error",
      e instanceof Error ? e.message : "Network error",
    );
  }
}

async function verifyInstagram(): Promise<VerifyResult> {
  const name = "Instagram (Meta)";
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const igId = process.env.META_IG_BUSINESS_ID?.trim();
  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";

  if (!token) {
    return base("instagram", name, "missing", "META_ACCESS_TOKEN ontbreekt");
  }
  if (!igId) {
    return base("instagram", name, "missing", "META_IG_BUSINESS_ID ontbreekt");
  }

  try {
    const qs = new URLSearchParams({
      fields: "id,username,name,followers_count,media_count",
      access_token: token,
    });
    const res = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(igId)}?${qs}`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      const text = await res.text();
      return base(
        "instagram",
        name,
        "error",
        `Meta HTTP ${res.status}: ${text.slice(0, 180)}`,
      );
    }

    const data = (await res.json()) as {
      username?: string;
      name?: string;
      followers_count?: number;
      media_count?: number;
      error?: { message?: string };
    };
    if (data.error?.message) {
      return base("instagram", name, "error", data.error.message);
    }

    const handle = data.username ? `@${data.username}` : data.name ?? "Instagram";
    const followers =
      data.followers_count != null
        ? ` · ${data.followers_count.toLocaleString("nl-NL")} volgers`
        : "";
    const media =
      data.media_count != null ? ` · ${data.media_count} posts` : "";
    return base("instagram", name, "verified", `${handle}${followers}${media}`);
  } catch (e) {
    return base(
      "instagram",
      name,
      "error",
      e instanceof Error ? e.message : "Network error",
    );
  }
}

async function verifyAuth(): Promise<VerifyResult> {
  const name = "Medewerker-login";

  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    return base("auth", name, "missing", "AUTH_SECRET ontbreekt");
  }

  const { getBrevoKey } = await import("@/lib/integrations/brevo/client");
  const brevoKey = getBrevoKey();
  if (!brevoKey) {
    return base(
      "auth",
      name,
      "error",
      "Brevo ontbreekt — uitnodigings- en resetmails werken niet",
    );
  }

  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/account", {
      headers: { accept: "application/json", "api-key": brevoKey },
      cache: "no-store",
    });
    if (!brevoRes.ok) {
      return base(
        "auth",
        name,
        "error",
        `Brevo mail HTTP ${brevoRes.status} — check API-key`,
      );
    }
  } catch (e) {
    return base(
      "auth",
      name,
      "error",
      e instanceof Error ? e.message : "Brevo bereikbaarheid mislukt",
    );
  }

  const fromEmail =
    process.env.AUTH_FROM_EMAIL?.trim() ||
    process.env.ALERT_FROM_EMAIL?.trim();
  const fromLabel = fromEmail ?? "noreply@thuishaven.nl (default)";

  const { allowedAuthDomains } = await import("@/lib/auth/domains");
  const domains = allowedAuthDomains();

  try {
    const { listUsers, isUserLoginReady } = await import("@/lib/auth/users");
    const users = await listUsers();
    const ready = users.filter(isUserLoginReady);
    const pending = users.filter((u) => !u.emailVerifiedAt);
    const admins = ready.filter((u) => u.role === "admin");

    if (!ready.length) {
      if (pending.length) {
        return base(
          "auth",
          name,
          "configured",
          `${pending.length} uitnodiging(en) open · wacht op acceptatie`,
        );
      }
      return base(
        "auth",
        name,
        "configured",
        "Geen actieve gebruikers — nodig medewerkers uit via /admin/gebruikers",
      );
    }

    const domainLabel = domains.map((d) => `@${d}`).join(", ");
    const roleLabel =
      admins.length > 0
        ? `${ready.length} kan inloggen (${admins.length} admin${admins.length !== 1 ? "s" : ""})`
        : `${ready.length} kan inloggen`;

    return base(
      "auth",
      name,
      "verified",
      `${roleLabel} · ${domainLabel} · mail via ${fromLabel}`,
      { pending: pending.length, domains, sender: fromLabel },
    );
  } catch (e) {
    return base(
      "auth",
      name,
      "error",
      e instanceof Error ? e.message : "Users laden mislukt",
    );
  }
}

async function verifyAlertNotify(): Promise<VerifyResult> {
  const name = "Dashboard alerts";
  const { resolveAlertRecipients, isAlertEmailEnabled } = await import(
    "@/lib/integrations/alerts/recipients"
  );
  const { weeztixSoldThreshold } = await import(
    "@/lib/integrations/weeztix/sold-out"
  );
  const { getBrevoKey } = await import("@/lib/integrations/brevo/client");

  if (!isAlertEmailEnabled()) {
    return base(
      "alert_notify",
      name,
      "configured",
      "ALERT_EMAIL_ENABLED staat niet op true — detectie werkt, mail is uit",
    );
  }

  const recipients = resolveAlertRecipients();
  if (!recipients.ok) {
    return base("alert_notify", name, "error", recipients.error);
  }

  if (!getBrevoKey()) {
    return base(
      "alert_notify",
      name,
      "error",
      "BREVO_API_KEY ontbreekt — alertmails kunnen niet weg",
    );
  }

  const { listAlertRules } = await import("@/lib/integrations/alerts/rules");
  const rules = await listAlertRules().catch(() => []);
  const threshold = weeztixSoldThreshold();
  const thresholdLabel =
    threshold != null ? `fallback-drempel ${threshold}` : "geen fallback-drempel";
  const ruleLabel =
    rules.length === 1
      ? "1 ingestelde alert"
      : `${rules.length} ingestelde alerts`;

  return base(
    "alert_notify",
    name,
    "verified",
    `Mail klaar · ${recipients.to.join(", ")} · ${ruleLabel} · ${thresholdLabel}`,
    { to: recipients.to, threshold, rules: rules.length },
  );
}

export async function verifyIntegration(id: string): Promise<VerifyResult> {
  const parked = INTEGRATIONS.find((i) => i.id === id);
  if (parked?.onHold) {
    return base(id, parked.name, "on_hold", parked.verifyHint);
  }

  switch (id) {
    case "auth":
      return verifyAuth();
    case "brevo":
      return verifyBrevo();
    case "ai":
      return verifyOpenAI();
    case "database":
      return verifyDatabase();
    case "kvk":
      return verifyKvk();
    case "open_meteo":
      return verifyOpenMeteo();
    case "weeztix":
      return verifyWeeztix();
    case "resident_advisor":
      return verifyResidentAdvisor();
    case "ticketswap":
      return verifyTicketSwap();
    case "google_places":
      return verifyGooglePlaces();
    case "youtube":
      return verifyYouTube();
    case "instagram":
      return verifyInstagram();
    case "tiktok":
      return verifyTikTok();
    case "alert_notify":
      return verifyAlertNotify();
    default: {
      const def = INTEGRATIONS.find((i) => i.id === id);
      if (!def) {
        return base(id, id, "error", "Onbekende integratie");
      }
      if (def.envKeys.length === 0) {
        return base(id, def.name, "verified", def.verifyHint);
      }
      if (def.priority === "later" && !process.env[def.envKeys[0] ?? ""]) {
        return base(
          id,
          def.name,
          "manual",
          "Nog te kiezen — pad bespreken met Thuishaven",
        );
      }
      return presenceCheck(
        def.id,
        def.name,
        def.envKeys,
        def.optionalEnvKeys ?? [],
      );
    }
  }
}

export async function verifyAllIntegrations(): Promise<VerifyResult[]> {
  return Promise.all(INTEGRATIONS.map((def) => verifyIntegration(def.id)));
}

/** Live probe for configured (non-manual) integrations — used by status API. */
export async function probeConfiguredIntegrations(): Promise<VerifyResult[]> {
  const snapshot = listIntegrationStatusSnapshot();
  const toProbe = snapshot.filter(
    (row) =>
      row.status === "configured" ||
      (row.status !== "manual" &&
        row.status !== "on_hold" &&
        row.status !== "missing" &&
        ["brevo", "auth", "weeztix", "database", "open_meteo", "ai", "kvk", "resident_advisor", "ticketswap", "google_places", "youtube", "instagram", "tiktok", "alert_notify"].includes(
          row.id,
        )),
  );
  const always = ["brevo", "auth", "weeztix", "database", "open_meteo", "ai", "resident_advisor", "ticketswap", "google_places", "youtube", "instagram", "tiktok", "alert_notify"];
  const ids = new Set([
    ...toProbe.map((r) => r.id),
    ...always.filter((id) => {
      const row = snapshot.find((r) => r.id === id);
      return (
        row &&
        row.status !== "missing" &&
        row.status !== "manual" &&
        row.status !== "on_hold"
      );
    }),
  ]);

  return Promise.all([...ids].map((id) => verifyIntegration(id)));
}

export function listIntegrationStatusSnapshot(): Array<{
  id: string;
  name: string;
  tool: string;
  priority: string;
  status: IntegrationStatus;
  missing: string[];
  askFromClient: string[];
}> {
  return INTEGRATIONS.map((def) => {
    const { missing } = getEnvPresence(def.envKeys);
    // Weeztix: legacy WEEZTIX_API_KEY telt ook als access token
    const weeztixOk =
      def.id === "weeztix" &&
      (Boolean(process.env.WEEZTIX_API_KEY?.trim()) ||
        Boolean(process.env.WEEZTIX_ACCESS_TOKEN?.trim()) ||
        Boolean(process.env.WEEZTIX_REFRESH_TOKEN?.trim()) ||
        Boolean(process.env.WEEZTIX_CLIENT_ID?.trim()));
    const aiOk =
      def.id === "ai" &&
      (Boolean(process.env.OPENAI_API_KEY?.trim()) ||
        Boolean(process.env.GEMINI_API_KEY?.trim()) ||
        Boolean(process.env.ANTHROPIC_API_KEY?.trim()));
    const brevoOk =
      def.id === "brevo" &&
      (Boolean(process.env.BREVO_API_KEY?.trim()) ||
        Boolean(process.env.BREVO_MCP_TOKEN?.trim()));
    const integrationOk = weeztixOk || aiOk || brevoOk;
    let status: IntegrationStatus =
      def.envKeys.length === 0
        ? "configured"
        : missing.length && !integrationOk
          ? "missing"
          : "configured";
    if (def.onHold) {
      status = "on_hold";
    } else if (
      missing.length &&
      !integrationOk &&
      (def.priority === "later" ||
        def.id === "linkedin" ||
        def.id === "enrichment")
    ) {
      status = "manual";
    }
    return {
      id: def.id,
      name: def.name,
      tool: def.tool,
      priority: def.priority,
      status,
      missing: def.onHold || integrationOk ? [] : missing,
      askFromClient: def.askFromClient,
    };
  });
}
