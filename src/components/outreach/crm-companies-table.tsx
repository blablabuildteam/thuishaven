"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabels } from "@/lib/mock/outreach";
import { type MailAngleId, isMailableAngle, mailAngleTone } from "@/lib/outreach/mail-angle";
import { type LeadScore } from "@/lib/outreach/lead-score";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";

const FOLLOW_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Keeps the Mailen hand-off URL a sane length; one batch at a time. */
const MAX_HANDOFF = 50;

function templateName(key: string | null): string | null {
  if (!key) return null;
  return OUTREACH_VARIANTS.find((v) => v.id === key)?.name ?? key;
}

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
  clickCount: number;
  replyCount: number;
  lastSentAt: string | null;
  lastVariantKey: string | null;
  searchLabel: string | null;
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
  score: LeadScore;
};

type Props = {
  rows: Row[];
};

type MailFilter =
  | "all"
  | "sig_jub_now"
  | "sig_jub_soon"
  | "sig_fresh"
  | "sig_followup"
  | "sig_replied"
  | "kans"
  | "jubileum"
  | "seizoen"
  | "funding"
  | "recordjaar"
  | "cold"
  | "onvolledig"
  | "past_niet";
type SortKey = "score" | "name" | "last";

type SignalId = Extract<MailFilter, `sig_${string}`>;

function signalMatch(id: SignalId, row: CrmRow, angle: Angle): boolean {
  const mailable = isMailableAngle(angle.id);
  switch (id) {
    case "sig_jub_now":
      return angle.id === "jubileum" && angle.jubileeYearsAway === 0 && row.mailCount === 0;
    case "sig_jub_soon":
      return angle.id === "jubileum" && (angle.jubileeYearsAway ?? 0) >= 1 && row.mailCount === 0;
    case "sig_fresh":
      return mailable && Boolean(row.email) && row.mailCount === 0;
    case "sig_followup":
      return (
        row.openCount > 0 &&
        row.replyCount === 0 &&
        row.lastSentAt != null &&
        Date.now() - new Date(row.lastSentAt).getTime() >= FOLLOW_UP_AFTER_MS
      );
    case "sig_replied":
      return row.replyCount > 0 && row.status !== "lead";
  }
}

const SIGNALS: { id: SignalId; label: string; hint: string }[] = [
  { id: "sig_jub_now", label: "Jubileum dit jaar", hint: "Nog niet gemaild" },
  { id: "sig_jub_soon", label: "Jubileum binnenkort", hint: "≤16 mnd · nog niet gemaild" },
  { id: "sig_replied", label: "Gereageerd", hint: "Opvolgen — nog geen lead" },
  { id: "sig_followup", label: "Geopend, geen reply", hint: "≥3 dagen · herinnering?" },
  { id: "sig_fresh", label: "Klaar, nooit gemaild", hint: "E-mail + mailkans" },
];

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

export function CrmCompaniesTable({ rows }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [mail, setMail] = useState<MailFilter>("kans");
  const [region, setRegion] = useState<RegionFilter>("all");
  const [completeness, setCompleteness] =
    useState<CompletenessFilter>("all");
  const [sort, setSort] = useState<SortKey>("score");

  const signalCounts = useMemo(() => {
    const out = {} as Record<SignalId, number>;
    for (const s of SIGNALS) {
      out[s.id] = rows.filter(({ row, angle }) => signalMatch(s.id, row, angle)).length;
    }
    return out;
  }, [rows]);

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
    const list = rows.filter(({ row, angle }) => {
      if (
        needle &&
        !row.companyName.toLowerCase().includes(needle) &&
        !(row.city ?? "").toLowerCase().includes(needle) &&
        !(row.email ?? "").toLowerCase().includes(needle)
      ) {
        return false;
      }

      if (mail.startsWith("sig_")) {
        if (!signalMatch(mail as SignalId, row, angle)) return false;
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
    return [...list].sort((a, b) => {
      if (sort === "name") {
        return a.row.companyName.localeCompare(b.row.companyName, "nl");
      }
      if (sort === "last") {
        return (b.row.lastTouchAt ?? "").localeCompare(a.row.lastTouchAt ?? "");
      }
      return (
        b.score.score - a.score.score ||
        a.row.companyName.localeCompare(b.row.companyName, "nl")
      );
    });
  }, [rows, q, mail, region, completeness, sort]);

  const mailableIds = filtered
    .filter(
      ({ row, angle }) =>
        isMailableAngle(angle.id) && Boolean(row.email) && row.mailCount === 0,
    )
    .map(({ row }) => row.id);

  return (
    <div>
      <div className="mb-6">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-text-dim">
          Signalen · klik om te filteren
        </p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {SIGNALS.map((s) => {
            const on = mail === s.id;
            const n = signalCounts[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setMail(on ? "kans" : s.id)}
                className={`border px-3 py-2.5 text-left transition-colors ${
                  on
                    ? "border-accent bg-accent/10"
                    : n > 0
                      ? "border-border bg-surface hover:border-accent"
                      : "border-border bg-surface opacity-60"
                }`}
              >
                <p className="font-display text-2xl leading-none text-text">{n}</p>
                <p className="mt-1 text-sm text-text">{s.label}</p>
                <p className="text-[11px] text-text-dim">{s.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
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
            {mail.startsWith("sig_") ? (
              <option value={mail}>
                Signaal: {SIGNALS.find((s) => s.id === mail)?.label}
              </option>
            ) : null}
            <option value="kans">Mailkans ({counts.kans})</option>
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
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-dim">
            Sorteer
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="mt-1.5 block w-full min-w-[8rem] border border-border bg-bg px-3 py-2 text-sm text-text"
          >
            <option value="score">Leadscore</option>
            <option value="last">Laatste contact</option>
            <option value="name">Naam</option>
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-dim">
          {filtered.length} van {rows.length}
          {mail === "kans" ? " · met mailkans" : ""}
          {" · klik een rij om te openen"}
        </p>
        {mailableIds.length > 0 ? (
          <div className="text-right">
            <Link
              href={`/outreach/emails?ids=${mailableIds.slice(0, MAX_HANDOFF).join(",")}`}
              className="border border-accent px-3 py-1.5 font-display text-xs tracking-[0.1em] text-accent hover:bg-accent/10"
            >
              Mail deze {Math.min(mailableIds.length, MAX_HANDOFF)}
              {mailableIds.length > MAX_HANDOFF
                ? ` (van ${mailableIds.length})`
                : ""}{" "}
              →
            </Link>
            <p className="mt-1 text-[11px] text-text-dim">
              Alleen dit filter, met e-mail, nog nooit gemaild. Maximaal{" "}
              {MAX_HANDOFF} per keer.
            </p>
          </div>
        ) : null}
      </div>

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
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Bedrijf</th>
                <th className="px-4 py-3 font-medium">Waarom nu</th>
                <th className="px-4 py-3 font-medium">Laatste mail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ row, angle, score }) => (
                <tr
                  key={row.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/outreach/crm/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/outreach/crm/${row.id}`);
                    }
                  }}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface/80"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-text group-hover:text-accent">
                      {row.companyName}
                    </span>
                    <p className="text-xs text-text-dim">
                      {row.apolloCity && row.inRegion
                        ? row.apolloCity
                        : row.city ?? row.kvkCity ?? "plaats?"}
                      {!row.inRegion && (row.city || row.kvkCity || row.apolloCity)
                        ? " · buiten regio"
                        : ""}
                      {` · ${sourceLabel(row.source)}`}
                      {row.searchLabel ? (
                        <span className="block text-[10px]">
                          via {row.searchLabel}
                        </span>
                      ) : null}
                      {row.kvkMatchWeak ? " · KvK-match checken" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3" title={score.reasons.join("\n")}>
                    <StatusBadge tone={mailAngleTone(angle.id)}>
                      {angle.label}
                    </StatusBadge>
                    <p className="mt-1 max-w-sm text-xs text-text-muted">
                      {angle.detail}
                    </p>
                    <p className="mt-1 text-[10px] text-text-dim">
                      Score {score.score} · {score.tier}
                      {row.decisionMakerName ? ` · ${row.decisionMakerName}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {row.lastSentAt ? (
                      <>
                        {fmt(row.lastSentAt)}
                        <p className="text-text-dim">
                          {templateName(row.lastVariantKey) ?? "—"}
                          {row.mailCount > 1 ? ` · ${row.mailCount}× gemaild` : ""}
                        {row.mailCount > 0
                          ? ` · ${row.openCount} open · ${row.clickCount} klik · ${row.replyCount} reply`
                          : ""}
                        </p>
                      </>
                    ) : (
                      <span className="text-text-dim">Nog niet gemaild</span>
                    )}
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
