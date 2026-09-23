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

const REJECT =
  /\b(hr\b|human resources|people ops|people operations|people manager|talent|recruiter|internal communications?|interne communicatie|marketing manager|sales manager|account manager|ceo|cfo|cto|founder|directeur)\b/i;

const ACCEPT =
  /\b(event|evenement|events|office manager|office management|facilitair|facilit(y|ies)|workplace)\b/i;

/** True if this title is someone who typically organizes venue / company events. */
export function isEventRelevantTitle(title?: string | null): boolean {
  const t = (title ?? "").trim();
  if (!t) return false;
  if (REJECT.test(t) && !/\bevent/i.test(t)) return false;
  return ACCEPT.test(t);
}

export function titleRelevanceScore(title?: string | null): number {
  const s = (title ?? "").toLowerCase();
  if (!s) return 99;
  if (!isEventRelevantTitle(s)) return 50;
  if (/\bevent|evenement/.test(s)) return 0;
  if (/office|facilit/.test(s)) return 1;
  if (/workplace/.test(s)) return 2;
  return 3;
}

export const LINKEDIN_PEOPLE_SEARCH =
  "Event Manager OR Evenementenmanager OR Event Coordinator OR Office Manager OR Facilities Manager OR Facilitair Manager";
