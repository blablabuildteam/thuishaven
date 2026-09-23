/**
 * Weeztix ticket prices include btw. Thuishaven tickets use the 9% culture rate.
 * Excl. is the inclusive amount minus the VAT cents, so the two still add up.
 */
export const TICKET_BTW_RATE = 0.09;

export function ticketRevenueExclBtwCents(inclCents: number): number {
  const vat = Math.round((inclCents * TICKET_BTW_RATE) / (1 + TICKET_BTW_RATE));
  return inclCents - vat;
}
