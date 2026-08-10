/**
 * Outreach data pipeline — stages from discovery → lead.
 * Runnable as dry-run with mock data until live credentials exist.
 */

import { prospects } from "@/lib/mock/outreach";
import { openAvailabilityDays } from "@/lib/mock/availability";
import { mailVariants } from "@/lib/mock/mail-performance";

export type PipelineStageId =
  | "discover"
  | "enrich"
  | "filter"
  | "generate"
  | "send"
  | "track"
  | "route";

export type PipelineStage = {
  id: PipelineStageId;
  name: string;
  description: string;
  dependsOn: string[];
  dataSource: string;
  status: "ready_mock" | "needs_credentials" | "partial";
  missing?: string[];
};

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: "discover",
    name: "1. Ontdekken",
    description:
      "KvK-zoekopdracht: regio Amsterdam + 50 km, 500–5.000 medewerkers, jubilea (5/10/25). Bureaus: vaste partnerlijst.",
    dependsOn: ["KVK_API_KEY", "bureau-lijst"],
    dataSource: "KvK API + handmatige bureau-import",
    status: "needs_credentials",
    missing: ["KVK_API_KEY", "Event bureau CSV"],
  },
  {
    id: "enrich",
    name: "2. Verrijken",
    description:
      "Website scrape voor info@/events@, sector, LinkedIn-context. Markeer unreachable als geen mail.",
    dependsOn: ["discover"],
    dataSource: "Website fetch + optioneel enrichment partner",
    status: "partial",
    missing: ["Enrichment partner keuze"],
  },
  {
    id: "filter",
    name: "3. Filteren",
    description:
      "Uitsluitingslijst, bestaande klanten, opt-outs, al recent benaderd.",
    dependsOn: ["exclusions"],
    dataSource: "exclusions tabel + Brevo unsubscribes",
    status: "ready_mock",
  },
  {
    id: "generate",
    name: "4. Genereren",
    description:
      "AI-mail per prospect op basis van variant/groep + live availability snippet.",
    dependsOn: ["OPENAI_API_KEY of ANTHROPIC_API_KEY", "tone voorbeelden"],
    dataSource: "Mailvarianten + /beschikbaar data",
    status: "needs_credentials",
    missing: ["AI key", "Tone samples"],
  },
  {
    id: "send",
    name: "5. Versturen",
    description:
      "Brevo transactional send met tracked availability-link + opt-out.",
    dependsOn: ["BREVO_API_KEY"],
    dataSource: "Brevo API",
    status: "needs_credentials",
    missing: ["BREVO_API_KEY"],
  },
  {
    id: "track",
    name: "6. Meten",
    description:
      "Opens/clicks/replies via Brevo webhooks → subject A/B + CTR op agenda-link.",
    dependsOn: ["Brevo webhooks"],
    dataSource: "Webhook → outreach_emails / mail_subjects",
    status: "partial",
    missing: ["Webhook URL + Brevo config"],
  },
  {
    id: "route",
    name: "7. Lead routen",
    description:
      "Positieve reply → notificatie sales + lead record.",
    dependsOn: ["SALES_NOTIFY_EMAIL", "Brevo"],
    dataSource: "inbound_replies + notify",
    status: "needs_credentials",
    missing: ["SALES_NOTIFY_EMAIL"],
  },
];

export type DryRunStepResult = {
  stage: PipelineStageId;
  ok: boolean;
  summary: string;
  sample?: unknown;
};

/**
 * Dry-run uses mock prospects + availability so we can demo the flow tomorrow.
 */
export async function runOutreachDryRun(): Promise<{
  ranAt: string;
  steps: DryRunStepResult[];
}> {
  const steps: DryRunStepResult[] = [];

  const discovered = prospects.filter((p) => p.type === "company" || p.type === "agency");
  steps.push({
    stage: "discover",
    ok: true,
    summary: `Mock discover: ${discovered.length} prospects (live: KvK search + bureau import)`,
    sample: discovered.slice(0, 3).map((p) => ({
      company: p.companyName,
      type: p.type,
      employees: p.employeeCount,
    })),
  });

  const enriched = discovered.filter((p) => p.email);
  const unreachable = discovered.filter((p) => !p.email);
  steps.push({
    stage: "enrich",
    ok: true,
    summary: `Mock enrich: ${enriched.length} met e-mail, ${unreachable.length} unreachable`,
    sample: { enriched: enriched.length, unreachable: unreachable.map((p) => p.companyName) },
  });

  const excludedNames = new Set(["Booking.com"]); // demo exclusion
  const filtered = enriched.filter((p) => !excludedNames.has(p.companyName));
  steps.push({
    stage: "filter",
    ok: true,
    summary: `Filter: ${enriched.length - filtered.length} uitgesloten, ${filtered.length} door`,
    sample: { remaining: filtered.map((p) => p.companyName) },
  });

  const openDays = openAvailabilityDays().slice(0, 3);
  const variant = mailVariants[0];
  const generated = filtered.slice(0, 2).map((p) => ({
    to: p.email,
    subject: variant.subjects[0].text
      .replace("{{company}}", p.companyName)
      .replace("{{years}}", String(p.anniversaryYears ?? 10)),
    availabilitySlots: openDays.map((d) => d.date),
  }));
  steps.push({
    stage: "generate",
    ok: true,
    summary: `Mock generate: ${generated.length} mails (variant “${variant.name}”)`,
    sample: generated,
  });

  steps.push({
    stage: "send",
    ok: false,
    summary: "Send overgeslagen in dry-run — vereist BREVO_API_KEY + expliciete live-modus",
  });

  steps.push({
    stage: "track",
    ok: true,
    summary: "Track klaargezet: subject A/B + availability CTR landt in analytics zodra webhooks live zijn",
  });

  steps.push({
    stage: "route",
    ok: true,
    summary: "Lead routing: positieve replies → /outreach/leads + SALES_NOTIFY_EMAIL",
  });

  return { ranAt: new Date().toISOString(), steps };
}
