/**
 * Geschatte omvang van de cold-doelgroep + wat de hele lijst kost.
 * CBS Q4 2025 (alle sectoren) + regio-aandeel. Geen live Apollo-count.
 */

import {
  APOLLO_PAGE_SIZE,
  estimateBatch,
  formatEurFromCents,
  OUTREACH_RATES,
} from "./batch-costs";

export const UNIVERSE_NOTE =
  "CBS Q4 2025: 990 bedrijven 500–999, 490 in 1.000–1.999, 340 in 2.000+ (NL, alle sectoren). Regio is ~⅓ van de grote HQs. Apollo telt ruimer (concern + vestiging).";

export const UNIVERSE = {
  fitLow: 250,
  fitMid: 350,
  fitHigh: 450,
  mailableLow: 150,
  mailableMid: 220,
  mailableHigh: 300,
  apolloRawHigh: 800,
  jubileeThisYear: { low: 30, high: 50 },
  nl500to1999: 990 + 490,
  nl2000plus: 340,
  nl250to499: 1880,
} as const;

export type UniverseBand = {
  low: number;
  high: number;
  label: string;
};

function apolloPages(companies: number, pageSize = APOLLO_PAGE_SIZE): number {
  return companies <= 0 ? 0 : Math.ceil(companies / pageSize);
}

function apolloFetchCents(companies: number, pageSize = APOLLO_PAGE_SIZE): number {
  return apolloPages(companies, pageSize) * OUTREACH_RATES.apolloCreditCents;
}

export function estimateCurrentUniverseCosts() {
  const n = UNIVERSE.fitMid;
  const mailable = UNIVERSE.mailableMid;

  const slim = {
    apollo25: apolloFetchCents(n, 25),
    apollo100: apolloFetchCents(n, 100),
    kvk: mailable * OUTREACH_RATES.kvkCallsPerCompany * OUTREACH_RATES.kvkCallCents,
    hunter: 0,
    people: 0,
  };
  const full = estimateBatch({
    companies: n,
    includeKvk: true,
    hunterShare: 0.5,
    includePeople: true,
  });

  const slimTotal25 = slim.apollo25 + slim.kvk;
  const slimTotal100 = slim.apollo100 + slim.kvk;

  return {
    companies: n,
    mailable,
    slim,
    slimTotal25,
    slimTotal100,
    fullTotal: full.totalCents,
    fullClient: full.clientCents,
    fullStudio: full.studioCents,
    perCompanySlim: slimTotal100 / n,
    perCompanyFull: full.perCompanyCents,
    labels: {
      slim25: formatEurFromCents(slimTotal25),
      slim100: formatEurFromCents(slimTotal100),
      full: formatEurFromCents(full.totalCents),
      kvk: formatEurFromCents(slim.kvk),
      fetch25: formatEurFromCents(slim.apollo25),
      fetch100: formatEurFromCents(slim.apollo100),
    },
  };
}

export const UNIVERSE_LEVERS: Array<{
  id: string;
  label: string;
  extra: string;
  cost: string;
  quality: string;
  completeness: string;
}> = [
  {
    id: "page100",
    label: "100 per Apollo-pagina",
    extra: "zelfde namen, 4× minder credits",
    cost: "ophalen van ~350: €0,32 i.p.v. €1,12",
    quality: "gelijk",
    completeness: "nodig om de hele Apollo-lijst leeg te trekken",
  },
  {
    id: "people-reverse",
    label: "Via Event / Office Managers",
    extra: "+40 tot +80 bedrijven",
    cost: "search kan 0 credits zijn; mail alleen verrijken als je mailt",
    quality: "vaak beter: je hebt meteen een naam",
    completeness: "vangt HQs die niet in de 15 plaatsen staan",
  },
  {
    id: "ring2",
    label: "2e ring steden",
    extra: "+80 tot +150",
    cost: "2 extra Apollo-pagina’s + KvK alleen voor wie een mail heeft",
    quality: "zelfde size, iets verder (Rotterdam, Den Haag, Leiden, Amersfoort)",
    completeness: "grote HQs buiten de 50 km-cirkel",
  },
  {
    id: "brainport",
    label: "Brainport Eindhoven",
    extra: "+40 tot +80",
    cost: "1 extra pagina + KvK op de hits",
    quality: "hoog (tech, intern-event cultuur), wel reistijd",
    completeness: "ASML-keten en toeleveranciers missen we nu",
  },
  {
    id: "size250",
    label: "Ondergrens 250 i.p.v. 500",
    extra: "+200 tot +400",
    cost: "Apollo goedkoop, KvK loopt op",
    quality: "lager: kleinere events, meer noise",
    completeness: "CBS: nog ~1.880 landelijk in 250–499",
  },
  {
    id: "dedupe",
    label: "Concern-dedupe",
    extra: "−20 tot −40 dubbele holdings",
    cost: "€0 — minder KvK en minder mails",
    quality: "hoger: niet 3× dezelfde groep",
    completeness: "juistere lijst, geen extra namen",
  },
  {
    id: "intent",
    label: "Jubileum + vacature Event Manager",
    extra: "subset van 30–80 met timing",
    cost: "KvK-datum alleen op de lijst die je al hebt",
    quality: "hoogste kans op een ja",
    completeness: "eerst de warme, daarna de rest",
  },
];
