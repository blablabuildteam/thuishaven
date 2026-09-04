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

export type OrganicSalesContribution = {
  /** spike = hourly match; range = uncertain split; exact = sole credit. */
  mode: "spike" | "range" | "exact" | "none";
  /** window = ±48u tickets; allocated = voorverkoop split by reach. */
  source: "spike" | "window" | "allocated" | "none";
  lift: number | null;
  /** Lower bound when credit is shared or weighted. */
  lowerBound: number | null;
};

/** Reach-first weight so viral posts take a larger slice of voorverkoop. */
export function organicAttributionWeight(p: {
  impressions: number;
  reach: number;
  engagement: number;
}): number {
  if (p.impressions > 0) return p.impressions;
  if (p.reach > 0) return p.reach;
  return Math.max(0, p.engagement);
}

/**
 * How much of ticket sales we can credit to one promo post.
 * 1. Sales spike within 4u → single estimate.
 * 2. ±48u window with tickets → range lift/N … lift (shared window).
 * 3. Otherwise split voorverkoop: equal share vs reach-weighted share.
 */
export function organicSalesContribution(input: {
  ticketLiftSold: number | null;
  spikeDetected: boolean;
  spikeEstimatedLift: number | null;
  concurrentPosts: number;
  preEventSold?: number | null;
  postWeight?: number;
  totalWeight?: number;
}): OrganicSalesContribution {
  const none = {
    mode: "none" as const,
    source: "none" as const,
    lift: null,
    lowerBound: null,
  };

  if (input.spikeDetected && input.spikeEstimatedLift != null) {
    return {
      mode: "spike",
      source: "spike",
      lift: input.spikeEstimatedLift,
      lowerBound: null,
    };
  }

  if (input.ticketLiftSold != null && input.ticketLiftSold > 0) {
    const lift = input.ticketLiftSold;
    if (input.concurrentPosts > 1) {
      const lowerBound = Math.round(lift / input.concurrentPosts);
      if (lowerBound !== lift) {
        return { mode: "range", source: "window", lift, lowerBound };
      }
    }
    return { mode: "exact", source: "window", lift, lowerBound: null };
  }

  const pool = input.preEventSold ?? 0;
  if (pool <= 0) return none;

  const n = Math.max(1, input.concurrentPosts);
  const equal = Math.round(pool / n);
  const totalWeight = input.totalWeight ?? 0;
  const postWeight = input.postWeight ?? 0;
  const weighted =
    totalWeight > 0 ? Math.round((pool * postWeight) / totalWeight) : equal;
  const lowerBound = Math.min(equal, weighted);
  const lift = Math.max(equal, weighted);
  if (lift <= 0) return none;
  if (lowerBound !== lift) {
    return { mode: "range", source: "allocated", lift, lowerBound };
  }
  return { mode: "exact", source: "allocated", lift, lowerBound: null };
}
