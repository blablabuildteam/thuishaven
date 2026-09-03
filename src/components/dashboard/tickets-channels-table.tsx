"use client";

import { useState } from "react";
import Link from "next/link";
import { DeurverkoopCell } from "@/components/dashboard/deurverkoop-cell";
import { displayEditionName } from "@/lib/editions/lineup";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export type TicketPoolCell = {
  /** Check-ins (gebruikt). */
  used: number;
  /** Pool allotment (gereserveerd). */
  reserved: number;
  /** Issued into pool — for event total math. */
  issued: number;
} | null;

export type TicketChannelRow = {
  id: string;
  name: string;
  startsAt: Date;
  day: string;
  weeztix: number | null;
  deurverkoop: number | null;
  ra: TicketPoolCell;
  appic: TicketPoolCell;
  wingame: TicketPoolCell;
  vrienden: TicketPoolCell;
  scanned: number | null;
  /** Handmatig extern event — alleen Totaal gevuld. */
  isExternal?: boolean;
  externalAttendees?: number | null;
};

function channelIssued(value: number | TicketPoolCell | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.issued;
}

export function totalTicketsSold(row: TicketChannelRow): number | null {
  if (row.isExternal) {
    return row.externalAttendees ?? null;
  }
  const parts = [
    row.weeztix,
    row.deurverkoop,
    channelIssued(row.ra),
    channelIssued(row.appic),
    channelIssued(row.wingame),
    channelIssued(row.vrienden),
  ];
  if (parts.every((n) => n == null)) return null;
  return parts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

const CHANNELS = [
  { key: "weeztix", label: "Weeztix", pending: false, pool: false },
  { key: "deurverkoop", label: "Deurverkoop", pending: false, pool: false },
  { key: "ra", label: "RA", pending: false, pool: true },
  { key: "appic", label: "Appic", pending: false, pool: true },
  { key: "wingame", label: "Game Appic", pending: true, pool: true },
  { key: "vrienden", label: "Vriendentickets", pending: false, pool: true },
] as const;

function monthKey(day: string): string {
  return day.slice(0, 7);
}

function monthLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
}

function groupByMonth(rows: TicketChannelRow[]): Array<{
  key: string;
  label: string;
  rows: TicketChannelRow[];
}> {
  const map = new Map<string, TicketChannelRow[]>();
  for (const row of rows) {
    const key = monthKey(row.day);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, group]) => ({
    key,
    label: monthLabel(group[0]!.day),
    rows: group,
  }));
}

function ChannelCell({
  value,
  pending,
}: {
  value: number | TicketPoolCell;
  pending?: boolean;
}) {
  if (value == null) {
    return (
      <span className="text-text-dim" title={pending ? "Integratie volgt" : undefined}>
        —
      </span>
    );
  }
  if (typeof value === "object") {
    return (
      <span
        className="inline-block whitespace-nowrap tabular-nums"
        title="Gebruikt / gereserveerd"
      >
        {formatNumber(value.used)}
        <span className="text-text-dim">/{formatNumber(value.reserved)}</span>
      </span>
    );
  }
  return <>{formatNumber(value)}</>;
}

function sumChannelValue(
  value: number | TicketPoolCell | null,
): { used: number; reserved: number; issued: number } | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return { used: value, reserved: value, issued: value };
  }
  return {
    used: value.used,
    reserved: value.reserved,
    issued: value.issued,
  };
}

function sumChannel(
  rows: TicketChannelRow[],
  key: (typeof CHANNELS)[number]["key"] | "scanned" | "total",
): number | TicketPoolCell | null {
  if (key === "total") {
    const values = rows.map(totalTicketsSold);
    if (values.every((n) => n == null)) return null;
    return values.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  }
  if (key === "scanned") {
    const values = rows.map((row) => row.scanned);
    if (values.every((n) => n == null)) return null;
    return values.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  }

  const col = CHANNELS.find((c) => c.key === key);
  const values = rows.map((row) => sumChannelValue(row[key]));
  if (values.every((n) => n == null)) return null;

  if (col?.pool) {
    return {
      used: values.reduce((sum, n) => sum + (n?.used ?? 0), 0),
      reserved: values.reduce((sum, n) => sum + (n?.reserved ?? 0), 0),
      issued: values.reduce((sum, n) => sum + (n?.issued ?? 0), 0),
    };
  }

  return values.reduce((sum, n) => sum + (n?.used ?? 0), 0);
}

function visibleChannels(showDeurverkoop: boolean) {
  return showDeurverkoop
    ? CHANNELS
    : CHANNELS.filter((col) => col.key !== "deurverkoop");
}

function TicketsTable({
  rows,
  showDeurverkoop = true,
  onDeurverkoopChange,
}: {
  rows: TicketChannelRow[];
  showDeurverkoop?: boolean;
  onDeurverkoopChange?: (editionId: string, value: number | null) => void;
}) {
  const months = groupByMonth(rows);
  const columns = visibleChannels(showDeurverkoop);
  const colCount = 2 + columns.length + 2;

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Editie</th>
            <th className="px-4 py-3 font-medium">Datum</th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-3 py-3 text-right font-medium",
                  col.pool && "whitespace-nowrap",
                )}
              >
                {col.label}
                {col.key === "deurverkoop" && (
                  <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                    handmatig
                  </span>
                )}
                {col.pending && col.key !== "wingame" && (
                  <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                    binnenkort
                  </span>
                )}
              </th>
            ))}
            <th className="border-l border-border px-4 py-3 text-right font-medium">
              Totaal
            </th>
            <th className="px-4 py-3 text-right font-medium">Gescand</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <MonthBlock
              key={month.key}
              month={month}
              colCount={colCount}
              columns={columns}
              onDeurverkoopChange={onDeurverkoopChange}
            />
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot className="border-t border-border">
            <tr className="text-sm">
              <td className="px-4 py-3 font-medium" colSpan={2}>
                Totaal
              </td>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-3 py-3 text-right font-mono",
                    col.pool && "whitespace-nowrap",
                  )}
                >
                  <ChannelCell value={sumChannel(rows, col.key)} pending={col.pending} />
                </td>
              ))}
              <td className="border-l border-border px-4 py-3 text-right font-mono font-medium">
                <ChannelCell value={sumChannel(rows, "total")} />
              </td>
              <td className="px-4 py-3 text-right font-mono font-medium">
                <ChannelCell value={sumChannel(rows, "scanned")} />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MonthBlock({
  month,
  colCount,
  columns,
  onDeurverkoopChange,
}: {
  month: { key: string; label: string; rows: TicketChannelRow[] };
  colCount: number;
  columns: readonly (typeof CHANNELS)[number][];
  onDeurverkoopChange?: (editionId: string, value: number | null) => void;
}) {
  return (
    <>
      <tr className="border-b border-border bg-surface/60">
        <td
          colSpan={colCount}
          className="px-4 py-2 text-xs font-medium capitalize text-text-muted"
        >
          {month.label}
        </td>
      </tr>
      {month.rows.map((row) => {
        const total = totalTicketsSold(row);
        return (
          <tr
            key={row.id}
            className={cn(
              "border-b border-border/70 last:border-0",
              row.isExternal && "bg-surface/30",
            )}
          >
            <td className="max-w-[280px] truncate px-4 py-3">
              {row.isExternal ? (
                <Link
                  href={`/dashboard/tickets/external/${row.id}`}
                  className="flex items-center gap-2 hover:underline"
                  title={row.name}
                >
                  <span className="truncate">{row.name}</span>
                  <span className="shrink-0 text-[10px] tracking-wide text-text-dim uppercase">
                    Extern
                  </span>
                </Link>
              ) : (
                <Link
                  href={`/dashboard/tickets/${row.id}`}
                  className="hover:underline"
                  title={row.name}
                >
                  {displayEditionName(row.name)}
                </Link>
              )}
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-text-muted">
              {formatDate(row.startsAt)}
            </td>
            {columns.map((col) => (
              <td
                key={col.key}
                className={cn(
                  "px-3 py-3 text-right font-mono",
                  col.pool && "whitespace-nowrap",
                )}
              >
                {col.key === "deurverkoop" &&
                !row.isExternal &&
                onDeurverkoopChange ? (
                  <DeurverkoopCell
                    editionId={row.id}
                    editionName={displayEditionName(row.name)}
                    value={row.deurverkoop}
                    onSaved={(next) => onDeurverkoopChange(row.id, next)}
                  />
                ) : (
                  <ChannelCell value={row[col.key]} pending={col.pending} />
                )}
              </td>
            ))}
            <td className="border-l border-border px-4 py-3 text-right font-mono font-medium">
              <ChannelCell value={total} />
            </td>
            <td className="px-4 py-3 text-right font-mono">
              <ChannelCell value={row.scanned} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  count,
}: {
  id: string;
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
          {eyebrow}
        </p>
        <h2 id={id} className="font-display text-2xl tracking-[0.03em] sm:text-3xl">
          {title}
        </h2>
      </div>
      <p className="shrink-0 text-right">
        <span className="font-display text-3xl tabular-nums leading-none">
          {count}
        </span>
        <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
          events
        </span>
      </p>
    </div>
  );
}

export function TicketsChannelsList({
  upcoming,
  past,
}: {
  upcoming: TicketChannelRow[];
  past: TicketChannelRow[];
}) {
  const [overrides, setOverrides] = useState<Record<string, number | null>>(
    {},
  );

  const applyOverrides = (rows: TicketChannelRow[]): TicketChannelRow[] =>
    rows.map((row) =>
      row.isExternal || !(row.id in overrides)
        ? row
        : { ...row, deurverkoop: overrides[row.id] ?? null },
    );

  const onDeurverkoopChange = (editionId: string, value: number | null) => {
    setOverrides((prev) => ({ ...prev, [editionId]: value }));
  };

  const upcomingRows = applyOverrides(upcoming);
  const pastRows = applyOverrides(past);

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="border border-border bg-surface p-5">
        <p className="text-sm text-text-muted">
          Geen edities gevonden. Sync Weeztix via Bronnen en vernieuw de pagina.
        </p>
      </div>
    );
  }

  return (
    <div>
      {upcoming.length > 0 && (
        <section className="mb-8" aria-labelledby="upcoming-tickets-heading">
          <SectionHeading
            id="upcoming-tickets-heading"
            eyebrow="Planning"
            title="Komende events"
            count={upcoming.length}
          />
          <TicketsTable
            rows={upcomingRows}
            onDeurverkoopChange={onDeurverkoopChange}
          />
        </section>
      )}

      {past.length > 0 && (
        <section
          className={cn(upcoming.length > 0 && "mt-12 border-t-2 border-border pt-10")}
          aria-labelledby="past-tickets-heading"
        >
          <SectionHeading
            id="past-tickets-heading"
            eyebrow="Archief"
            title="Afgelopen events"
            count={past.length}
          />
          <TicketsTable
            rows={pastRows}
            onDeurverkoopChange={onDeurverkoopChange}
          />
        </section>
      )}
    </div>
  );
}
