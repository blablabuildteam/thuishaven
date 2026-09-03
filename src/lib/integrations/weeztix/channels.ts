import type { WeeztixTicketType } from "@/lib/integrations/weeztix/client";

export type WeeztixSalesChannel =
  | "weeztix"
  | "appic"
  | "resident_advisor"
  | "wingame"
  | "vrienden";

export type ChannelInventorySummary = {
  /** Barcodes issued into the pool (Weeztix sold_count). */
  sold: number;
  /** Check-ins at the door (Weeztix scanned_count). */
  scanned: number;
  /** Reserved pool size (allotment). */
  capacity: number | null;
  available: number;
};

/** Platforms persisted in ticket_inventory from Weeztix ticket-type names. */
export const WEEZTIX_DERIVED_PLATFORMS = [
  "appic",
  "resident_advisor",
  "vrienden",
] as const;

export type WeeztixDerivedPlatform = (typeof WEEZTIX_DERIVED_PLATFORMS)[number];

export const DERIVED_PLATFORM_CHANNEL: Record<
  WeeztixDerivedPlatform,
  WeeztixSalesChannel
> = {
  appic: "appic",
  resident_advisor: "resident_advisor",
  vrienden: "vrienden",
};

const BARCODE_POOL_CHANNELS = new Set<WeeztixSalesChannel>([
  "appic",
  "resident_advisor",
  "wingame",
  "vrienden",
]);

function ticketSold(t: WeeztixTicketType): number {
  return typeof t.sold_count === "number" ? t.sold_count : 0;
}

function ticketScanned(t: WeeztixTicketType): number {
  return typeof t.scanned_count === "number" ? t.scanned_count : 0;
}

function ticketStock(t: WeeztixTicketType): number | null {
  return typeof t.available_stock === "number" ? t.available_stock : null;
}

/**
 * Map Weeztix ticket-type names to sales channels (barcode pools, shop tiers).
 * Order matters: wingame before appic, RA before generic weeztix.
 */
export function classifyWeeztixTicketChannel(name: string): WeeztixSalesChannel {
  const n = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/wingame/.test(n)) return "wingame";
  if (/^ra dayticket/.test(n) || /\bra daytickets?\b/.test(n)) {
    return "resident_advisor";
  }
  if (/appic|barcodes verkoop/.test(n)) return "appic";
  if (/vrienden/.test(n)) return "vrienden";
  return "weeztix";
}

function summarizeShopBucket(
  tickets: WeeztixTicketType[],
): ChannelInventorySummary {
  let sold = 0;
  let scanned = 0;
  let capacitySum = 0;
  let hasStock = false;

  for (const t of tickets) {
    const s = ticketSold(t);
    const stock = ticketStock(t);
    sold += s;
    scanned += ticketScanned(t);
    if (stock != null) {
      hasStock = true;
      capacitySum += Math.max(stock, s);
    }
  }

  const capacity = hasStock ? capacitySum : sold > 0 ? sold : null;
  const available =
    capacity != null ? Math.max(0, capacity - sold) : 0;

  return { sold, scanned, capacity, available };
}

/**
 * Barcode pools (Appic, RA daytickets) often have duplicate CM + dated ticket
 * types. Take the max per metric — reserved is the round allotment (100, 50…),
 * scanned is actual usage at the door.
 */
function summarizeBarcodeBucket(
  tickets: WeeztixTicketType[],
): ChannelInventorySummary {
  if (!tickets.length) {
    return { sold: 0, scanned: 0, capacity: null, available: 0 };
  }

  let reserved = 0;
  let issued = 0;
  let scanned = 0;

  for (const t of tickets) {
    const stock = ticketStock(t) ?? 0;
    const s = ticketSold(t);
    reserved = Math.max(reserved, Math.max(stock, s));
    issued = Math.max(issued, s);
    scanned = Math.max(scanned, ticketScanned(t));
  }

  return {
    sold: issued,
    scanned,
    capacity: reserved > 0 ? reserved : issued > 0 ? issued : null,
    available: reserved > 0 ? Math.max(0, reserved - issued) : 0,
  };
}

function summarizeBucket(
  tickets: WeeztixTicketType[],
  channel: WeeztixSalesChannel,
): ChannelInventorySummary {
  if (BARCODE_POOL_CHANNELS.has(channel)) {
    return summarizeBarcodeBucket(tickets);
  }
  return summarizeShopBucket(tickets);
}

export function summarizeWeeztixChannels(
  tickets: WeeztixTicketType[],
): Record<WeeztixSalesChannel, ChannelInventorySummary> {
  const buckets: Record<WeeztixSalesChannel, WeeztixTicketType[]> = {
    weeztix: [],
    appic: [],
    resident_advisor: [],
    wingame: [],
    vrienden: [],
  };

  for (const t of tickets) {
    const channel = classifyWeeztixTicketChannel(String(t.name ?? ""));
    buckets[channel].push(t);
  }

  return {
    weeztix: summarizeBucket(buckets.weeztix, "weeztix"),
    appic: summarizeBucket(buckets.appic, "appic"),
    resident_advisor: summarizeBucket(buckets.resident_advisor, "resident_advisor"),
    wingame: summarizeBucket(buckets.wingame, "wingame"),
    vrienden: summarizeBucket(buckets.vrienden, "vrienden"),
  };
}

export function channelHasTicketTypes(
  tickets: WeeztixTicketType[],
  channel: WeeztixSalesChannel,
): boolean {
  return tickets.some(
    (t) =>
      classifyWeeztixTicketChannel(String(t.name ?? "")) === channel,
  );
}

/** Issued barcodes / pool slots counted in the Weeztix event total. */
export function weeztixSplitChannelSold(
  channels: Record<WeeztixSalesChannel, ChannelInventorySummary>,
): number {
  return (
    channels.appic.sold +
    channels.resident_advisor.sold +
    channels.wingame.sold +
    channels.vrienden.sold
  );
}

/** Weeztix shop-only sold (total minus barcode / allocation pools). */
export function weeztixShopSold(
  totalSold: number,
  channels: Record<WeeztixSalesChannel, ChannelInventorySummary>,
): number {
  return Math.max(0, totalSold - weeztixSplitChannelSold(channels));
}

/** Display label for barcode pool channels: used / reserved. */
export function formatPoolUsage(
  used: number,
  reserved: number | null | undefined,
): string {
  if (reserved == null || reserved <= 0) {
    return String(used);
  }
  return `${used} / ${reserved}`;
}
