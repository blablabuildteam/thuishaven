import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sampleEmails } from "@/lib/mock/outreach";
import { PUBLIC_AVAILABILITY_URL } from "@/lib/mock/availability";

export const metadata = { title: "E-mails" };

export default function EmailsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Outbound"
        title="Gegenereerde mails"
        description="Per ontvanger uniek, met meetbare links. Availability-URL is altijd live — clicks tellen mee in Wat werkt."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/outreach/analytics"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Analytics →
            </Link>
            <Link
              href="/beschikbaar"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Live agenda
            </Link>
          </div>
        }
      />

      <div className="mb-6 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        Live link in mails:{" "}
        <code className="text-accent">{PUBLIC_AVAILABILITY_URL}</code>
        {" · "}
        UTM/campaign-id per verzending voor CTR per onderwerp.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sampleEmails.map((email) => (
          <article
            key={email.id}
            className="flex flex-col border border-border bg-surface"
          >
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={email.audience === "company" ? "info" : "accent"}
                >
                  {email.audience === "company" ? "Bedrijf" : "Bureau"}
                </StatusBadge>
                <StatusBadge tone="neutral">{email.status}</StatusBadge>
              </div>
              <p className="mt-2 text-xs text-text-dim">
                Aan {email.prospectName}
              </p>
              <h2 className="mt-1 text-sm font-medium text-text">
                {email.subject}
              </h2>
            </div>
            <pre className="flex-1 whitespace-pre-wrap px-4 py-4 font-sans text-sm leading-relaxed text-text-muted">
              {email.body}
            </pre>
            <div className="border-t border-border px-4 py-3">
              <p className="text-[11px] text-text-dim">
                Incl. B2B opt-out · tracked availability-link
              </p>
              <a
                href="/beschikbaar"
                className="mt-2 inline-block font-display text-sm tracking-[0.1em] text-accent underline-offset-2 hover:underline"
              >
                Bekijk beschikbare data →
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
