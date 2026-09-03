"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AddExternalEvent } from "@/components/dashboard/add-external-event";
import { displayEditionName } from "@/lib/editions/lineup";
import {
  TicketsChannelsList,
  type TicketChannelRow,
} from "@/components/dashboard/tickets-channels-table";

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

  const filteredUpcoming = useMemo(
    () => upcoming.filter((row) => matchesSearch(row, query)).map(toRow),
    [upcoming, query],
  );
  const filteredPast = useMemo(
    () => past.filter((row) => matchesSearch(row, query)).map(toRow),
    [past, query],
  );

  const hasResults = filteredUpcoming.length > 0 || filteredPast.length > 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
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
