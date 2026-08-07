import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { mailVariants } from "@/lib/mock/mail-performance";
import { PUBLIC_AVAILABILITY_URL } from "@/lib/mock/availability";
import { formatPercent } from "@/lib/utils";

export const metadata = { title: "Mailvarianten" };

export default function MailVariantsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Per doelgroep"
        title="Mailvarianten"
        description="Per groep een eigen pitch + A/B onderwerpregels. Availability-link is dynamisch — altijd de live agenda."
        action={
          <Link
            href="/beschikbaar"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
          >
            Preview live agenda →
          </Link>
        }
      />

      <div className="space-y-4">
        {mailVariants.map((variant) => (
          <article
            key={variant.id}
            className="border border-border bg-surface"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={variant.audience === "agency" ? "info" : "accent"}
                  >
                    {variant.groupLabel}
                  </StatusBadge>
                  <StatusBadge
                    tone={
                      variant.status === "active"
                        ? "success"
                        : variant.status === "testing"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {variant.status}
                  </StatusBadge>
                  {variant.includeAvailabilityLink && (
                    <StatusBadge tone="neutral">Live agenda-link</StatusBadge>
                  )}
                </div>
                <h2 className="mt-3 font-display text-2xl tracking-[0.06em]">
                  {variant.name}
                </h2>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
                <p className="mb-3 font-display text-sm tracking-[0.14em] text-text-muted">
                  Onderwerpregels A/B
                </p>
                <ul className="space-y-3">
                  {variant.subjects.map((s) => {
                    const ctr = s.sent ? (s.clicks / s.sent) * 100 : 0;
                    return (
                      <li
                        key={s.id}
                        className="border border-border bg-bg px-3 py-3"
                      >
                        <p className="text-sm text-text">{s.text}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted">
                          <span>{s.sent} sent</span>
                          <span className="text-accent">
                            CTR {formatPercent(ctr)}
                          </span>
                          <span>{s.replies} replies</span>
                          <span>{s.leads} leads</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="p-4">
                <p className="mb-3 font-display text-sm tracking-[0.14em] text-text-muted">
                  Body template
                </p>
                <pre className="whitespace-pre-wrap border border-border bg-bg p-3 font-sans text-sm leading-relaxed text-text-muted">
                  {variant.bodyTemplate.replaceAll(
                    "{{availability_link}}",
                    PUBLIC_AVAILABILITY_URL,
                  )}
                </pre>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
