import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { CrmNoteForm } from "@/components/outreach/crm-note-form";
import { getCrmDossier, statusLabels } from "@/lib/outreach/crm";

export const dynamic = "force-dynamic";

function fmt(iso: string) {
  return format(new Date(iso), "d MMM yyyy · HH:mm", { locale: nl });
}

const kindLabel: Record<string, string> = {
  mail: "Mail",
  reply: "Reply",
  note: "Notitie",
  call: "Belletje",
  linkedin: "LinkedIn",
  kvk: "KvK",
  lead: "Lead",
};

export default async function CrmDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { dossier } = await getCrmDossier(id);
  if (!dossier) notFound();

  return (
    <div>
      <SectionHeader
        eyebrow={dossier.partner ? "Partner" : "CRM"}
        title={dossier.companyName}
        description={
          dossier.partner
            ? "Bestaande relatie — geen cold mail."
            : [dossier.city, dossier.sector, dossier.email]
                .filter(Boolean)
                .join(" · ") || "Nog weinig bekend"
        }
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              tone={
                dossier.status === "lead"
                  ? "accent"
                  : dossier.nonMailing
                    ? "warn"
                    : "neutral"
              }
            >
              {statusLabels[dossier.status]}
            </StatusBadge>
            <Link
              href="/outreach/crm"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Alle dossiers
            </Link>
            <Link
              href="/outreach/emails"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Mail schrijven
            </Link>
          </div>
        }
      />

      {dossier.nonMailing ? (
        <div className="mb-6 border border-warn/40 bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">KvK non-mailing</p>
          <p className="mt-1">
            Dit bedrijf wil geen reclame op basis van hun KvK-inschrijving. Niet
            mailen omdat ze in het register staan. Wél: LinkedIn, een bekend
            contact, of als zij jou schrijven.
          </p>
        </div>
      ) : null}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="KvK" value={dossier.kvkNumber ?? "—"} />
        <Fact
          label="Medewerkers"
          value={dossier.employeeCount != null ? String(dossier.employeeCount) : "—"}
        />
        <Fact
          label="Jubileum"
          value={
            dossier.anniversaryYears ? `${dossier.anniversaryYears} jaar` : "—"
          }
        />
        <Fact
          label="Fit"
          value={
            dossier.doelgroepFit === "ja"
              ? "Ja"
              : dossier.doelgroepReason ?? "Onbekend"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="border border-border bg-surface p-4">
          <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
            Contactmomenten
          </h2>
          {dossier.timeline.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nog niets gelogd. Stuur een testmail of schrijf hieronder een
              notitie.
            </p>
          ) : (
            <ol className="space-y-4">
              {dossier.timeline.map((item) => (
                <li
                  key={item.id}
                  className="border-l-2 border-border pl-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={
                        item.kind === "reply" || item.kind === "lead"
                          ? "accent"
                          : item.kind === "kvk"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {kindLabel[item.kind] ?? item.kind}
                    </StatusBadge>
                    <span className="text-xs text-text-dim">{fmt(item.at)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-text">{item.title}</p>
                  {item.detail ? (
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">
                      {item.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-4">
          <section className="border border-border bg-surface p-4">
            <h2 className="mb-3 font-display text-xl tracking-[0.06em]">
              Nieuw moment
            </h2>
            <CrmNoteForm prospectId={dossier.id} />
          </section>
          <section className="border border-border bg-surface p-4 text-sm text-text-muted">
            <h2 className="mb-3 font-display text-xl tracking-[0.06em] text-text">
              Gegevens
            </h2>
            <p>E-mail: {dossier.email ?? "nog niet"}</p>
            <p className="mt-1">
              Website:{" "}
              {dossier.website ? (
                <a
                  href={dossier.website}
                  className="text-accent underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {dossier.website}
                </a>
              ) : (
                "—"
              )}
            </p>
            <p className="mt-1">Mails: {dossier.mailCount}</p>
            <p className="mt-1">Replies: {dossier.replyCount}</p>
            {dossier.lastLead ? (
              <p className="mt-3 text-text">{dossier.lastLead.summary}</p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-text-dim">{label}</p>
      <p className="mt-1 text-sm text-text">{value}</p>
    </div>
  );
}
