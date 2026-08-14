/**
 * Festival-weer rating voor outdoor (Thuishaven / NL zomer-events).
 *
 * Geen harde wetenschap — heuristiek op basis van comfort:
 * - Sweet spot ~18–25°C, droog, niet te windig
 * - Hittegolf / zware regen / onweer / koud in de zomer → lager
 *
 * Score 1–10 zodat je dagen kunt vergelijken naast ticketdata.
 */

export type FestivalWeatherBand =
  | "excellent"
  | "good"
  | "ok"
  | "poor"
  | "harsh";

export type FestivalWeatherInput = {
  /** YYYY-MM-DD — voor seizoenscontext */
  day?: string | null;
  tempMinC?: number | null;
  tempMaxC?: number | null;
  precipMm?: number | null;
  windMaxMps?: number | null;
  weatherCode?: number | null;
};

export type FestivalWeatherScore = {
  /** 1 (slecht) … 10 (ideaal outdoor) */
  score: number;
  band: FestivalWeatherBand;
  /** Kort NL-label, bijv. "Goed festivalweer" */
  label: string;
  /** Waarom deze score (NL) */
  reasons: string[];
};

const BAND_LABEL: Record<FestivalWeatherBand, string> = {
  excellent: "Top festivalweer",
  good: "Goed festivalweer",
  ok: "Redelijk festivalweer",
  poor: "Matig festivalweer",
  harsh: "Slecht festivalweer",
};

function monthFromDay(day?: string | null): number | null {
  if (!day || day.length < 7) return null;
  const m = Number(day.slice(5, 7));
  return Number.isFinite(m) ? m : null;
}

function isWarmSeason(month: number | null): boolean {
  // Mei–sept: outdoor-seizoen in AMS
  return month != null && month >= 5 && month <= 9;
}

function bandFromScore(score: number): FestivalWeatherBand {
  if (score >= 9) return "excellent";
  if (score >= 7) return "good";
  if (score >= 5) return "ok";
  if (score >= 3) return "poor";
  return "harsh";
}

/**
 * Deducties vanaf 10. Clampt naar 1–10.
 */
export function scoreFestivalWeather(
  input: FestivalWeatherInput,
): FestivalWeatherScore {
  const reasons: string[] = [];
  let points = 10;

  const tempMax = input.tempMaxC;
  const tempMin = input.tempMinC;
  const precip = input.precipMm ?? 0;
  const wind = input.windMaxMps ?? 0;
  const code = input.weatherCode;
  const month = monthFromDay(input.day);
  const warmSeason = isWarmSeason(month);

  // —— Temperatuur ——
  if (tempMax == null) {
    points -= 1;
    reasons.push("Geen temperatuurdata");
  } else if (tempMax >= 34) {
    points -= 5;
    reasons.push(`Extreme hitte (${tempMax.toFixed(0)}°C)`);
  } else if (tempMax >= 31) {
    points -= 3.5;
    reasons.push(`Hittegolf-achtig (${tempMax.toFixed(0)}°C)`);
  } else if (tempMax >= 28) {
    points -= 2;
    reasons.push(`Aan de warme kant (${tempMax.toFixed(0)}°C)`);
  } else if (tempMax >= 25 && tempMax < 28) {
    points -= 0.5;
    reasons.push(`Warm maar meestal ok (${tempMax.toFixed(0)}°C)`);
  } else if (tempMax >= 18 && tempMax <= 24) {
    reasons.push(`Comfortabele max (${tempMax.toFixed(0)}°C)`);
  } else if (tempMax >= 15 && tempMax < 18) {
    points -= warmSeason ? 1.5 : 0.5;
    reasons.push(
      warmSeason
        ? `Fris voor outdoor-seizoen (${tempMax.toFixed(0)}°C)`
        : `Koel (${tempMax.toFixed(0)}°C)`,
    );
  } else if (tempMax >= 10 && tempMax < 15) {
    points -= warmSeason ? 3 : 1.5;
    reasons.push(
      warmSeason
        ? `Koud voor de zomer (${tempMax.toFixed(0)}°C)`
        : `Koud (${tempMax.toFixed(0)}°C)`,
    );
  } else if (tempMax < 10) {
    points -= warmSeason ? 4.5 : 2.5;
    reasons.push(`Te koud outdoor (${tempMax.toFixed(0)}°C)`);
  }

  if (tempMin != null && warmSeason && tempMin < 8) {
    points -= 0.5;
    reasons.push(`Koele nacht (${tempMin.toFixed(0)}°C)`);
  }

  // —— Neerslag ——
  if (precip >= 20) {
    points -= 4.5;
    reasons.push(`Zware regen (${precip.toFixed(1)} mm)`);
  } else if (precip >= 10) {
    points -= 3;
    reasons.push(`Veel regen (${precip.toFixed(1)} mm)`);
  } else if (precip >= 5) {
    points -= 2;
    reasons.push(`Natte dag (${precip.toFixed(1)} mm)`);
  } else if (precip >= 2) {
    points -= 1;
    reasons.push(`Lichte regen (${precip.toFixed(1)} mm)`);
  } else if (precip >= 0.5) {
    points -= 0.4;
    reasons.push(`Druppels (${precip.toFixed(1)} mm)`);
  } else {
    reasons.push("Droog");
  }

  // —— Wind (m/s) ——
  if (wind >= 14) {
    points -= 2.5;
    reasons.push(`Harde wind (${wind.toFixed(0)} m/s)`);
  } else if (wind >= 10) {
    points -= 1.5;
    reasons.push(`Stevige wind (${wind.toFixed(0)} m/s)`);
  } else if (wind >= 7) {
    points -= 0.7;
    reasons.push(`Winderig (${wind.toFixed(0)} m/s)`);
  }

  // —— WMO weather code ——
  if (code != null) {
    if (code >= 95) {
      points -= 3;
      reasons.push("Onweer");
    } else if (code >= 80 && code <= 82) {
      points -= 1.5;
      reasons.push("Buien");
    } else if (code >= 61 && code <= 67) {
      points -= 1;
      reasons.push("Regenachtig");
    } else if (code >= 45 && code <= 48) {
      points -= 0.8;
      reasons.push("Mistig");
    } else if ((code === 2 || code === 3) && precip < 0.5) {
      points -= 0.4;
      reasons.push("Bewolkt");
    } else if (code === 0 || code === 1) {
      reasons.push(code === 0 ? "Helder" : "Overwegend helder");
    }
  }

  // Dedup-ish: if we already penalized heavy rain via mm, don't stack endless code reasons
  const uniqueReasons = [...new Set(reasons)];

  const score = Math.max(1, Math.min(10, Math.round(points * 10) / 10));
  // Present as whole/half for UI
  const display = Math.max(1, Math.min(10, Math.round(score * 2) / 2));
  const band = bandFromScore(display);

  // Keep reasons short: prefer impactful ones first, max 4
  const ordered = uniqueReasons
    .filter((r) => !r.startsWith("Comfortabele") && r !== "Droog")
    .concat(uniqueReasons.filter((r) => r.startsWith("Comfortabele") || r === "Droog"))
    .slice(0, 4);

  if (!ordered.length) {
    ordered.push("Gemiddelde omstandigheden");
  }

  return {
    score: display,
    band,
    label: BAND_LABEL[band],
    reasons: ordered,
  };
}

export function festivalWeatherTone(
  band: FestivalWeatherBand,
): "success" | "info" | "warn" | "danger" | "neutral" {
  switch (band) {
    case "excellent":
    case "good":
      return "success";
    case "ok":
      return "info";
    case "poor":
      return "warn";
    case "harsh":
      return "danger";
    default:
      return "neutral";
  }
}
