import {
  scoreFestivalWeather,
  type FestivalWeatherInput,
  type FestivalWeatherScore,
} from "@/lib/weather/festival-score";
import { weatherCodeLabel } from "@/lib/weather/open-meteo";
import { isOutdoorSeason } from "@/lib/time/amsterdam";

/**
 * Leesbare weersoort op de eventdag — geen 1–10 score als hoofdverhaal.
 * Hitte, koud+nat, regen en wind zijn de types die sfeer / last-minute raken.
 */
export type WeatherKind =
  | "heat"
  | "cold_wet"
  | "wet"
  | "cold"
  | "windy"
  | "ideal"
  | "ok";

export type ClassifiedWeather = {
  kind: WeatherKind;
  /** "Koud & nat" */
  label: string;
  /** "12° · 18 mm regen" */
  summary: string;
  sky: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipMm: number;
  windMaxMps: number | null;
  score: FestivalWeatherScore;
  outdoorSeason: boolean;
};

const KIND_LABEL: Record<WeatherKind, string> = {
  heat: "Te heet",
  cold_wet: "Koud & nat",
  wet: "Regenachtig",
  cold: "Koud",
  windy: "Winderig",
  ideal: "Ideaal outdoor",
  ok: "Redelijk",
};

/** Korte definities voor filter-legend. */
export const WEATHER_DEFS: Array<{
  kind: WeatherKind;
  label: string;
  definition: string;
}> = [
  {
    kind: "ideal",
    label: KIND_LABEL.ideal,
    definition: "max 18–25°C, <1,5 mm, geen harde wind",
  },
  {
    kind: "heat",
    label: KIND_LABEL.heat,
    definition: "max ≥28°C",
  },
  {
    kind: "cold_wet",
    label: KIND_LABEL.cold_wet,
    definition: "outdoor koel (<16–18°C) én regen",
  },
  {
    kind: "wet",
    label: KIND_LABEL.wet,
    definition: "≥5 mm regen (niet per se koud)",
  },
  {
    kind: "cold",
    label: KIND_LABEL.cold,
    definition: "outdoor <15°C, weinig regen",
  },
  {
    kind: "windy",
    label: KIND_LABEL.windy,
    definition: "wind ≥10 m/s, verder geen harsh weer",
  },
  {
    kind: "ok",
    label: KIND_LABEL.ok,
    definition: "rest — geen extreme hitte/kou/regen",
  },
];

export function weatherKindLabel(kind: WeatherKind): string {
  return KIND_LABEL[kind];
}

export function classifyEventWeather(
  input: FestivalWeatherInput,
): ClassifiedWeather {
  const score = scoreFestivalWeather(input);
  const tempMax = input.tempMaxC ?? null;
  const tempMin = input.tempMinC ?? null;
  const precip = input.precipMm ?? 0;
  const wind = input.windMaxMps ?? 0;
  const outdoor = isOutdoorSeason(input.day ?? "");
  const sky = weatherCodeLabel(input.weatherCode);

  let kind: WeatherKind = "ok";

  if (tempMax != null && tempMax >= 28) {
    kind = "heat";
  } else if (
    outdoor &&
    tempMax != null &&
    tempMax < 16 &&
    precip >= 1.5
  ) {
    kind = "cold_wet";
  } else if (
    outdoor &&
    tempMax != null &&
    tempMax < 18 &&
    precip >= 5
  ) {
    kind = "cold_wet";
  } else if (!outdoor && tempMax != null && tempMax < 8 && precip >= 2) {
    kind = "cold_wet";
  } else if (precip >= 5) {
    kind = "wet";
  } else if (outdoor && tempMax != null && tempMax < 15) {
    kind = "cold";
  } else if (
    !outdoor &&
    tempMax != null &&
    tempMax < 6 &&
    precip < 2
  ) {
    kind = "cold";
  } else if (
    tempMax != null &&
    tempMax >= 18 &&
    tempMax <= 25 &&
    precip < 1.5 &&
    wind < 10
  ) {
    kind = "ideal";
  } else if (wind >= 10) {
    kind = "windy";
  }

  const tempBit =
    tempMax != null ? `${Math.round(tempMax)}°` : "geen temp";
  const rainBit =
    precip >= 0.5 ? `${precip.toFixed(precip >= 10 ? 0 : 1)} mm regen` : "droog";

  return {
    kind,
    label: KIND_LABEL[kind],
    summary: `${tempBit} · ${rainBit}`,
    sky,
    tempMaxC: tempMax,
    tempMinC: tempMin,
    precipMm: precip,
    windMaxMps: input.windMaxMps ?? null,
    score,
    outdoorSeason: outdoor,
  };
}
