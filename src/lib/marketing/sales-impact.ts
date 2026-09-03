import { amsterdamDay, shiftIsoDay } from "@/lib/time/amsterdam";

/** How a linked organic post relates to ticket sales for its edition. */
export type SalesImpactRole = "promo" | "same_day" | "after";

export type SalesImpactOffer =
  | "lineup"
  | "early_bird"
  | "sold_out"
  | "aftermovie"
  | "recap"
  | "door"
  | "other"
  | string
  | null
  | undefined;

const AFTER_OFFERS = new Set(["aftermovie", "recap", "door"]);

const AFTER_TEXT_RE =
  /\b(aftermovie|recap|relive|full\s+set|outdoor\s*&\s*indoor|set\s+op\s+thuishaven)\b/i;

export const SALES_IMPACT_ROLE_LABEL: Record<SalesImpactRole, string> = {
  promo: "Promo",
  same_day: "Eventdag",
  after: "Na event",
};

export const SALES_IMPACT_ROLE_HINT: Record<SalesImpactRole, string> = {
  promo: "Voor het event — telt mee voor sales-impact.",
  same_day:
    "Gepost op de eventdag (vaak live/clip) — alleen verkopen diezelfde dag.",
  after: "Aftermovie / recap / na het event — geen sales-impact.",
};

function isAfterContent(
  offer: SalesImpactOffer,
  text: string | null | undefined,
): boolean {
  if (offer && AFTER_OFFERS.has(offer)) return true;
  if (text && AFTER_TEXT_RE.test(text)) return true;
  return false;
}

/**
 * Classify whether a post can drive ticket sales for an edition.
 * Aftermovies stay linked to the event but never count toward sales lift.
 */
export function classifySalesImpactRole(input: {
  publishedAt: Date | string | null | undefined;
  eventStartsAt: Date | string | null | undefined;
  offer?: SalesImpactOffer;
  text?: string | null;
}): SalesImpactRole {
  if (isAfterContent(input.offer, input.text)) return "after";

  if (!input.publishedAt || !input.eventStartsAt) return "promo";

  const publishDay = amsterdamDay(input.publishedAt);
  const eventDay = amsterdamDay(input.eventStartsAt);
  if (!publishDay || !eventDay) return "promo";

  if (publishDay > eventDay) return "after";
  if (publishDay === eventDay) return "same_day";
  return "promo";
}

export type SalesLiftWindow = {
  dayFrom: string;
  dayTo: string;
  /** Short label for UI (±48u / eventdag / n.v.t.). */
  label: string;
};

/**
 * Calendar window used for ticket-lift correlation.
 * `after` → null (no sales attribution).
 */
export function salesLiftWindow(input: {
  role: SalesImpactRole;
  publishedAt: Date | string | null | undefined;
}): SalesLiftWindow | null {
  if (input.role === "after") return null;
  if (!input.publishedAt) return null;

  const center = amsterdamDay(input.publishedAt);
  if (!center) return null;

  if (input.role === "same_day") {
    return { dayFrom: center, dayTo: center, label: "eventdag" };
  }

  return {
    dayFrom: shiftIsoDay(center, -1),
    dayTo: shiftIsoDay(center, 1),
    label: "±48u",
  };
}

/** True when the post should contribute to event sales-impact totals / chips. */
export function countsTowardSalesImpact(role: SalesImpactRole): boolean {
  return role === "promo" || role === "same_day";
}
