import type { WeeztixTicketType } from "@/lib/integrations/weeztix/client";

export type WeeztixSoldOutReason =
  | "capacity"
  | "public_types"
  | "sold_threshold";

export type WeeztixSoldOutVerdict = {
  soldOut: boolean;
  reason: WeeztixSoldOutReason | null;
};

/** Guestlist / template leftovers — niet de publieke shop. */
const IGNORE_NAME =
  /vrienden|community|hardcopy|guest\s*list|comp\b|invite/i;
const TEMPLATE_NAME = /\[DATUM\]/i;

/** Default drempel als Weeztix geen bruikbare ticketcap heeft (weekedities). */
export const DEFAULT_WEEZTIX_SOLD_THRESHOLD = 3000;

export function weeztixSoldThreshold(): number | null {
  const raw = process.env.ALERT_WEEZTIX_SOLD_THRESHOLD?.trim();
  if (raw === "0" || raw?.toLowerCase() === "off") return null;
  if (!raw) return DEFAULT_WEEZTIX_SOLD_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WEEZTIX_SOLD_THRESHOLD;
  return Math.floor(n);
}

function ticketSold(t: WeeztixTicketType): number {
  return typeof t.sold_count === "number" ? t.sold_count : 0;
}

function ticketStock(t: WeeztixTicketType): number {
  return typeof t.available_stock === "number" ? t.available_stock : 0;
}

function ticketPrice(t: WeeztixTicketType): number {
  return typeof t.min_price === "number" ? t.min_price : 0;
}

/** Publieke verkooptypes — geen template, geen vrienden/community, geen gratis. */
export function isPublicSaleTicket(t: WeeztixTicketType): boolean {
  const name = String(t.name ?? "");
  if (TEMPLATE_NAME.test(name) && ticketSold(t) <= 0) return false;
  if (IGNORE_NAME.test(name)) return false;
  if (t.hide_without_coupon || t.require_coupon) return false;
  if (ticketPrice(t) <= 0) return false;
  return true;
}

export function isTicketTypeSoldOut(t: WeeztixTicketType): boolean {
  const status = String(t.status ?? "").toLowerCase();
  if (status === "sold_out") return true;
  const stock = ticketStock(t);
  const sold = ticketSold(t);
  return stock > 0 && sold >= stock * 0.995;
}

/**
 * Weeztix-uitverkocht voor alerts.
 *
 * Weekedities hebben vaak een template met unused Early Entrance (200) en
 * Vrienden/Community/Final op 0 — daardoor raakt total cap nooit 99.5%.
 * Publieke types (early bird / regular / late) wél. Zonder allotment
 * (echt unlimited) valt terug op ALERT_WEEZTIX_SOLD_THRESHOLD (default 3000).
 */
export function resolveWeeztixSoldOut(input: {
  tickets: WeeztixTicketType[];
  sold: number;
  capacity: number | null;
}): WeeztixSoldOutVerdict {
  const { tickets, sold, capacity } = input;

  if (capacity != null && capacity > 0 && sold >= capacity * 0.995) {
    return { soldOut: true, reason: "capacity" };
  }

  const allotted = tickets
    .filter(isPublicSaleTicket)
    .filter((t) => ticketStock(t) > 0 || ticketSold(t) > 0);

  if (allotted.length > 0) {
    const stillOpen = allotted.some((t) => !isTicketTypeSoldOut(t));
    if (!stillOpen) return { soldOut: true, reason: "public_types" };
    return { soldOut: false, reason: null };
  }

  const threshold = weeztixSoldThreshold();
  if (threshold != null && sold >= threshold) {
    return { soldOut: true, reason: "sold_threshold" };
  }

  return { soldOut: false, reason: null };
}
