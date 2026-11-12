"use client";

import { useState } from "react";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";
import { SocialChannelIcon } from "@/components/ui/social-channel-icon";
import type { RadarSettingsValue } from "@/lib/radar/settings";

export function RadarSettingsForm({
  initial,
}: {
  initial: RadarSettingsValue;
}) {
  const [settings, setSettings] = useState(initial);
  const [recipientsText, setRecipientsText] = useState(
    initial.digest.recipients.join(", "),
  );
  const [labelWatchText, setLabelWatchText] = useState(
    (initial.labelWatchlist ?? []).join(", "),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const recipients = recipientsText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const labelWatchlist = labelWatchText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
    const payload: RadarSettingsValue = {
      ...settings,
      digest: { ...settings.digest, recipients },
      labelWatchlist,
    };
    const res = await fetch("/api/radar/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    setSettings(payload);
    setMessage("Opgeslagen.");
  }

  async function runSync(extra?: Record<string, unknown>) {
    setSyncNote(null);
    setError(null);
    const res = await fetch("/api/radar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extra ?? {}),
    });
    const data = (await res.json()) as {
      error?: string;
      notes?: string[];
      discovery?: { artistsCreated?: number; venuesScanned?: number };
      spotify?: { matched?: number; attempted?: number };
      digest?: { emailed?: boolean; recipients?: string[]; error?: string };
    };
    if (!res.ok) {
      setError(data.error ?? "Sync mislukt");
      return;
    }
    setSyncNote(
      [
        `Discovery: ${data.discovery?.venuesScanned ?? 0} venues, ${data.discovery?.artistsCreated ?? 0} nieuw`,
        data.spotify
          ? `Spotify: ${data.spotify.matched}/${data.spotify.attempted} gematcht`
          : null,
        data.digest?.emailed
          ? `Digest → ${(data.digest.recipients ?? []).join(", ")}`
          : data.digest?.error
            ? `Digest: ${data.digest.error}`
            : null,
        ...(data.notes ?? []),
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <section className="border border-border bg-surface p-4">
        <h2 className="font-display text-lg tracking-[0.04em]">Handmatige sync</h2>
        <p className="mt-1 text-sm text-text-muted">
          RA + websites + IG (batch, shortlist/watching). Spotify staat standaard
          uit — Apify-token in Vercel voor social growth.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runSync()}
            className="border border-border px-3 py-2 text-sm hover:border-accent"
          >
            Pipeline nu draaien
          </button>
          <button
            type="button"
            onClick={() =>
              void runSync({
                skipDiscovery: true,
                skipSpotify: true,
                skipSocial: true,
                forceDigest: true,
              })
            }
            className="border border-border px-3 py-2 text-sm hover:border-accent"
          >
            Test-digest naar team@
          </button>
        </div>
        {syncNote ? (
          <p className="mt-2 text-sm text-text-muted">{syncNote}</p>
        ) : null}
      </section>

      <section className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <h2 className="flex flex-wrap items-center gap-2 font-display text-lg tracking-[0.04em] sm:col-span-2 lg:col-span-5">
          Scoregewichten
          <RadarInfoTip topic="totaal" withLabel />
        </h2>
        {(
          [
            ["spotify", "Spotify"],
            ["instagram", "Instagram"],
            ["tiktok", "TikTok"],
            ["soundcloud", "SoundCloud"],
            ["resident_advisor", "Resident Advisor"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-text-dim uppercase">
              <SocialChannelIcon channel={key} size={12} />
              {label}
            </span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={settings.weights[key]}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  weights: {
                    ...settings.weights,
                    [key]: Number(e.target.value),
                  },
                })
              }
              className="w-full border border-border bg-bg px-2 py-2 font-mono"
            />
          </label>
        ))}
        <label className="text-sm sm:col-span-2 lg:col-span-2">
          <span className="mb-1 flex items-center gap-1 text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Aandeel velocity (0–1)
            <RadarInfoTip topic="velocity" />
          </span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={settings.velocityShare}
            onChange={(e) =>
              setSettings({
                ...settings,
                velocityShare: Number(e.target.value),
              })
            }
            className="w-full border border-border bg-bg px-2 py-2 font-mono"
          />
        </label>
      </section>

      <section className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2">
        <h2 className="font-display text-lg tracking-[0.04em] sm:col-span-2">
          Alerts & digest
        </h2>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Velocity-drempel
          </span>
          <input
            type="number"
            value={settings.alerts.velocityThreshold}
            onChange={(e) =>
              setSettings({
                ...settings,
                alerts: {
                  ...settings.alerts,
                  velocityThreshold: Number(e.target.value),
                },
              })
            }
            className="w-full border border-border bg-bg px-2 py-2 font-mono"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Nieuw-op-radar min. score
          </span>
          <input
            type="number"
            value={settings.alerts.newOnRadarMinScore}
            onChange={(e) =>
              setSettings({
                ...settings,
                alerts: {
                  ...settings.alerts,
                  newOnRadarMinScore: Number(e.target.value),
                },
              })
            }
            className="w-full border border-border bg-bg px-2 py-2 font-mono"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Digest-ontvangers (komma-gescheiden)
          </span>
          <input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder="booker@thuishaven.nl, team@…"
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={settings.digest.enabled}
            onChange={(e) =>
              setSettings({
                ...settings,
                digest: { ...settings.digest, enabled: e.target.checked },
              })
            }
          />
          Wekelijkse e-maildigest aan (maandagochtend; zonder RADAR_LIVE_DIGEST
          alleen team@)
        </label>
      </section>

      <section className="border border-border bg-surface p-4">
        <h2 className="font-display text-lg tracking-[0.04em]">
          Label-watchlist
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          RA-labels die je volgt. Als een sterke artiest op zo’n label staat,
          krijg je een alert “Label-watch”. Voorbeelden: Innervisions, Ilian Tape,
          Dekmantel, Nous’klaer.
        </p>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Labels (komma-gescheiden)
          </span>
          <textarea
            value={labelWatchText}
            onChange={(e) => setLabelWatchText(e.target.value)}
            rows={3}
            placeholder="Innervisions, Ilian Tape, Dekmantel, …"
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
      </section>

      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {message ? <p className="text-sm text-text-muted">{message}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="border border-accent bg-accent px-4 py-2 text-sm text-accent-contrast disabled:opacity-60"
      >
        Instellingen opslaan
      </button>
    </form>
  );
}
