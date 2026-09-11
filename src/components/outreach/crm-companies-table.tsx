"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabels } from "@/lib/mock/outreach";
import { type MailAngleId } from "@/lib/outreach/mail-angle";

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
};

type Angle = {
  id: MailAngleId;
  label: string;
  detail: string;
  jubileeMark?: number;
  jubileeYearsAway?: number;
};

type Row = {
  row: CrmRow;
  angle: Angle;
};

type Props = {
  rows: Row[];
};

type MailFilter = "all" | "kans" | "jubileum" | "cold" | "onvolledig" | "past_niet";
type RegionFilter = "all" | "in" | "out" | "unknown";
type CompletenessFilter = "all" | "ready" | "missing_mdw" | "missing_email" | "missing_contact";

function angleTone(id: string) {
  if (id === "jubileum") return "accent" as const;
  if (id === "algemeen") return "success" as const;
  if (id === "past_niet" || id === "niet_mailen") return "danger" as const;
  return "neutral" as const;
}

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
    parts.push("Nog geen betrouwbaar aantal — vul aan via Lijst bijwerken of handmatig op het dossier");
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
      cold: 0,
      onvolledig: 0,
      past_niet: 0,
      missing_mdw: 0,
      missing_email: 0,
      in: 0,
      out: 0,
    };
    for (const { row, angle } of rows) {
      if (angle.id === "jubileum" || angle.id === "algemeen") c.kans += 1;
      if (angle.id === "jubileum") c.jubileum += 1;
      if (angle.id === "algemeen") c.cold += 1;
      if (angle.id === "nog_checken") c.onvolledig += 1;
      if (angle.id === "past_niet") c.past_niet += 1;
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
          if (angle.id !== "jubileum" && angle.id !== "algemeen") return false;
          break;
        case "jubileum":
          if (angle.id !== "jubileum") return false;
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

  function chip(
    active: boolean,
    onClick: () => void,
    label: string,
    count?: number,
  ) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={
          active
            ? "bg-accent px-3 py-1.5 font-display text-xs tracking-[0.08em] text-accent-contrast"
            : "border border-border bg-surface px-3 py-1.5 font-display text-xs tracking-[0.08em] text-text-muted hover:border-accent"
        }
      >
        {label}
        {count != null ? ` (${count})` : ""}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <label className="block">
          <span className="font-display text-xs tracking-[0.14em] text-text-dim">
            Zoek op bedrijfsnaam
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Typ een bedrijfsnaam…"
            autoFocus
            className="mt-1.5 block w-full border border-border bg-bg px-4 py-3 text-base text-text"
          />
        </label>
      </div>

      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-full text-[11px] uppercase tracking-wider text-text-dim sm:w-auto">
            Mailkans
          </span>
          {chip(mail === "kans", () => setMail("kans"), "Klaar om te mailen", counts.kans)}
          {chip(mail === "jubileum", () => setMail("jubileum"), "Jubileum ≤16 mnd", counts.jubileum)}
          {chip(mail === "cold", () => setMail("cold"), "Cold mail", counts.cold)}
          {chip(mail === "onvolledig", () => setMail("onvolledig"), "Onvolledig", counts.onvolledig)}
          {chip(mail === "past_niet", () => setMail("past_niet"), "Past niet", counts.past_niet)}
          {chip(mail === "all", () => setMail("all"), "Alles", counts.all)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-full text-[11px] uppercase tracking-wider text-text-dim sm:w-auto">
            Regio
          </span>
          {chip(region === "all", () => setRegion("all"), "Alle regio’s")}
          {chip(region === "in", () => setRegion("in"), "In ~50 km", counts.in)}
          {chip(region === "out", () => setRegion("out"), "Buiten", counts.out)}
          {chip(region === "unknown", () => setRegion("unknown"), "Plaats onbekend")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-full text-[11px] uppercase tracking-wider text-text-dim sm:w-auto">
            Compleet
          </span>
          {chip(completeness === "all", () => setCompleteness("all"), "Alles")}
          {chip(completeness === "ready", () => setCompleteness("ready"), "Compleet genoeg")}
          {chip(
            completeness === "missing_mdw",
            () => setCompleteness("missing_mdw"),
            "Geen mdw",
            counts.missing_mdw,
          )}
          {chip(
            completeness === "missing_email",
            () => setCompleteness("missing_email"),
            "Geen e-mail",
            counts.missing_email,
          )}
          {chip(
            completeness === "missing_contact",
            () => setCompleteness("missing_contact"),
            "Geen contactpersoon",
          )}
        </div>
      </div>

      <p className="mb-3 text-xs text-text-dim">
        {filtered.length} van {rows.length} · Hover op mdw voor Apollo/KvK-bron ·
        Jubileum = marker binnen ~16 maanden · anders cold mail bij fit
      </p>

      {filtered.length === 0 ? (
        <p className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
          Geen bedrijven in dit filter.{" "}
          <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
            Lijst bijwerken
          </Link>{" "}
          om mdw/e-mail aan te vullen.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Bedrijf</th>
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
                      {row.email ? ` · ${row.email}` : " · geen e-mail"}
                      {` · ${sourceLabel(row.source)}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={angleTone(angle.id)}>
                      {angle.label}
                    </StatusBadge>
                    <p className="mt-1 max-w-[220px] text-xs text-text-dim">
                      {angle.detail}
                    </p>
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
