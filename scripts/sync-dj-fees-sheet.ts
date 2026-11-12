/**
 * Sync DJ fees from the client's Google Sheet (same code as the daily cron).
 *
 * Usage:
 *   npx tsx scripts/sync-dj-fees-sheet.ts            # dry run: show what would change
 *   npx tsx scripts/sync-dj-fees-sheet.ts --write    # apply
 *   npx tsx scripts/sync-dj-fees-sheet.ts --csv <dir> # read <dir>/<year>.csv instead of Google
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function main() {
  const write = process.argv.includes("--write");
  const csvIndex = process.argv.indexOf("--csv");
  const csvDir = csvIndex >= 0 ? process.argv[csvIndex + 1] : undefined;

  const { parseDjFeeSheetTabs, syncDjFeesFromSheet } = await import(
    "../src/lib/dashboard/dj-fees-sheet-sync"
  );
  const { endDb } = await import("../src/lib/db/client");

  let sheet;
  if (csvDir) {
    const values = new Map<string, string[][]>();
    for (const file of readdirSync(csvDir)) {
      const m = file.match(/^(\d{4})\.csv$/);
      if (m) values.set(m[1]!, parseCsv(readFileSync(join(csvDir, file), "utf8")));
    }
    sheet = parseDjFeeSheetTabs(values);
  }

  const result = await syncDjFeesFromSheet({ dryRun: !write, sheet });
  const { unmatched, plan, ...summary } = result;
  if (process.argv.includes("--plan") && plan) {
    for (const item of plan) console.log(`${item.action}\t${item.day}\t${item.name}\t${item.event}`);
  }
  console.log(JSON.stringify(summary, null, 2));
  if (unmatched.length > 0) {
    console.log(`\nNiet gekoppeld (${unmatched.length}):`);
    for (const row of unmatched) {
      console.log(`  ${row.tab} r${row.row}  ${row.day ?? "          "}  ${row.name.padEnd(28)}  ${row.reason}`);
    }
  }
  if (!write) console.log("\nDry run — niets opgeslagen. Gebruik --write om toe te passen.");
  await endDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
