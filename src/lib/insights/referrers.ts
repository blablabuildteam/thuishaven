import { desc, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { ticketSaleReferrers } from "@/lib/db/schema";

export type ReferrerChannelTotal = {
  channel: string;
  orders: number;
};

const CHANNEL_LABEL: Record<string, string> = {
  brevo: "Brevo / mail",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  shop: "Weeztix shop",
  direct: "Direct",
  other: "Overig",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function referrerChannelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

/** Geaggregeerde order-referrers (Weeztix) per kanaal. */
export async function getReferrerChannelTotals(options?: {
  limit?: number;
}): Promise<{
  channels: ReferrerChannelTotal[];
  totalOrders: number;
}> {
  if (!hasDatabase()) {
    return { channels: [], totalOrders: 0 };
  }

  const db = getDb();
  const rows = await db
    .select({
      channel: ticketSaleReferrers.channel,
      orders: sql<number>`coalesce(sum(${ticketSaleReferrers.orderCount}), 0)::int`,
    })
    .from(ticketSaleReferrers)
    .groupBy(ticketSaleReferrers.channel)
    .orderBy(desc(sql`sum(${ticketSaleReferrers.orderCount})`));

  const channels = rows
    .map((r) => ({
      channel: r.channel,
      orders: Number(r.orders) || 0,
    }))
    .filter((r) => r.orders > 0)
    .slice(0, options?.limit ?? 12);

  return {
    channels,
    totalOrders: channels.reduce((s, c) => s + c.orders, 0),
  };
}
