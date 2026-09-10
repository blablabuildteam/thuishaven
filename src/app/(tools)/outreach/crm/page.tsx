import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { listCrmRecords, statusLabels } from "@/lib/outreach/crm";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Bedrijven" };
export const dynamic = "force-dynamic";

function fmt(iso: string | null) {
  if (!iso) return "Nog geen contact";
  return format(new Date(iso), "d MMM yyyy", { locale: nl });
}

function angleTone(id: string) {
  if (id === "jubileum") return "accent" as const;
  if (id === "algemeen") return "success" as const;
  if (id === "past_niet" || id === "niet_mailen") return "danger" as const;
  return "neutral" as const;
}

export default async function OutreachCrmPage() {
  const { rows, source } = await listCrmRecords();
  const existingCustomers = rows.filter(
    (r) => !r.partner && r.existingCustomer,
  );
  const companies = rows
    .filter((r) => !r.partner && !r.existingCustomer)
    .map((row) => ({
      row,
      angle: mailAngleFor({
        status: row.status,
        existingCustomer: row.existingCustomer,
        doelgroepFit: row.doelgroepFit,
        doelgroepReason: row.doelgroepReason,
        anniversaryYears: row.anniversaryYears,
      }),
    }))
    .sort(
      (a, b) =>
        a.angle.rank - b.angle.rank ||
        a.row.companyName.localeCompare(b.row.companyName, "nl"),
    );

  const mailable = companies.filter(
    (c) => c.angle.id === "jubileum" || c.angle.id === "algemeen",
  ).length;
  const jubileum = companies.filter((c) => c.angle.id === "jubileum").length;
  const outside = companies.filter((c) => c.angle.id === "past_niet").length;

  return (
    <div>
      <SectionHeader
        eyebrow="Lijst"
        title="Bedrijven"
        description="Gesorteerd op mailhoek: jubileum eerst, daarna algemeen feest. Buiten regio of verkeerde grootte krijgen label Past niet."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {companies.length} op de lijst
            </StatusBadge>
            <Link
                href="/outreach/lijst-bijwerken"
                className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
              >
                Lijst bijwerken →
              </Link>
            <Link
              href="/outreach/emails"
              data-tour="crm-mailen"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Mailen →
            </Link>
          </div>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Op de lijst" value={formatNumber(companies.length)} />
        <MetricCard
          label="Klaar om te mailen"
          value={formatNumber(mailable)}
          accent
          hint="Passen in doelgroep"
        />
        <MetricCard
          label="Jubileum dit/volgend jaar"
          value={formatNumber(jubileum)}
        />
        <MetricCard
          label="Past niet"
          value={formatNumber(outside)}
          hint="o.a. buiten regio"
        />
      </div>

      <p className="mb-4 text-sm text-text-muted">
        <span className="text-text">Jubileum</span> = felicitatie-mail.{" "}
        <span className="text-text">Algemeen feest</span> = bedrijfsfeest /
        zomerfeest. <span className="text-text">Past niet</span> = te klein/groot
        of buiten Amsterdam + ~50 km — zichtbaar met label, niet in bulk. Nieuwe
        bedrijven haal je op via{" "}
        <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
          Lijst bijwerken
        </Link>
        .
      </p>

      <section className="mb-10">
        {companies.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
            Nog geen bedrijven.{" "}
            <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
              Haal ze hier op
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Bedrijf</th>
                  <th className="px-4 py-3 font-medium">Mailhoek</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Mdw</th>
                  <th className="px-4 py-3 font-medium">Mails</th>
                  <th className="px-4 py-3 font-medium">Replies</th>
                  <th className="px-4 py-3 font-medium">Laatst contact</th>
                </tr>
              </thead>
              <tbody>
                {companies.map(({ row, angle }) => (
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
                      <StatusBadge tone={angleTone(angle.id)}>
                        {angle.label}
                      </StatusBadge>
                      <p className="mt-1 max-w-[220px] text-xs text-text-dim">
                        {angle.detail}
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
                    <td className="px-4 py-3 font-mono text-text-muted">
                      {row.linkedinEmployeeEstimate != null
                        ? `~${row.linkedinEmployeeEstimate}`
                        : (row.employeeCount ?? "—")}
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

      {existingCustomers.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-2xl tracking-[0.06em]">
            Al klant / niet mailen
          </h2>
          <p className="mb-3 text-sm text-text-muted">
            {existingCustomers.length} namen — zichtbaar, niet in de mail-bulk.
          </p>
          <ul className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
            {existingCustomers.map((row) => (
              <li key={row.id} className="mb-1.5 break-inside-avoid">
                <Link
                  href={`/outreach/crm/${row.id}`}
                  className="text-sm text-text hover:text-accent"
                >
                  {row.companyName}
                </Link>
                <span className="ml-1.5 text-xs text-danger">
                  {row.excludedReason ?? "Niet mailen"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
