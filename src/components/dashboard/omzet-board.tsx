"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MessageCircleQuestionMark, Search, X } from "lucide-react";
import {
  ManualEntryField,
  manualEntryInputClass,
} from "@/components/ui/manual-entry-field";
import { SectionHeader } from "@/components/ui/section-header";
import {
  formatHorecaInput,
  isHorecaComplete,
  parseHorecaInput,
  rowHorecaCents,
  sumEnteredCents,
  type HorecaRevenueEvent,
} from "@/lib/dashboard/horeca-amounts";
import { formatDjFeeSpend } from "@/lib/dashboard/dj-fee-ranges";
import {
  costBand,
  costGap,
  describePictureGaps,
  djGap,
  formatEuroBand,
  horecaGap,
  pictureFor,
  resultBand,
  resultGap,
  revenueBand,
  revenueGap,
  sumDjFees,
  type EuroBand,
} from "@/lib/dashboard/omzet-picture";
import { displayEditionName } from "@/lib/editions/lineup";
import { formatTicketSheetDate } from "@/lib/time/amsterdam";
import { notifyOmzetChanged } from "@/components/dashboard/omzet-nav-badge";
import { cn, formatEuroFromCents } from "@/lib/utils";

const revenueCol = "bg-success-soft";
const costCol = "bg-danger-soft";
const resultCol = "bg-info-soft";
const partValue = "font-normal text-text-muted";
const editionCol =
  "sticky left-0 z-20 w-[240px] min-w-[240px] max-w-[240px] border-r border-border bg-bg";

function monthKey(day: string): string {
  return day.slice(0, 7);
}

function monthLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
}

function groupByMonth(rows: HorecaRevenueEvent[]): Array<{
  key: string;
  label: string;
  rows: HorecaRevenueEvent[];
}> {
  const map = new Map<string, HorecaRevenueEvent[]>();
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

function MissingHint({
  message,
  href,
  hrefLabel = "DJ-fees invullen",
}: {
  message: string;
  href?: string;
  hrefLabel?: string;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);

  function measure() {
    const el = anchor.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const above = rect.top > 220;
    return {
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(
        Math.max(rect.left + rect.width / 2, 168),
        window.innerWidth - 168,
      ),
      above,
    };
  }

  useEffect(() => {
    if (!open) return;
    function reposition() {
      setPlace(measure());
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    reposition();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={anchor}
        className="inline-flex shrink-0 cursor-pointer rounded-full p-0.5 text-text-dim transition duration-150 hover:bg-text/10 hover:text-text active:scale-90"
        aria-label={message}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setPlace(measure());
          setOpen(true);
        }}
      >
        <MessageCircleQuestionMark className="size-3.5" aria-hidden />
      </button>
      {open && place
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                aria-label="Sluiten"
                className="absolute inset-0"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="missing-hint-title"
                style={{ top: place.top, left: place.left }}
                className={cn(
                  "absolute z-10 w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2",
                  place.above && "-translate-y-full",
                )}
              >
                <div
                  className={cn(
                    "border border-border bg-surface p-4 text-left font-sans text-sm font-normal tracking-normal text-text normal-case shadow-lg motion-reduce:animate-none",
                    place.above ? "missing-hint-pop-above" : "missing-hint-pop-below",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      id="missing-hint-title"
                      className="font-display text-lg tracking-[0.04em]"
                    >
                      Nog niet compleet
                    </h2>
                    <button
                      type="button"
                      aria-label="Sluiten"
                      onClick={() => setOpen(false)}
                      className="text-text-dim hover:text-text"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-text-muted">
                    {message}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {href ? (
                      <Link
                        href={href}
                        className="border border-border bg-text px-3 py-2 text-sm text-bg hover:opacity-90"
                      >
                        {hrefLabel}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="border border-border px-3 py-2 text-sm hover:border-text"
                    >
                      Sluiten
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function djFeesHref(editionId?: string): string {
  return editionId ? `/dashboard/dj-fees?edition=${editionId}` : "/dashboard/dj-fees";
}

function needsDjFees(event: HorecaRevenueEvent): boolean {
  const dj = event.djFees;
  return !dj || dj.priced === 0 || dj.missing > 0;
}

function euroOrDash(cents: number | null): string {
  return cents == null ? "—" : formatEuroFromCents(cents);
}

function DjFeeValue({
  spend,
  href,
  message,
}: {
  spend: HorecaRevenueEvent["djFees"];
  href?: string;
  message?: string | null;
}) {
  const hint = message ?? djGap(spend) ?? "DJ-fees nog niet ingevuld";
  if (!spend || spend.priced === 0) {
    return (
      <span className="inline-flex items-center justify-end gap-1.5 text-text-dim">
        <span>—</span>
        <MissingHint message={hint} href={href} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1.5 whitespace-nowrap",
        spend.missing > 0 && "text-text-muted",
      )}
      title={spend.missing > 0 ? undefined : "DJ-fee-bandbreedte"}
    >
      <span>{formatDjFeeSpend(spend)}</span>
      {spend.missing > 0 && (
        <MissingHint message={message ?? djGap(spend) ?? "DJ-fees missen"} href={href} />
      )}
    </span>
  );
}

function BandValue({
  band,
  open,
  title,
  missing,
  href,
  emphasis,
}: {
  band: EuroBand | null;
  open: "atLeast" | "atMost";
  title: string;
  missing?: string | null;
  href?: string;
  emphasis?: boolean;
}) {
  if (!band) return <span className="text-text-dim">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1.5 whitespace-nowrap",
        band.incomplete && !emphasis && "text-text-muted",
        emphasis ? "font-semibold text-text" : !band.incomplete && "font-medium",
      )}
      title={band.incomplete ? undefined : title}
    >
      <span>{formatEuroBand(band, open)}</span>
      {band.incomplete && missing ? (
        <MissingHint message={missing} href={href} />
      ) : null}
    </span>
  );
}

function AmountCell({
  editionId,
  editionName,
  field,
  label,
  value,
  onSaved,
}: {
  editionId: string;
  editionName: string;
  field: "barCents" | "kitchenCents";
  label: string;
  value: number | null;
  onSaved: (cents: number | null) => void;
}) {
  const committed = useRef(value);
  const focused = useRef(false);
  const [draft, setDraft] = useState(formatHorecaInput(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (focused.current) return;
    committed.current = value;
    setDraft(formatHorecaInput(value));
  }, [value]);

  async function save() {
    const parsed = parseHorecaInput(draft);
    if (parsed === "invalid") {
      setError("Ongeldig bedrag");
      setDraft(formatHorecaInput(committed.current));
      return;
    }
    if (parsed === committed.current) {
      setDraft(formatHorecaInput(parsed));
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/editions/${editionId}/omzet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: parsed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        barCents?: number | null;
        kitchenCents?: number | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        setDraft(formatHorecaInput(committed.current));
        return;
      }
      const next = data[field] === undefined ? parsed : data[field];
      committed.current = next;
      setDraft(formatHorecaInput(next));
      onSaved(next);
      notifyOmzetChanged();
    } catch {
      setError("Opslaan mislukt");
      setDraft(formatHorecaInput(committed.current));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ManualEntryField
      label={`${label} ${editionName}, exclusief btw, zelf invullen`}
      filled={draft !== ""}
      error={error != null}
      saving={saving}
      prefix="€"
      width="w-[6.75rem]"
    >
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder="0,00"
        disabled={saving}
        autoComplete="off"
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          setDraft(event.target.value.replace(/[^\d.,]/g, ""));
          setError(null);
        }}
        onBlur={() => {
          focused.current = false;
          void save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(formatHorecaInput(committed.current));
            setError(null);
            event.currentTarget.blur();
          }
        }}
        aria-invalid={error != null}
        title={error ?? `${label} exclusief btw — zelf invullen`}
        className={cn(manualEntryInputClass, error && "text-danger")}
      />
    </ManualEntryField>
  );
}

function totalsFor(rows: HorecaRevenueEvent[]) {
  const bar = sumEnteredCents(rows.map((row) => row.barCents));
  const kitchen = sumEnteredCents(rows.map((row) => row.kitchenCents));
  const horeca = sumEnteredCents([bar, kitchen]);
  const tickets = sumEnteredCents(rows.map((row) => row.ticketExclCents));
  const ads = sumEnteredCents(rows.map((row) => row.adsCents));
  const dj = sumDjFees(rows.map((row) => row.djFees));
  return { bar, kitchen, horeca, tickets, ads, dj };
}

function OmzetTable({
  rows,
  onChange,
}: {
  rows: HorecaRevenueEvent[];
  onChange: (
    id: string,
    field: "barCents" | "kitchenCents",
    cents: number | null,
  ) => void;
}) {
  const months = groupByMonth(rows);
  const totals = totalsFor(rows);
  const picture = pictureFor(rows);
  const gaps = describePictureGaps(rows);
  const djHref = rows.some(needsDjFees) ? djFeesHref() : undefined;

  return (
    <div className="max-w-full overflow-x-auto border border-border">
      <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-left text-sm">
        <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
          <tr>
            <th className={cn("px-4 py-3 font-medium", editionCol)}>Editie</th>
            <th className="px-4 py-3 font-medium">Datum</th>
            <th className={cn("border-l border-border px-2 py-3 text-right font-medium", revenueCol)}>
              Bar
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                ex btw
              </span>
            </th>
            <th className={cn("px-2 py-3 text-right font-medium", revenueCol)}>
              Keuken
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                ex btw
              </span>
            </th>
            <th className={cn("border-l border-border px-4 py-3 text-right font-medium", revenueCol)}>
              Horeca
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                bar + keuken
              </span>
            </th>
            <th className={cn("border-l border-border px-4 py-3 text-right font-medium", revenueCol)}>
              Tickets
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                excl. btw
              </span>
            </th>
            <th className={cn("border-l border-border px-4 py-3 text-right font-medium", revenueCol)}>
              Omzet
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                tickets + horeca
              </span>
            </th>
            <th className={cn("border-l border-border px-3 py-3 text-right font-medium", costCol)}>
              DJ-fees
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                bandbreedte
              </span>
            </th>
            <th className={cn("border-l border-border px-3 py-3 text-right font-medium", costCol)}>
              Ads
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                betaald
              </span>
            </th>
            <th className={cn("border-l border-border px-4 py-3 text-right font-medium", costCol)}>
              Kosten
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                DJ + ads
              </span>
            </th>
            <th className={cn("border-l border-border px-4 py-3 text-right font-medium", resultCol)}>
              Resultaat
              <span className="mt-0.5 block font-normal tracking-normal text-text-dim normal-case">
                omzet − kosten
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => {
            const monthTotals = totalsFor(month.rows);
            return (
              <MonthRows
                key={month.key}
                month={month}
                totals={monthTotals}
                onChange={onChange}
              />
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="border-t border-border">
            <tr>
              <td className={cn("px-4 py-3 font-medium", editionCol)}>
                Totaal
              </td>
              <td className="px-4 py-3" />
              <td className={cn("border-l border-border px-2 py-3 text-right font-mono font-medium", revenueCol)}>
                {euroOrDash(totals.bar)}
              </td>
              <td className={cn("px-2 py-3 text-right font-mono font-medium", revenueCol)}>
                {euroOrDash(totals.kitchen)}
              </td>
              <td className={cn("border-l border-border px-4 py-3 text-right font-mono font-medium", revenueCol)}>
                {euroOrDash(totals.horeca)}
              </td>
              <td className={cn("border-l border-border px-4 py-3 text-right font-mono", revenueCol, partValue)}>
                {euroOrDash(totals.tickets)}
              </td>
              <td className={cn("border-l border-border px-4 py-3 text-right font-mono", revenueCol)}>
                <BandValue
                  band={picture.revenue}
                  open="atLeast"
                  title="Tickets exclusief btw plus horeca"
                  missing={gaps.revenue}
                  emphasis
                />
              </td>
              <td className={cn("border-l border-border px-3 py-3 text-right font-mono", costCol)}>
                <DjFeeValue spend={totals.dj} href={djHref} message={gaps.costs} />
              </td>
              <td className={cn("border-l border-border px-3 py-3 text-right font-mono", costCol, partValue)}>
                {euroOrDash(totals.ads)}
              </td>
              <td className={cn("border-l border-border px-4 py-3 text-right font-mono", costCol)}>
                <BandValue
                  band={picture.costs}
                  open="atLeast"
                  title="DJ-fees plus betaalde ads"
                  missing={gaps.costs}
                  href={djHref}
                  emphasis
                />
              </td>
              <td className={cn("border-l border-border px-4 py-3 text-right font-mono", resultCol)}>
                <BandValue
                  band={picture.result}
                  open="atMost"
                  title="Omzet minus kosten"
                  missing={gaps.result}
                  href={djHref}
                />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MonthRows({
  month,
  totals,
  onChange,
}: {
  month: { key: string; label: string; rows: HorecaRevenueEvent[] };
  totals: {
    bar: number | null;
    kitchen: number | null;
    horeca: number | null;
    tickets: number | null;
    ads: number | null;
    dj: HorecaRevenueEvent["djFees"];
  };
  onChange: (
    id: string,
    field: "barCents" | "kitchenCents",
    cents: number | null,
  ) => void;
}) {
  const picture = pictureFor(month.rows);
  const gaps = describePictureGaps(month.rows);
  const monthDjHref = month.rows.some(needsDjFees)
    ? `/dashboard/dj-fees?month=${month.key}`
    : undefined;
  return (
    <>
      <tr className="border-b border-border bg-surface/60">
        <td
          colSpan={10}
          className="px-4 py-2 text-xs font-medium text-text-muted capitalize"
        >
          {month.label}
        </td>
      </tr>
      {month.rows.map((row) => {
        const name = displayEditionName(row.name);
        const horeca = rowHorecaCents(row.barCents, row.kitchenCents);
        const horecaMissing = horecaGap(row);
        const revenue = revenueBand(row);
        const costs = costBand(row);
        const djHref = needsDjFees(row) ? djFeesHref(row.id) : undefined;
        return (
          <tr key={row.id} className="border-b border-border/70 last:border-0">
            <td className={cn("truncate px-4 py-3", editionCol)}>
              <Link
                href={`/dashboard/tickets/${row.id}`}
                className="hover:underline"
                title={row.name}
              >
                {name}
              </Link>
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-text-muted">
              {formatTicketSheetDate(row.day)}
            </td>
            <td className={cn("border-l border-border px-2 py-2 text-right", revenueCol)}>
              <AmountCell
                editionId={row.id}
                editionName={name}
                field="barCents"
                label="Bar"
                value={row.barCents}
                onSaved={(cents) => onChange(row.id, "barCents", cents)}
              />
            </td>
            <td className={cn("px-2 py-2 text-right", revenueCol)}>
              <AmountCell
                editionId={row.id}
                editionName={name}
                field="kitchenCents"
                label="Keuken"
                value={row.kitchenCents}
                onSaved={(cents) => onChange(row.id, "kitchenCents", cents)}
              />
            </td>
            <td
              className={cn(
                "border-l border-border px-4 py-3 text-right font-mono",
                revenueCol,
                horeca.complete ? "font-medium" : "text-text-muted",
              )}
              title={
                horeca.cents == null
                  ? (horecaMissing ?? "Bar + keuken, exclusief btw")
                  : horeca.complete
                    ? "Bar + keuken, exclusief btw"
                    : undefined
              }
            >
              {horeca.cents == null ? (
                "—"
              ) : (
                <span className="inline-flex items-center justify-end gap-1.5">
                  <span>{formatEuroFromCents(horeca.cents)}</span>
                  {!horeca.complete && horecaMissing ? (
                    <MissingHint message={horecaMissing} />
                  ) : null}
                </span>
              )}
            </td>
            <td
              className={cn(
                "border-l border-border px-4 py-3 text-right font-mono whitespace-nowrap",
                revenueCol,
                partValue,
              )}
              title="Weeztix-ticketomzet exclusief 9% btw"
            >
              {euroOrDash(row.ticketExclCents)}
            </td>
            <td className={cn("border-l border-border px-4 py-3 text-right font-mono", revenueCol)}>
              <BandValue
                band={revenue}
                open="atLeast"
                title="Tickets exclusief btw plus horeca"
                missing={revenueGap(row)}
                emphasis
              />
            </td>
            <td className={cn("border-l border-border px-3 py-3 text-right font-mono", costCol)}>
              <DjFeeValue spend={row.djFees} href={djHref} />
            </td>
            <td
              className={cn(
                "border-l border-border px-3 py-3 text-right font-mono whitespace-nowrap",
                costCol,
                partValue,
              )}
              title="Meta- en TikTok-spend gekoppeld aan dit event"
            >
              {euroOrDash(row.adsCents)}
            </td>
            <td className={cn("border-l border-border px-4 py-3 text-right font-mono", costCol)}>
              <BandValue
                band={costs}
                open="atLeast"
                title="DJ-fees plus betaalde ads"
                missing={costGap(row)}
                href={djHref}
                emphasis
              />
            </td>
            <td className={cn("border-l border-border px-4 py-3 text-right font-mono", resultCol)}>
              <BandValue
                band={resultBand(revenue, costs)}
                open="atMost"
                title="Omzet minus kosten. Bij een DJ-range is dit zelf een range."
                missing={resultGap(row)}
                href={djHref}
              />
            </td>
          </tr>
        );
      })}
      <tr className="border-b border-border bg-bg">
        <td className={cn("px-4 py-2 text-xs text-text-dim", editionCol)}>
          Maandtotaal
        </td>
        <td className="px-4 py-2" />
        <td className={cn("border-l border-border px-2 py-2 text-right font-mono text-xs", revenueCol)}>
          {euroOrDash(totals.bar)}
        </td>
        <td className={cn("px-2 py-2 text-right font-mono text-xs", revenueCol)}>
          {euroOrDash(totals.kitchen)}
        </td>
        <td className={cn("border-l border-border px-4 py-2 text-right font-mono text-xs font-medium", revenueCol)}>
          {euroOrDash(totals.horeca)}
        </td>
        <td className={cn("border-l border-border px-4 py-2 text-right font-mono text-xs", revenueCol, partValue)}>
          {euroOrDash(totals.tickets)}
        </td>
        <td className={cn("border-l border-border px-4 py-2 text-right font-mono text-xs", revenueCol)}>
          <BandValue
            band={picture.revenue}
            open="atLeast"
            title="Tickets exclusief btw plus horeca"
            missing={gaps.revenue}
            emphasis
          />
        </td>
        <td className={cn("border-l border-border px-3 py-2 text-right font-mono text-xs", costCol)}>
          <DjFeeValue spend={totals.dj} href={monthDjHref} message={gaps.costs} />
        </td>
        <td className={cn("border-l border-border px-3 py-2 text-right font-mono text-xs", costCol, partValue)}>
          {euroOrDash(totals.ads)}
        </td>
        <td className={cn("border-l border-border px-4 py-2 text-right font-mono text-xs", costCol)}>
          <BandValue
            band={picture.costs}
            open="atLeast"
            title="DJ-fees plus betaalde ads"
            missing={gaps.costs}
            href={monthDjHref}
            emphasis
          />
        </td>
        <td className={cn("border-l border-border px-4 py-2 text-right font-mono text-xs", resultCol)}>
          <BandValue
            band={picture.result}
            open="atMost"
            title="Omzet minus kosten"
            missing={gaps.result}
            href={monthDjHref}
          />
        </td>
      </tr>
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
        <span className="font-display text-3xl leading-none tabular-nums">{count}</span>
        <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
          events
        </span>
      </p>
    </div>
  );
}

export function OmzetBoard({ past }: { past: HorecaRevenueEvent[] }) {
  const [rows, setRows] = useState(past);
  const [query, setQuery] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const applyState = useMemo(() => {
    return (list: HorecaRevenueEvent[]) => list.map((row) => byId.get(row.id) ?? row);
  }, [byId]);

  const filteredPast = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applyState(past).filter((row) => {
      if (onlyOpen && isHorecaComplete(row.barCents, row.kitchenCents)) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        displayEditionName(row.name).toLowerCase().includes(q)
      );
    });
  }, [past, query, onlyOpen, applyState]);

  const openCount = applyState(past).filter(
    (row) => !isHorecaComplete(row.barCents, row.kitchenCents),
  ).length;

  function onChange(
    id: string,
    field: "barCents" | "kitchenCents",
    cents: number | null,
  ) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: cents } : row)),
    );
  }

  const hasResults = filteredPast.length > 0;

  return (
    <div>
      <SectionHeader
        eyebrow="Omzet"
        title="Omzet"
        description="Omzet en kosten per event. Bar en keuken vul je zelf in, exclusief btw. Tickets komen uit Weeztix. DJ-fees en betaalde ads staan erbij, zodat omzet minus kosten zichtbaar is."
        action={
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-dim"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Zoek op eventnaam…"
              aria-label="Zoek op eventnaam"
              className="w-full border border-border bg-bg py-2.5 pr-3 pl-10 text-sm outline-none focus:border-text"
            />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {openCount === 0
            ? "Alle events hebben bar en keuken."
            : `${openCount} ${openCount === 1 ? "event mist" : "events missen"} nog bar of keuken.`}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <button
            type="button"
            role="switch"
            aria-checked={onlyOpen}
            onClick={() => setOnlyOpen((value) => !value)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              onlyOpen ? "bg-text" : "bg-border",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 size-4 rounded-full bg-bg transition-transform",
                onlyOpen && "translate-x-4",
              )}
            />
          </button>
          <span className="text-text-muted">Alleen nog in te vullen</span>
        </label>
      </div>

      {past.length === 0 ? (
        <div className="border border-border bg-surface p-5">
          <p className="text-sm text-text-muted">
            Geen edities gevonden. Sync Weeztix via Bronnen en vernieuw de pagina.
          </p>
        </div>
      ) : query.trim() && !hasResults ? (
        <div className="border border-border bg-surface px-4 py-8 text-sm text-text-muted">
          Geen events gevonden voor &ldquo;{query.trim()}&rdquo;.
        </div>
      ) : !hasResults ? (
        <div className="border border-border bg-surface px-4 py-8 text-sm text-text-muted">
          Alles is ingevuld.
        </div>
      ) : (
        <div>
          {filteredPast.length > 0 && (
            <section className="mb-8" aria-labelledby="past-omzet-heading">
              <SectionHeading
                id="past-omzet-heading"
                eyebrow="Archief"
                title="Afgelopen events"
                count={filteredPast.length}
              />
              <OmzetTable rows={filteredPast} onChange={onChange} />
            </section>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-text-dim">
        Bedragen voor tickets, bar en keuken zijn exclusief btw. Horeca = bar + keuken.
        Omzet = tickets + horeca. DJ-fees zijn de bandbreedte uit DJ-fees. Ads zijn de
        Meta- en TikTok-spend die aan het event hangt; geen ads telt als €0. Kosten =
        DJ-fees + ads. Resultaat = omzet − kosten; bij een DJ-range is dat zelf een
        range. Onvolledig betekent dat bar, keuken of DJ-fees nog missen. Leeg laten
        bij bar of keuken betekent nog niet ingevuld; 0 is een echte nul.{" "}
        <span className="text-text">
          Later kunnen hier ook{" "}
          <span className="font-medium">inkoop van eten en drinken</span> en{" "}
          <span className="font-medium">personeelskosten</span> bij. Daarmee wordt het
          resultaat een scherper beeld van wat een event oplevert.
        </span>
      </p>
    </div>
  );
}
