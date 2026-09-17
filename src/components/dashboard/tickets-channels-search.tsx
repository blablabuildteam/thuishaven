"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AddExternalEvent } from "@/components/dashboard/add-external-event";
import { displayEditionName } from "@/lib/editions/lineup";
import {
  TicketsChannelsList,
  type TicketChannelRow,
} from "@/components/dashboard/tickets-channels-table";
import { cn } from "@/lib/utils";

export type TicketChannelRowInput = Omit<TicketChannelRow, "startsAt"> & {
  startsAt: string;
};

function toRow(row: TicketChannelRowInput): TicketChannelRow {
  return { ...row, startsAt: new Date(row.startsAt) };
}

function matchesSearch(row: TicketChannelRowInput, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.name.toLowerCase().includes(q) ||
    displayEditionName(row.name).toLowerCase().includes(q)
  );
}

export function TicketsChannelsSearch({
  upcoming,
  past,
}: {
  upcoming: TicketChannelRowInput[];
  past: TicketChannelRowInput[];
}) {
  const [query, setQuery] = useState("");
  const [showExternal, setShowExternal] = useState(false);

  const hasExternalEvents =
    upcoming.some((row) => row.isExternal) ||
    past.some((row) => row.isExternal);

  const filteredUpcoming = useMemo(() => {
    return upcoming
      .filter((row) => matchesSearch(row, query))
      .filter((row) => showExternal || !row.isExternal)
      .map(toRow);
  }, [upcoming, query, showExternal]);

  const filteredPast = useMemo(() => {
    return past
      .filter((row) => matchesSearch(row, query))
      .filter((row) => showExternal || !row.isExternal)
      .map(toRow);
  }, [past, query, showExternal]);

  const hasResults = filteredUpcoming.length > 0 || filteredPast.length > 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-dim"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op eventnaam…"
              aria-label="Zoek op eventnaam"
              className="w-full border border-border bg-bg py-2.5 pr-3 pl-10 text-sm outline-none focus:border-text"
            />
          </div>
          {hasExternalEvents && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <button
                type="button"
                role="switch"
                aria-checked={showExternal}
                onClick={() => setShowExternal((v) => !v)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  showExternal ? "bg-text" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-4 rounded-full bg-bg transition-transform",
                    showExternal && "translate-x-4",
                  )}
                />
              </button>
              <span className="text-text-muted">Toon externe events</span>
            </label>
          )}
        </div>
        <AddExternalEvent />
      </div>

      {query.trim() && !hasResults ? (
        <div className="border border-border bg-surface px-4 py-8 text-sm text-text-muted">
          Geen events gevonden voor &ldquo;{query.trim()}&rdquo;.
        </div>
      ) : (
        <TicketsChannelsList upcoming={filteredUpcoming} past={filteredPast} />
      )}
    </>
  );
}
