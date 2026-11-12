import { DJ_FEE_AMOUNT_MAX, parseDjFeeAmount } from "@/lib/dashboard/dj-fee-ranges";
import { normalizeArtistKey } from "@/lib/editions/lineup";

/**
 * Parser for the client's "DJ Fee's betaald" Google Sheet: one tab per year,
 * header row "| Artiest | Fee | Datum | Soort Fee | Bijzonderheid | (notes)".
 * Column A only names the month on its first row and is ignored.
 */

export type SheetCellValue = string | number | boolean | null | undefined;

export type SheetFeeRow = {
  tab: string;
  /** 1-based row number as shown in Google Sheets. */
  row: number;
  /** yyyy-mm-dd */
  day: string;
  name: string;
  /** Lookup keys, e.g. "SDK (Simone de Kunovich)" → sdk, simonedekunovich. */
  keys: string[];
  isTenHour: boolean;
  /** "after" in Bijzonderheid: belongs to that day's nachtshow. */
  isAfter: boolean;
  feeAmount: number | null;
  note: string | null;
};

export type SheetSkippedRow = {
  tab: string;
  row: number;
  name: string;
  reason: string;
};

const HEADERS = {
  name: /^artiest/i,
  fee: /^fee$/i,
  date: /^datum/i,
  feeType: /^soort/i,
  remark: /^bijzonderheid/i,
} as const;

type Columns = Record<keyof typeof HEADERS, number> & { notes: number[] };

function text(value: SheetCellValue): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function columnsFromHeader(header: SheetCellValue[]): Columns {
  const find = (re: RegExp, fallback: number) => {
    const index = header.findIndex((cell) => re.test(text(cell)));
    return index >= 0 ? index : fallback;
  };
  const cols = {
    name: find(HEADERS.name, 1),
    fee: find(HEADERS.fee, 2),
    date: find(HEADERS.date, 3),
    feeType: find(HEADERS.feeType, 4),
    remark: find(HEADERS.remark, 5),
  };
  const last = Math.max(...Object.values(cols));
  // Unnamed columns after Bijzonderheid hold free-text notes ("< incl. travel").
  const notes = [last + 1, last + 2, last + 3];
  return { ...cols, notes };
}

/** Excel/Sheets serial day number → yyyy-mm-dd. */
function serialToDay(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseSheetDate(value: SheetCellValue): string | null {
  if (typeof value === "number") return serialToDay(value);
  const raw = text(value);
  if (!raw) return null;
  let m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const day = `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return Number.isNaN(Date.parse(`${day}T12:00:00Z`)) ? null : day;
  }
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

export function parseSheetFee(value: SheetCellValue): number | null | "invalid" {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return "invalid";
    const rounded = Math.round(value);
    return rounded > DJ_FEE_AMOUNT_MAX ? "invalid" : rounded;
  }
  const raw = text(value);
  if (!raw) return null;
  // "833.34" / "833,34": round instead of dropping the cents.
  const decimal = raw.replace(/[€\s]/g, "").match(/^(\d+)[.,](\d{1,2})$/);
  if (decimal) return Math.round(Number(`${decimal[1]}.${decimal[2]}`));
  return parseDjFeeAmount(raw);
}

const HOURS_RE = /\b(\d{1,2})\s*hrs?\b/gi;

export function cleanSheetArtistName(raw: string): {
  name: string;
  isTenHour: boolean;
} {
  const original = text(raw);
  const isTenHour = /\b10\s*hrs?\b/i.test(original);
  const name = original.replace(HOURS_RE, " ").replace(/\s+/g, " ").trim();
  return { name: name.slice(0, 80), isTenHour };
}

/** Keys used to match a sheet name to an RA / event-name DJ. */
export function sheetNameKeys(name: string): string[] {
  const keys = new Set<string>();
  const add = (value: string) => {
    const key = normalizeArtistKey(value);
    if (key.length >= 2) keys.add(key);
  };
  add(name.replace(/\(.*?\)/g, " "));
  add(name);
  for (const match of name.matchAll(/\(([^)]+)\)/g)) {
    if (match[1] && !/^(live|dj set|hybrid)$/i.test(match[1].trim())) add(match[1]);
  }
  return [...keys];
}

function joinNote(parts: string[]): string | null {
  const cleaned = parts
    .map((part) => part.replace(/^<\s*/, "").trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" · ").slice(0, 500) : null;
}

export function parseDjFeeSheetTab(
  tab: string,
  values: SheetCellValue[][],
): { rows: SheetFeeRow[]; skipped: SheetSkippedRow[] } {
  const rows: SheetFeeRow[] = [];
  const skipped: SheetSkippedRow[] = [];
  const headerIndex = values.findIndex((row) =>
    row.some((cell) => HEADERS.name.test(text(cell))),
  );
  if (headerIndex < 0) {
    skipped.push({ tab, row: 1, name: "", reason: "Kolom 'Artiest' niet gevonden" });
    return { rows, skipped };
  }
  const cols = columnsFromHeader(values[headerIndex]!);

  for (let i = headerIndex + 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    const rawName = text(cells[cols.name]);
    if (!rawName) continue;
    const rowNumber = i + 1;

    const { name, isTenHour } = cleanSheetArtistName(rawName);
    const keys = sheetNameKeys(name);
    if (!name || keys.length === 0) {
      skipped.push({ tab, row: rowNumber, name: rawName, reason: "Ongeldige naam" });
      continue;
    }

    const day = parseSheetDate(cells[cols.date]);
    if (!day) {
      skipped.push({
        tab,
        row: rowNumber,
        name,
        reason: text(cells[cols.date])
          ? `Datum "${text(cells[cols.date])}" niet herkend`
          : "Datum ontbreekt",
      });
      continue;
    }

    const feeType = text(cells[cols.feeType]);
    const remark = text(cells[cols.remark]);
    const notes = cols.notes.map((index) => text(cells[index]));

    // Text in the fee cell: "500 (250 pp)" → €500, "via Kasper?" → no amount.
    // Either way the text is kept as a note so nothing gets lost.
    const rawFee = text(cells[cols.fee]);
    let feeAmount = parseSheetFee(cells[cols.fee]);
    let feeText = "";
    if (feeAmount === "invalid") {
      const leading = rawFee.match(/^€?\s*(\d[\d.,]*)\s+\S/);
      const amount = leading ? parseSheetFee(leading[1]) : "invalid";
      feeAmount = amount === "invalid" ? null : amount;
      feeText = `fee: ${rawFee}`;
    }
    const note = joinNote([feeText, feeType, remark, ...notes]);
    // "geen fee betaald" / "inbegrepen in dagtarief" with an empty fee cell is
    // a real €0 (no separate fee), not a gap.
    if (feeAmount == null && /\bgeen fee\b|\binbegrepen\b/i.test(note ?? "")) {
      feeAmount = 0;
    }

    rows.push({
      tab,
      row: rowNumber,
      day,
      name,
      keys,
      isTenHour,
      isAfter: /\bafter\b|\bnacht/i.test(remark),
      feeAmount,
      note,
    });
  }

  return { rows, skipped };
}
