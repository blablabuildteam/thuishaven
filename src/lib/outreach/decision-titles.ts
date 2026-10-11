/**
 * Job titles we want for cold outreach — people who book / organize company events.
 * Keep this tight: Apollo's include_similar_titles otherwise pulls HR / People Ops.
 */

/** Titles sent to Apollo person_titles (lowercase). Event-first, then office/facilities. */
export const DECISION_TITLES = [
  "event manager",
  "evenementenmanager",
  "event coördinator",
  "event coordinator",
  "events manager",
  "head of events",
  "manager events",
  "office manager",
  "office management",
  "facilitair manager",
  "facility manager",
  "facilities manager",
  "hoofd facilitair",
  "manager facilities",
  "workplace manager",
] as const;

/** Second round when nobody above exists (smaller companies). */
export const BROADER_DECISION_TITLES = [
  "management assistant",
  "executive assistant",
  "directiesecretaresse",
  "directie assistent",
  "office coordinator",
  "office assistant",
  "communicatie manager",
  "communications manager",
  "hr & office manager",
  "personeelsvereniging",
] as const;

const CORE =
  /\b(event|evenement|office[- ]?manag|facilit|workplace)/i;
const BROADER =
  /\b(management assistent|management assistant|executive assistant|directiesecretar|secretaresse|secretary|directie assistent|office (coordinator|assistant)|communicatie|communications?|personeelsvereniging|pv[- ]?bestuur)\b/i;
const REJECT =
  /\b(human resources|hr\b|people ops|people operations|people manager|talent|recruit|internal communications?|interne communicatie|marketing|sales|account manager|business development|ceo|cfo|cto|coo|founder|eigenaar|directeur|managing director|engineer|developer|consultant|advisor|adviseur|analist|analyst)\b/i;

/** 0 = event, 1 = office/facility, 2 = assistant/communicatie, 9 = niet relevant. */
export function titleTier(title?: string | null): 0 | 1 | 2 | 9 {
  const t = (title ?? "").trim();
  if (!t) return 9;
  if (/\bevent|evenement/i.test(t)) return 0;
  if (CORE.test(t)) return 1;
  if (REJECT.test(t)) return 9;
  if (BROADER.test(t)) return 2;
  return 9;
}

/** True if this title is someone who typically organizes venue / company events. */
export function isEventRelevantTitle(title?: string | null): boolean {
  return titleTier(title) <= 1;
}

/** Core or broader (assistant / communicatie) — still a sensible person to mail. */
export function isMailableTitle(title?: string | null): boolean {
  return titleTier(title) <= 2;
}

export function titleRelevanceScore(title?: string | null): number {
  const tier = titleTier(title);
  if (tier === 9) return (title ?? "").trim() ? 50 : 99;
  if (tier === 0) return 0;
  if (/workplace/i.test(title ?? "")) return 2;
  return tier === 1 ? 1 : 3;
}

export const TITLE_TIER_LABEL: Record<0 | 1 | 2 | 9, string> = {
  0: "Events",
  1: "Office / facility",
  2: "Assistent / communicatie",
  9: "Niet relevant",
};

export const LINKEDIN_PEOPLE_SEARCH =
  "Event Manager OR Evenementenmanager OR Event Coordinator OR Office Manager OR Facilities Manager OR Facilitair Manager";
