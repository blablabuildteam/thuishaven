/**
 * Indicatieve kosten voor het vullen van de doelgroep.
 * Apollo/Hunter = credits op onze key tot Thuishaven een eigen account zet.
 * KvK = credits op hun Developer Portal-account.
 */

export const APOLLO_PAGE_SIZE = 100;

export const OUTREACH_RATES = {
  apolloCreditCents: 8,
  hunterSearchCents: 9,
  kvkCallCents: 2,
  kvkCallsPerCompany: 3,
} as const;

export type CostPayer = "client" | "studio" | "gratis";

export type BatchCostInput = {
  companies: number;
  includeKvk: boolean;
  /** 0–1: aandeel bedrijven zonder events@ op de site. */
  hunterShare: number;
  includePeople: boolean;
};

export type BatchCostLine = {
  id: string;
  label: string;
  detail: string;
  units: number;
  unitLabel: string;
  cents: number;
  payer: CostPayer;
};

export type BatchCostEstimate = {
  companies: number;
  apolloPages: number;
  hunterLookups: number;
  lines: BatchCostLine[];
  clientCents: number;
  studioCents: number;
  totalCents: number;
  perCompanyCents: number;
};

export function formatEurFromCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function estimateBatch(input: BatchCostInput): BatchCostEstimate {
  const companies = Math.max(0, Math.round(input.companies));
  const apolloPages =
    companies === 0 ? 0 : Math.ceil(companies / APOLLO_PAGE_SIZE);
  const hunterShare = Math.min(1, Math.max(0, input.hunterShare));
  const hunterCount = Math.round(companies * hunterShare);

  const lines: BatchCostLine[] = [
    {
      id: "apollo",
      label: "Apollo · bedrijven ophalen",
      detail: `${apolloPages} pagina${apolloPages === 1 ? "" : "s"} · max ${APOLLO_PAGE_SIZE} per credit`,
      units: apolloPages,
      unitLabel: apolloPages === 1 ? "credit" : "credits",
      cents: apolloPages * OUTREACH_RATES.apolloCreditCents,
      payer: "studio",
    },
    {
      id: "site",
      label: "Contactmail van de website",
      detail: "events@ / info@ van de publieke site · geen API",
      units: companies,
      unitLabel: companies === 1 ? "bedrijf" : "bedrijven",
      cents: 0,
      payer: "gratis",
    },
  ];

  if (input.includeKvk) {
    const calls = companies * OUTREACH_RATES.kvkCallsPerCompany;
    lines.splice(1, 0, {
      id: "kvk",
      label: "KvK · verrijken",
      detail: `${OUTREACH_RATES.kvkCallsPerCompany} calls per bedrijf (zoek + basis + vestiging)`,
      units: calls,
      unitLabel: "API-calls",
      cents: calls * OUTREACH_RATES.kvkCallCents,
      payer: "client",
    });
  }

  if (hunterCount > 0) {
    lines.push({
      id: "hunter",
      label: "Hunter · fallback-mail",
      detail: `Alleen als de site geen adres heeft · nu ${Math.round(hunterShare * 100)}%`,
      units: hunterCount,
      unitLabel: hunterCount === 1 ? "zoekopdracht" : "zoekopdrachten",
      cents: hunterCount * OUTREACH_RATES.hunterSearchCents,
      payer: "studio",
    });
  }

  if (input.includePeople) {
    lines.push({
      id: "people",
      label: "Apollo · contactpersoon",
      detail: "Event / office / facilities · 1 credit per bedrijf (conservatief)",
      units: companies,
      unitLabel: companies === 1 ? "credit" : "credits",
      cents: companies * OUTREACH_RATES.apolloCreditCents,
      payer: "studio",
    });
  }

  const clientCents = lines
    .filter((l) => l.payer === "client")
    .reduce((s, l) => s + l.cents, 0);
  const studioCents = lines
    .filter((l) => l.payer === "studio")
    .reduce((s, l) => s + l.cents, 0);
  const totalCents = clientCents + studioCents;

  return {
    companies,
    apolloPages,
    hunterLookups: hunterCount,
    lines,
    clientCents,
    studioCents,
    totalCents,
    perCompanyCents: companies > 0 ? totalCents / companies : 0,
  };
}

export const BATCH_PRESETS = [
  {
    id: "fetch",
    label: "Alleen ophalen",
    hint: "1 Apollo-credit",
    input: {
      companies: 25,
      includeKvk: false,
      hunterShare: 0,
      includePeople: false,
    },
  },
  {
    id: "kvk",
    label: "Ophalen + KvK",
    hint: "Meest gebruikte rits",
    input: {
      companies: 25,
      includeKvk: true,
      hunterShare: 0,
      includePeople: false,
    },
  },
  {
    id: "full",
    label: "Volle rits",
    hint: "KvK + Hunter + personen",
    input: {
      companies: 25,
      includeKvk: true,
      hunterShare: 0.5,
      includePeople: true,
    },
  },
  {
    id: "universe",
    label: "Hele doelgroep",
    hint: "~350 namen · huidige filter",
    input: {
      companies: 350,
      includeKvk: true,
      hunterShare: 0,
      includePeople: false,
    },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  hint: string;
  input: BatchCostInput;
}>;
