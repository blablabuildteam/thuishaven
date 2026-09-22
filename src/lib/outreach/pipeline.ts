/**
 * Outreach data-pipeline — stappen van ontdekken → lead.
 * Status weerspiegelt echte keys (Apollo/KvK/Brevo), niet alleen mock.
 */

import { prospects } from "@/lib/mock/outreach";
import { openAvailabilityDays } from "@/lib/mock/availability";
import { mailVariants } from "@/lib/mock/mail-performance";
import { mockMultiSourceDiscover } from "@/lib/outreach/sources";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasApolloConfig } from "@/lib/integrations/apollo/client";
import { hasHunterConfig } from "@/lib/integrations/hunter/client";
import { getBrevoKey } from "@/lib/integrations/brevo/client";
import {
  getOutreachBrevoKey,
  isOutreachSendEnabled,
  isOutreachTestSendEnabled,
} from "@/lib/outreach/send-policy";

export type PipelineStageId =
  | "discover"
  | "enrich"
  | "filter"
  | "generate"
  | "send"
  | "track"
  | "route";

export type PipelineStageStatus = "ready" | "partial" | "blocked";

export type PipelineStage = {
  id: PipelineStageId;
  name: string;
  description: string;
  dependsOn: string[];
  dataSource: string;
  status: PipelineStageStatus;
  missing?: string[];
};

function hasAiKey(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim(),
  );
}

export function getLivePipelineStages(): PipelineStage[] {
  const apollo = hasApolloConfig();
  const kvk = hasKvkConfig();
  const hunter = hasHunterConfig();
  const brevo = Boolean(getOutreachBrevoKey() || getBrevoKey());
  const ai = hasAiKey();
  const webhook = Boolean(process.env.OUTREACH_BREVO_WEBHOOK_SECRET?.trim());
  const liveSend =
    isOutreachSendEnabled() &&
    process.env.OUTREACH_LIVE_SEND?.trim() === "true";
  const testSend = isOutreachTestSendEnabled() && brevo;

  return [
    {
      id: "discover",
      name: "1. Ontdekken",
      description: apollo
        ? "Apollo staat aan. Haal batches van 100 op via Lijst bijwerken."
        : "Apollo ontbreekt — geen nieuwe bedrijven ophalen.",
      dependsOn: ["APOLLO_API_KEY"],
      dataSource: "Apollo Organization Search",
      status: apollo ? "ready" : "blocked",
      missing: apollo ? [] : ["APOLLO_API_KEY"],
    },
    {
      id: "enrich",
      name: "2. Verrijken",
      description: kvk
        ? hunter
          ? "KvK + Hunter staan aan. Auto-aanvullen via Lijst bijwerken."
          : "KvK staat aan. Hunter ontbreekt — website-mail blijft als fallback."
        : "KvK ontbreekt — geen jubileum/vestiging.",
      dependsOn: ["KVK_API_KEY", "HUNTER_API_KEY (optioneel)"],
      dataSource: "KvK · Apollo people · Hunter",
      status: kvk ? (hunter ? "ready" : "partial") : "blocked",
      missing: [
        ...(kvk ? [] : ["KVK_API_KEY"]),
        ...(hunter ? [] : ["HUNTER_API_KEY (optioneel)"]),
      ],
    },
    {
      id: "filter",
      name: "3. Filteren",
      description:
        "Uitsluitingslijst, bestaande klanten, regio, non-mailing — actief in CRM.",
      dependsOn: ["uitsluitingen"],
      dataSource: "exclusions + CRM-filters",
      status: "ready",
    },
    {
      id: "generate",
      name: "4. Genereren",
      description: ai
        ? "AI-sleutel aanwezig — drafts via Gemini/OpenAI + templates als fallback."
        : "Geen AI-sleutel — templates werken wel (Reijner-toon).",
      dependsOn: ["GEMINI_API_KEY / OPENAI_API_KEY (optioneel)"],
      dataSource: "Mailvarianten + /beschikbaar",
      status: ai ? "ready" : "partial",
      missing: ai ? [] : ["AI-sleutel (optioneel — templates werken)"],
    },
    {
      id: "send",
      name: "5. Versturen",
      description: liveSend
        ? "Live naar prospects staat aan."
        : testSend
          ? "Testsend naar team@ mag. Live naar prospects blijft bewust uit."
          : "Brevo of testsend staat uit.",
      dependsOn: ["BREVO_API_KEY / BREVO_MCP_TOKEN"],
      dataSource: "Brevo transactional",
      status: liveSend ? "ready" : testSend ? "partial" : "blocked",
      missing: brevo
        ? liveSend
          ? []
          : ["Live send uit (bewust)"]
        : ["Brevo API-key"],
    },
    {
      id: "track",
      name: "6. Meten",
      description: webhook
        ? "Brevo-webhook staat op productie (opens/clicks). Replies log je handmatig."
        : "Webhook-secret ontbreekt — opens komen niet binnen.",
      dependsOn: ["OUTREACH_BREVO_WEBHOOK_SECRET"],
      dataSource: "Webhook + Resultaten reply-form",
      status: webhook ? "ready" : "partial",
      missing: webhook ? [] : ["OUTREACH_BREVO_WEBHOOK_SECRET"],
    },
    {
      id: "route",
      name: "7. Lead routen",
      description:
        "Positieve gelogde reply → warme lead. Sales-notify via testadres tot live unlock.",
      dependsOn: ["inbound reply log"],
      dataSource: "inbound_replies → leads",
      status: "ready",
    },
  ];
}

/** Prefer getLivePipelineStages() — evaluated at request time. */
export const PIPELINE_STAGES = [] as PipelineStage[];

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
  const stages = getLivePipelineStages();
  const steps: DryRunStepResult[] = [];
  const multi = mockMultiSourceDiscover();

  const discover = stages.find((s) => s.id === "discover")!;
  steps.push({
    stage: "discover",
    ok: discover.status !== "blocked",
    summary:
      discover.status === "blocked"
        ? "Apollo niet gekoppeld"
        : `Apollo klaar · dry-run mock: ${multi.merged.length} uniek`,
    sample: {
      status: discover.status,
      perBron: multi.bySource,
    },
  });

  const discovered = prospects.filter(
    (p) => p.type === "company" || p.type === "agency",
  );
  const enriched = discovered.filter((p) => p.email);
  const enrich = stages.find((s) => s.id === "enrich")!;
  steps.push({
    stage: "enrich",
    ok: enrich.status !== "blocked",
    summary:
      enrich.status === "blocked"
        ? "KvK niet gekoppeld"
        : `KvK/Hunter klaar · mock: ${enriched.length} met e-mail`,
  });

  steps.push({
    stage: "filter",
    ok: true,
    summary: "Filters actief in CRM (uitsluitingen · regio · fit)",
  });

  const openDays = openAvailabilityDays().slice(0, 3);
  const variant = mailVariants[0];
  const generate = stages.find((s) => s.id === "generate")!;
  steps.push({
    stage: "generate",
    ok: true,
    summary: generate.description,
    sample: {
      variant: variant?.name,
      openDays: openDays.map((d) => d.date),
    },
  });

  const send = stages.find((s) => s.id === "send")!;
  steps.push({
    stage: "send",
    ok: send.status !== "blocked",
    summary: send.description,
  });

  const track = stages.find((s) => s.id === "track")!;
  steps.push({
    stage: "track",
    ok: track.status !== "blocked",
    summary: track.description,
  });

  steps.push({
    stage: "route",
    ok: true,
    summary: "Leadrouting: positieve replies → /outreach/leads",
  });

  return { ranAt: new Date().toISOString(), steps };
}
