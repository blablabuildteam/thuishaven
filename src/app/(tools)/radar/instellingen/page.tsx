import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RadarPageHeader } from "@/components/radar/radar-page-header";

export const metadata = { title: "Instellingen · Radar" };

export default async function RadarSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/radar/artiesten");

  return (
    <div>
      <RadarPageHeader
        title="Instellingen"
        description="Groeiscore-gewichten, alert-drempels, digest-ontvangers en bronnen. Alleen admins."
      />
      <div className="space-y-4 border border-border bg-surface px-4 py-5 text-sm text-text-muted">
        <p>
          Sprint 1 legt het fundament. Spotify, Apify (Instagram/TikTok),
          SoundCloud en Resident Advisor koppelen we hier stap voor stap.
        </p>
        <ul className="list-inside list-disc space-y-1 text-text-dim">
          <li>Scoregewichten per platform (configureerbaar)</li>
          <li>Velocity-drempel vs. nieuw-op-de-radar</li>
          <li>Wekelijkse digest (maandag) naar e-mailgroep</li>
          <li>Verversingsritme om lopende kosten te sturen</li>
        </ul>
      </div>
    </div>
  );
}