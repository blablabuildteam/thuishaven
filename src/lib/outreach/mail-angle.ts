/**
 * Which mail angle we use for a company — shown as a plain label in the list.
 *
 * Jubileum (5/10/15/20/25/50…) dit of volgend jaar → jubileum-mail.
 * Anders (ook als jubileum nog 2–4 jaar weg is) → algemeen bedrijfsfeest.
 */

import type { DoelgroepFit } from "./doelgroep";

export const JUBILEE_MARKS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100] as const;

export type MailAngleId = "jubileum" | "algemeen" | "niet_mailen" | "past_niet" | "nog_checken";

export type MailAngle = {
  id: MailAngleId;
  /** Short chip label */
  label: string;
  /** One-line explanation */
  detail: string;
  /** Sort: jubileum first, then algemeen, then rest */
  rank: number;
};

function nextJubilee(ageYears: number): { mark: number; yearsAway: number } | null {
  const mark = JUBILEE_MARKS.find((m) => m >= ageYears);
  if (mark == null) return null;
  return { mark, yearsAway: mark - ageYears };
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

  if (next && next.yearsAway <= 1) {
    return {
      id: "jubileum",
      label: "Jubileum",
      detail:
        next.yearsAway === 0
          ? `${next.mark} jaar — jubileum-mail`
          : `${next.mark} jaar volgend jaar — jubileum-mail`,
      rank: 10,
    };
  }

  if (input.doelgroepFit === "ja") {
    if (next && next.yearsAway > 1) {
      return {
        id: "algemeen",
        label: "Algemeen feest",
        detail: `Jubileum (${next.mark} jr) pas over ${next.yearsAway} jaar — mail als bedrijfsfeest / zomerfeest`,
        rank: 20,
      };
    }
    return {
      id: "algemeen",
      label: "Algemeen feest",
      detail: "Geen jubileum dichtbij — mail als bedrijfsfeest / zomerfeest",
      rank: 20,
    };
  }

  return {
    id: "nog_checken",
    label: "Nog checken",
    detail: input.doelgroepReason ?? "Eerst grootte / regio bevestigen",
    rank: 50,
  };
}
