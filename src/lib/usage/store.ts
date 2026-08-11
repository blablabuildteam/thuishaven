import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { desc, gte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { usageEvents } from "@/lib/db/schema";
import {
  estimateCostEurCents,
  UNIT_COST_EUR_CENTS,
  type UsageVendor,
} from "@/lib/usage/pricing";

export type UsageEvent = {
  id: string;
  tool: "outreach" | "dashboard" | "shared";
  vendor: UsageVendor;
  operation: string;
  units: number;
  unitLabel: string;
  /** EUR cents (kan fractioneel zijn in file-store; DB rondt af). */
  costEurCents: number;
  meta?: Record<string, unknown>;
  createdAt: string;
};

const FILE_STORE = path.join(process.cwd(), ".data", "usage-events.json");

async function readFileStore(): Promise<UsageEvent[]> {
  try {
    const raw = await fs.readFile(FILE_STORE, "utf8");
    return JSON.parse(raw) as UsageEvent[];
  } catch {
    return [];
  }
}

async function writeFileStore(events: UsageEvent[]) {
  await fs.mkdir(path.dirname(FILE_STORE), { recursive: true });
  await writeAtomic(FILE_STORE, JSON.stringify(events, null, 2));
}

async function writeAtomic(file: string, contents: string) {
  await fs.writeFile(file, contents, "utf8");
}

/** Seed sample month so the meter is zichtbaar vóór live API-calls. */
function demoSeedEvents(): UsageEvent[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rows: Array<Omit<UsageEvent, "id">> = [
    {
      tool: "outreach",
      vendor: "openai",
      operation: "mail_personaliseren",
      units: 420,
      unitLabel: "1k tokens",
      costEurCents: estimateCostEurCents("openai", 420),
      createdAt: new Date(now - 2 * day).toISOString(),
      meta: { model: "gpt-4.1-mini", emails: 180 },
    },
    {
      tool: "outreach",
      vendor: "openai",
      operation: "variant_genereren",
      units: 95,
      unitLabel: "1k tokens",
      costEurCents: estimateCostEurCents("openai", 95),
      createdAt: new Date(now - 5 * day).toISOString(),
    },
    {
      tool: "outreach",
      vendor: "brevo",
      operation: "transactional_send",
      units: 1860,
      unitLabel: "e-mail",
      costEurCents: estimateCostEurCents("brevo", 1860),
      createdAt: new Date(now - 3 * day).toISOString(),
    },
    {
      tool: "outreach",
      vendor: "kvk",
      operation: "zoeken",
      units: 340,
      unitLabel: "API-call",
      costEurCents: estimateCostEurCents("kvk", 340),
      createdAt: new Date(now - 4 * day).toISOString(),
      meta: { billedTo: "thuishaven-kvk-account" },
    },
    {
      tool: "outreach",
      vendor: "kvk",
      operation: "basisprofiel",
      units: 120,
      unitLabel: "API-call",
      costEurCents: estimateCostEurCents("kvk", 120),
      createdAt: new Date(now - 1 * day).toISOString(),
      meta: { billedTo: "thuishaven-kvk-account" },
    },
    {
      tool: "outreach",
      vendor: "google_places",
      operation: "textsearch",
      units: 40,
      unitLabel: "zoekopdracht",
      costEurCents: estimateCostEurCents("google_places", 40),
      createdAt: new Date(now - 6 * day).toISOString(),
    },
  ];
  return rows.map((r) => ({ ...r, id: randomUUID() }));
}

export async function recordUsage(input: {
  tool?: UsageEvent["tool"];
  vendor: UsageVendor;
  operation: string;
  units: number;
  unitLabel?: string;
  costEurCents?: number;
  meta?: Record<string, unknown>;
}): Promise<UsageEvent> {
  const unitLabel =
    input.unitLabel ?? UNIT_COST_EUR_CENTS[input.vendor].unitLabel;
  const costEurCents =
    input.costEurCents ?? estimateCostEurCents(input.vendor, input.units);

  const event: UsageEvent = {
    id: randomUUID(),
    tool: input.tool ?? "outreach",
    vendor: input.vendor,
    operation: input.operation,
    units: input.units,
    unitLabel,
    costEurCents,
    meta: input.meta,
    createdAt: new Date().toISOString(),
  };

  if (hasDatabase()) {
    try {
      const db = getDb();
      await db.insert(usageEvents).values({
        id: event.id,
        tool: event.tool,
        vendor: event.vendor,
        operation: event.operation,
        units: Math.round(event.units),
        unitLabel: event.unitLabel,
        costEurCents: Math.round(event.costEurCents),
        meta: event.meta ?? {},
      });
      return event;
    } catch (e) {
      console.error("recordUsage db error", e);
    }
  }

  const all = await readFileStore();
  all.push(event);
  await writeFileStore(all);
  return event;
}

export async function listUsageEvents(options?: {
  sinceDays?: number;
  tool?: string;
}): Promise<UsageEvent[]> {
  const sinceDays = options?.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  if (hasDatabase()) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(usageEvents)
        .where(gte(usageEvents.createdAt, since))
        .orderBy(desc(usageEvents.createdAt))
        .limit(500);
      if (rows.length) {
        return rows
          .filter((r) => !options?.tool || r.tool === options.tool)
          .map((r) => ({
            id: r.id,
            tool: r.tool as UsageEvent["tool"],
            vendor: r.vendor,
            operation: r.operation,
            units: r.units,
            unitLabel: r.unitLabel,
            costEurCents: r.costEurCents,
            meta: (r.meta as Record<string, unknown>) ?? undefined,
            createdAt: r.createdAt.toISOString(),
          }));
      }
    } catch (e) {
      console.error("listUsageEvents db error", e);
    }
  }

  let events = await readFileStore();
  if (!events.length) {
    events = demoSeedEvents();
    await writeFileStore(events);
  }

  return events
    .filter((e) => new Date(e.createdAt) >= since)
    .filter((e) => !options?.tool || e.tool === options.tool)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export type UsageSummary = {
  sinceDays: number;
  totalEurCents: number;
  /** Kosten die op Thuishaven-vendor-accounts landen (KvK). */
  clientBilledEurCents: number;
  /** Kosten die via onze keys/plans lopen (AI, Brevo, …) tot anders afgesproken. */
  ourStackEurCents: number;
  byVendor: Array<{
    vendor: UsageVendor;
    units: number;
    unitLabel: string;
    costEurCents: number;
    share: number;
  }>;
  recent: UsageEvent[];
};

export async function getUsageSummary(options?: {
  sinceDays?: number;
  tool?: string;
}): Promise<UsageSummary> {
  const sinceDays = options?.sinceDays ?? 30;
  const events = await listUsageEvents({
    sinceDays,
    tool: options?.tool ?? "outreach",
  });

  const totalEurCents = events.reduce((s, e) => s + e.costEurCents, 0);
  const clientVendors = new Set<UsageVendor>(["kvk"]);
  const clientBilledEurCents = events
    .filter((e) => clientVendors.has(e.vendor))
    .reduce((s, e) => s + e.costEurCents, 0);
  const ourStackEurCents = totalEurCents - clientBilledEurCents;

  const map = new Map<
    UsageVendor,
    { units: number; unitLabel: string; costEurCents: number }
  >();
  for (const e of events) {
    const cur = map.get(e.vendor) ?? {
      units: 0,
      unitLabel: e.unitLabel,
      costEurCents: 0,
    };
    cur.units += e.units;
    cur.costEurCents += e.costEurCents;
    cur.unitLabel = e.unitLabel;
    map.set(e.vendor, cur);
  }

  const byVendor = [...map.entries()]
    .map(([vendor, v]) => ({
      vendor,
      ...v,
      share: totalEurCents > 0 ? (v.costEurCents / totalEurCents) * 100 : 0,
    }))
    .sort((a, b) => b.costEurCents - a.costEurCents);

  return {
    sinceDays,
    totalEurCents,
    clientBilledEurCents,
    ourStackEurCents,
    byVendor,
    recent: events.slice(0, 25),
  };
}
