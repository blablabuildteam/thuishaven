/**
 * Lead score 0–100: how worth-it a company is to mail (or follow up) right now.
 * Fit + timing signal + size + right person + region + engagement with earlier mails.
 */

import {
  bestTargetTier,
  type EmailCheck,
  type RankableContact,
  type TargetTier,
} from "./contact-ranking";
import type { MailAngleId } from "./mail-angle";

const PERSON_POINTS: Record<TargetTier, [number, string] | null> = {
  0: [20, "eventverantwoordelijke gevonden"],
  1: [15, "office/facility-persoon gevonden"],
  2: [8, "assistent/communicatie gevonden"],
  3: [3, "alleen algemeen adres"],
  9: null,
};

function sizePoints(employees: number): number {
  if (employees >= 500) return 15;
  if (employees >= 100) return 10;
  if (employees >= 25) return 5;
  return 0;
}

export type LeadTier = "heet" | "warm" | "koud";

export type LeadScore = {
  score: number;
  tier: LeadTier;
  reasons: string[];
};

export function leadScore(input: {
  doelgroepFit?: string | null;
  angleId: MailAngleId;
  jubileeYearsAway?: number;
  hasEmail: boolean;
  hasContact: boolean;
  /** Best mailable person (from rankMailTargets); null = nobody usable. Omit to fall back on hasEmail/hasContact. */
  bestTargetTier?: TargetTier | null;
  employeeCount?: number | null;
  inRegion?: boolean;
  openCount: number;
  clickCount: number;
  replyCount: number;
  status?: string | null;
}): LeadScore {
  if (input.angleId === "niet_mailen" || input.angleId === "past_niet") {
    return { score: 0, tier: "koud", reasons: ["Niet mailen / past niet"] };
  }

  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, why: string) => {
    score += n;
    reasons.push(`+${n} ${why}`);
  };

  if (input.doelgroepFit === "ja") add(15, "past in doelgroep");
  if (input.angleId === "jubileum") {
    if (input.jubileeYearsAway === 0) add(25, "jubileum dit jaar");
    else add(15, "jubileum binnenkort");
  } else if (input.angleId === "funding" || input.angleId === "recordjaar") {
    add(10, input.angleId === "funding" ? "recente deal / funding" : "recordjaar");
  } else if (input.angleId === "seizoen") {
    add(5, "seizoensmoment");
  }
  if (input.employeeCount != null) {
    const n = sizePoints(input.employeeCount);
    if (n > 0) {
      add(n, `${new Intl.NumberFormat("nl-NL").format(input.employeeCount)} medewerkers`);
    }
  }
  if (input.bestTargetTier !== undefined) {
    const person =
      input.bestTargetTier === null ? null : PERSON_POINTS[input.bestTargetTier];
    if (person) add(person[0], person[1]);
  } else {
    if (input.hasContact) add(10, "contactpersoon bekend");
    if (input.hasEmail) add(10, "e-mail bekend");
  }
  if (input.inRegion) add(5, "in de regio");
  if (input.openCount > 0) add(10, "mail geopend");
  if (input.clickCount > 0) add(15, "link geklikt");
  if (input.replyCount > 0) add(30, "gereageerd");
  if (input.status === "lead") add(20, "warme lead");

  score = Math.min(100, score);
  const tier: LeadTier = score >= 60 ? "heet" : score >= 35 ? "warm" : "koud";
  return { score, tier, reasons };
}

/** Score for a CRM record, same inputs on list and dossier. */
export function leadScoreForRecord(
  r: {
    doelgroepFit?: string | null;
    email: string | null;
    decisionMakerName?: string;
    website: string | null;
    companyName: string;
    contacts: RankableContact[];
    emailChecks?: Record<string, EmailCheck>;
    employeeCount: number | null;
    inRegion: boolean;
    openCount: number;
    clickCount: number;
    replyCount: number;
    status?: string | null;
  },
  angle: { id: MailAngleId; jubileeYearsAway?: number },
): LeadScore {
  return leadScore({
    doelgroepFit: r.doelgroepFit,
    angleId: angle.id,
    jubileeYearsAway: angle.jubileeYearsAway,
    hasEmail: Boolean(r.email),
    hasContact: Boolean(r.decisionMakerName),
    bestTargetTier: bestTargetTier({
      contacts: r.contacts,
      company: { website: r.website, companyName: r.companyName },
      companyEmail: r.email,
      checks: r.emailChecks,
    }),
    employeeCount: r.employeeCount,
    inRegion: r.inRegion,
    openCount: r.openCount,
    clickCount: r.clickCount,
    replyCount: r.replyCount,
    status: r.status,
  });
}

export function leadTierTone(tier: LeadTier): "accent" | "success" | "neutral" {
  if (tier === "heet") return "accent";
  if (tier === "warm") return "success";
  return "neutral";
}
