/**
 * Free public employee estimates via Wikidata (no LinkedIn login).
 */

import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import { scoreDoelgroep } from "./doelgroep";
import { kvkHeadcountLooksOff } from "./linkedin";

const UA =
  "ThuishavenOutreach/1.0 (https://thuishaven.vercel.app; team@blablabuild.com)";

const NAME_ALIASES: Record<string, string> = {
  "nike european headquarters": "Nike",
  "vattenfall nederland": "Vattenfall",
  "pvh europe": "PVH",
  "imc trading": "IMC",
  "a.s.r.": "ASR Nederland",
  messagebird: "MessageBird",
  "tata steel nederland": "Tata Steel",
  "port of amsterdam": "Havenbedrijf Amsterdam",
  "jll nederland": "Jones Lang LaSalle",
  "cbre nederland": "CBRE",
  "nn group": "NN Group",
  "rtl nederland": "RTL Nederland",
  "dpg media": "DPG Media",
  "afas software": "AFAS",
  "flow traders": "Flow Traders",
  picnic: "Picnic supermarket",
  coolblue: "Coolblue",
  wetransfer: "WeTransfer",
  bunq: "bunq",
  miro: "Miro software",
  "talpa network": "Talpa Network",
  "suit supply": "Suitsupply",
  alliander: "Alliander",
  vodafoneziggo: "VodafoneZiggo",
  postnl: "PostNL",
  elastic: "Elastic NV",
  grandvision: "GrandVision",
};

type WikidataHit = { id: string; label: string };

export type PublicHeadcount = {
  estimate: number;
  source: "wikidata";
  wikidataId: string;
  label: string;
};

function aliasFor(name: string): string {
  return NAME_ALIASES[name.trim().toLowerCase()] ?? name;
}

async function wikidataSearch(
  name: string,
  language: "nl" | "en",
): Promise<WikidataHit[]> {
  const q = new URLSearchParams({
    action: "wbsearchentities",
    search: aliasFor(name),
    language,
    uselang: language,
    format: "json",
    limit: "8",
    type: "item",
  });
  const res = await fetch(`https://www.wikidata.org/w/api.php?${q}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    search?: Array<{ id: string; label?: string }>;
  };
  return (data.search ?? [])
    .filter((h) => h.id)
    .map((h) => ({ id: h.id, label: h.label ?? name }));
}

async function wikidataEntity(id: string) {
  const res = await fetch(
    `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,
    {
      headers: { Accept: "application/json", "User-Agent": UA },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    entities?: Record<string, Parameters<typeof parseEmployees>[0]>;
  };
  return json.entities?.[id] ?? null;
}

function parseEmployees(entity: {
  claims?: Record<
    string,
    Array<{
      mainsnak?: {
        datavalue?: { value?: { amount?: string } };
      };
      qualifiers?: {
        P585?: Array<{ datavalue?: { value?: { time?: string } } }>;
      };
    }>
  >;
}): number | null {
  const claims = entity.claims?.P1128 ?? [];
  let best: { amount: number; time: string } | null = null;
  for (const claim of claims) {
    const raw = claim.mainsnak?.datavalue?.value?.amount;
    const amount = raw ? Number(raw) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const time =
      claim.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? "0";
    if (!best || time > best.time || (time === best.time && amount > best.amount)) {
      best = { amount, time };
    }
  }
  return best ? Math.round(best.amount) : null;
}

export async function lookupPublicHeadcount(
  companyName: string,
): Promise<PublicHeadcount | null> {
  const hits = [
    ...(await wikidataSearch(companyName, "nl")),
    ...(await wikidataSearch(companyName, "en")),
  ];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    const entity = await wikidataEntity(hit.id);
    if (!entity) continue;
    const estimate = parseEmployees(entity);
    if (!estimate) continue;
    return {
      estimate,
      source: "wikidata",
      wikidataId: hit.id,
      label: hit.label,
    };
  }
  return null;
}

export async function applyPublicHeadcountToProspect(
  prospectId: string,
): Promise<
  | { ok: true; estimate: number; label: string }
  | { ok: false; error: string }
> {
  if (!hasDatabase()) return { ok: false, error: "Geen database" };
  const db = getDb();
  const [row] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  if (!row) return { ok: false, error: "Prospect niet gevonden" };

  const found = await lookupPublicHeadcount(row.companyName);
  if (!found) {
    return { ok: false, error: "Geen publieke medewerkersschatting gevonden" };
  }

  const meta = { ...(row.metadata ?? {}) };
  meta.publicEmployeeEstimate = found.estimate;
  meta.publicEmployeeSource = found.source;
  meta.publicEmployeeLabel = found.label;
  meta.wikidataId = found.wikidataId;
  if (typeof meta.linkedinEmployeeEstimate !== "number") {
    meta.linkedinEmployeeEstimate = found.estimate;
  }
  const estimate =
    typeof meta.linkedinEmployeeEstimate === "number"
      ? meta.linkedinEmployeeEstimate
      : found.estimate;
  const scored = scoreDoelgroep({
    employeeCount: estimate,
    city: row.city,
  });
  meta.doelgroepFit = scored.fit;
  meta.doelgroepReason = `Publiek ~${found.estimate} (${found.label}) · ${scored.reason}`;

  await db
    .update(prospects)
    .set({ metadata: meta, updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));

  return { ok: true, estimate: found.estimate, label: found.label };
}

export async function fillPublicHeadcounts(options?: {
  onlyOffKvk?: boolean;
  limit?: number;
}): Promise<{
  tried: number;
  filled: number;
  missed: string[];
}> {
  if (!hasDatabase()) return { tried: 0, filled: 0, missed: [] };
  const db = getDb();
  const rows = await db.select().from(prospects);
  const targets = rows.filter((p) => {
    if (p.type !== "company") return false;
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.publicEmployeeEstimate === "number") return false;
    if (options?.onlyOffKvk !== false) {
      return kvkHeadcountLooksOff(p.employeeCount) || p.employeeCount == null;
    }
    return true;
  });

  const limit = options?.limit ?? targets.length;
  let filled = 0;
  const missed: string[] = [];

  for (const row of targets.slice(0, limit)) {
    const result = await applyPublicHeadcountToProspect(row.id);
    if (result.ok) filled += 1;
    else missed.push(row.companyName);
    await new Promise((r) => setTimeout(r, 350));
  }

  return { tried: Math.min(targets.length, limit), filled, missed };
}
