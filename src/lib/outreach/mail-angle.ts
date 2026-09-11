/**
 * Which mail angle we use for a company — shown as a plain label in the list.
 *
 * Jubileum-marker (5/10/15/20/25/50…) binnen ~16 maanden → jubileum-mail.
 * Anders (fit ok) → cold mail / algemeen feest.
 */

import type { DoelgroepFit } from "./doelgroep";

export const JUBILEE_MARKS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100] as const;

/** ~16 maanden venster voor jubileum-kans (integer leeftijd → yearsAway ≤ 1). */
export const JUBILEE_WINDOW_MONTHS = 16;

export type MailAngleId =
  | "jubileum"
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
  /** Sort: jubileum first, then cold mail, then rest */
  rank: number;
  /** Next jubilee mark if known */
  jubileeMark?: number;
  /** Whole years until that mark (0 = dit jaar) */
  jubileeYearsAway?: number;
};

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

export function mailAngleFor(input: {
  status?: string | null;
  existingCustomer?: boolean;
  doelgroepFit?: DoelgroepFit | string | null;
  doelgroepReason?: string | null;
  anniversaryYears?: number | null;
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
    };
  }

  if (input.doelgroepFit === "ja") {
    if (next && next.yearsAway > 1) {
      return {
        id: "algemeen",
        label: "Cold mail",
        detail: `Geen jubileum dichtbij (${next.mark} jr pas over ${next.yearsAway} jr) — algemeen feest / zomerfeest`,
        rank: 20,
        jubileeMark: next.mark,
        jubileeYearsAway: next.yearsAway,
      };
    }
    return {
      id: "algemeen",
      label: "Cold mail",
      detail: "Geen jubileum dichtbij — algemeen feest / zomerfeest",
      rank: 20,
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
