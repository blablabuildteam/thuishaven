import { displayEditionName } from "@/lib/editions/lineup";

export function formatEventDateLong(startsAt: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(startsAt);
}

export function formatEventDateShort(startsAt: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Amsterdam",
  }).format(startsAt);
}

export function alertEventTitle(name: string): string {
  return displayEditionName(name);
}

export function alertEventLabel(name: string, startsAt: Date): string {
  return `${alertEventTitle(name)} · ${formatEventDateLong(startsAt)}`;
}
