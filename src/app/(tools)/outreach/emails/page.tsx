import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { OutreachEmailWorkbench } from "@/components/outreach/email-workbench";
import { listOutreachEmails, listProspects } from "@/lib/outreach/data";

export const metadata = { title: "E-mails" };
export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const [{ rows: emails, source }, { rows: prospects }] = await Promise.all([
    listOutreachEmails(),
    listProspects({ type: "company" }),
  ]);

  return (
    <div>
      <SectionHeader
        eyebrow="Outbound"
        title="Mailen"
        description="Kies bedrijf + invalshoek, genereer een draft, stuur een test naar team@."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {emails.length} drafts
            </StatusBadge>
            <Link
              href="/outreach/analytics"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Resultaten →
            </Link>
          </div>
        }
      />

      <OutreachEmailWorkbench prospects={prospects} />

      {emails.length === 0 ? (
        <p className="border-t border-border pt-6 text-sm text-text-muted">
          Nog geen eerdere drafts.
        </p>
      ) : (
        <section className="border-t border-border pt-6">
          <h2 className="mb-3 font-display text-lg tracking-[0.06em]">
            Eerdere drafts
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {emails.map((email) => (
              <li
                key={email.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {email.subject}
                  </p>
                  <p className="text-xs text-text-dim">
                    {email.prospectName}
                    {email.toEmail ? ` · ${email.toEmail}` : ""}
                  </p>
                </div>
                <StatusBadge tone="neutral">{email.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
