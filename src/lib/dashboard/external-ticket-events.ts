import { z } from "zod";
import { amsterdamDay } from "@/lib/time/amsterdam";

export function parseExternalEventDay(dayIso: string): Date {
  return new Date(`${dayIso}T12:00:00.000Z`);
}

export function externalEventDayInput(date: Date): string {
  return amsterdamDay(date);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeClockTime(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hhmm = trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
  return TIME_RE.test(hhmm) ? hhmm : null;
}

const clockTimeValue = z.union([z.string(), z.null()]).transform((value, ctx) => {
  if (value == null || value.trim() === "") return null;
  const normalized = normalizeClockTime(value);
  if (!normalized) {
    ctx.addIssue({
      code: "custom",
      message: "Ongeldige tijd",
    });
    return z.NEVER;
  }
  return normalized;
});

export const createExternalTicketEventSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  expectedAttendees: z.coerce
    .number()
    .int("Moet een heel getal zijn")
    .min(1, "Minimaal 1 bezoeker"),
  startTime: clockTimeValue.optional().transform((value) => value ?? null),
  endTime: clockTimeValue.optional().transform((value) => value ?? null),
});

export const updateExternalTicketEventSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200).optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum").optional(),
  expectedAttendees: z.coerce
    .number()
    .int("Moet een heel getal zijn")
    .min(1, "Minimaal 1 bezoeker")
    .optional(),
  startTime: clockTimeValue.optional(),
  endTime: clockTimeValue.optional(),
  scanned: z
    .union([
      z.coerce.number().int("Moet een heel getal zijn").min(0, "Minimaal 0"),
      z.null(),
    ])
    .optional(),
});

export type ExternalTicketEventRecord = {
  id: string;
  name: string;
  startsAt: Date;
  expectedAttendees: number;
  startTime: string | null;
  endTime: string | null;
  scanned: number | null;
};
