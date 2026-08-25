import { getDb } from "@/lib/db/client";
import {
  ticketDemographics,
  type DemographicBucket,
} from "@/lib/db/schema";

/**
 * Standaard Weeztix/Eventix visitor-velden (company-breed, 2016+).
 * Alleen aggregaties hiervan zijn veilig om te bewaren.
 */
const GENDER_FIELD = "3f7b72f0-a47f-11e6-a52d-21d369c3d816";
const CITY_FIELD = "3e4aa5b0-a1b8-11e6-b2b5-735d381b6ca7";
const DOB_FIELD = "3679cfa0-afe0-11e6-95b9-f1a3f6ac9164";

const AGE_ORDER = [
  "0-17",
  "18-24",
  "25-29",
  "30-34",
  "35-39",
  "40-44",
  "45-49",
  "50+",
  "onbekend",
] as const;

const GENDER_ORDER = ["vrouw", "man", "non-binair", "onbekend"] as const;

export type WeeztixDemographics = {
  gender: DemographicBucket[];
  age: DemographicBucket[];
  city: DemographicBucket[];
  answered: number;
  total: number;
};

type RawBucket = { key?: unknown; doc_count?: number };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function rawBuckets(node: unknown): RawBucket[] {
  const obj = asRecord(node);
  if (!obj) return [];
  if (Array.isArray(obj.buckets)) return obj.buckets as RawBucket[];
  const stats = asRecord(obj.statistics);
  if (!stats) return [];
  if (Array.isArray(stats.buckets)) return stats.buckets as RawBucket[];
  const inner = asRecord(stats.statistics);
  if (inner && Array.isArray(inner.buckets)) {
    return inner.buckets as RawBucket[];
  }
  return [];
}

function ticketMetaFields(data: unknown): Record<string, unknown> {
  const root = asRecord(data);
  const aggs = asRecord(root?.aggregations);
  const ticketMeta = asRecord(aggs?.ticketMetaData);
  const outer = asRecord(ticketMeta?.data) ?? ticketMeta;
  const inner = asRecord(outer?.data) ?? outer;
  return inner ?? {};
}

function ticketMetaTotal(data: unknown): number {
  const root = asRecord(data);
  const aggs = asRecord(root?.aggregations);
  const ticketMeta = asRecord(aggs?.ticketMetaData);
  const n = ticketMeta?.doc_count;
  return typeof n === "number" ? n : 0;
}

function normalizeGender(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "onbekend";
  if (/^(woman|female|vrouw|vrouwlijk|f)$/.test(s)) return "vrouw";
  if (/^(man|male|men|m)$/.test(s)) return "man";
  if (/non[-\s]?binar/.test(s)) return "non-binair";
  return s;
}

function ageBucket(age: number): (typeof AGE_ORDER)[number] {
  if (age < 18) return "0-17";
  if (age < 25) return "18-24";
  if (age < 30) return "25-29";
  if (age < 35) return "30-34";
  if (age < 40) return "35-39";
  if (age < 45) return "40-44";
  if (age < 50) return "45-49";
  return "50+";
}

function ageOnDay(dobIso: string, eventStart: Date): number | null {
  const dob = new Date(`${dobIso}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  if (dob.getUTCFullYear() < 1920 || dob.getUTCFullYear() > eventStart.getUTCFullYear()) {
    return null;
  }
  let age = eventStart.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = eventStart.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && eventStart.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  if (age < 0 || age > 100) return null;
  return age;
}

function addCount(map: Map<string, number>, key: string, n: number) {
  if (n <= 0) return;
  map.set(key, (map.get(key) ?? 0) + n);
}

function sortedBuckets(
  map: Map<string, number>,
  order?: readonly string[],
): DemographicBucket[] {
  const rows = [...map.entries()].map(([key, count]) => ({ key, count }));
  if (order) {
    const idx = new Map(order.map((k, i) => [k, i]));
    rows.sort((a, b) => (idx.get(a.key) ?? 99) - (idx.get(b.key) ?? 99));
    return rows;
  }
  return rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Haalt alleen geanonimiseerde tellingen uit Weeztix dashboard-statistics. */
export function demographicsFromStatistics(
  data: unknown,
  eventStart: Date,
): WeeztixDemographics {
  const fields = ticketMetaFields(data);
  const total = ticketMetaTotal(data);

  const genderMap = new Map<string, number>();
  for (const b of rawBuckets(fields[GENDER_FIELD])) {
    const n = typeof b.doc_count === "number" ? b.doc_count : 0;
    addCount(genderMap, normalizeGender(String(b.key ?? "")), n);
  }

  const cityMap = new Map<string, number>();
  for (const b of rawBuckets(fields[CITY_FIELD])) {
    const n = typeof b.doc_count === "number" ? b.doc_count : 0;
    const city = String(b.key ?? "").trim();
    addCount(cityMap, city || "onbekend", n);
  }

  const ageMap = new Map<string, number>();
  for (const b of rawBuckets(fields[DOB_FIELD])) {
    const n = typeof b.doc_count === "number" ? b.doc_count : 0;
    const raw = String(b.key ?? "").trim();
    if (!raw) {
      addCount(ageMap, "onbekend", n);
      continue;
    }
    const age = ageOnDay(raw.slice(0, 10), eventStart);
    addCount(ageMap, age == null ? "onbekend" : ageBucket(age), n);
  }

  const knownGender = [...genderMap.entries()]
    .filter(([k]) => k !== "onbekend")
    .reduce((s, [, n]) => s + n, 0);

  return {
    gender: sortedBuckets(genderMap, GENDER_ORDER),
    age: sortedBuckets(ageMap, AGE_ORDER),
    city: sortedBuckets(cityMap),
    answered: knownGender,
    total,
  };
}

export function hasDemographicSignal(demo: WeeztixDemographics): boolean {
  return demo.answered > 0 || demo.city.some((c) => c.key !== "onbekend");
}

export async function upsertWeeztixDemographics(input: {
  editionId: string;
  eventStart: Date;
  statistics: unknown;
}): Promise<boolean> {
  const demo = demographicsFromStatistics(input.statistics, input.eventStart);
  if (!hasDemographicSignal(demo) && demo.total <= 0) return false;

  const db = getDb();
  await db
    .insert(ticketDemographics)
    .values({
      editionId: input.editionId,
      platform: "weeztix",
      gender: demo.gender,
      age: demo.age,
      city: demo.city,
      answered: demo.answered,
      total: demo.total,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [ticketDemographics.editionId, ticketDemographics.platform],
      set: {
        gender: demo.gender,
        age: demo.age,
        city: demo.city,
        answered: demo.answered,
        total: demo.total,
        syncedAt: new Date(),
      },
    });
  return true;
}
