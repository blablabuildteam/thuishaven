import type { ProspectType } from "./outreach";
import { PUBLIC_AVAILABILITY_URL } from "./availability";

export type MailAudienceGroup =
  | "company_anniversary"
  | "company_general"
  | "agency_availability";

export type MailVariant = {
  id: string;
  group: MailAudienceGroup;
  groupLabel: string;
  audience: ProspectType;
  name: string;
  /** A/B subject variants */
  subjects: {
    id: string;
    text: string;
    sent: number;
    opens: number;
    clicks: number;
    replies: number;
    leads: number;
  }[];
  bodyTemplate: string;
  includeAvailabilityLink: boolean;
  status: "draft" | "testing" | "active" | "paused";
};

export const mailVariants: MailVariant[] = [
  {
    id: "mv-anniv",
    group: "company_anniversary",
    groupLabel: "Bedrijven · jubileum",
    audience: "company",
    name: "Jubileum-pitch",
    status: "active",
    includeAvailabilityLink: true,
    subjects: [
      {
        id: "s-a1",
        text: "{{years}} jaar {{company}} — een avond die bij jullie past",
        sent: 64,
        opens: 28,
        clicks: 11,
        replies: 5,
        leads: 2,
      },
      {
        id: "s-a2",
        text: "Gefeliciteerd met {{years}} jaar — beschikbare data bij Thuishaven",
        sent: 64,
        opens: 21,
        clicks: 6,
        replies: 3,
        leads: 1,
      },
    ],
    bodyTemplate: `Hoi team {{company}},

Gefeliciteerd met {{years}} jaar. Dat verdient meer dan een taart op kantoor.

Thuishaven — outdoor warehouse aan het water in Amsterdam — is doordeweeks beschikbaar voor bedrijfsevents tot ~1.500 gasten.

Bekijk live welke data nog open zijn (inclusief actuele prijzen):
{{availability_link}}

Zin in een korte tour?

Groet,
Thuishaven Events`,
  },
  {
    id: "mv-company",
    group: "company_general",
    groupLabel: "Bedrijven · algemeen",
    audience: "company",
    name: "Algemene B2B intro",
    status: "testing",
    includeAvailabilityLink: true,
    subjects: [
      {
        id: "s-c1",
        text: "Doordeweeks bij Thuishaven — voor {{company}}",
        sent: 40,
        opens: 14,
        clicks: 4,
        replies: 1,
        leads: 0,
      },
      {
        id: "s-c2",
        text: "{{company}}: locatie voor jullie volgende bedrijfsevent?",
        sent: 40,
        opens: 17,
        clicks: 7,
        replies: 2,
        leads: 1,
      },
    ],
    bodyTemplate: `Hoi {{company}},

Wij openen doordeweeks ons terrein voor bedrijfsevents — Tempel, Loods en Circus, tot ~1.500 pax.

Actuele beschikbaarheid + dynamic pricing:
{{availability_link}}

Groet,
Thuishaven Events`,
  },
  {
    id: "mv-agency",
    group: "agency_availability",
    groupLabel: "Event bureaus",
    audience: "agency",
    name: "Open-data update",
    status: "active",
    includeAvailabilityLink: true,
    subjects: [
      {
        id: "s-b1",
        text: "Open data Thuishaven · {{week_range}}",
        sent: 28,
        opens: 14,
        clicks: 9,
        replies: 3,
        leads: 2,
      },
      {
        id: "s-b2",
        text: "Live agenda B2B — slots die deze week nog open zijn",
        sent: 28,
        opens: 8,
        clicks: 3,
        replies: 1,
        leads: 0,
      },
    ],
    bodyTemplate: `Hoi {{company}},

Update van onze open doordeweekse slots — live en altijd actueel:

{{availability_link}}

Handig voor client pitches. Floorplans of capacity sheets? Stuur ik meteen mee.

Groet,
Thuishaven Partnerships`,
  },
];

export type SubjectPerformance = {
  subjectId: string;
  variantName: string;
  groupLabel: string;
  subject: string;
  sent: number;
  openRate: number;
  ctr: number;
  replyRate: number;
  leadRate: number;
  winner?: boolean;
};

export function subjectPerformance(): SubjectPerformance[] {
  const rows: SubjectPerformance[] = [];
  for (const variant of mailVariants) {
    const scored = variant.subjects.map((s) => {
      const openRate = s.sent ? (s.opens / s.sent) * 100 : 0;
      const ctr = s.sent ? (s.clicks / s.sent) * 100 : 0;
      const replyRate = s.sent ? (s.replies / s.sent) * 100 : 0;
      const leadRate = s.sent ? (s.leads / s.sent) * 100 : 0;
      return {
        subjectId: s.id,
        variantName: variant.name,
        groupLabel: variant.groupLabel,
        subject: s.text,
        sent: s.sent,
        openRate,
        ctr,
        replyRate,
        leadRate,
        score: ctr * 0.4 + replyRate * 0.4 + leadRate * 0.2,
      };
    });
    const best = Math.max(...scored.map((s) => s.score));
    for (const s of scored) {
      rows.push({
        subjectId: s.subjectId,
        variantName: s.variantName,
        groupLabel: s.groupLabel,
        subject: s.subject,
        sent: s.sent,
        openRate: s.openRate,
        ctr: s.ctr,
        replyRate: s.replyRate,
        leadRate: s.leadRate,
        winner: s.score === best && scored.length > 1,
      });
    }
  }
  return rows.sort((a, b) => b.ctr - a.ctr);
}

export const inboxReplies = [
  {
    id: "in-1",
    from: "events@adyen.com",
    company: "Adyen",
    subject: "Re: 10 jaar Adyen — een avond die bij jullie past",
    preview:
      "Interessant — kunnen jullie september-data + capacity voor ~800 pax delen?",
    receivedAt: "2026-08-05T11:38:00+02:00",
    sentiment: "positive" as const,
    linkedVariant: "Jubileum-pitch",
  },
  {
    id: "in-2",
    from: "hello@freshcotton.nl",
    company: "Fresh Cotton Events",
    subject: "Re: Open data Thuishaven · week 33–36",
    preview:
      "Thanks! We pitchen vrijdag — mag ik floorplans van Loods + Tempel?",
    receivedAt: "2026-08-06T09:12:00+02:00",
    sentiment: "positive" as const,
    linkedVariant: "Open-data update",
  },
  {
    id: "in-3",
    from: "info@tomtom.com",
    company: "TomTom",
    subject: "Re: 25 jaar TomTom — een avond die bij jullie past",
    preview: "Voor nu geen behoefte, dank voor het bereiken.",
    receivedAt: "2026-08-04T16:02:00+02:00",
    sentiment: "neutral" as const,
    linkedVariant: "Jubileum-pitch",
  },
];

export const analyticsKpis = {
  sent: 264,
  openRate: 38.6,
  ctr: 15.2,
  replyRate: 5.7,
  leadRate: 2.3,
  availabilityLinkClicks: 41,
  bestSubject:
    "Open data Thuishaven · {{week_range}}",
  bestGroup: "Event bureaus",
};

export function renderAvailabilitySnippet() {
  return PUBLIC_AVAILABILITY_URL;
}
