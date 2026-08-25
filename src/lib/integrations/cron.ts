import { timingSafeEqual } from "crypto";

/** Amsterdam-uren voor dashboard-sync (Weeztix + TicketSwap). */
export const AMSTERDAM_SYNC_HOURS = [8, 13, 19, 23] as const;
export const TICKETSWAP_CRON_HOURS_AMSTERDAM = AMSTERDAM_SYNC_HOURS;
export const WEEZTIX_CRON_HOURS_AMSTERDAM = AMSTERDAM_SYNC_HOURS;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET`. Fail-closed zonder secret. */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  return safeEqual(header, `Bearer ${secret}`);
}

export function amsterdamHour(at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return Number(hour);
}

export function isAmsterdamSyncSlot(at: Date = new Date()): boolean {
  return (AMSTERDAM_SYNC_HOURS as readonly number[]).includes(amsterdamHour(at));
}

export function isTicketswapCronSlot(at: Date = new Date()): boolean {
  return isAmsterdamSyncSlot(at);
}

export function isWeeztixCronSlot(at: Date = new Date()): boolean {
  return isAmsterdamSyncSlot(at);
}
