import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";

const PLACEHOLDER_STATS = [
  { value: "—", label: "spend" },
  { value: "—", label: "impr." },
  { value: "—", label: "clicks" },
  { value: "—", label: "CTR" },
  { value: "—", label: "CPC" },
  { value: "0/0", label: "gekoppeld" },
] as const;

const PLACEHOLDER_ROWS = [
  { ad: "Campagne", event: "Event", muted: true },
  { ad: "Ad 1", event: "—", muted: false },
  { ad: "Ad 2", event: "—", muted: false },
  { ad: "Ad 3", event: "—", muted: false },
] as const;

export function PaidAdsComingSoon({
  title,
  channelLabel,
}: {
  title: string;
  channelLabel: string;
}) {
  return (
    <div className="animate-fade-up">
      <div className="pointer-events-none select-none opacity-45 grayscale">
        <SectionHeader
          eyebrow="Marketing · paid"
          title={title}
          description={`${channelLabel} volgt zodra de Google Ads-koppeling live is. Deze view vullen we daarna met spend, impressions en clicks.`}
        />

        <section className="mb-10 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-6 lg:grid-cols-6">
          {PLACEHOLDER_STATS.map((stat) => (
            <p key={stat.label} className="min-w-0">
              <span className="block break-words font-display text-2xl leading-none tabular-nums sm:text-3xl">
                {stat.value}
              </span>
              <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
                {stat.label}
              </span>
            </p>
          ))}
        </section>

        <div className="max-w-full overflow-x-auto border border-border">
          <table className="w-full min-w-[880px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[22%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead className="border-b border-border bg-surface text-[10px] tracking-[0.12em] text-text-dim uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Ad</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 text-right font-medium">Spend</th>
                <th className="px-3 py-2 text-right font-medium">Impr.</th>
                <th className="px-3 py-2 text-right font-medium">Clicks</th>
                <th className="px-3 py-2 text-right font-medium">CTR</th>
                <th className="px-3 py-2 text-right font-medium">CPC</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_ROWS.map((row) => (
                <tr
                  key={row.ad}
                  className={cn(
                    "border-t border-border",
                    row.muted ? "bg-surface" : "bg-bg",
                  )}
                >
                  <td className="px-3 py-2.5 text-text-muted">{row.ad}</td>
                  <td className="px-3 py-2.5 text-text-dim">{row.event}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-dim">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-dim">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-dim">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-dim">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-dim">
                    —
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-sm text-text-muted">
        Nog niet gekoppeld. Deze view vullen we zodra Google Ads live is.
      </p>
    </div>
  );
}
