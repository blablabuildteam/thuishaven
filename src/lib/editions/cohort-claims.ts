import type { EditionAnalysisRow } from "@/lib/editions/analysis";
import {
  CALENDAR_PERIOD_LABEL,
  WEEKDAY_LABEL,
  type CalendarPeriod,
  type WeekdayKey,
} from "@/lib/time/nl-calendar";

export type CohortClaim = {
  title: string;
  body: string;
  evidence: string;
};

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pastWithSales(rows: EditionAnalysisRow[]): EditionAnalysisRow[] {
  const now = Date.now();
  return rows.filter(
    (r) => r.sold > 0 && new Date(r.startsAt).getTime() < now,
  );
}

/** Za vs zo (en vr als n genoeg). */
export function weekdayClaims(rows: EditionAnalysisRow[]): CohortClaim[] {
  const past = pastWithSales(rows);
  const byWd = (wd: WeekdayKey) => past.filter((r) => r.weekday === wd);
  const za = byWd("za");
  const zo = byWd("zo");
  const vr = byWd("vr");
  const aZa = avg(za.map((r) => r.sold));
  const aZo = avg(zo.map((r) => r.sold));
  const claims: CohortClaim[] = [];

  if (aZa != null && aZo != null && za.length >= 5 && zo.length >= 5) {
    const lift = ((aZo - aZa) / aZa) * 100;
    claims.push({
      title: `Zo ${Math.round(lift) >= 0 ? "+" : ""}${Math.round(lift)}% vs za`,
      body: `Zondag ~${Math.round(aZo).toLocaleString("nl-NL")} · zaterdag ~${Math.round(aZa).toLocaleString("nl-NL")} sold`,
      evidence: `n=${zo.length} zo · n=${za.length} za`,
    });
  }

  const aVr = avg(vr.map((r) => r.sold));
  if (aVr != null && aZa != null && vr.length >= 5) {
    const lift = ((aVr - aZa) / aZa) * 100;
    claims.push({
      title: `Vr ${Math.round(lift) >= 0 ? "+" : ""}${Math.round(lift)}% vs za`,
      body: `Vrijdag ~${Math.round(aVr).toLocaleString("nl-NL")} sold`,
      evidence: `n=${vr.length} vr · n=${za.length} za`,
    });
  }

  return claims;
}

/** Periode vs outdoor-baseline (of winter). */
export function periodClaims(rows: EditionAnalysisRow[]): CohortClaim[] {
  const past = pastWithSales(rows);
  const outdoor = past.filter((r) => r.periods.includes("outdoor"));
  const aOutdoor = avg(outdoor.map((r) => r.sold));
  const claims: CohortClaim[] = [];

  const check = (period: CalendarPeriod, minN = 5) => {
    const cohort = past.filter((r) => r.periods.includes(period));
    const a = avg(cohort.map((r) => r.sold));
    if (a == null || cohort.length < minN || aOutdoor == null || aOutdoor <= 0)
      return;
    if (period === "outdoor" || period === "winter") return;
    const lift = ((a - aOutdoor) / aOutdoor) * 100;
    claims.push({
      title: `${CALENDAR_PERIOD_LABEL[period].split(" ")[0]} ${Math.round(lift) >= 0 ? "+" : ""}${Math.round(lift)}% vs outdoor`,
      body: `~${Math.round(a).toLocaleString("nl-NL")} sold in ${CALENDAR_PERIOD_LABEL[period].toLowerCase()}`,
      evidence: `n=${cohort.length} · outdoor baseline n=${outdoor.length}`,
    });
  };

  check("paas");
  check("pinksteren");
  check("koningsdag");
  check("ade");

  const winter = past.filter((r) => r.periods.includes("winter"));
  const aWinter = avg(winter.map((r) => r.sold));
  if (
    aWinter != null &&
    aOutdoor != null &&
    winter.length >= 5 &&
    outdoor.length >= 5
  ) {
    const lift = ((aWinter - aOutdoor) / aOutdoor) * 100;
    claims.push({
      title: `Winter ${Math.round(lift) >= 0 ? "+" : ""}${Math.round(lift)}% vs outdoor`,
      body: `Winter ~${Math.round(aWinter).toLocaleString("nl-NL")} · outdoor ~${Math.round(aOutdoor).toLocaleString("nl-NL")}`,
      evidence: `n=${winter.length} winter · n=${outdoor.length} outdoor`,
    });
  }

  return claims;
}

export function weekDayLabel(wd: WeekdayKey): string {
  return WEEKDAY_LABEL[wd];
}
