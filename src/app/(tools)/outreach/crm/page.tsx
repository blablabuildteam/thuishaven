import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { listCrmRecords, statusLabels } from "@/lib/outreach/crm";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

function fmt(iso: string | null) {
  if (!iso) return "Nog geen contact";
  return format(new Date(iso), "d MMM yyyy", { locale: nl });
}

export default async function OutreachCrmPage() {
  const { rows, source } = await listCrmRecords();
  const companies = rows.filter((r) => !r.partner);
  const partners = rows.filter((r) => r.partner);
  const mailed = companies.filter((r) => r.mailCount > 0).length;
  const replied = companies.filter((r) => r.replyCount > 0).length;
  const fit = companies.filter((r) => r.doelgroepFit === "ja").length;
  const kvkOff = companies.filter((r) => r.kvkHeadcountOff).length;

  return (
    <div>
      <SectionHeader
        eyebrow="Relaties"
        title="CRM"
        description="KvK vult medewerkers, plaats en jubileum. Non-mailing negeren we — dat blokkeert geen mail."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {companies.length} dossiers
            </StatusBadge>
            <Link
              href="/outreach/prospects"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Lijst vullen →
            </Link>
          </div>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Bedrijven" value={formatNumber(companies.length)} />
        <MetricCard label="Al gemaild" value={formatNumber(mailed)} accent />
        <MetricCard label="Met reply" value={formatNumber(replied)} />
        <MetricCard label="Past in doelgroep" value={formatNumber(fit)} />
        <MetricCard
          label="KvK mdw checken"
          value={formatNumber(kvkOff)}
          hint="Raar laag — LinkedIn"
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-2xl tracking-[0.06em]">
          Doelgroep
        </h2>
        {companies.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
            Nog geen dossiers.{" "}
            <Link href="/outreach/prospects" className="text-accent underline">
              Vul de lijst
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Bedrijf</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Fit</th>
                  <th className="px-4 py-3 font-medium">Mdw</th>
                  <th className="px-4 py-3 font-medium">Jubileum</th>
                  <th className="px-4 py-3 font-medium">Mails</th>
                  <th className="px-4 py-3 font-medium">Replies</th>
                  <th className="px-4 py-3 font-medium">Laatst</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-surface/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/outreach/crm/${row.id}`}
                        className="text-text hover:text-accent"
                      >
                        {row.companyName}
                      </Link>
                      <p className="text-xs text-text-dim">
                        {row.city ?? "—"}
                        {row.email ? ` · ${row.email}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          row.status === "lead" || row.status === "replied"
                            ? "accent"
                            : row.status === "excluded"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {statusLabels[row.status]}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {row.doelgroepFit === "ja" ? (
                        <StatusBadge tone="success">fit</StatusBadge>
                      ) : row.doelgroepFit === "nee" ? (
                        <StatusBadge tone="danger">
                          {row.doelgroepReason ?? "geen fit"}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-text-dim">onbekend</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.linkedinEmployeeEstimate != null
                        ? `~${row.linkedinEmployeeEstimate}`
                        : (row.employeeCount ?? "—")}
                      {row.kvkHeadcountOff &&
                      row.linkedinEmployeeEstimate == null ? (
                        <span className="ml-1 text-[10px] uppercase tracking-wide text-warn">
                          check LI
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-accent">
                      {row.anniversaryYears ? `${row.anniversaryYears} jr` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono">{row.mailCount}</td>
                    <td className="px-4 py-3 font-mono">{row.replyCount}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {fmt(row.lastTouchAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-2xl tracking-[0.06em]">
          Partnerbureaus
        </h2>
        <p className="mb-3 text-sm text-text-muted">
          Bestaande relatie — niet cold. Klik voor het dossier.
        </p>
        <ul className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
          {partners.map((row) => (
            <li key={row.id} className="mb-1.5 break-inside-avoid">
              <Link
                href={`/outreach/crm/${row.id}`}
                className="text-sm text-text hover:text-accent"
              >
                {row.companyName}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
