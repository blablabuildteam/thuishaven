import { timingSafeEqual } from "crypto";

/** Amsterdam-uren waarop TicketSwap-listings worden gesynchroniseerd. */
export const TICKETSWAP_CRON_HOURS_AMSTERDAM = [8, 13, 19, 23] as const;

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

export function isTicketswapCronSlot(at: Date = new Date()): boolean {
  return (TICKETSWAP_CRON_HOURS_AMSTERDAM as readonly number[]).includes(
    amsterdamHour(at),
  );
}
