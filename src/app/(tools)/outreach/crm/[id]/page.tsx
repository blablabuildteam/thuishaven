import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { CrmNoteForm } from "@/components/outreach/crm-note-form";
import { LinkedinEstimateForm } from "@/components/outreach/linkedin-estimate-form";
import { getCrmDossier, statusLabels } from "@/lib/outreach/crm";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import {
  linkedinCompanySearchUrl,
  linkedinPeopleSearchUrl,
} from "@/lib/outreach/linkedin";

export const dynamic = "force-dynamic";

function fmt(iso: string) {
  return format(new Date(iso), "d MMM yyyy · HH:mm", { locale: nl });
}

const kindLabel: Record<string, string> = {
  mail: "Mail",
  reply: "Reply",
  note: "Notitie",
  call: "Belletje",
  linkedin: "Contact",
  kvk: "Systeem",
  lead: "Lead",
};

export default async function CrmDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ dossier }, session] = await Promise.all([
    getCrmDossier(id),
    auth(),
  ]);
  if (!dossier) notFound();
  const isAdmin = session?.user?.role === "admin";

  const angle = mailAngleFor({
    status: dossier.status,
    existingCustomer: dossier.existingCustomer,
    doelgroepFit: dossier.doelgroepFit,
    doelgroepReason: dossier.doelgroepReason,
    anniversaryYears: dossier.anniversaryYears,
  });

  return (
    <div>
      <SectionHeader
        eyebrow={
          dossier.partner
            ? "Partner"
            : dossier.existingCustomer
              ? "Niet mailen"
              : "CRM"
        }
        title={dossier.companyName}
        description={
          dossier.partner
            ? "Bestaande relatie — geen cold mail."
            : dossier.existingCustomer
              ? dossier.excludedReason ?? "Al klant / niet mailen"
              : [dossier.city, dossier.sector, dossier.email]
                  .filter(Boolean)
                  .join(" · ") || "Nog weinig bekend"
        }
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              tone={
                angle.id === "jubileum"
                  ? "accent"
                  : angle.id === "algemeen"
                    ? "success"
                    : angle.id === "past_niet" || angle.id === "niet_mailen"
                      ? "danger"
                      : "neutral"
              }
            >
              {angle.label}
            </StatusBadge>
            <StatusBadge
              tone={
                dossier.status === "lead"
                  ? "accent"
                  : dossier.status === "excluded"
                    ? "danger"
                    : "neutral"
              }
            >
              {dossier.existingCustomer
                ? dossier.excludedReason ?? statusLabels[dossier.status]
                : statusLabels[dossier.status]}
            </StatusBadge>
            <Link
              href="/outreach/crm"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Alle dossiers
            </Link>
            {!dossier.partner && !dossier.existingCustomer ? (
              <Link
                href="/outreach/emails"
                className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
              >
                Mail schrijven
              </Link>
            ) : null}
          </div>
        }
      />

      <p className="mb-6 text-sm text-text-muted">{angle.detail}</p>

      {dossier.existingCustomer ? (
        <div className="mb-6 border border-danger/40 bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">Al klant / niet mailen</p>
          <p className="mt-1">
            Staat op de uitsluitingslijst van Reijner. Draft en send zijn
            geblokkeerd; Apollo haalt dit bedrijf niet opnieuw binnen.
          </p>
        </div>
      ) : null}

      {dossier.nonMailing ? (
        <div className="mb-6 border border-danger/40 bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">KvK non-mailing</p>
          <p className="mt-1">
            Dit bedrijf staat bij KvK op niet-mailen. Draft en send zijn
            geblokkeerd.
          </p>
        </div>
      ) : null}

      {dossier.incomplete && !dossier.existingCustomer ? (
        <div className="mb-6 border border-warn/40 bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">Dossier onvolledig</p>
          <p className="mt-1">
            {[
              dossier.employeeCount == null ? "geen bruikbare mdw" : null,
              !dossier.email ? "geen e-mail" : null,
              !dossier.decisionMakerName ? "geen contactpersoon" : null,
              !dossier.inRegion && !(dossier.city || dossier.apolloCity)
                ? "plaats onbekend"
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Nog gegevens nodig"}
            . Vul aan via{" "}
            <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
              Lijst bijwerken
            </Link>{" "}
            of de headcount-override hiernaast.
          </p>
        </div>
      ) : null}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="KvK" value={dossier.kvkNumber ?? "—"} />
        <Fact
          label="Mdw (voor fit)"
          value={
            dossier.employeeCount != null
              ? `~${dossier.employeeCount}`
              : "—"
          }
        />
        <Fact
          label="Apollo mdw"
          value={
            dossier.apolloEmployeeCount != null
              ? `~${dossier.apolloEmployeeCount}`
              : "—"
          }
        />
        <Fact
          label="KvK mdw (vestiging)"
          value={
            dossier.kvkEmployeeCount != null
              ? `${dossier.kvkEmployeeCount}${
                  dossier.kvkHeadcountOff ? " · vaak te laag" : ""
                }`
              : "—"
          }
        />
        <Fact
          label="Leeftijd / jubileum"
          value={
            dossier.anniversaryYears != null
              ? `${dossier.anniversaryYears} jr${
                  angle.jubileeMark
                    ? ` → ${angle.jubileeMark}`
                    : ""
                }`
              : "—"
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
        <Fact label="Plaats · Apollo" value={dossier.apolloCity ?? "—"} />
        <Fact label="Plaats · KvK" value={dossier.kvkCity ?? "—"} />
        <Fact
          label="Regio"
          value={dossier.inRegion ? "In ~50 km" : "Buiten / onbekend"}
        />
        <Fact
          label="Bron"
          value={
            dossier.source === "apollo"
              ? "Apollo"
              : dossier.source === "paste"
                ? "Handmatig"
                : dossier.source ?? "—"
          }
        />
        <Fact label="Mails verstuurd" value={String(dossier.mailCount)} />
        <Fact
          label="Opens / replies"
          value={`${dossier.openCount} / ${dossier.replyCount}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="border border-border bg-surface p-4">
          <h2 className="mb-1 font-display text-2xl tracking-[0.06em]">
            Activiteit
          </h2>
          <p className="mb-4 text-sm text-text-muted">
            Alles wat er gebeurd is: ophalen, KvK, contact, mails, opens,
            clicks, replies.
          </p>
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
                          : item.status === "opened" ||
                              item.status === "clicked"
                            ? "info"
                            : item.kind === "kvk"
                              ? "info"
                              : "neutral"
                      }
                    >
                      {item.title.startsWith("Mail geopend")
                        ? "Open"
                        : item.title.startsWith("Link geklikt")
                          ? "Click"
                          : kindLabel[item.kind] ?? item.kind}
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
          {isAdmin ? (
            <section className="border border-border bg-surface p-4">
              <h2 className="mb-3 font-display text-xl tracking-[0.06em]">
                Headcount override (admin)
              </h2>
              <p className="mb-3 text-xs text-text-muted">
                Alleen noodgeval — normaal vult Apollo dit automatisch.
              </p>
              <LinkedinEstimateForm
                prospectId={dossier.id}
                companySearchUrl={linkedinCompanySearchUrl(dossier.companyName)}
                peopleSearchUrl={linkedinPeopleSearchUrl(dossier.companyName)}
                currentEstimate={dossier.linkedinEmployeeEstimate}
                currentUrl={dossier.linkedinUrl}
              />
            </section>
          ) : (
            <section className="border border-border bg-surface p-4 text-sm text-text-muted">
              <h2 className="mb-2 font-display text-xl tracking-[0.06em] text-text">
                Medewerkers
              </h2>
              <p>
                Komt automatisch uit Apollo (bij ophalen of via{" "}
                <Link
                  href="/outreach/lijst-bijwerken"
                  className="text-accent underline"
                >
                  Alles aanvullen
                </Link>
                ). Geen handmatige LinkedIn-invoer.
              </p>
              <p className="mt-2 font-mono text-text">
                Fit:{" "}
                {dossier.employeeCount != null
                  ? `~${dossier.employeeCount}`
                  : "nog niet"}
                {dossier.apolloEmployeeCount != null
                  ? ` · Apollo ~${dossier.apolloEmployeeCount}`
                  : ""}
              </p>
            </section>
          )}
          <section className="border border-border bg-surface p-4">
            <h2 className="mb-3 font-display text-xl tracking-[0.06em]">
              Nieuw moment
            </h2>
            <CrmNoteForm prospectId={dossier.id} />
          </section>
          <section className="border border-border bg-surface p-4 text-sm text-text-muted">
            <h2 className="mb-3 font-display text-xl tracking-[0.06em] text-text">
              Contactpersonen
            </h2>
            {dossier.contacts.length > 0 ? (
              <ul className="space-y-3">
                {dossier.contacts.map((c) => (
                  <li key={`${c.name}-${c.title ?? ""}`}>
                    <p className="font-medium text-text">{c.name}</p>
                    <p className="text-xs">
                      {[c.title, c.email ?? "geen e-mail"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {c.linkedinUrl ? (
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent underline"
                      >
                        LinkedIn
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Nog geen Event/Office Manager. Haal ze op via{" "}
                <Link
                  href="/outreach/lijst-bijwerken"
                  className="text-accent underline"
                >
                  Lijst bijwerken → stap 3
                </Link>
                .
              </p>
            )}
            <p className="mt-3">
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
            {dossier.kvkMatchWeak ? (
              <p className="mt-3 text-warn">
                KvK-naammatch twijfelachtig — check KvK-nummer op het dossier.
              </p>
            ) : null}
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
