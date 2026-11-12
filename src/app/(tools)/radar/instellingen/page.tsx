import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RadarPageHeader } from "@/components/radar/radar-page-header";
import { RadarSettingsForm } from "@/components/radar/settings-form";
import { isApifyConfigured } from "@/lib/integrations/apify/client";
import { isSpotifyConfigured } from "@/lib/integrations/spotify/client";
import { loadRadarSettings } from "@/lib/radar/settings";

export const metadata = { title: "Instellingen · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/radar/artiesten");

  const settings = await loadRadarSettings();

  return (
    <div>
      <RadarPageHeader
        title="Instellingen"
        description="Gewichten, drempels, digest en multi-source pipeline. Venue-websites/IG configureer je per venue; Spotify/Apify via env."
      />
      <dl className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        <div className="bg-surface px-3 py-3">
          <dt className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Spotify
          </dt>
          <dd className="mt-1 text-sm">
            {isSpotifyConfigured() ? "Geconfigureerd" : "Env ontbreekt"}
          </dd>
        </div>
        <div className="bg-surface px-3 py-3">
          <dt className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Apify
          </dt>
          <dd className="mt-1 text-sm">
            {isApifyConfigured() ? "Token gezet" : "Nog niet"}
          </dd>
        </div>
        <div className="bg-surface px-3 py-3">
          <dt className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
            RA discovery
          </dt>
          <dd className="mt-1 text-sm">Publieke GraphQL</dd>
        </div>
        <div className="bg-surface px-3 py-3">
          <dt className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Digest
          </dt>
          <dd className="mt-1 text-sm">
            {settings.digest.enabled ? "Aan (mail volgt)" : "Uit"}
          </dd>
        </div>
      </dl>
      <RadarSettingsForm initial={settings} />
    </div>
  );
}
