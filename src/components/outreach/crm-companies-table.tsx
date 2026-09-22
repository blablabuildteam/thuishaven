"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabels } from "@/lib/mock/outreach";
import { type MailAngleId, isMailableAngle, mailAngleTone } from "@/lib/outreach/mail-angle";

/** Client-safe shape — avoid importing server crm.ts (postgres) into the browser. */
type CrmRow = {
  id: string;
  companyName: string;
  status: keyof typeof statusLabels;
  email: string | null;
  city: string | null;
  kvkCity: string | null;
  apolloCity: string | null;
  inRegion: boolean;
  employeeCount: number | null;
  apolloEmployeeCount: number | null;
  linkedinEmployeeEstimate: number | null;
  kvkEmployeeCount: number | null;
  anniversaryYears: number | null;
  lastTouchAt: string | null;
  kvkHeadcountOff: boolean;
  mailCount: number;
  openCount: number;
  replyCount: number;
  incomplete: boolean;
  source?: string;
  doelgroepReason?: string;
  decisionMakerName?: string;
  decisionMakerTitle?: string;
  decisionMakerEmail?: string;
  decisionMakerLinkedin?: string;
  contacts: Array<{
    name: string;
    title?: string;
    email?: string;
    linkedinUrl?: string;
  }>;
  kvkMatchWeak?: boolean;
};

type Angle = {
  id: MailAngleId;
  label: string;
  detail: string;
  jubileeMark?: number;
  jubileeYearsAway?: number;
  also?: MailAngleId[];
};

type Row = {
  row: CrmRow;
  angle: Angle;
};

type Props = {
  rows: Row[];
};

type MailFilter =
  | "all"
  | "kans"
  | "jubileum"
  | "seizoen"
  | "funding"
  | "recordjaar"
  | "cold"
  | "onvolledig"
  | "past_niet";
type RegionFilter = "all" | "in" | "out" | "unknown";
type CompletenessFilter = "all" | "ready" | "missing_mdw" | "missing_email" | "missing_contact";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "d MMM yyyy", { locale: nl });
}

function sourceLabel(source?: string) {
  if (source === "apollo") return "Apollo";
  if (source === "paste" || source === "manual") return "Handmatig";
  if (source === "linkedin") return "LinkedIn";
  return source ?? "—";
}

function angleLabel(id: MailAngleId): string {
  if (id === "seizoen") return "Seizoen";
  if (id === "funding") return "Funding";
  if (id === "recordjaar") return "Recordjaar";
  if (id === "algemeen") return "Algemeen";
  if (id === "jubileum") return "Jubileum";
  return id;
}

function MdwCell({ row }: { row: CrmRow }) {
  const display = row.employeeCount;
  const parts: string[] = [];
  if (row.apolloEmployeeCount != null) {
    parts.push(`Apollo ~${row.apolloEmployeeCount} (concern-schatting)`);
  }
  if (row.linkedinEmployeeEstimate != null) {
    parts.push(`Handmatig/LinkedIn ~${row.linkedinEmployeeEstimate}`);
  }
  if (row.kvkEmployeeCount != null) {
    parts.push(
      `KvK ${row.kvkEmployeeCount} (vestiging${
        row.kvkHeadcountOff ? ", vaak te laag" : ""
      })`,
    );
  }
  if (parts.length === 0) {
    parts.push(
      "Nog geen betrouwbaar aantal — vul aan via Lijst bijwerken of handmatig op het dossier",
    );
  } else {
    parts.push(
      display != null
        ? `Voor fit gebruiken we: ${display}`
        : "Voor fit: nog geen bruikbaar aantal (lage KvK telt niet)",
    );
  }
  const title = parts.join("\n");

  return (
    <td className="px-4 py-3" title={title}>
      <span className="font-mono text-text">
        {display != null ? `~${display}` : "—"}
      </span>
      <p className="mt-0.5 max-w-[9rem] text-[10px] leading-snug text-text-dim">
        {row.apolloEmployeeCount != null
          ? "Apollo"
          : row.linkedinEmployeeEstimate != null
            ? "Handmatig"
            : row.kvkEmployeeCount != null
              ? row.kvkHeadcountOff
                ? "KvK onbruikbaar"
                : "KvK"
              : "Ontbreekt"}
        {row.apolloEmployeeCount != null && row.kvkEmployeeCount != null
          ? ` · KvK ${row.kvkEmployeeCount}`
          : ""}
      </p>
    </td>
  );
}

export function CrmCompaniesTable({ rows }: Props) {
  const [q, setQ] = useState("");
  const [mail, setMail] = useState<MailFilter>("kans");
  const [region, setRegion] = useState<RegionFilter>("all");
  const [completeness, setCompleteness] =
    useState<CompletenessFilter>("all");

  const counts = useMemo(() => {
    const c = {
      all: rows.length,
      kans: 0,
      jubileum: 0,
      seizoen: 0,
      funding: 0,
      recordjaar: 0,
      cold: 0,
      onvolledig: 0,
      past_niet: 0,
      missing_mdw: 0,
      missing_email: 0,
      in: 0,
      out: 0,
    };
    for (const { row, angle } of rows) {
      if (isMailableAngle(angle.id)) c.kans += 1;
      if (angle.id === "jubileum") c.jubileum += 1;
      if (angle.id === "seizoen") c.seizoen += 1;
      if (angle.id === "algemeen") c.cold += 1;
      if (angle.id === "nog_checken") c.onvolledig += 1;
      if (angle.id === "past_niet") c.past_niet += 1;
      // Selectable even when not primary
      if (
        angle.id === "funding" ||
        angle.also?.includes("funding")
      ) {
        c.funding += 1;
      }
      if (
        angle.id === "recordjaar" ||
        angle.also?.includes("recordjaar")
      ) {
        c.recordjaar += 1;
      }
      if (row.employeeCount == null) c.missing_mdw += 1;
      if (!row.email) c.missing_email += 1;
      if (row.inRegion) c.in += 1;
      else if (row.city || row.kvkCity || row.apolloCity) c.out += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(({ row, angle }) => {
      if (
        needle &&
        !row.companyName.toLowerCase().includes(needle) &&
        !(row.city ?? "").toLowerCase().includes(needle) &&
        !(row.email ?? "").toLowerCase().includes(needle)
      ) {
        return false;
      }

      switch (mail) {
        case "kans":
          if (!isMailableAngle(angle.id)) return false;
          break;
        case "jubileum":
          if (angle.id !== "jubileum") return false;
          break;
        case "seizoen":
          if (angle.id !== "seizoen" && !angle.also?.includes("seizoen")) {
            return false;
          }
          break;
        case "funding":
          if (angle.id !== "funding" && !angle.also?.includes("funding")) {
            return false;
          }
          break;
        case "recordjaar":
          if (
            angle.id !== "recordjaar" &&
            !angle.also?.includes("recordjaar")
          ) {
            return false;
          }
          break;
        case "cold":
          if (angle.id !== "algemeen") return false;
          break;
        case "onvolledig":
          if (angle.id !== "nog_checken" && !row.incomplete) return false;
          break;
        case "past_niet":
          if (angle.id !== "past_niet") return false;
          break;
        default:
          break;
      }

      switch (region) {
        case "in":
          if (!row.inRegion) return false;
          break;
        case "out":
          if (
            row.inRegion ||
            !(row.city || row.kvkCity || row.apolloCity)
          ) {
            return false;
          }
          break;
        case "unknown":
          if (row.city || row.kvkCity || row.apolloCity) return false;
          break;
        default:
          break;
      }

      switch (completeness) {
        case "ready":
          if (row.incomplete) return false;
          break;
        case "missing_mdw":
          if (row.employeeCount != null) return false;
          break;
        case "missing_email":
          if (row.email) return false;
          break;
        case "missing_contact":
          if (row.decisionMakerName) return false;
          break;
        default:
          break;
      }

      return true;
    });
  }, [rows, q, mail, region, completeness]);

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="block min-w-0">
          <span className="text-[11px] uppercase tracking-wider text-text-dim">
            Zoeken
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Bedrijfsnaam…"
            autoFocus
            className="mt-1.5 block w-full border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-dim">
            Invalshoek
          </span>
          <select
            value={mail}
            onChange={(e) => setMail(e.target.value as MailFilter)}
            className="mt-1.5 block w-full min-w-[10rem] border border-border bg-bg px-3 py-2 text-sm text-text"
          >
            <option value="kans">Klaar om te mailen ({counts.kans})</option>
            <option value="jubileum">Jubileum ({counts.jubileum})</option>
            <option value="seizoen">Seizoen ({counts.seizoen})</option>
            <option value="funding">Deal / funding ({counts.funding})</option>
            <option value="recordjaar">Recordjaar ({counts.recordjaar})</option>
            <option value="cold">Algemeen ({counts.cold})</option>
            <option value="onvolledig">Onvolledig ({counts.onvolledig})</option>
            <option value="past_niet">Past niet ({counts.past_niet})</option>
            <option value="all">Alles ({counts.all})</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-dim">
            Regio
          </span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as RegionFilter)}
            className="mt-1.5 block w-full min-w-[9rem] border border-border bg-bg px-3 py-2 text-sm text-text"
          >
            <option value="all">Alle regio’s</option>
            <option value="in">In ~50 km ({counts.in})</option>
            <option value="out">Buiten ({counts.out})</option>
            <option value="unknown">Plaats onbekend</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-dim">
            Compleet
          </span>
          <select
            value={completeness}
            onChange={(e) =>
              setCompleteness(e.target.value as CompletenessFilter)
            }
            className="mt-1.5 block w-full min-w-[10rem] border border-border bg-bg px-3 py-2 text-sm text-text"
          >
            <option value="all">Alles</option>
            <option value="ready">Compleet genoeg</option>
            <option value="missing_mdw">Geen mdw ({counts.missing_mdw})</option>
            <option value="missing_email">
              Geen e-mail ({counts.missing_email})
            </option>
            <option value="missing_contact">Geen contactpersoon</option>
          </select>
        </label>
      </div>

      <p className="mb-3 text-xs text-text-dim">
        {filtered.length} van {rows.length}
        {mail === "kans" ? " · klaar om te mailen" : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="border-y border-border py-6 text-sm text-text-muted">
          Geen bedrijven in dit filter.{" "}
          <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
            Lijst bijwerken
          </Link>{" "}
          om mdw/e-mail aan te vullen.
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto border border-border">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Bedrijf</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Mailkans</th>
                <th className="px-4 py-3 font-medium">Mdw</th>
                <th className="px-4 py-3 font-medium">Jubileum</th>
                <th className="px-4 py-3 font-medium">Mail / open / reply</th>
                <th className="px-4 py-3 font-medium">Laatst</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ row, angle }) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/outreach/crm/${row.id}`}
                      className="font-medium text-text hover:text-accent"
                    >
                      {row.companyName}
                    </Link>
                    <p className="text-xs text-text-dim">
                      {row.apolloCity && row.inRegion
                        ? row.apolloCity
                        : row.city ?? row.kvkCity ?? "plaats?"}
                      {!row.inRegion && (row.city || row.kvkCity || row.apolloCity)
                        ? " · buiten regio"
                        : ""}
                      {` · ${sourceLabel(row.source)}`}
                      {row.kvkMatchWeak ? " · KvK-match checken" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {row.contacts?.length || row.decisionMakerName ? (
                      <div className="space-y-1.5">
                        {(row.contacts?.length
                          ? row.contacts
                          : [
                              {
                                name: row.decisionMakerName!,
                                title: row.decisionMakerTitle,
                                email: row.decisionMakerEmail,
                                linkedinUrl: row.decisionMakerLinkedin,
                              },
                            ]
                        ).slice(0, 3).map((c) => (
                          <div key={`${c.name}-${c.title ?? ""}`}>
                            <p className="text-sm text-text">{c.name}</p>
                            <p className="text-xs text-text-dim">
                              {[c.title, c.email ?? "geen mail"]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-text-dim">
                        Nog geen contact — via Lijst bijwerken
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={mailAngleTone(angle.id)}>
                      {angle.label}
                    </StatusBadge>
                    {angle.also && angle.also.length > 0 ? (
                      <p className="mt-1 text-[10px] text-text-dim">
                        Ook: {angle.also.map(angleLabel).join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <MdwCell row={row} />
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {row.anniversaryYears != null
                      ? `${row.anniversaryYears} jr oud`
                      : "—"}
                    {angle.jubileeMark != null ? (
                      <p className="text-text-dim">
                        → {angle.jubileeMark} jr
                        {angle.jubileeYearsAway === 0
                          ? " dit jaar"
                          : angle.jubileeYearsAway === 1
                            ? " ≤16 mnd"
                            : ` over ${angle.jubileeYearsAway} jr`}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {row.mailCount} / {row.openCount} / {row.replyCount}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {fmt(row.lastTouchAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
