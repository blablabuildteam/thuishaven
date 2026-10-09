import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OutreachPipelineStatus } from "@/lib/outreach/pipeline-status";

type Props = {
  status: OutreachPipelineStatus;
};

type Segment = {
  key: string;
  count: number;
  label: string;
  href: string;
  hint: string;
  tone: "accent" | "success" | "warn" | "danger" | "neutral" | "info";
  emphasize?: boolean;
};

export function PipelineStatusBanner({ status }: Props) {
  const segments: Segment[] = [
    {
      key: "review",
      count: status.needsReview,
      label: "Te checken",
      href: "/outreach/planning",
      hint:
        status.drafts > 0
          ? "Staan in de Wachtrij — lezen en testen"
          : "Staan in de Wachtrij — lezen en testen",
      tone: status.needsReview > 0 ? "accent" : "neutral",
    },
    {
      key: "ready",
      count: status.readyToMail,
      label: "Klaar om te mailen",
      href: "/outreach/emails",
      hint: "E-mail + invalshoek ok · nog niet gemaild of in de Wachtrij",
      tone: status.readyToMail > 0 ? "success" : "neutral",
    },
    {
      key: "fit",
      count: status.fitUnknown,
      label: "Fit nog checken",
      href: "/outreach/crm",
      hint: "Heeft mail, doelgroep nog onbekend — beoordelen vóór first-mail",
      tone: status.fitUnknown > 0 ? "warn" : "neutral",
      emphasize: status.fitUnknown > 0,
    },
    {
      key: "no-email",
      count: status.missingEmail,
      label: "Geen e-mail",
      href: "/outreach/lijst-bijwerken",
      hint: "Nog niet gemaild — vul e-mail aan via Lijst bijwerken",
      tone: status.missingEmail > 0 ? "danger" : "neutral",
      emphasize: status.missingEmail > 0,
    },
    {
      key: "incomplete",
      count: status.incompleteButHasEmail,
      label: "Gegevens ontbreken",
      href: "/outreach/crm",
      hint: "Heeft e-mail, maar medewerkers / contact / plaats ontbreekt",
      tone: status.incompleteButHasEmail > 0 ? "warn" : "neutral",
      emphasize: status.incompleteButHasEmail > 0,
    },
    {
      key: "mailed",
      count: status.mailed,
      label: "Al verstuurd",
      href: "/outreach/crm",
      hint: "Minstens één echte mail verstuurd",
      tone: "neutral",
    },
  ];

  const missingTotal =
    status.missingEmail + status.incompleteButHasEmail + status.fitUnknown;

  return (
    <div
      className="mb-6 border-y border-border py-3"
      role="region"
      aria-label="Outreach-funnel status"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] uppercase tracking-wider text-text-dim">
          Funnel · {status.totalCompanies} bedrijven
        </p>
        {missingTotal > 0 ? (
          <p className="text-xs text-warn">
            Pad naar first-mail aan iedereen: {status.fitUnknown} fit checken
            {status.fitNo > 0 ? ` · ${status.fitNo} past niet` : ""}
            {status.missingEmail > 0
              ? ` · ${status.missingEmail} zonder e-mail`
              : ""}
            {status.nonMailing > 0
              ? ` · ${status.nonMailing} KvK non-mailing (nooit mailen)`
              : ""}
          </p>
        ) : (
          <p className="text-xs text-text-dim">
            Geen openstaande gegevensgaten bij nog-niet-gemailde
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-stretch gap-x-1 gap-y-2 sm:gap-x-0">
        {segments.map((seg, i) => (
          <div key={seg.key} className="flex min-w-0 items-center">
            {i > 0 ? (
              <span
                className="mx-2 hidden text-text-dim sm:inline"
                aria-hidden
              >
                ·
              </span>
            ) : null}
            <Link
              href={seg.href}
              title={seg.hint}
              className={`group inline-flex min-w-0 flex-col gap-1 rounded-sm px-1 py-0.5 transition-colors hover:bg-surface/80 ${
                seg.emphasize
                  ? "border border-warn/50 bg-warn/10 px-2 py-1.5"
                  : ""
              }`}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`font-display text-base tabular-nums tracking-wide ${
                    seg.emphasize ? "text-warn" : "text-text"
                  }`}
                >
                  {seg.count}
                </span>
                <StatusBadge tone={seg.tone}>{seg.label}</StatusBadge>
              </span>
              <span className="max-w-[12rem] text-[11px] leading-snug text-text-dim group-hover:text-text-muted">
                {seg.hint}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
