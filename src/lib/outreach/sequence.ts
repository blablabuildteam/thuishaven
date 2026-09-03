/**
 * Follow-up sequences for outstanding leads (no reply).
 * Open-tracking is internal queue signal only — never mentioned in copy.
 * Planning only until live send unlocked; never auto-sends by itself.
 */

export type SequenceStepId =
  | "day0_initial"
  | "day3_nudge"
  | "day7_soft_close";

export type SequenceStep = {
  id: SequenceStepId;
  afterDays: number;
  /** Internal only — who shows up in the follow-up queue. */
  trigger: "always" | "opened_no_reply" | "no_reply";
  name: string;
  subjectHint: string;
  toneNote: string;
  exampleBody: string;
};

/**
 * Soft follow-ups for leads die nog openstaan.
 * Copy leest als een menselijke reminder — niet als “we zagen je openen”.
 */
export const OUTSTANDING_LEAD_SEQUENCE: SequenceStep[] = [
  {
    id: "day0_initial",
    afterDays: 0,
    trigger: "always",
    name: "1. Eerste mail",
    subjectHint: "A/B onderwerp uit variant",
    toneNote: "Persoonlijk, Reijner-stijl.",
    exampleBody: "(zie gegenereerde draft)",
  },
  {
    id: "day3_nudge",
    afterDays: 3,
    trigger: "opened_no_reply",
    name: "2. Reminder",
    subjectHint: "Even een seintje",
    toneNote:
      "Intern: prioriteit bij geopend + geen reply. In de mail: gewoon een korte check-in — nooit open-tracking benoemen.",
    exampleBody: `Hoi,

Even een seintje — vast druk, dus houd ik ’t kort.

Speelt er iets (pitch, borrel, teamdag) waarbij Thuishaven zou kunnen passen? Dan denk ik graag even mee. Zo niet: ook goed, dan laat ik ’t hierbij.

Groet,`,
  },
  {
    id: "day7_soft_close",
    afterDays: 7,
    trigger: "opened_no_reply",
    name: "3. Soft close",
    subjectHint: "Laatste seintje van mijn kant",
    toneNote: "Afsluiten zonder drama. Deur open laten.",
    exampleBody: `Hoi,

Laatste seintje van mijn kant — dan stop ik met mailen.

Mocht Thuishaven ooit relevant worden: je weet me te vinden. Rondleiding blijft leuker dan een lange thread.

Groet,`,
  },
];

/** @deprecated use OUTSTANDING_LEAD_SEQUENCE */
export const OPENED_NO_REPLY_SEQUENCE = OUTSTANDING_LEAD_SEQUENCE;

export function sequenceForOpenedNoReply() {
  return OUTSTANDING_LEAD_SEQUENCE;
}

export function sequenceForOutstandingLeads() {
  return OUTSTANDING_LEAD_SEQUENCE;
}

/** Days after send before a lead is “follow-up ready” (matches step 2). */
export const FOLLOW_UP_READY_AFTER_DAYS = 3;
