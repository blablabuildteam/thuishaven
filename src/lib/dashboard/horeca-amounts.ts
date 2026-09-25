/** Horeca-omzet bedragen, exclusief btw. Centen zodat we geen afronding verliezen. */

export const HORECA_MAX_EUROS = 10_000_000;

export type HorecaRevenueEvent = {
  id: string;
  name: string;
  day: string;
  barCents: number | null;
  kitchenCents: number | null;
  /** Weeztix-ticketomzet exclusief 9% btw. Null als er nog geen voorraadrij is. */
  ticketExclCents: number | null;
  /** DJ-fee-bandbreedte in hele euro's. Null als er geen DJ-rijen zijn. */
  djFees: {
    min: number;
    max: number;
    openEnded: boolean;
    priced: number;
    missing: number;
  } | null;
  /** Gekoppelde paid-ads-spend (Meta, TikTok, YouTube) in centen. 0 als er geen ads aan het event hangen. */
  adsCents: number | null;
};

export function isHorecaComplete(
  barCents: number | null,
  kitchenCents: number | null,
): boolean {
  return barCents != null && kitchenCents != null;
}

/** Som van ingevulde bedragen. Null als er nog niets staat. */
export function sumEnteredCents(values: Array<number | null>): number | null {
  if (values.every((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** Horeca = bar + keuken. Onvolledig zolang een van de twee leeg is. */
export function rowHorecaCents(
  barCents: number | null,
  kitchenCents: number | null,
): { cents: number | null; complete: boolean } {
  if (barCents == null && kitchenCents == null) {
    return { cents: null, complete: false };
  }
  return {
    cents: (barCents ?? 0) + (kitchenCents ?? 0),
    complete: isHorecaComplete(barCents, kitchenCents),
  };
}

export function formatHorecaInput(cents: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Nederlandse bedragen: 1.234,56 of 1234,56. Een losse punt met 1–2 decimalen
 * (12.50) telt als decimaal; 1.234 als duizendtallen.
 */
export function parseHorecaInput(draft: string): number | null | "invalid" {
  let raw = draft.trim().replace(/€/g, "").replace(/[\s\u00a0]/g, "");
  if (raw === "" || raw === "-" || raw === "—") return null;

  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "invalid";
  const euros = Number(raw);
  if (!Number.isFinite(euros) || euros > HORECA_MAX_EUROS) return "invalid";
  return Math.round(euros * 100);
}
