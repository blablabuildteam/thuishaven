/**
 * Outreach data-pipeline — stappen van ontdekken → lead.
 * Dry-run op mockdata tot live credentials er zijn.
 */

import { prospects } from "@/lib/mock/outreach";
import { openAvailabilityDays } from "@/lib/mock/availability";
import { mailVariants } from "@/lib/mock/mail-performance";
import { mockMultiSourceDiscover } from "@/lib/outreach/sources";

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
      "Multi-source: KvK (jubilea/size/regio) + bureau-import + optioneel Places/directories/CRM. Dedupe op naam/domein/KvK.",
    dependsOn: ["KVK_API_KEY of alternatieve bronnen", "bureau-lijst"],
    dataSource: "KvK · CSV · CRM · Places · directories",
    status: "partial",
    missing: ["KVK_API_KEY of enrichment", "Eventbureau CSV"],
  },
  {
    id: "enrich",
    name: "2. Verrijken",
    description:
      "Website-scrape voor info@/events@, sector, optioneel enrichment-API. Markeer onbereikbaar zonder mail.",
    dependsOn: ["discover"],
    dataSource: "Website-fetch + optionele enrichment-partner",
    status: "partial",
    missing: ["Keuze enrichment-partner"],
  },
  {
    id: "filter",
    name: "3. Filteren",
    description:
      "Uitsluitingslijst, bestaande klanten, opt-outs, recent benaderd.",
    dependsOn: ["uitsluitingen"],
    dataSource: "exclusions-tabel + Brevo uitschrijvingen",
    status: "ready_mock",
  },
  {
    id: "generate",
    name: "4. Genereren",
    description:
      "AI-mail per prospect op basis van variant/groep + live beschikbaarheidsfragment.",
    dependsOn: ["GEMINI_API_KEY of OPENAI_API_KEY / ANTHROPIC_API_KEY"],
    dataSource: "Mailvarianten + /beschikbaar",
    status: "needs_credentials",
    missing: ["AI-sleutel"],
  },
  {
    id: "send",
    name: "5. Versturen",
    description:
      "Brevo transactional send met getrackte agenda-link + opt-out.",
    dependsOn: ["BREVO_API_KEY"],
    dataSource: "Brevo API",
    status: "needs_credentials",
    missing: ["BREVO_API_KEY"],
  },
  {
    id: "track",
    name: "6. Meten",
    description:
      "Opens/clicks/replies via Brevo-webhooks → onderwerp A/B + CTR op agenda-link.",
    dependsOn: ["Brevo-webhooks"],
    dataSource: "Webhook → outreach_emails / mail_subjects",
    status: "partial",
    missing: ["Webhook-URL + Brevo-config"],
  },
  {
    id: "route",
    name: "7. Lead routen",
    description: "Positieve reply → notificatie sales + leadrecord.",
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

export async function runOutreachDryRun(): Promise<{
  ranAt: string;
  steps: DryRunStepResult[];
}> {
  const steps: DryRunStepResult[] = [];
  const multi = mockMultiSourceDiscover();

  steps.push({
    stage: "discover",
    ok: true,
    summary: `Multi-source mock: ${multi.merged.length} uniek · ${multi.duplicatesRemoved} samengevoegd`,
    sample: {
      perBron: multi.bySource,
      voorbeelden: multi.merged.slice(0, 4).map((p) => ({
        bedrijf: p.companyName,
        bron: p.source,
        email: p.email ?? null,
      })),
    },
  });

  const discovered = prospects.filter(
    (p) => p.type === "company" || p.type === "agency",
  );
  const enriched = discovered.filter((p) => p.email);
  const unreachable = discovered.filter((p) => !p.email);
  steps.push({
    stage: "enrich",
    ok: true,
    summary: `Verrijking mock: ${enriched.length} met e-mail, ${unreachable.length} onbereikbaar`,
    sample: {
      verrijkt: enriched.length,
      onbereikbaar: unreachable.map((p) => p.companyName),
    },
  });

  const excludedNames = new Set(["Booking.com"]);
  const filtered = enriched.filter((p) => !excludedNames.has(p.companyName));
  steps.push({
    stage: "filter",
    ok: true,
    summary: `Filter: ${enriched.length - filtered.length} uitgesloten, ${filtered.length} door`,
    sample: { overgebleven: filtered.map((p) => p.companyName) },
  });

  const openDays = openAvailabilityDays().slice(0, 3);
  const variant = mailVariants[0];
  const generated = filtered.slice(0, 2).map((p) => ({
    aan: p.email,
    onderwerp: variant.subjects[0].text
      .replace("{{company}}", p.companyName)
      .replace("{{years}}", String(p.anniversaryYears ?? 10)),
    beschikbareData: openDays.map((d) => d.date),
  }));
  steps.push({
    stage: "generate",
    ok: true,
    summary: `Generatie mock: ${generated.length} mails (variant “${variant.name}”)`,
    sample: generated,
  });

  steps.push({
    stage: "send",
    ok: false,
    summary:
      "Verzenden overgeslagen in dry-run — vereist BREVO_API_KEY + expliciete live-modus",
  });

  steps.push({
    stage: "track",
    ok: true,
    summary:
      "Meten klaargezet: onderwerp A/B + agenda-CTR landen in analytics zodra webhooks live zijn",
  });

  steps.push({
    stage: "route",
    ok: true,
    summary:
      "Leadrouting: positieve replies → /outreach/leads + SALES_NOTIFY_EMAIL",
  });

  return { ranAt: new Date().toISOString(), steps };
}
