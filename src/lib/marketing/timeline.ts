import { and, desc, eq, gte, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import { emailCampaignMetrics, marketingPosts, ticketSalesDaily } from "@/lib/db/schema";
import { amsterdamDay } from "@/lib/time/amsterdam";

export type TimelineDay = {
  day: string;
  sold: number;
  posts: number;
  mails: number;
};

export type TimelineMarker = {
  day: string;
  channel: "instagram" | "tiktok" | "youtube" | "brevo" | "other";
  label: string;
  permalink: string | null;
};

export type MarketingTimeline = {
  days: TimelineDay[];
  markers: TimelineMarker[];
};

/** Venue-wide daily sales + marketing activity markers for correlation charts. */
export const loadMarketingTimeline = cache(
  async (options?: { days?: number }): Promise<MarketingTimeline> => {
    if (!hasDatabase()) return { days: [], markers: [] };

    const windowDays = Math.min(Math.max(options?.days ?? 60, 14), 180);
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - windowDays);
    const startDay = amsterdamDay(start);

    const db = getDb();

    const salesRows = await db
      .select({
        day: ticketSalesDaily.day,
        sold: sql<number>`coalesce(sum(${ticketSalesDaily.sold}), 0)::int`,
      })
      .from(ticketSalesDaily)
      .where(
        and(
          eq(ticketSalesDaily.platform, "weeztix"),
          gte(ticketSalesDaily.day, startDay),
        ),
      )
      .groupBy(ticketSalesDaily.day)
      .orderBy(ticketSalesDaily.day);

    const posts = await db
      .select({
        channel: marketingPosts.channel,
        title: marketingPosts.title,
        permalink: marketingPosts.permalink,
        publishedAt: marketingPosts.publishedAt,
      })
      .from(marketingPosts)
      .where(gte(marketingPosts.publishedAt, start))
      .orderBy(desc(marketingPosts.publishedAt))
      .limit(200);

    const mails = await db
      .select({
        name: emailCampaignMetrics.name,
        sentAt: emailCampaignMetrics.sentAt,
      })
      .from(emailCampaignMetrics)
      .where(gte(emailCampaignMetrics.sentAt, start))
      .orderBy(desc(emailCampaignMetrics.sentAt))
      .limit(80);

    const byDay = new Map<string, TimelineDay>();
    for (const row of salesRows) {
      const day =
        typeof row.day === "string"
          ? row.day
          : amsterdamDay(new Date(row.day));
      byDay.set(day, { day, sold: row.sold, posts: 0, mails: 0 });
    }

    const markers: TimelineMarker[] = [];

    for (const post of posts) {
      if (!post.publishedAt) continue;
      const day = amsterdamDay(post.publishedAt);
      const cur = byDay.get(day) ?? { day, sold: 0, posts: 0, mails: 0 };
      cur.posts += 1;
      byDay.set(day, cur);
      markers.push({
        day,
        channel: post.channel,
        label: (post.title ?? post.channel).slice(0, 60),
        permalink: post.permalink,
      });
    }

    for (const mail of mails) {
      if (!mail.sentAt) continue;
      const day = amsterdamDay(mail.sentAt);
      const cur = byDay.get(day) ?? { day, sold: 0, posts: 0, mails: 0 };
      cur.mails += 1;
      byDay.set(day, cur);
      markers.push({
        day,
        channel: "brevo",
        label: mail.name.slice(0, 60),
        permalink: null,
      });
    }

    // Fill gaps so the chart stays continuous
    const days: TimelineDay[] = [];
    const cursor = new Date(`${startDay}T12:00:00Z`);
    const endDay = amsterdamDay(end);
    while (amsterdamDay(cursor) <= endDay) {
      const day = amsterdamDay(cursor);
      days.push(byDay.get(day) ?? { day, sold: 0, posts: 0, mails: 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      days,
      markers: markers.slice(0, 80),
    };
  },
);

export type ChannelImpact = {
  channel: string;
  posts: number;
  avgLift: number;
  measured: number;
  topTitle: string | null;
};

export const loadChannelImpact = cache(
  async (): Promise<ChannelImpact[]> => {
    if (!hasDatabase()) return [];
    const { loadMarketingPostsBundle } = await import("@/lib/marketing/posts");
    const channels = ["instagram", "tiktok", "youtube"] as const;
    const out: ChannelImpact[] = [];

    for (const channel of channels) {
      const bundle = await loadMarketingPostsBundle({
        limit: 40,
        channel,
        withLift: true,
      });
      const measured = bundle.posts.filter(
        (p) => p.ticketLift?.signal === "measured",
      );
      const avgLift =
        measured.length > 0
          ? measured.reduce((s, p) => s + (p.ticketLift?.sold ?? 0), 0) /
            measured.length
          : 0;
      const top = [...measured].sort(
        (a, b) => (b.ticketLift?.sold ?? 0) - (a.ticketLift?.sold ?? 0),
      )[0];
      if (bundle.posts.length === 0) continue;
      out.push({
        channel,
        posts: bundle.posts.length,
        avgLift,
        measured: measured.length,
        topTitle: top?.title ?? bundle.posts[0]?.title ?? null,
      });
    }

    return out;
  },
);
