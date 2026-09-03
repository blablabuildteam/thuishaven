/**
 * Outreach cadence / planning — wat staat klaar, in welk ritme.
 * Geen verzending: alleen zichtbaarheid voor review.
 */

import { listExclusions, listOutreachEmails, listProspects } from "./data";
import { openAvailabilityDaysLive } from "./availability";
import { outreachSendBlockReason } from "./send-policy";
import { OUTREACH_VARIANTS } from "./tone";

export type CadencePlan = {
  /** Weekdays Mon=1 … Fri=5 */
  sendWeekdays: number[];
  mailsPerDay: number;
  batchLabel: string;
  notes: string[];
};

/** Conservatief start-ritme voor bureau-stream (handmatig goedkeuren later). */
export const DEFAULT_AGENCY_CADENCE: CadencePlan = {
  sendWeekdays: [2, 4], // di + do
  mailsPerDay: 3,
  batchLabel: "Eventbureaus · open data",
  notes: [
    "Alleen bureaus met e-mail, niet op uitsluitingslijst.",
    "Geen automatische send — jij keurt batches goed in dit dashboard.",
    "Max 3 mails/dag · di & do → ~6/week, rustig opbouwen.",
    "Afzender later via zakelijk@thuishaven.nl (bestaande Brevo), reply-to evenement@ — niet postduif@.",
  ],
};

export type PlannedSlot = {
  dayIndex: number;
  dateLabel: string;
  weekdayLabel: string;
  prospects: Array<{
    id: string;
    companyName: string;
    email: string;
    status: string;
    contacts: number;
  }>;
};

export type OutreachPlanningSnapshot = {
  sendLocked: boolean;
  sendBlockReason: string | null;
  readyCount: number;
  excludedAgencyCount: number;
  noEmailCount: number;
  exclusionCount: number;
  draftCount: number;
  openSlotCount: number;
  variants: typeof OUTREACH_VARIANTS;
  cadence: CadencePlan;
  queue: Array<{
    id: string;
    companyName: string;
    email: string | null;
    status: string;
    contacts: string[];
    blockedReason: string | null;
  }>;
  schedule: PlannedSlot[];
  weeksToClear: number;
};

const WEEKDAY_NL = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function nextSendDates(
  cadence: CadencePlan,
  count: number,
  from = new Date(),
): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(12, 0, 0, 0);
  // start tomorrow so "vandaag" niet per ongeluk als send-dag voelt
  cursor.setDate(cursor.getDate() + 1);

  let guard = 0;
  while (out.length < count && guard < 400) {
    const dow = cursor.getDay(); // 0=zo
    const isoDow = dow === 0 ? 7 : dow;
    if (cadence.sendWeekdays.includes(isoDow)) {
      for (let i = 0; i < cadence.mailsPerDay && out.length < count; i++) {
        out.push(new Date(cursor));
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

export async function getOutreachPlanningSnapshot(): Promise<OutreachPlanningSnapshot> {
  const [{ rows: prospects }, { rows: exclusions }, { rows: emails }, openSlots] =
    await Promise.all([
      listProspects({ type: "agency" }),
      listExclusions(),
      listOutreachEmails(100),
      openAvailabilityDaysLive(),
    ]);

  const cadence = DEFAULT_AGENCY_CADENCE;
  const block = outreachSendBlockReason();

  const queue = prospects.map((p) => {
    let blockedReason: string | null = null;
    if (p.status === "excluded") {
      blockedReason = p.excludedReason ?? "Uitgesloten";
    } else if (!p.email) {
      blockedReason = "Geen e-mailadres";
    }
    return {
      id: p.id,
      companyName: p.companyName,
      email: p.email,
      status: p.status,
      contacts: p.contacts ?? (p.email ? [p.email] : []),
      blockedReason,
    };
  });

  const ready = queue.filter((q) => !q.blockedReason);
  const excludedAgencyCount = queue.filter((q) => q.status === "excluded").length;
  const noEmailCount = queue.filter(
    (q) => q.status !== "excluded" && !q.email,
  ).length;

  const dates = nextSendDates(cadence, ready.length);
  const byDay = new Map<string, PlannedSlot>();

  ready.forEach((prospect, idx) => {
    const date = dates[idx];
    if (!date) return;
    const key = date.toISOString().slice(0, 10);
    if (!byDay.has(key)) {
      byDay.set(key, {
        dayIndex: byDay.size + 1,
        dateLabel: key,
        weekdayLabel: WEEKDAY_NL[date.getDay()] ?? "",
        prospects: [],
      });
    }
    byDay.get(key)!.prospects.push({
      id: prospect.id,
      companyName: prospect.companyName,
      email: prospect.email!,
      status: prospect.status,
      contacts: prospect.contacts.length,
    });
  });

  const schedule = [...byDay.values()];
  const mailsPerWeek = cadence.sendWeekdays.length * cadence.mailsPerDay;
  const weeksToClear =
    mailsPerWeek > 0 ? Math.ceil(ready.length / mailsPerWeek) : 0;

  return {
    sendLocked: true,
    sendBlockReason: block,
    readyCount: ready.length,
    excludedAgencyCount,
    noEmailCount,
    exclusionCount: exclusions.length,
    draftCount: emails.filter((e) => e.status === "draft").length,
    openSlotCount: openSlots.length,
    variants: OUTREACH_VARIANTS,
    cadence,
    queue,
    schedule,
    weeksToClear,
  };
}
