/**
 * Mail invalshoeken / campaign angles for B2B outreach.
 *
 * Auto-pick (primary):
 * - Jubileum binnen ~16 maanden
 * - Anders in seizoensvenster → zomerfeest / einde-jaar / kerst
 * - Anders → algemene cold mail
 *
 * Altijd beschikbaar als mailing-variant (ook zonder auto-signaal):
 * - Funding / IPO / overname
 * - Recordjaar / targets gehaald
 */

import type { DoelgroepFit } from "./doelgroep";

export const JUBILEE_MARKS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100] as const;

/** ~16 maanden venster voor jubileum-kans (integer leeftijd → yearsAway ≤ 1). */
export const JUBILEE_WINDOW_MONTHS = 16;

export type MailAngleId =
  | "jubileum"
  | "seizoen"
  | "funding"
  | "recordjaar"
  | "algemeen"
  | "niet_mailen"
  | "past_niet"
  | "nog_checken";

export type MailAngle = {
  id: MailAngleId;
  /** Short chip label */
  label: string;
  /** One-line explanation */
  detail: string;
  /** Sort: jubileum first, then seizoen, then rest */
  rank: number;
  /** Next jubilee mark if known */
  jubileeMark?: number;
  /** Whole years until that mark (0 = dit jaar) */
  jubileeYearsAway?: number;
  /** Other mailing angles you can still choose for this company */
  also?: MailAngleId[];
};

/** Catalog of angles we actually send mail for (excl. blockers). */
export const MAIL_CAMPAIGN_ANGLES: Array<{
  id: Extract<MailAngleId, "jubileum" | "seizoen" | "funding" | "recordjaar" | "algemeen">;
  label: string;
  detail: string;
  /** Maps to OUTREACH_VARIANTS id when composing mail */
  variantId: "jubileum" | "seizoen" | "funding" | "recordjaar" | "warm_tour";
}> = [
  {
    id: "jubileum",
    label: "Jubileum",
    detail: "5/10/15/20/25/50-jaar — felicitatie + soft bezichtiging",
    variantId: "jubileum",
  },
  {
    id: "seizoen",
    label: "Seizoensfeest",
    detail: "Zomerfeest, einde-jaar of kerstborrel",
    variantId: "seizoen",
  },
  {
    id: "funding",
    label: "Deal / funding",
    detail: "IPO, funding round of overname vieren",
    variantId: "funding",
  },
  {
    id: "recordjaar",
    label: "Recordjaar",
    detail: "Targets gehaald — kick-off of afterparty",
    variantId: "recordjaar",
  },
  {
    id: "algemeen",
    label: "Algemeen feest",
    detail: "Bedrijfsfeest / teamavond zonder specifieke trigger",
    variantId: "warm_tour",
  },
];

export function nextJubilee(
  ageYears: number,
): { mark: number; yearsAway: number } | null {
  const mark = JUBILEE_MARKS.find((m) => m >= ageYears);
  if (mark == null) return null;
  return { mark, yearsAway: mark - ageYears };
}

/** Integer age → treat yearsAway ≤ 1 as within ~16 months. */
export function jubileeWithinWindow(yearsAway: number): boolean {
  return yearsAway * 12 <= JUBILEE_WINDOW_MONTHS;
}

/**
 * Seasonal window for auto-suggest.
 * Apr–Sep → zomerfeest; Oct–Jan → einde-jaar / kerst; Feb–Mar → nog seizoen-optie.
 */
export function seasonalAngleNow(at: Date = new Date()): {
  id: "seizoen";
  label: string;
  detail: string;
  season: "zomer" | "eindejaar" | "algemeen";
} {
  const month = at.getUTCMonth() + 1;
  if (month >= 4 && month <= 9) {
    return {
      id: "seizoen",
      label: "Zomerfeest",
      detail: "Seizoen — zomerfeest / team outdoor",
      season: "zomer",
    };
  }
  if (month >= 10 || month <= 1) {
    return {
      id: "seizoen",
      label: "Einde-jaar / kerst",
      detail: "Seizoen — einde-jaarfeest of kerstborrel",
      season: "eindejaar",
    };
  }
  return {
    id: "seizoen",
    label: "Seizoensfeest",
    detail: "Zomerfeest of einde-jaar/kerstborrel als invalshoek",
    season: "algemeen",
  };
}

const ALSO_WITHOUT_JUBILEE: MailAngleId[] = [
  "seizoen",
  "funding",
  "recordjaar",
  "algemeen",
];

export function mailAngleFor(input: {
  status?: string | null;
  existingCustomer?: boolean;
  doelgroepFit?: DoelgroepFit | string | null;
  doelgroepReason?: string | null;
  anniversaryYears?: number | null;
  now?: Date;
}): MailAngle {
  if (input.existingCustomer || input.status === "excluded") {
    return {
      id: "niet_mailen",
      label: "Niet mailen",
      detail: "Staat op de uitsluitingslijst",
      rank: 90,
    };
  }

  if (input.doelgroepFit === "nee") {
    return {
      id: "past_niet",
      label: "Past niet",
      detail: input.doelgroepReason ?? "Te klein, te groot of buiten regio",
      rank: 80,
    };
  }

  const age = input.anniversaryYears ?? null;
  const next = age != null ? nextJubilee(age) : null;
  const seasonal = seasonalAngleNow(input.now ?? new Date());

  if (next && jubileeWithinWindow(next.yearsAway)) {
    return {
      id: "jubileum",
      label:
        next.yearsAway === 0
          ? `Jubileum ${next.mark} jr`
          : `Jubileum ≤${JUBILEE_WINDOW_MONTHS} mnd`,
      detail:
        next.yearsAway === 0
          ? `${next.mark} jaar dit jaar — jubileum-mail`
          : `${next.mark} jaar binnenkort — jubileum-mail`,
      rank: 10,
      jubileeMark: next.mark,
      jubileeYearsAway: next.yearsAway,
      also: ["seizoen", "funding", "recordjaar"],
    };
  }

  if (input.doelgroepFit === "ja") {
    // Prefer seasonal hook over plain cold when we're in a feast season.
    if (seasonal.season !== "algemeen") {
      return {
        id: "seizoen",
        label: seasonal.label,
        detail: `${seasonal.detail} · ook: funding / recordjaar`,
        rank: 15,
        jubileeMark: next?.mark,
        jubileeYearsAway: next?.yearsAway,
        also: ["funding", "recordjaar", "algemeen"],
      };
    }

    if (next && next.yearsAway > 1) {
      return {
        id: "algemeen",
        label: "Algemeen feest",
        detail: `Geen jubileum dichtbij (${next.mark} jr over ${next.yearsAway} jr) — kies seizoen, funding of recordjaar`,
        rank: 20,
        jubileeMark: next.mark,
        jubileeYearsAway: next.yearsAway,
        also: ALSO_WITHOUT_JUBILEE.filter((a) => a !== "algemeen"),
      };
    }

    return {
      id: "algemeen",
      label: "Algemeen feest",
      detail: "Algemene cold mail — of kies seizoen / funding / recordjaar",
      rank: 20,
      also: ALSO_WITHOUT_JUBILEE.filter((a) => a !== "algemeen"),
    };
  }

  return {
    id: "nog_checken",
    label: "Onvolledig",
    detail:
      input.doelgroepReason ??
      "Nog geen betrouwbare grootte/regio — eerst aanvullen",
    rank: 50,
  };
}

export function isMailableAngle(id: MailAngleId): boolean {
  return (
    id === "jubileum" ||
    id === "seizoen" ||
    id === "funding" ||
    id === "recordjaar" ||
    id === "algemeen"
  );
}

export function mailAngleTone(
  id: MailAngleId,
): "accent" | "success" | "info" | "danger" | "neutral" {
  if (id === "jubileum") return "accent";
  if (id === "seizoen") return "success";
  if (id === "funding" || id === "recordjaar") return "info";
  if (id === "algemeen") return "success";
  if (id === "past_niet" || id === "niet_mailen") return "danger";
  return "neutral";
}
