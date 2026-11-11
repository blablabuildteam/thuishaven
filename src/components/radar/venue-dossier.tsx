import Link from "next/link";
import { Info } from "lucide-react";
import type { VenueParty } from "@/lib/radar/venues";
import {
  RADAR_VENUE_STATUS_NL,
  RADAR_VENUE_TIER_NL,
  type RadarVenueTier,
} from "@/lib/radar/types";

const CURATOR_SCORE_HELP =
  "Curator-score (0–100): onze handmatige inschatting hoe sterk deze club/festival early talent signaleert. Hoog = breakouts vroeg. Laag = grotere / latere namen. Geen RA-cijfer.";

type Props = {
  venue: {
    id: string;
    name: string;
    kind: string;
    status: "seed" | "suggested" | "accepted" | "rejected";
    tier: RadarVenueTier;
    city: string | null;
    country: string | null;
    raUrl: string | null;
    curatorScore: string | null;
    venueScore: string | null;
    notes: string | null;
  };
  parties: VenueParty[];
};

export function VenueDossier({ venue, parties }: Props) {
  const now = Date.now();
  const upcoming = parties.filter(
    (p) => p.startsAt && p.startsAt.getTime() >= now - 12 * 60 * 60 * 1000,
  );
  const past = parties.filter(
    (p) => !p.startsAt || p.startsAt.getTime() < now - 12 * 60 * 60 * 1000,
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/radar/venues"
          className="text-xs text-text-muted hover:text-text"
        >
          ← Venues
        </Link>
        <h1 className="mt-2 font-display text-3xl tracking-[0.04em]">
          {venue.name}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {venue.kind}
          {venue.tier ? ` · ${RADAR_VENUE_TIER_NL[venue.tier]}` : ""}
          {venue.city || venue.country
            ? ` · ${[venue.city, venue.country].filter(Boolean).join(", ")}`
            : ""}
          {" · "}
          {RADAR_VENUE_STATUS_NL[venue.status]}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
          <span className="inline-flex items-center gap-1">
            Curator-score {venue.curatorScore ?? "—"}
            <span
              title={CURATOR_SCORE_HELP}
              aria-label={CURATOR_SCORE_HELP}
              className="text-text-dim"
            >
              <Info className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </span>
          {venue.venueScore ? (
            <span title="Overlap met Radar-artiesten die hier speelden">
              · overlap {venue.venueScore}
            </span>
          ) : null}
          {venue.raUrl ? (
            <>
              <span>·</span>
              <a
                href={
                  venue.raUrl.startsWith("http")
                    ? venue.raUrl
                    : `https://${venue.raUrl}`
                }
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-text"
              >
                RA
              </a>
            </>
          ) : null}
        </p>
        {venue.notes ? (
          <p className="mt-2 text-sm text-text-dim">{venue.notes}</p>
        ) : null}
        <p className="mt-3 max-w-xl text-sm text-text-muted">
          Parties hieronder komen uit RA-line-ups die we al hebben opgehaald.
          Accepteer deze club in de startlijst om hem structureel te volgen —
          dan haalt discovery hier nieuwe namen uit.
        </p>
      </div>

      <PartySection title="Aankomend / recent" parties={upcoming} />
      <PartySection title="Eerder" parties={past} />
    </div>
  );
}

function PartySection({
  title,
  parties,
}: {
  title: string;
  parties: VenueParty[];
}) {
  if (parties.length === 0) {
    return (
      <section>
        <h2 className="mb-3 font-display text-xl tracking-[0.04em]">{title}</h2>
        <p className="border border-dashed border-border px-4 py-8 text-sm text-text-muted">
          Nog geen events in Radar voor deze venue.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 font-display text-xl tracking-[0.04em]">{title}</h2>
      <ul className="divide-y divide-border border border-border">
        {parties.map((p) => (
          <li
            key={`${p.externalEventId ?? p.eventName}-${p.startsAt?.toISOString() ?? "x"}`}
            className="px-3 py-3 sm:px-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {p.eventName ?? "Untitled event"}
              </p>
              <p className="text-xs text-text-dim">
                {p.startsAt
                  ? p.startsAt.toLocaleString("nl-NL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "datum onbekend"}
                {p.attending != null
                  ? ` · ${p.attending.toLocaleString("nl-NL")} attending`
                  : ""}
              </p>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {p.artists.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/radar/artiesten/${a.id}`}
                    className="underline hover:text-text"
                  >
                    {a.name}
                  </Link>
                  <span className="text-text-dim">
                    {a.growthScore != null ? ` ${a.growthScore}` : ""}
                    {a.homeGigCount > 0 ? " · TH" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
