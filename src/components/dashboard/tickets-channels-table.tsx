import Link from "next/link";
import { displayEditionName } from "@/lib/editions/lineup";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export type TicketChannelRow = {
  id: string;
  name: string;
  startsAt: Date;
  day: string;
  weeztix: number | null;
  deurverkoop: number | null;
  ra: number | null;
  appic: number | null;
  wingame: number | null;
  vrienden: number | null;
  scanned: number | null;
};

const CHANNELS = [
  { key: "weeztix", label: "Weeztix", pending: false },
  { key: "deurverkoop", label: "Deurverkoop", pending: false },
  { key: "ra", label: "Resident Advisor", pending: false },
  { key: "appic", label: "Appic", pending: true },
  { key: "wingame", label: "Wingame Appic", pending: true },
  { key: "vrienden", label: "Vriendentickets", pending: true },
] as const;

export function totalTicketsSold(row: TicketChannelRow): number | null {
  const parts = [
    row.weeztix,
    row.deurverkoop,
    row.ra,
    row.appic,
    row.wingame,
    row.vrienden,
  ];
  if (parts.every((n) => n == null)) return null;
  return parts.reduce((sum, n) => sum + (n ?? 0), 0);
}

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
  value: number | null;
  pending?: boolean;
}) {
  if (value == null) {
    return (
      <span className="text-text-dim" title={pending ? "Integratie volgt" : undefined}>
        —
      </span>
    );
  }
  return <>{formatNumber(value)}</>;
}

function sumChannel(
  rows: TicketChannelRow[],
  key: (typeof CHANNELS)[number]["key"] | "scanned" | "total",
): number | null {
  if (key === "total") {
    const values = rows.map(totalTicketsSold);
    if (values.every((n) => n == null)) return null;
    return values.reduce((sum, n) => sum + (n ?? 0), 0);
  }
  const values = rows.map((row) => row[key]);
  if (values.every((n) => n == null)) return null;
  return values.reduce((sum, n) => sum + (n ?? 0), 0);
}

function TicketsTable({ rows }: { rows: TicketChannelRow[] }) {
  const months = groupByMonth(rows);
  const colCount = 2 + CHANNELS.length + 2;

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Editie</th>
            <th className="px-4 py-3 font-medium">Datum</th>
            {CHANNELS.map((col) => (
              <th key={col.key} className="px-4 py-3 text-right font-medium">
                {col.label}
                {col.pending && (
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
            <MonthBlock key={month.key} month={month} colCount={colCount} />
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot className="border-t border-border">
            <tr className="text-sm">
              <td className="px-4 py-3 font-medium" colSpan={2}>
                Totaal
              </td>
              {CHANNELS.map((col) => (
                <td key={col.key} className="px-4 py-3 text-right font-mono">
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
}: {
  month: { key: string; label: string; rows: TicketChannelRow[] };
  colCount: number;
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
          <tr key={row.id} className="border-b border-border/70 last:border-0">
            <td className="max-w-[280px] truncate px-4 py-3">
              <Link
                href={`/dashboard/weeztix/${row.id}`}
                className="hover:underline"
                title={row.name}
              >
                {displayEditionName(row.name)}
              </Link>
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-text-muted">
              {formatDate(row.startsAt)}
            </td>
            {CHANNELS.map((col) => (
              <td key={col.key} className="px-4 py-3 text-right font-mono">
                <ChannelCell value={row[col.key]} pending={col.pending} />
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
          <TicketsTable rows={upcoming} />
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
          <TicketsTable rows={past} />
        </section>
      )}
    </div>
  );
}
