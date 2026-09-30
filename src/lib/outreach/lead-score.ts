/**
 * Lead score 0–100: how worth-it a company is to mail (or follow up) right now.
 * Fit + timing signal + reachability + engagement with earlier mails.
 */

import type { MailAngleId } from "./mail-angle";

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

  if (input.doelgroepFit === "ja") add(20, "past in doelgroep");
  if (input.angleId === "jubileum") {
    if (input.jubileeYearsAway === 0) add(25, "jubileum dit jaar");
    else add(15, "jubileum binnenkort");
  } else if (input.angleId === "seizoen") {
    add(5, "seizoensmoment");
  }
  if (input.hasContact) add(10, "contactpersoon bekend");
  if (input.hasEmail) add(10, "e-mail bekend");
  if (input.openCount > 0) add(10, "mail geopend");
  if (input.clickCount > 0) add(15, "link geklikt");
  if (input.replyCount > 0) add(30, "gereageerd");
  if (input.status === "lead") add(20, "warme lead");

  score = Math.min(100, score);
  const tier: LeadTier = score >= 60 ? "heet" : score >= 35 ? "warm" : "koud";
  return { score, tier, reasons };
}

export function leadTierTone(tier: LeadTier): "accent" | "success" | "neutral" {
  if (tier === "heet") return "accent";
  if (tier === "warm") return "success";
  return "neutral";
}
