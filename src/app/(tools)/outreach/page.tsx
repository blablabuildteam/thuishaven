import Link from "next/link";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOutreachOverview } from "@/lib/outreach/data";
import {
  getPublicAvailabilityUrl,
  openAvailabilityDaysLive,
} from "@/lib/outreach/availability";
import { outreachLiveSendBlockReason } from "@/lib/outreach/send-policy";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

function slotLine(dateIso: string, label?: string) {
  let dateBit = dateIso;
  try {
    dateBit = format(parseISO(dateIso), "EEE d MMM yyyy", { locale: nl });
  } catch {
    /* keep iso */
  }
  return label ? `${dateBit} · ${label}` : dateBit;
}

export default async function OutreachPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const overview = await getOutreachOverview();
  const openSlots = isAdmin ? await openAvailabilityDaysLive() : [];
  const liveUrl = isAdmin ? getPublicAvailabilityUrl() : null;
  const sendBlock = outreachLiveSendBlockReason();
  const openRate =
    overview.kpis.sent > 0
      ? (overview.kpis.opened / overview.kpis.sent) * 100
      : 0;

  return (
    <div>
      <SectionHeader
        eyebrow="Bedrijfsevent Outreach"
        title="Overzicht"
        description="Stand van zaken. Flow: Lijst bijwerken → Bedrijven → Mailen → Resultaten."
        action={
          <div className="flex flex-wrap gap-2">
            {isAdmin && sendBlock ? (
              <StatusBadge tone="info">Testmodus</StatusBadge>
            ) : null}
            <Link
              href="/outreach/uitleg"
              className="text-sm text-text-muted underline-offset-4 hover:underline"
            >
              Hoe het werkt
            </Link>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-4 text-sm">
        <p>
          <span className="text-text-dim">Bedrijven</span>{" "}
          <strong className="font-display text-lg text-text">
            {formatNumber(overview.kpis.prospectsTotal)}
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Verzonden</span>{" "}
          <strong className="text-text">{formatNumber(overview.kpis.sent)}</strong>
        </p>
        <p>
          <span className="text-text-dim">Open</span>{" "}
          <strong className="text-text">{formatPercent(openRate)}</strong>
        </p>
        <p>
          <span className="text-text-dim">Replies</span>{" "}
          <strong className="text-text">
            {formatNumber(overview.kpis.replied)}
          </strong>
        </p>
        <p>
          <span className="text-text-dim">Leads</span>{" "}
          <strong className="text-text">{formatNumber(overview.kpis.leads)}</strong>
        </p>
      </div>

      <nav className="mb-10 flex flex-wrap gap-2">
        <Link
          href="/outreach/lijst-bijwerken"
          className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast"
        >
          Lijst bijwerken
        </Link>
        <Link
          href="/outreach/crm"
          className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent"
        >
          Bedrijven
        </Link>
        <Link
          href="/outreach/emails"
          className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent"
        >
          Mailen
        </Link>
        <Link
          href="/outreach/analytics"
          className="border border-border px-4 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent"
        >
          Resultaten
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg tracking-[0.06em]">
              Warme leads
            </h2>
            <Link
              href="/outreach/analytics"
              className="text-xs text-text-dim hover:text-accent"
            >
              Resultaten →
            </Link>
          </div>
          {overview.leads.length === 0 ? (
            <p className="text-sm text-text-muted">Nog geen warme leads.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {overview.leads.slice(0, 5).map((lead) => (
                <li key={lead.id} className="py-3">
                  <p className="text-sm text-text">{lead.companyName}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{lead.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isAdmin ? (
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg tracking-[0.06em]">
                Agenda · {openSlots.length} open
              </h2>
              <Link
                href="/outreach/beschikbaarheid"
                className="text-xs text-text-dim hover:text-accent"
              >
                Beheren →
              </Link>
            </div>
            {openSlots.length === 0 ? (
              <p className="text-sm text-text-muted">Nog geen open dagen.</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-text-muted">
                {openSlots.slice(0, 5).map((slot) => (
                  <li key={slot.id}>{slotLine(slot.date, slot.label)}</li>
                ))}
              </ul>
            )}
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block break-all font-mono text-xs text-accent underline-offset-2 hover:underline"
              >
                {liveUrl}
              </a>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
