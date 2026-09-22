import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { BatchCostPlanner } from "@/components/outreach/batch-cost-planner";
import { getUsageSummary } from "@/lib/usage/store";
import {
  APOLLO_PAGE_SIZE,
  OUTREACH_RATES,
  formatEurFromCents,
} from "@/lib/outreach/batch-costs";
import { UNIVERSE, estimateCurrentUniverseCosts } from "@/lib/outreach/universe";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Kosten · Outreach" };
export const dynamic = "force-dynamic";

const vendorLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  brevo: "Brevo",
  kvk: "KvK",
  google_places: "Places",
  enrichment: "Apollo / Hunter",
  other: "Overig",
};

export default async function OutreachKostenPage() {
  let summary: Awaited<ReturnType<typeof getUsageSummary>>;
  try {
    summary = await getUsageSummary({ sinceDays: 30, tool: "outreach" });
  } catch (e) {
    console.error("outreach kosten", e);
    return (
      <div>
        <SectionHeader
          eyebrow="Outreach"
          title="Kosten"
          description="Kon kosten niet laden. Check DATABASE_URL."
        />
      </div>
    );
  }

  const universe = estimateCurrentUniverseCosts();
  const max = Math.max(...summary.byVendor.map((v) => v.costEurCents), 1);

  return (
    <div>
      <SectionHeader
        eyebrow="Outreach"
        title="Kosten"
        description="Schatting per rits · verbruik laatste 30 dagen. KvK op hun account; Apollo/Hunter op onze stack."
        action={
          <Link
            href="/outreach/lijst-bijwerken"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
          >
            Lijst bijwerken →
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-4 text-sm">
        <p>
          <span className="text-text-dim">Doelgroep ~</span>{" "}
          <strong className="text-text">
            {UNIVERSE.fitLow}–{UNIVERSE.fitHigh}
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Hele lijst slim</span>{" "}
          <strong className="text-text">{universe.labels.smart}</strong>
        </p>
        <p>
          <span className="text-text-dim">30d totaal</span>{" "}
          <strong className="text-text">
            {formatEurFromCents(summary.totalEurCents)}
          </strong>
          <span className="ml-1 text-xs text-text-dim">
            (hun {formatEurFromCents(summary.clientBilledEurCents)} · onze{" "}
            {formatEurFromCents(summary.ourStackEurCents)})
          </span>
        </p>
      </div>

      <BatchCostPlanner />

      <section className="mb-8 border-t border-border pt-6">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Tarief per stap
        </h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          <Rate
            label={`Apollo · ${APOLLO_PAGE_SIZE} ophalen`}
            amount={formatEurFromCents(OUTREACH_RATES.apolloCreditCents)}
            payer="onze"
          />
          <Rate
            label="Apollo · contactpersoon"
            amount={formatEurFromCents(OUTREACH_RATES.apolloCreditCents)}
            payer="onze"
          />
          <Rate
            label={`KvK · ${OUTREACH_RATES.kvkCallsPerCompany} calls`}
            amount={formatEurFromCents(
              OUTREACH_RATES.kvkCallCents * OUTREACH_RATES.kvkCallsPerCompany,
            )}
            payer="hun"
          />
          <Rate
            label="Hunter · e-mail"
            amount={formatEurFromCents(OUTREACH_RATES.hunterSearchCents)}
            payer="onze"
          />
          <Rate label="Website-mail" amount="€ 0,00" payer="gratis" />
        </ul>
      </section>

      <section className="mb-8 border-t border-border pt-6">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Verbruik · 30 dagen
        </h2>
        {summary.byVendor.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nog geen events gelogd.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {summary.byVendor.map((row) => (
              <li key={row.vendor}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span>
                    {vendorLabel[row.vendor] ?? row.vendor}
                    {row.vendor === "kvk" ? (
                      <span className="ml-2 text-[10px] uppercase text-text-dim">
                        hun
                      </span>
                    ) : null}
                  </span>
                  <span className="font-display tracking-wide">
                    {formatEurFromCents(row.costEurCents)}
                  </span>
                </div>
                <div className="h-1.5 bg-bg-elevated">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(row.costEurCents / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {summary.recent.length > 0 ? (
        <section className="border-t border-border pt-6">
          <h2 className="font-display text-lg tracking-[0.06em]">
            Recent ({formatNumber(summary.recent.length)})
          </h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {summary.recent.slice(0, 12).map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2"
              >
                <span className="text-text-muted">
                  {new Date(e.createdAt).toLocaleString("nl-NL", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {vendorLabel[e.vendor] ?? e.vendor} · {e.operation}
                </span>
                <span className="font-display tracking-wide">
                  {formatEurFromCents(e.costEurCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Rate({
  label,
  amount,
  payer,
}: {
  label: string;
  amount: string;
  payer: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-text">{label}</span>
      <span className="flex items-center gap-2">
        <StatusBadge
          tone={
            payer === "hun" ? "info" : payer === "gratis" ? "neutral" : "neutral"
          }
        >
          {payer}
        </StatusBadge>
        <span className="w-16 text-right font-display text-xs tracking-[0.08em]">
          {amount}
        </span>
      </span>
    </li>
  );
}
