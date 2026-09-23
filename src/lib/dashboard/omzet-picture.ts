import type { HorecaRevenueEvent } from "@/lib/dashboard/horeca-amounts";
import { rowHorecaCents } from "@/lib/dashboard/horeca-amounts";
import { displayEditionName } from "@/lib/editions/lineup";
import { formatEuroFromCents } from "@/lib/utils";

/** Een bedrag, of een band als de DJ-fees een range zijn. */
export type EuroBand = {
  minCents: number;
  maxCents: number;
  /** Bovenkant ligt open, bijvoorbeeld een DJ-band van €10.000+. */
  openEnded: boolean;
  /** Er mist ticket-, horeca- of DJ-informatie. Geen ads telt als €0. */
  incomplete: boolean;
};

type PictureEvent = Pick<
  HorecaRevenueEvent,
  "ticketExclCents" | "barCents" | "kitchenCents" | "djFees" | "adsCents"
>;

/** Tickets excl. btw + horeca. Onvolledig zolang tickets of bar/keuken ontbreken. */
export function revenueBand(event: PictureEvent): EuroBand | null {
  const horeca = rowHorecaCents(event.barCents, event.kitchenCents);
  if (event.ticketExclCents == null && horeca.cents == null) return null;
  const cents = (event.ticketExclCents ?? 0) + (horeca.cents ?? 0);
  return {
    minCents: cents,
    maxCents: cents,
    openEnded: false,
    incomplete: event.ticketExclCents == null || !horeca.complete,
  };
}

/** DJ-band plus betaalde ads. Geen ads telt als €0. Ontbrekende DJ-fees maken het totaal onvolledig. */
export function costBand(event: PictureEvent): EuroBand | null {
  const dj = event.djFees;
  const pricedDj = dj != null && dj.priced > 0 ? dj : null;
  const ads = event.adsCents ?? 0;
  const djMissing = dj != null && dj.missing > 0;
  if (!pricedDj && ads === 0 && !djMissing) return null;
  return {
    minCents: (pricedDj?.min ?? 0) * 100 + ads,
    maxCents: (pricedDj?.max ?? 0) * 100 + ads,
    openEnded: pricedDj?.openEnded ?? false,
    incomplete: !pricedDj || djMissing,
  };
}

/** Omzet minus kosten. Bij een DJ-range is het resultaat zelf een range. */
export function resultBand(
  revenue: EuroBand | null,
  costs: EuroBand | null,
): EuroBand | null {
  if (!revenue && !costs) return null;
  const rev = revenue ?? {
    minCents: 0,
    maxCents: 0,
    openEnded: false,
    incomplete: true,
  };
  const cost = costs ?? {
    minCents: 0,
    maxCents: 0,
    openEnded: false,
    incomplete: true,
  };
  return {
    minCents: rev.minCents - cost.maxCents,
    maxCents: rev.maxCents - cost.minCents,
    openEnded: rev.openEnded || cost.openEnded,
    incomplete: !revenue || !costs || rev.incomplete || cost.incomplete,
  };
}

export function sumBands(bands: Array<EuroBand | null>): EuroBand | null {
  if (bands.every((band) => band == null)) return null;
  let minCents = 0;
  let maxCents = 0;
  let openEnded = false;
  let incomplete = false;
  for (const band of bands) {
    if (!band) {
      incomplete = true;
      continue;
    }
    minCents += band.minCents;
    maxCents += band.maxCents;
    openEnded = openEnded || band.openEnded;
    incomplete = incomplete || band.incomplete;
  }
  return { minCents, maxCents, openEnded, incomplete };
}

export function sumDjFees(
  spends: Array<HorecaRevenueEvent["djFees"]>,
): HorecaRevenueEvent["djFees"] {
  const present = spends.filter(
    (spend): spend is NonNullable<HorecaRevenueEvent["djFees"]> => spend != null,
  );
  if (present.length === 0) return null;
  const total = {
    min: 0,
    max: 0,
    openEnded: false,
    priced: 0,
    missing: 0,
  };
  for (const spend of present) {
    total.min += spend.min;
    total.max += spend.max;
    total.openEnded = total.openEnded || spend.openEnded;
    total.priced += spend.priced;
    total.missing += spend.missing;
  }
  if (total.priced === 0 && total.missing === 0) return null;
  return total;
}

export function pictureFor(events: PictureEvent[]): {
  revenue: EuroBand | null;
  costs: EuroBand | null;
  result: EuroBand | null;
} {
  const revenue = sumBands(events.map(revenueBand));
  const costs = sumBands(events.map(costBand));
  return { revenue, costs, result: resultBand(revenue, costs) };
}

/**
 * `atLeast` voor kosten (€1.000+). `atMost` voor een resultaat waarvan de
 * kosten aan de bovenkant open zijn (≤ €4.000).
 */
export function formatEuroBand(
  band: EuroBand | null,
  open: "atLeast" | "atMost" = "atLeast",
): string {
  if (!band) return "—";
  if (band.openEnded) {
    const bound = open === "atLeast" ? band.minCents : band.maxCents;
    return open === "atLeast"
      ? `${formatEuroFromCents(bound)}+`
      : `≤ ${formatEuroFromCents(bound)}`;
  }
  const lo = Math.min(band.minCents, band.maxCents);
  const hi = Math.max(band.minCents, band.maxCents);
  if (lo === hi) return formatEuroFromCents(lo);
  return `${formatEuroFromCents(lo)}–${formatEuroFromCents(hi)}`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinSentences(parts: Array<string | null>): string | null {
  const present = parts.filter((part): part is string => part != null && part !== "");
  if (present.length === 0) return null;
  return present.join(". ");
}

/** Wat er mist voor de horeca-som. */
export function horecaGap(
  event: Pick<PictureEvent, "barCents" | "kitchenCents">,
): string | null {
  if (event.barCents == null && event.kitchenCents == null) {
    return "Bar en keuken nog niet ingevuld";
  }
  if (event.barCents == null) return "Bar nog niet ingevuld";
  if (event.kitchenCents == null) return "Keuken nog niet ingevuld";
  return null;
}

export function revenueGap(event: PictureEvent): string | null {
  return joinSentences([
    event.ticketExclCents == null ? "Ticketomzet ontbreekt" : null,
    horecaGap(event),
  ]);
}

export function djGap(spend: HorecaRevenueEvent["djFees"]): string | null {
  if (!spend || spend.missing <= 0) return null;
  return countLabel(spend.missing, "DJ zonder fee", "DJs zonder fee");
}

export function costGap(event: PictureEvent): string | null {
  const dj = event.djFees;
  if (dj && dj.missing > 0) return djGap(dj);
  if (!dj || dj.priced === 0) return "DJ-fees nog niet ingevuld";
  return null;
}

export function resultGap(event: PictureEvent): string | null {
  return joinSentences([revenueGap(event), costGap(event)]);
}

type NamedPictureEvent = PictureEvent & { name: string };

function namedGaps(
  events: NamedPictureEvent[],
  gap: (event: NamedPictureEvent) => string | null,
): string | null {
  const lines = events.flatMap((event) => {
    const missing = gap(event);
    return missing ? [`${displayEditionName(event.name)}: ${missing}`] : [];
  });
  return lines.length > 0 ? lines.join("\n") : null;
}

/** Uitleg voor een maand- of sectietotaal, met het event erbij. */
export function describePictureGaps(events: NamedPictureEvent[]): {
  revenue: string | null;
  costs: string | null;
  result: string | null;
} {
  return {
    revenue: namedGaps(events, revenueGap),
    costs: namedGaps(events, costGap),
    result: namedGaps(events, resultGap),
  };
}
