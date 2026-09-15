/** Weersoorten waarop gebruikers een alert kunnen zetten (niet ideaal/ok). */
export const ALERT_WEATHER_KINDS = [
  "heat",
  "cold_wet",
  "wet",
  "cold",
  "windy",
] as const;

export type AlertWeatherKind = (typeof ALERT_WEATHER_KINDS)[number];

export const ALERT_WEATHER_KIND_LABEL: Record<AlertWeatherKind, string> = {
  heat: "Te heet",
  cold_wet: "Koud & nat",
  wet: "Regenachtig",
  cold: "Koud",
  windy: "Winderig",
};

export function isAlertWeatherKind(value: string): value is AlertWeatherKind {
  return (ALERT_WEATHER_KINDS as readonly string[]).includes(value);
}

export function alertWeatherKindLabel(kind: AlertWeatherKind): string {
  return ALERT_WEATHER_KIND_LABEL[kind];
}
