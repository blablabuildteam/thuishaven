/**
 * Indicatieve EUR-prijzen per eenheid — aanpassen wanneer echte facturen binnenkomen.
 * Bedoeld voor intern kostmeter + transparantie richting Thuishaven.
 */

export type UsageVendor =
  | "openai"
  | "anthropic"
  | "brevo"
  | "kvk"
  | "google_places"
  | "enrichment"
  | "other";

/** Centen per eenheid (EUR). */
export const UNIT_COST_EUR_CENTS: Record<
  UsageVendor,
  { unitLabel: string; centsPerUnit: number; note: string }
> = {
  openai: {
    unitLabel: "1k tokens",
    centsPerUnit: 0.5, // ~€0.005 / 1k blended estimate
    note: "Blended GPT-schatting; vervang door model-specifieke rates",
  },
  anthropic: {
    unitLabel: "1k tokens",
    centsPerUnit: 0.8,
    note: "Blended Claude-schatting",
  },
  brevo: {
    unitLabel: "e-mail",
    centsPerUnit: 0.1, // €0.001
    note: "Afhankelijk van Brevo-plan",
  },
  kvk: {
    unitLabel: "API-call",
    centsPerUnit: 2, // €0.02 — placeholder tot hun tarief bekend is
    note: "Credits op Thuishaven KvK-account; tarief bevestigen",
  },
  google_places: {
    unitLabel: "zoekopdracht",
    centsPerUnit: 3.2,
    note: "Places Text Text-schatting",
  },
  enrichment: {
    unitLabel: "lookup",
    centsPerUnit: 5,
    note: "Afhankelijk van partner (Apollo/Hunter/…)",
  },
  other: {
    unitLabel: "eenheid",
    centsPerUnit: 0,
    note: "Handmatig",
  },
};

export function estimateCostEurCents(
  vendor: UsageVendor,
  units: number,
): number {
  const rate = UNIT_COST_EUR_CENTS[vendor]?.centsPerUnit ?? 0;
  return Math.round(units * rate * 100) / 100;
}

/** Tokens → units of 1k tokens for pricing. */
export function tokensToKUnits(tokens: number): number {
  return tokens / 1000;
}
