import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listCampaignsWithLiveStats } from "@/lib/outreach/data";
import { outreachLiveSendBlockReason } from "@/lib/outreach/send-policy";
import { formatPercent } from "@/lib/utils";

export const metadata = { title: "Campagnes" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { rows, source } = await listCampaignsWithLiveStats();
  const sendBlock = outreachLiveSendBlockReason();

  return (
    <div>
      <SectionHeader
        eyebrow="Lijsten"
        title="Twee outreach-stromen"
        description="Bedrijven (jubilea via KvK, later) en partnerbureaus (open-data seintjes). Cijfers komen uit echte mails — geen demo-getallen."
        action={
          <StatusBadge tone={source === "db" ? "success" : "neutral"}>
            {source === "db" ? "Live data" : "Mock"}
          </StatusBadge>
        }
      />

      {sendBlock ? (
        <div className="mb-6 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          <p className="font-medium text-text">Nog geen live campagne-volume</p>
          <p className="mt-1">{sendBlock}</p>
          <p className="mt-1 text-xs text-text-dim">
            Testsends tellen mee bij de bureau-stroom als die naar een
            bureau-prospect horen.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {rows.map((c) => {
          const openRate =
            c.sentCount > 0 ? (c.openCount / c.sentCount) * 100 : 0;
          return (
            <article
              key={c.id}
              className="border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={c.audience === "company" ? "info" : "accent"}
                    >
                      {c.audience === "company" ? "Bedrijven" : "Bureaus"}
                    </StatusBadge>
                    <StatusBadge
                      tone={c.status === "active" ? "success" : "neutral"}
                    >
                      {c.status}
                    </StatusBadge>
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
