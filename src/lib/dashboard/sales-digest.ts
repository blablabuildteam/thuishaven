import { renderSalesDigestEmail } from "@/lib/dashboard/sales-digest-email";
import {
  alertSender,
  sendBrevoTransactionalEmail,
} from "@/lib/integrations/brevo/client";
import { isWithinHardDomainCeiling } from "@/lib/integrations/alerts/recipients";
import {
  fetchWeeztixHourlySales,
  listOnSaleWeeztixEditions,
  type HourlySalesPoint,
} from "@/lib/integrations/weeztix/daily";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Window + 7 days back, for the week-ago comparison and the weekly average. */
const LOOKBACK_DAYS = 8;

export type SalesDigestEvent = {
  editionId: string;
  name: string;
  startsAt: Date;
  sold: number;
  revenueCents: number;
  soldWeekAgo: number;
};

export type SalesDigest = {
  /** Rolling window [windowStart, windowEnd), on whole hours. */
  windowStart: Date;
  windowEnd: Date;
  sold: number;
  revenueCents: number;
  /** Same 24h window exactly one week earlier. */
  soldWeekAgo: number;
  revenueCentsWeekAgo: number;
  /** Average tickets per 24h over the 7 days before the window. */
  avgSoldPrevWeek: number;
  /** Beat every one of the 7 previous 24h windows. */
  bestOfWeek: boolean;
  busiestHour: { at: Date; sold: number } | null;
  selling: SalesDigestEvent[];
  quiet: SalesDigestEvent[];
};

function sumWindow(points: HourlySalesPoint[], start: number, end: number) {
  let sold = 0;
  let revenueCents = 0;
  for (const p of points) {
    if (p.at < start || p.at >= end) continue;
    sold += p.sold;
    revenueCents += p.revenueCents;
  }
  return { sold, revenueCents };
}

/**
 * Ticketverkoop van de afgelopen 24 uur per event, uit dezelfde Weeztix
 * order-histogram als Verkoop per dag, maar per uur i.p.v. per kalenderdag.
 */
export async function loadSalesDigest(
  now: Date = new Date(),
): Promise<{ ok: true; digest: SalesDigest } | { ok: false; error: string }> {
  const end = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const start = end - DAY_MS;
  const editions = await listOnSaleWeeztixEditions();

  const res = await fetchWeeztixHourlySales({
    eventGuids: editions.map((e) => e.guid),
    start: new Date(end - LOOKBACK_DAYS * DAY_MS),
    end: new Date(end),
  });
  if (!res.ok) return { ok: false, error: res.error };

  const allPoints = [...res.byEvent.values()].flat();
  const events: SalesDigestEvent[] = editions.map((edition) => {
    const points = res.byEvent.get(edition.guid) ?? [];
    const now24 = sumWindow(points, start, end);
    const weekAgo = sumWindow(points, start - 7 * DAY_MS, end - 7 * DAY_MS);
    return {
      editionId: edition.id,
      name: edition.name,
      startsAt: edition.startsAt,
      sold: now24.sold,
      revenueCents: now24.revenueCents,
      soldWeekAgo: weekAgo.sold,
    };
  });

  const total = sumWindow(allPoints, start, end);
  const weekAgo = sumWindow(allPoints, start - 7 * DAY_MS, end - 7 * DAY_MS);
  const previous = Array.from({ length: 7 }, (_, i) =>
    sumWindow(allPoints, start - (i + 1) * DAY_MS, end - (i + 1) * DAY_MS).sold,
  );

  const byHour = new Map<number, number>();
  for (const p of allPoints) {
    if (p.at < start || p.at >= end) continue;
    byHour.set(p.at, (byHour.get(p.at) ?? 0) + p.sold);
  }
  let busiestHour: SalesDigest["busiestHour"] = null;
  for (const [at, sold] of byHour) {
    if (!busiestHour || sold > busiestHour.sold) {
      busiestHour = { at: new Date(at), sold };
    }
  }

  return {
    ok: true,
    digest: {
      windowStart: new Date(start),
      windowEnd: new Date(end),
      sold: total.sold,
      revenueCents: total.revenueCents,
      soldWeekAgo: weekAgo.sold,
      revenueCentsWeekAgo: weekAgo.revenueCents,
      avgSoldPrevWeek: previous.reduce((a, b) => a + b, 0) / previous.length,
      bestOfWeek: total.sold > 0 && previous.every((sold) => total.sold > sold),
      busiestHour,
      selling: events
        .filter((e) => e.sold > 0)
        .sort((a, b) => b.sold - a.sold || b.revenueCents - a.revenueCents),
      quiet: events
        .filter((e) => e.sold === 0 && e.startsAt.getTime() > now.getTime())
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    },
  };
}

export const DEFAULT_SALES_DIGEST_RECIPIENTS = [
  "job@thuishaven.nl",
  "kasper@thuishaven.nl",
] as const;

export function salesDigestRecipients(): string[] {
  const fromEnv = (process.env.SALES_DIGEST_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : [...DEFAULT_SALES_DIGEST_RECIPIENTS];
}

/** Laadt de 24u-cijfers en mailt ze. Alleen naar *@thuishaven.nl / *@blablabuild.com. */
export async function sendSalesDigest(input: {
  to: string[];
  now?: Date;
}): Promise<
  | { ok: true; to: string[]; subject: string; sold: number; revenueCents: number }
  | { ok: false; error: string }
> {
  const blocked = input.to.filter((email) => !isWithinHardDomainCeiling(email));
  if (blocked.length > 0) {
    return { ok: false, error: `Ontvanger niet toegestaan: ${blocked.join(", ")}` };
  }
  if (input.to.length === 0) return { ok: false, error: "Geen ontvangers" };

  const now = input.now ?? new Date();
  const loaded = await loadSalesDigest(now);
  if (!loaded.ok) return loaded;

  const mail = renderSalesDigestEmail(loaded.digest, now);
  const sent = await sendBrevoTransactionalEmail({
    to: input.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    sender: { email: alertSender().email, name: "De Thuishaven Kassa" },
  });
  if (!sent.ok) return sent;
  return {
    ok: true,
    to: input.to,
    subject: mail.subject,
    sold: loaded.digest.sold,
    revenueCents: loaded.digest.revenueCents,
  };
}
