import Link from "next/link";
import type { OutreachPipelineStatus } from "@/lib/outreach/pipeline-status";

type Props = {
  status: OutreachPipelineStatus;
};

type Stat = {
  key: string;
  count: number;
  label: string;
  href: string;
  hint: string;
  primary?: boolean;
};

export function PipelineStatusBanner({ status }: Props) {
  const toComplete =
    status.missingEmail + status.incompleteButHasEmail + status.fitUnknown;

  const stats: Stat[] = [
    {
      key: "ready",
      count: status.readyToMail,
      label: "Klaar om te mailen",
      href: "/outreach/emails",
      hint: "E-mail en invalshoek in orde, nog niet gemaild",
      primary: true,
    },
    {
      key: "review",
      count: status.needsReview,
      label: "In de Wachtrij",
      href: "/outreach/planning",
      hint: "Lezen, testen en inplannen",
    },
    {
      key: "complete",
      count: toComplete,
      label: "Aan te vullen",
      href: "/outreach/lijst-bijwerken",
      hint: `${status.missingEmail} zonder e-mail · ${status.incompleteButHasEmail} onvolledig · ${status.fitUnknown} fit onbekend`,
    },
    {
      key: "mailed",
      count: status.mailed,
      label: "Verstuurd",
      href: "/outreach/analytics",
      hint: "Minstens één echte mail",
    },
  ];

  return (
    <nav
      aria-label="Outreach-status"
      className="mb-8 grid grid-cols-2 border-y border-border sm:grid-cols-4"
    >
      {stats.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          title={s.hint}
          className="group border-border px-4 py-4 transition-colors hover:bg-surface/70 [&:not(:first-child)]:border-l"
        >
          <span
            className={`block font-display text-3xl tabular-nums tracking-wide ${
              s.primary ? "text-accent" : "text-text"
            }`}
          >
            {s.count}
          </span>
          <span className="mt-1 block text-sm text-text">{s.label}</span>
          <span className="mt-0.5 block text-xs text-text-dim group-hover:text-text-muted">
            {s.hint}
          </span>
        </Link>
      ))}
    </nav>
  );
}
