import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sampleEmails } from "@/lib/mock/outreach";

export const metadata = { title: "E-mails" };

export default function EmailsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="AI-personalisatie"
        title="Gegenereerde outbound"
        description="Elke mail is uniek — geen vaste templates. Tone of voice calibreren we met jullie voorbeelden vóór automatische verzending."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {sampleEmails.map((email) => (
          <article
            key={email.id}
            className="flex flex-col rounded-sm border border-border bg-surface"
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
              <p className="mt-2 text-xs text-text-dim">Aan {email.prospectName}</p>
              <h2 className="mt-1 text-sm font-medium text-text">
                {email.subject}
              </h2>
            </div>
            <pre className="flex-1 whitespace-pre-wrap px-4 py-4 font-sans text-sm leading-relaxed text-text-muted">
              {email.body}
            </pre>
            <div className="border-t border-border px-4 py-2 text-[10px] text-text-dim">
              Incl. B2B opt-out / uitschrijflink bij verzending via Brevo
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
