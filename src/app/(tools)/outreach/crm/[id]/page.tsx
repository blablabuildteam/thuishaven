import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { CrmNoteForm } from "@/components/outreach/crm-note-form";
import { RefillContactButton } from "@/components/outreach/refill-contact-button";
import { LinkedinEstimateForm } from "@/components/outreach/linkedin-estimate-form";
import { getCrmDossier, statusLabels } from "@/lib/outreach/crm";
import { mailAngleFor, mailAngleTone } from "@/lib/outreach/mail-angle";
import { leadScore, leadTierTone } from "@/lib/outreach/lead-score";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";
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
  const score = leadScore({
    doelgroepFit: dossier.doelgroepFit,
    angleId: angle.id,
    jubileeYearsAway: angle.jubileeYearsAway,
    hasEmail: Boolean(dossier.email),
    hasContact: Boolean(dossier.decisionMakerName),
    openCount: dossier.openCount,
    clickCount: dossier.clickCount,
    replyCount: dossier.replyCount,
    status: dossier.status,
  });
  const templateName = (key: string | null) =>
    key ? (OUTREACH_VARIANTS.find((v) => v.id === key)?.name ?? key) : "—";

  return (
    <div>
      <SectionHeader
        eyebrow={
          dossier.partner
            ? "Partner"
            : dossier.existingCustomer
              ? "Niet mailen"
              : "Bedrijven"
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
            <StatusBadge tone={leadTierTone(score.tier)}>
              Score {score.score} · {score.tier}
            </StatusBadge>
            <StatusBadge tone={mailAngleTone(angle.id)}>
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
                href={`/outreach/emails?prospect=${dossier.id}`}
                className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
              >
                Zet klaar in Mailen
              </Link>
            ) : null}
          </div>
        }
      />

      <p className="mb-2 text-xs text-text-dim">
        Leadscore: {score.reasons.join(" · ") || "nog geen signalen"}
      </p>
      <p className="mb-6 text-sm text-text-muted">
        {angle.detail}
        {angle.also && angle.also.length > 0
          ? ` · Andere invalshoeken: ${angle.also.join(", ")}`
          : ""}
      </p>

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
            </Link>
            .
          </p>
        </div>
      ) : null}

      <details className="mb-8">
        <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
          Gegevens
        </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <Fact label="Gevonden via" value={dossier.searchLabel ?? "—"} />
        <Fact label="Mails verstuurd" value={String(dossier.mailCount)} />
        <Fact
          label="Open / klik / reply"
          value={`${dossier.openCount} / ${dossier.clickCount} / ${dossier.replyCount}`}
        />
      </div>
      </details>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
        <section className="border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl tracking-[0.06em]">Maillog</h2>
            <p className="text-xs text-text-dim">
              Echte verzendingen + open drafts · testmails niet
            </p>
          </div>
          {dossier.mails.length === 0 ? (
            <p className="text-sm text-text-muted">Nog nooit gemaild.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {dossier.mails.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-text-dim">
                      {m.sentAt ? fmt(m.sentAt) : `Draft · ${fmt(m.createdAt)}`}
                    </span>
                    <StatusBadge tone="neutral">{templateName(m.variantKey)}</StatusBadge>
                    {m.sentAt ? <StatusBadge tone="success">Verzonden</StatusBadge> : null}
                    {m.openedAt ? <StatusBadge tone="info">Geopend</StatusBadge> : null}
                    {m.clickedAt ? <StatusBadge tone="info">Geklikt</StatusBadge> : null}
                    {m.repliedAt ? <StatusBadge tone="accent">Gereageerd</StatusBadge> : null}
                    {m.status === "bounced" ? <StatusBadge tone="danger">Bounce</StatusBadge> : null}
                  </div>
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-sm font-medium text-text hover:text-accent">
                      {m.subject}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-muted">
                      {m.body}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

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
        </div>

        <aside className="space-y-4">
          <section className="border border-border bg-surface p-4">
            <h2 className="mb-3 font-display text-xl tracking-[0.06em]">
              Notities
            </h2>
            <CrmNoteForm prospectId={dossier.id} />
            {dossier.notes.length > 0 ? (
              <ul className="mt-4 space-y-3 border-t border-border pt-3">
                {dossier.notes.map((n) => (
                  <li key={n.id} className="text-sm">
                    <p className="text-xs text-text-dim">
                      {kindLabel[n.kind] ?? n.kind} · {fmt(n.at)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-text">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
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
                Nog geen Event/Office Manager. Zoek hieronder opnieuw, of via{" "}
                <Link
                  href="/outreach/lijst-bijwerken"
                  className="text-accent underline"
                >
                  Lijst bijwerken
                </Link>
                .
              </p>
            )}
            <RefillContactButton prospectId={dossier.id} />
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
