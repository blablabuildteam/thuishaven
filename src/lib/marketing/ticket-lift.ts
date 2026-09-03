import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { ticketSalesDaily } from "@/lib/db/schema";
import { amsterdamDay, shiftIsoDay } from "@/lib/time/amsterdam";
import {
  classifySalesImpactRole,
  salesLiftWindow,
  type SalesImpactOffer,
  type SalesImpactRole,
} from "@/lib/marketing/sales-impact";

export type TicketLift = {
  /** Som sold over de dagen in het window; null = geen curve of geen sales-role. */
  sold: number | null;
  daysCovered: number;
  dayFrom: string;
  dayTo: string;
  signal: "measured" | "no_curve" | "excluded";
  role?: SalesImpactRole;
  windowLabel?: string;
};

/**
 * Ticketorders rond publicatie, role-aware:
 * - promo: ±1 kalenderdag (~48u)
 * - same_day: alleen eventdag
 * - after / aftermovie: excluded (geen sales-impact)
 */
export async function ticketLiftAroundPublish(options: {
  publishedAt: Date | string | null;
  editionId?: string | null;
  eventStartsAt?: Date | string | null;
  offer?: SalesImpactOffer;
  text?: string | null;
}): Promise<TicketLift> {
  const empty = (
    dayFrom: string,
    dayTo: string,
    signal: TicketLift["signal"] = "no_curve",
    role?: SalesImpactRole,
  ): TicketLift => ({
    sold: null,
    daysCovered: 0,
    dayFrom,
    dayTo,
    signal,
    role,
  });

  if (!options.publishedAt || !hasDatabase()) {
    return empty("", "");
  }

  const published =
    typeof options.publishedAt === "string"
      ? new Date(options.publishedAt)
      : options.publishedAt;
  if (Number.isNaN(published.getTime())) return empty("", "");

  const role = classifySalesImpactRole({
    publishedAt: published,
    eventStartsAt: options.eventStartsAt ?? null,
    offer: options.offer,
    text: options.text,
  });

  const window = salesLiftWindow({ role, publishedAt: published });
  if (!window) {
    return {
      ...empty("", "", "excluded", role),
      windowLabel: "n.v.t.",
    };
  }

  const { dayFrom, dayTo, label } = window;

  const db = getDb();
  const conditions = [
    eq(ticketSalesDaily.platform, "weeztix"),
    gte(ticketSalesDaily.day, dayFrom),
    lte(ticketSalesDaily.day, dayTo),
  ];
  if (options.editionId) {
    conditions.push(eq(ticketSalesDaily.editionId, options.editionId));
  }

  const rows = await db
    .select({
      sold: sql<number>`coalesce(sum(${ticketSalesDaily.sold}), 0)::int`,
      days: sql<number>`count(distinct ${ticketSalesDaily.day})::int`,
    })
    .from(ticketSalesDaily)
    .where(and(...conditions));

  const sold = Number(rows[0]?.sold ?? 0);
  const daysCovered = Number(rows[0]?.days ?? 0);

  if (daysCovered === 0) {
    return {
      sold: null,
      daysCovered: 0,
      dayFrom,
      dayTo,
      signal: "no_curve",
      role,
      windowLabel: label,
    };
  }

  return {
    sold,
    daysCovered,
    dayFrom,
    dayTo,
    signal: "measured",
    role,
    windowLabel: label,
  };
}

export async function ticketLiftByPostIds(
  posts: Array<{
    id: string;
    publishedAt: string | null;
    editionId?: string | null;
    eventStartsAt?: Date | string | null;
    offer?: SalesImpactOffer;
    text?: string | null;
  }>,
): Promise<Map<string, TicketLift>> {
  const out = new Map<string, TicketLift>();
  if (!posts.length || !hasDatabase()) return out;

  const dated = posts.filter((p) => p.publishedAt);
  if (!dated.length) {
    for (const p of posts) {
      out.set(p.id, {
        sold: null,
        daysCovered: 0,
        dayFrom: "",
        dayTo: "",
        signal: "no_curve",
      });
    }
    return out;
  }

  const windows = dated.map((p) => {
    const role = classifySalesImpactRole({
      publishedAt: p.publishedAt,
      eventStartsAt: p.eventStartsAt ?? null,
      offer: p.offer,
      text: p.text,
    });
    const window = salesLiftWindow({ role, publishedAt: p.publishedAt });
    return {
      id: p.id,
      editionId: p.editionId ?? null,
      role,
      window,
    };
  });

  const active = windows.filter((w) => w.window != null);
  for (const w of windows) {
    if (!w.window) {
      out.set(w.id, {
        sold: null,
        daysCovered: 0,
        dayFrom: "",
        dayTo: "",
        signal: "excluded",
        role: w.role,
        windowLabel: "n.v.t.",
      });
    }
  }

  if (!active.length) {
    for (const p of posts) {
      if (!out.has(p.id)) {
        out.set(p.id, {
          sold: null,
          daysCovered: 0,
          dayFrom: "",
          dayTo: "",
          signal: "no_curve",
        });
      }
    }
    return out;
  }

  const minDay = active.map((w) => w.window!.dayFrom).sort()[0]!;
  const maxDay = active.map((w) => w.window!.dayTo).sort().at(-1)!;

  const db = getDb();
  const rows = await db
    .select({
      editionId: ticketSalesDaily.editionId,
      day: ticketSalesDaily.day,
      sold: ticketSalesDaily.sold,
    })
    .from(ticketSalesDaily)
    .where(
      and(
        eq(ticketSalesDaily.platform, "weeztix"),
        gte(ticketSalesDaily.day, minDay),
        lte(ticketSalesDaily.day, maxDay),
      ),
    );

  const byEditionDay = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const day =
      typeof r.day === "string" ? r.day.slice(0, 10) : amsterdamDay(r.day);
    const sold = r.sold ?? 0;
    byDay.set(day, (byDay.get(day) ?? 0) + sold);
    byEditionDay.set(`${r.editionId}:${day}`, sold);
  }

  for (const w of active) {
    const window = w.window!;
    let sold = 0;
    let daysCovered = 0;
    for (
      let d = window.dayFrom;
      d <= window.dayTo;
      d = shiftIsoDay(d, 1)
    ) {
      const n = w.editionId
        ? (byEditionDay.get(`${w.editionId}:${d}`) ?? 0)
        : (byDay.get(d) ?? 0);
      const has =
        w.editionId != null
          ? byEditionDay.has(`${w.editionId}:${d}`)
          : byDay.has(d);
      if (has) {
        daysCovered += 1;
        sold += n;
      }
    }
    out.set(w.id, {
      sold: daysCovered > 0 ? sold : null,
      daysCovered,
      dayFrom: window.dayFrom,
      dayTo: window.dayTo,
      signal: daysCovered > 0 ? "measured" : "no_curve",
      role: w.role,
      windowLabel: window.label,
    });
  }

  for (const p of posts) {
    if (!out.has(p.id)) {
      out.set(p.id, {
        sold: null,
        daysCovered: 0,
        dayFrom: "",
        dayTo: "",
        signal: "no_curve",
      });
    }
  }

  return out;
}

export type CreativeLiftAggregate = {
  key: string;
  label: string;
  n: number;
  avgLift: number;
  measured: number;
};

export function aggregateLiftByFeature(
  rows: Array<{
    offer?: string | null;
    format?: string | null;
    hasTextOverlay?: boolean | null;
    lift: number | null;
  }>,
): CreativeLiftAggregate[] {
  const buckets = new Map<
    string,
    { label: string; lifts: number[]; measured: number }
  >();

  const add = (key: string, label: string, lift: number | null) => {
    let b = buckets.get(key);
    if (!b) {
      b = { label, lifts: [], measured: 0 };
      buckets.set(key, b);
    }
    if (lift != null) {
      b.lifts.push(lift);
      b.measured += 1;
    }
  };

  for (const r of rows) {
    if (r.offer) add(`offer:${r.offer}`, `Offer · ${r.offer}`, r.lift);
    if (r.format) add(`format:${r.format}`, `Format · ${r.format}`, r.lift);
    if (r.hasTextOverlay != null) {
      add(
        `overlay:${r.hasTextOverlay ? "yes" : "no"}`,
        r.hasTextOverlay ? "Met tekst-overlay" : "Zonder tekst-overlay",
        r.lift,
      );
    }
  }

  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: b.label,
      n: b.lifts.length,
      measured: b.measured,
      avgLift:
        b.lifts.length > 0
          ? b.lifts.reduce((s, x) => s + x, 0) / b.lifts.length
          : 0,
    }))
    .filter((b) => b.measured >= 2)
    .sort((a, b) => b.avgLift - a.avgLift);
}
