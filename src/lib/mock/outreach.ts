export type ProspectStatus =
  | "discovered"
  | "enriched"
  | "ready"
  | "contacted"
  | "opened"
  | "replied"
  | "lead"
  | "excluded"
  | "unreachable";

export type ProspectType = "company" | "agency";

export const outreachKpis = {
  prospectsTotal: 612,
  sent: 184,
  opened: 71,
  replied: 12,
  leads: 5,
  unreachable: 43,
};

export const campaigns = [
  {
    id: "camp-companies",
    name: "Jubilea Amsterdam · Q3",
    audience: "company" as ProspectType,
    status: "active" as const,
    description:
      "Bedrijven 500–5.000 medewerkers, Amsterdam + 50 km, trigger op 5/10/25-jarig jubileum.",
    sentCount: 128,
    openCount: 49,
    replyCount: 8,
    leadCount: 3,
  },
  {
    id: "camp-agencies",
    name: "Open data · Event bureaus",
    audience: "agency" as ProspectType,
    status: "active" as const,
    description:
      "Doorlopende beschikbaarheids-updates naar partner event management bureaus.",
    sentCount: 56,
    openCount: 22,
    replyCount: 4,
    leadCount: 2,
  },
];

export const prospects = [
  {
    id: "p-1",
    type: "company" as ProspectType,
    companyName: "Adyen",
    sector: "Fintech",
    employeeCount: 4200,
    city: "Amsterdam",
    anniversaryYears: 10,
    email: "events@adyen.com",
    status: "lead" as ProspectStatus,
  },
  {
    id: "p-2",
    type: "company" as ProspectType,
    companyName: "TomTom",
    sector: "Tech",
    employeeCount: 3800,
    city: "Amsterdam",
    anniversaryYears: 25,
    email: "info@tomtom.com",
    status: "opened" as ProspectStatus,
  },
  {
    id: "p-3",
    type: "company" as ProspectType,
    companyName: "Booking.com",
    sector: "Travel",
    employeeCount: 5000,
    city: "Amsterdam",
    anniversaryYears: null,
    email: null,
    status: "unreachable" as ProspectStatus,
  },
  {
    id: "p-4",
    type: "agency" as ProspectType,
    companyName: "Fresh Cotton Events",
    sector: "Event management",
    employeeCount: 45,
    city: "Amsterdam",
    anniversaryYears: null,
    email: "hello@freshcotton.nl",
    status: "replied" as ProspectStatus,
  },
  {
    id: "p-5",
    type: "agency" as ProspectType,
    companyName: "Sense Events",
    sector: "Event management",
    employeeCount: 30,
    city: "Amstelveen",
    anniversaryYears: null,
    email: "bureau@sense-events.nl",
    status: "contacted" as ProspectStatus,
  },
  {
    id: "p-6",
    type: "company" as ProspectType,
    companyName: "ING",
    sector: "Finance",
    employeeCount: 4500,
    city: "Amsterdam",
    anniversaryYears: 10,
    email: "corporate.events@ing.com",
    status: "ready" as ProspectStatus,
  },
];

export const sampleEmails = [
  {
    id: "oe-1",
    prospectName: "Adyen",
    audience: "company" as ProspectType,
    subject: "10 jaar Adyen — een avond die bij jullie past",
    body: `Hoi team Adyen,

Gefeliciteerd met 10 jaar. Dat verdient meer dan een taart op kantoor.

Thuishaven — outdoor warehouse aan het water in Amsterdam — is doordeweeks beschikbaar voor bedrijfsevents tot ~1.500 gasten. Denk: private line-up, food courts, en een setting die jullie cultuur écht raakt.

Zin in een korte tour of beschikbare data in september?

Groet,
Thuishaven Events`,
    status: "replied",
  },
  {
    id: "oe-2",
    prospectName: "Fresh Cotton Events",
    audience: "agency" as ProspectType,
    subject: "Open data Thuishaven · week 33–36",
    body: `Hoi Fresh Cotton,

Even een update van onze open doordeweekse slots:

• di 19 aug — outdoor + indoor warehouse
• wo 27 aug — volledige locatie
• do 4 sep — half-day / avond

Handig voor client pitches die deze week lopen. Stuur ik meer detail of floorplans?

Groet,
Thuishaven Partnerships`,
    status: "opened",
  },
];

export const leads = [
  {
    id: "l-1",
    companyName: "Adyen",
    summary: "Positieve reply — vraagt naar beschikbaarheidsdata september + capacity.",
    createdAt: "2026-08-05T11:40:00+02:00",
    notified: true,
  },
  {
    id: "l-2",
    companyName: "Fresh Cotton Events",
    summary: "Bureau wil floorplans voor pitch bij tech-client (400 pax).",
    createdAt: "2026-08-06T09:15:00+02:00",
    notified: true,
  },
];

export const availabilitySlots = [
  {
    id: "av-1",
    date: "2026-08-19",
    slotType: "weekday",
    label: "Dinsdag 19 aug — outdoor + indoor",
    isOpen: true,
  },
  {
    id: "av-2",
    date: "2026-08-27",
    slotType: "weekday",
    label: "Woensdag 27 aug — volledige locatie",
    isOpen: true,
  },
  {
    id: "av-3",
    date: "2026-09-04",
    slotType: "weekday",
    label: "Donderdag 4 sep — half-day / avond",
    isOpen: true,
  },
];

export const statusLabels: Record<ProspectStatus, string> = {
  discovered: "Gevonden",
  enriched: "Verrijkt",
  ready: "Klaar",
  contacted: "Verstuurd",
  opened: "Geopend",
  replied: "Gereageerd",
  lead: "Lead",
  excluded: "Uitgesloten",
  unreachable: "Niet bereikbaar",
};
