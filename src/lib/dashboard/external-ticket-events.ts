import { z } from "zod";
import { amsterdamDay } from "@/lib/time/amsterdam";

export function parseExternalEventDay(dayIso: string): Date {
  return new Date(`${dayIso}T12:00:00.000Z`);
}

export function externalEventDayInput(date: Date): string {
  return amsterdamDay(date);
}

export const createExternalTicketEventSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  expectedAttendees: z.coerce
    .number()
    .int("Moet een heel getal zijn")
    .min(1, "Minimaal 1 bezoeker"),
});

export const updateExternalTicketEventSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200).optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum").optional(),
  expectedAttendees: z.coerce
    .number()
    .int("Moet een heel getal zijn")
    .min(1, "Minimaal 1 bezoeker")
    .optional(),
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
  scanned: number | null;
};
