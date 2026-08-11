import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getUsageSummary } from "@/lib/usage/store";
import { UNIT_COST_EUR_CENTS } from "@/lib/usage/pricing";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Kosten · Outreach" };
export const dynamic = "force-dynamic";

function eurFromCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const vendorLabel: Record<string, string> = {
  openai: "OpenAI (tokens)",
  anthropic: "Anthropic (tokens)",
  brevo: "Brevo (e-mail)",
  kvk: "KvK API",
  google_places: "Google Places",
  enrichment: "Enrichment",
  other: "Overig",
};

export default async function OutreachKostenPage() {
  const summary = await getUsageSummary({ sinceDays: 30, tool: "outreach" });
  const max = Math.max(...summary.byVendor.map((v) => v.costEurCents), 1);

  return (
    <div>
      <SectionHeader
        eyebrow="Outreach"
        title="Kostmeter"
        description="Tokens en API-verbruik van de outreach-tool. KvK-credits lopen via het Thuishaven-account; AI/Brevo via onze stack tot anders afgesproken."
        action={
          <Link
            href="/koppelingen"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
          >
            Koppelingen →
          </Link>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Totaal · 30 dagen"
          value={eurFromCents(summary.totalEurCents)}
          accent
          hint="Geschat op basis van unit-prijzen"
        />
        <MetricCard
          label="Op hun account"
          value={eurFromCents(summary.clientBilledEurCents)}
          hint="Nu: KvK credits"
        />
        <MetricCard
          label="Onze stack"
          value={eurFromCents(summary.ourStackEurCents)}
          hint="AI + Brevo + Places e.d."
        />
        <MetricCard
          label="Events gelogd"
          value={formatNumber(summary.recent.length)}
          hint="Laatste 25 in periode"
        />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <section className="border border-border bg-surface p-4">
          <h2 className="mb-1 font-display text-2xl tracking-[0.06em]">
            Verdeling
          </h2>
          <p className="mb-4 text-sm text-text-muted">
            Meter vult zich automatisch zodra live calls `recordUsage` aanroepen.
            Onderstaande demo-data verdwijnt zodra echte events binnenkomen.
          </p>
          <ul className="space-y-4">
            {summary.byVendor.map((row) => (
              <li key={row.vendor}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    {vendorLabel[row.vendor] ?? row.vendor}
                    {row.vendor === "kvk" && (
                      <StatusBadge tone="accent">hun factuur</StatusBadge>
                    )}
                  </span>
                  <span className="font-display tracking-wide text-text">
                    {eurFromCents(row.costEurCents)}
                  </span>
                </div>
                <div className="h-2 bg-bg">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${(row.costEurCents / max) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-text-dim">
                  {formatNumber(Math.round(row.units))} {row.unitLabel} ·{" "}
                  {row.share.toFixed(0)}%
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border bg-surface p-4">
          <h2 className="mb-1 font-display text-2xl tracking-[0.06em]">
            Tarieven (indicatie)
          </h2>
          <p className="mb-4 text-sm text-text-muted">
            Aanpassen zodra echte facturen of KvK-tarieven bekend zijn.
          </p>
          <ul className="divide-y divide-border text-sm">
            {(
              Object.entries(UNIT_COST_EUR_CENTS) as Array<
                [
                  keyof typeof UNIT_COST_EUR_CENTS,
                  (typeof UNIT_COST_EUR_CENTS)[keyof typeof UNIT_COST_EUR_CENTS],
                ]
              >
            )
              .filter(([k]) => k !== "other")
              .map(([vendor, rate]) => (
                <li
                  key={vendor}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-text">
                      {vendorLabel[vendor] ?? vendor}
                    </p>
                    <p className="text-xs text-text-muted">{rate.note}</p>
                  </div>
                  <p className="shrink-0 font-display text-xs tracking-[0.08em] text-text-muted">
                    {eurFromCents(rate.centsPerUnit)} / {rate.unitLabel}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <section className="border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Recente events
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-3 font-medium">Wanneer</th>
                <th className="pb-3 font-medium">Vendor</th>
                <th className="pb-3 font-medium">Operatie</th>
                <th className="pb-3 font-medium">Volume</th>
                <th className="pb-3 font-medium">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {summary.recent.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="py-3 text-text-muted">
                    {new Date(e.createdAt).toLocaleString("nl-NL", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3">
                    {vendorLabel[e.vendor] ?? e.vendor}
                    {e.vendor === "kvk" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
                        hun
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-text">{e.operation}</td>
                  <td className="py-3 text-text-muted">
                    {formatNumber(Math.round(e.units))} {e.unitLabel}
                  </td>
                  <td className="py-3 font-display tracking-wide">
                    {eurFromCents(e.costEurCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
