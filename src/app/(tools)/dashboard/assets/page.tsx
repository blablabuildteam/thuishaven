import { SectionHeader } from "@/components/ui/section-header";
import { marketingPosts } from "@/lib/mock/dashboard";

export const metadata = { title: "Creatives" };

export default function AssetsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Visual recognition"
        title="Welke creatives verkopen"
        description="Assets worden geanalyseerd op kleur, compositie, tekst-overlay en format — gekoppeld aan ticketconversie rond publicatie."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {marketingPosts.map((post) => (
          <article
            key={post.id}
            className="overflow-hidden border border-border bg-surface"
          >
            <div
              className="flex h-36 items-end p-4"
              style={{
                background: `linear-gradient(135deg, ${post.visualFeatures.dominantColors[0]}55, ${post.visualFeatures.dominantColors[1] ?? "#000000"} 70%)`,
              }}
            >
              <div className="flex gap-1.5">
                {post.visualFeatures.dominantColors.map((c) => (
                  <span
                    key={c}
                    className="size-5 border border-white/20"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-text-dim">
                {post.channel} · {post.visualFeatures.format}
              </p>
              <h3 className="mt-1 text-sm font-medium text-text">{post.title}</h3>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-text-dim">Tekst-overlay</dt>
                  <dd className="mt-0.5 text-text">
                    {post.visualFeatures.hasTextOverlay ? "Ja" : "Nee"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-dim">Compositie</dt>
                  <dd className="mt-0.5 text-text">
                    {post.visualFeatures.composition}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-dim">Tickets ±48u</dt>
                  <dd className="mt-0.5 font-mono text-accent">
                    +{post.ticketsAroundPublish}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-dim">Engagement</dt>
                  <dd className="mt-0.5 font-mono text-text">
                    {post.engagement.toLocaleString("nl-NL")}
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
