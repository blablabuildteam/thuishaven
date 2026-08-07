import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { campaigns } from "@/lib/mock/outreach";
import { formatPercent } from "@/lib/utils";

export const metadata = { title: "Campagnes" };

export default function CampaignsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Campagnes"
        title="Twee outreach-stromen"
        description="Zelfde technische basis, eigen targeting en triggers. Tone of voice en targetingcriteria finetunen we samen vóór live-gang."
      />

      <div className="grid gap-4">
        {campaigns.map((c) => {
          const openRate =
            c.sentCount > 0 ? (c.openCount / c.sentCount) * 100 : 0;
          return (
            <article
              key={c.id}
              className="border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      tone={c.audience === "company" ? "info" : "accent"}
                    >
                      {c.audience === "company" ? "Bedrijven" : "Bureaus"}
                    </StatusBadge>
                    <StatusBadge tone="success">{c.status}</StatusBadge>
                  </div>
                  <h2 className="mt-3 font-display text-2xl tracking-tight">
                    {c.name}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-text-muted">
                    {c.description}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Verzonden" value={String(c.sentCount)} />
                <Stat label="Open rate" value={formatPercent(openRate)} />
                <Stat label="Replies" value={String(c.replyCount)} />
                <Stat label="Leads" value={String(c.leadCount)} accent />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border bg-bg px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider text-text-dim">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl ${accent ? "text-accent" : "text-text"}`}
      >
        {value}
      </p>
    </div>
  );
}
