/**
 * Outreach data-pipeline — stappen van ontdekken → lead.
 * Dry-run op mockdata tot live credentials er zijn.
 */

import { prospects } from "@/lib/mock/outreach";
import { openAvailabilityDays } from "@/lib/mock/availability";
import { mailVariants } from "@/lib/mock/mail-performance";
import { mockMultiSourceDiscover } from "@/lib/outreach/sources";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasApolloConfig } from "@/lib/integrations/apollo/client";

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
      "Apollo haalt bedrijven 500–5.000 mdw in AMS-regio. Dedupe vs bestaande lijst + uitsluitingen. KvK target niet.",
    dependsOn: ["APOLLO_API_KEY"],
    dataSource: "Apollo Organization Search",
    status: "needs_credentials",
    missing: ["APOLLO_API_KEY"],
  },
  {
    id: "enrich",
    name: "2. Verrijken",
    description:
      "KvK op bedrijfsnaam of KvK-nummer: vestiging, medewerkers, jubileum, non-mailing. Geen SBI/plaats-sweep.",
    dependsOn: ["KVK_API_KEY"],
    dataSource: "KvK Zoeken + Basis + Vestiging",
    status: "needs_credentials",
    missing: ["KVK_API_KEY"],
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
      "Opens/clicks via Brevo-webhook. Replies loggen op Resultaten (evenement@) → inbound_replies.",
    dependsOn: ["Brevo-webhooks", "Resultaten reply-form"],
    dataSource: "Webhook + /api/outreach/inbound",
    status: "partial",
    missing: ["Mailbox-automatisering (optioneel)"],
  },
  {
    id: "route",
    name: "7. Lead routen",
    description:
      "Positieve gelogde reply → leadrecord. Sales-mail blijft geblokkeerd tot unlock.",
    dependsOn: ["inbound reply log"],
    dataSource: "inbound_replies → leads",
    status: "partial",
    missing: ["OUTREACH_SEND_ENABLED voor sales-notify"],
  },
];

export function getLivePipelineStages(): PipelineStage[] {
  return PIPELINE_STAGES.map((stage) => {
    if (stage.id === "discover" && hasApolloConfig()) {
      return {
        ...stage,
        status: "partial",
        missing: [],
        description:
          "Apollo-key staat aan. Haal 25 bedrijven per keer via /outreach/prospects.",
      };
    }
    if (stage.id === "enrich" && hasKvkConfig()) {
      return {
        ...stage,
        status: "partial",
        missing: [],
        description:
          "KvK-key staat aan. Verrijk bestaande prospects op naam of nummer via /outreach/prospects.",
      };
    }
    return stage;
  });
}

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
    summary: `Apollo-flow mock: ${multi.merged.length} uniek · ${multi.duplicatesRemoved} samengevoegd`,
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
