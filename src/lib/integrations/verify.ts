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
  const { missing } = getEnvPresence(def.envKeys);
  if (missing.length) {
    return base("brevo", def.name, "missing", `Ontbreekt: ${missing.join(", ")}`);
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY!,
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
  const openai = process.env.OPENAI_API_KEY?.trim();
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openai && !anthropic) {
    return base("ai", "AI (OpenAI / Anthropic)", "missing", "Geen AI-key gezet");
  }

  if (openai) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${openai}` },
        cache: "no-store",
      });
      if (!res.ok) {
        return base("ai", "AI (OpenAI / Anthropic)", "error", `OpenAI HTTP ${res.status}`);
      }
      return base("ai", "AI (OpenAI / Anthropic)", "verified", "OpenAI key geldig");
    } catch (e) {
      return base(
        "ai",
        "AI (OpenAI / Anthropic)",
        "error",
        e instanceof Error ? e.message : "Network error",
      );
    }
  }

  return base(
    "ai",
    "AI (OpenAI / Anthropic)",
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

const presenceIds = [
  "weeztix",
  "resident_advisor",
  "appic",
  "ticketswap",
  "internal_ticketing",
  "instagram",
  "tiktok",
  "youtube",
  "sales_notify",
  "alert_notify",
  "linkedin",
  "google_places",
  "enrichment",
] as const;

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

export async function verifyIntegration(id: string): Promise<VerifyResult> {
  switch (id) {
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
  const results: VerifyResult[] = [];
  for (const def of INTEGRATIONS) {
    results.push(await verifyIntegration(def.id));
  }
  return results;
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
    let status: IntegrationStatus =
      def.envKeys.length === 0
        ? "configured"
        : missing.length
          ? "missing"
          : "configured";
    if (
      missing.length &&
      (def.priority === "later" ||
        def.id === "linkedin" ||
        def.id === "google_places" ||
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
      missing,
      askFromClient: def.askFromClient,
    };
  });
}
