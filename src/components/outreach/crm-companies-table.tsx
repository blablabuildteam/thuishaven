"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabels } from "@/lib/mock/outreach";
import {
  type MailAngleId,
  isMailableAngle,
  isReadyToMail,
  mailAngleTone,
} from "@/lib/outreach/mail-angle";
import { leadTierTone, type LeadScore } from "@/lib/outreach/lead-score";
import {
  OUTREACH_VARIANTS,
  type OutreachVariantId,
} from "@/lib/outreach/tone";

const FOLLOW_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** One Mailen batch at a time (cookie handoff, not URL length). */
const MAX_HANDOFF = 80;

const HANDOFF_VARIANT_IDS = new Set(
  OUTREACH_VARIANTS.map((v) => v.id),
);

/** Map Bedrijven-filter → default template for Mailen. */
function variantFromMailFilter(filter: string): OutreachVariantId | null {
  if (HANDOFF_VARIANT_IDS.has(filter as OutreachVariantId)) {
    return filter as OutreachVariantId;
  }
  if (filter === "cold") return "warm_tour";
  return null;
}

const COMPANY_HANDOFF_VARIANTS = OUTREACH_VARIANTS.filter(
  (v) => v.audience === "company" || v.audience === "both",
);

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
  queuedCount: number;
  draftCount: number;
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
  switch (id) {
    case "sig_jub_now":
      return angle.id === "jubileum" && angle.jubileeYearsAway === 0 && row.mailCount === 0;
    case "sig_jub_soon":
      return angle.id === "jubileum" && (angle.jubileeYearsAway ?? 0) >= 1 && row.mailCount === 0;
    case "sig_fresh":
      return isReadyToMail({
        angleId: angle.id,
        email: row.email,
        mailCount: row.mailCount,
        queuedCount: row.queuedCount,
        draftCount: row.draftCount,
      });
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
];

type RegionFilter = "all" | "in" | "out" | "unknown";
type CompletenessFilter = "all" | "ready" | "missing_mdw" | "missing_email" | "missing_contact";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "d MMM yyyy", { locale: nl });
}

/** Labels for title tooltip on incomplete rows. */
function missingDataLabels(row: CrmRow): string[] {
  const missing: string[] = [];
  if (!row.email) missing.push("e-mail");
  if (row.employeeCount == null) missing.push("mdw");
  if (!row.decisionMakerName) missing.push("contact");
  if (!(row.city || row.kvkCity || row.apolloCity)) missing.push("plaats");
  return missing;
}

export function CrmCompaniesTable({ rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  /** null = laat Mailen per bedrijf kiezen; anders één template meenemen. */
  const [handoffVariant, setHandoffVariant] = useState<
    OutreachVariantId | "auto"
  >("auto");
  const [q, setQ] = useState("");
  const [mail, setMail] = useState<MailFilter>("kans");
  const [region, setRegion] = useState<RegionFilter>("all");
  const [completeness, setCompleteness] =
    useState<CompletenessFilter>("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [moreOpen, setMoreOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

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
      incompleteWithEmail: 0,
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
      if (row.incomplete && row.email && row.mailCount === 0) {
        c.incompleteWithEmail += 1;
      }
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
        isReadyToMail({
          angleId: angle.id,
          email: row.email,
          mailCount: row.mailCount,
          queuedCount: row.queuedCount,
          draftCount: row.draftCount,
        }),
    )
    .map(({ row }) => row.id);

  const pickedMailable = mailableIds.filter((id) => picked.has(id));
  const handoffIds =
    pickedMailable.length > 0 ? pickedMailable : mailableIds;
  const handoffCount = Math.min(handoffIds.length, MAX_HANDOFF);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickVisibleMailable() {
    setPicked(new Set(mailableIds.slice(0, MAX_HANDOFF)));
  }

  async function goToMailen() {
    const ids = handoffIds.slice(0, MAX_HANDOFF);
    if (!ids.length) return;
    setHandoffError(null);
    setHandoffBusy(true);
    const variantId =
      handoffVariant === "auto"
        ? variantFromMailFilter(mail)
        : handoffVariant;
    try {
      const res = await fetch("/api/outreach/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectIds: ids,
          ...(variantId ? { variantId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok) {
        setHandoffError(data.error ?? "Handoff mislukt");
        return;
      }
      startTransition(() => {
        router.push(data.redirectTo ?? "/outreach/emails");
      });
    } finally {
      setHandoffBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SIGNALS.map((s) => {
          const on = mail === s.id;
          const n = signalCounts[s.id];
          if (n === 0 && !on) return null;
          return (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              onClick={() => setMail(on ? "kans" : s.id)}
              className={`border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-accent bg-accent/10 text-text"
                  : "border-border text-text-muted hover:border-text-dim hover:text-text"
              }`}
            >
              <span className="font-display tabular-nums tracking-wide">
                {n}
              </span>
              <span className="ml-1.5">{s.label}</span>
              {on ? (
                <span className="ml-1 text-xs text-text-dim">×</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Zoeken</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek bedrijf…"
              autoFocus
              className="block w-full border border-border bg-bg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="block">
            <span className="sr-only">Invalshoek</span>
            <select
              value={mail}
              onChange={(e) => setMail(e.target.value as MailFilter)}
              className="block w-full min-w-[11rem] border border-border bg-bg px-3 py-2 text-sm text-text"
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
              <option value="recordjaar">
                Recordjaar ({counts.recordjaar})
              </option>
              <option value="cold">Algemeen ({counts.cold})</option>
              <option value="onvolledig">
                Onvolledig ({counts.onvolledig})
              </option>
              <option value="past_niet">Past niet ({counts.past_niet})</option>
              <option value="all">Alles ({counts.all})</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className="self-start text-sm text-text-muted underline-offset-2 hover:text-text hover:underline sm:self-end sm:pb-2"
          >
            {moreOpen ? "Minder" : "Meer filters"}
          </button>
        </div>

        {handoffCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {picked.size > 0 ? (
              <button
                type="button"
                onClick={() => setPicked(new Set())}
                className="text-xs text-text-dim underline"
              >
                Wis selectie
              </button>
            ) : (
              <button
                type="button"
                onClick={pickVisibleMailable}
                className="text-xs text-text-muted underline-offset-2 hover:underline"
                title={`Vinkt max ${MAX_HANDOFF} aan met e-mail, nog nooit gemaild`}
              >
                Vink mailklare aan
              </button>
            )}
            <label className="block">
              <span className="sr-only">Invalshoek</span>
              <select
                value={handoffVariant}
                onChange={(e) =>
                  setHandoffVariant(
                    e.target.value as OutreachVariantId | "auto",
                  )
                }
                className="block min-w-[10rem] border border-border bg-bg px-3 py-2 text-sm text-text"
                title="Meenemen naar Mailen"
              >
                <option value="auto">
                  Auto
                  {variantFromMailFilter(mail)
                    ? ` → ${
                        COMPANY_HANDOFF_VARIANTS.find(
                          (v) => v.id === variantFromMailFilter(mail),
                        )?.name ?? variantFromMailFilter(mail)
                      }`
                    : " — invalshoek per bedrijf"}
                </option>
                {COMPANY_HANDOFF_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={handoffBusy || pending}
              onClick={() => void goToMailen()}
              title={
                pickedMailable.length > 0
                  ? `Jouw selectie · max ${MAX_HANDOFF}`
                  : `Alle mailklare in dit filter · max ${MAX_HANDOFF} per keer`
              }
              className="shrink-0 bg-accent px-4 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
            >
              {handoffBusy || pending
                ? "Bezig…"
                : pickedMailable.length > 0
                  ? `Mail selectie (${handoffCount}) →`
                  : `Mail ${handoffCount}${
                      mailableIds.length > MAX_HANDOFF
                        ? ` van ${mailableIds.length}`
                        : ""
                    } →`}
            </button>
          </div>
        ) : null}
      </div>
      {handoffError ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {handoffError}
        </p>
      ) : null}

      {moreOpen ? (
        <div className="mb-4 flex flex-wrap gap-3 border-b border-border pb-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-dim">
              Regio
            </span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as RegionFilter)}
              className="mt-1 block w-full min-w-[9rem] border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              <option value="all">Alle regio’s</option>
              <option value="in">In regio ({counts.in})</option>
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
              className="mt-1 block w-full min-w-[10rem] border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              <option value="all">Alles</option>
              <option value="ready">Compleet genoeg</option>
              <option value="missing_mdw">
                Geen mdw ({counts.missing_mdw})
              </option>
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
              className="mt-1 block w-full min-w-[8rem] border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              <option value="score">Leadscore</option>
              <option value="last">Laatste contact</option>
              <option value="name">Naam</option>
            </select>
          </label>
        </div>
      ) : null}

      <p className="mb-3 text-xs text-text-dim">
        {filtered.length} van {rows.length}
        {mail === "kans" ? " · mailkans" : ""}
        {picked.size > 0 ? ` · ${picked.size} aangevinkt` : ""}
        {" · vink aan om te selecteren, klik naam voor dossier"}
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
        <div className="max-w-full overflow-x-auto border-y border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-dim">
              <tr>
                <th className="w-10 py-2.5 pr-2 font-medium">
                  <span className="sr-only">Selecteer</span>
                </th>
                <th className="px-0 py-2.5 pr-4 font-medium">Bedrijf</th>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Waarom nu</th>
                <th className="px-4 py-2.5 font-medium">Laatste mail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ row, angle, score }) => {
                const on = picked.has(row.id);
                const canMail = isReadyToMail({
                  angleId: angle.id,
                  email: row.email,
                  mailCount: row.mailCount,
                  queuedCount: row.queuedCount,
                  draftCount: row.draftCount,
                });
                const topReason =
                  score.reasons[0]?.replace(/^\+\d+\s*/, "") ?? null;
                const missing = missingDataLabels(row);
                const showIncompleteBadge =
                  row.incomplete && row.mailCount === 0;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border/70 last:border-0 hover:bg-surface/60 ${
                      on ? "bg-accent/5" : ""
                    }`}
                  >
                    <td className="py-3 pr-2 align-top">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!canMail && !on}
                        title={
                          canMail
                            ? "Selecteer om te mailen"
                            : row.mailCount > 0
                              ? "Al verstuurd"
                              : row.queuedCount > 0 || row.draftCount > 0
                                ? "Staat al in de Wachtrij"
                              : !row.email
                                ? "Geen e-mail"
                                : "Geen mailkans"
                        }
                        onChange={() => togglePick(row.id)}
                        aria-label={`Selecteer ${row.companyName}`}
                      />
                    </td>
                    <td className="px-0 py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => router.push(`/outreach/crm/${row.id}`)}
                          className="text-left font-medium text-text hover:text-accent"
                        >
                          {row.companyName}
                        </button>
                        {showIncompleteBadge ? (
                          <span
                            title={
                              missing.length
                                ? `Ontbreekt: ${missing.join(" / ")}`
                                : "Gegevens ontbreken"
                            }
                            className="inline-flex border border-warn/50 bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-warn"
                          >
                            gegevens ontbreken
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-text-dim">
                        {row.apolloCity && row.inRegion
                          ? row.apolloCity
                          : row.city ?? row.kvkCity ?? "plaats?"}
                        {!row.inRegion &&
                        (row.city || row.kvkCity || row.apolloCity)
                          ? " · buiten regio"
                          : ""}
                        {row.queuedCount > 0
                          ? ` · ${row.queuedCount} in wachtrij`
                          : row.draftCount > 0
                            ? ` · ${row.draftCount} concept`
                            : ""}
                      </p>
                    </td>
                    <td
                      className="px-4 py-3"
                      title={score.reasons.join("\n")}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-display text-sm tabular-nums tracking-wide text-text">
                          {score.score}
                        </span>
                        <StatusBadge tone={leadTierTone(score.tier)}>
                          {score.tier}
                        </StatusBadge>
                      </div>
                      {topReason ? (
                        <p className="mt-1 max-w-[10rem] text-xs text-text-dim">
                          {topReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3" title={score.reasons.join("\n")}>
                      <StatusBadge tone={mailAngleTone(angle.id)}>
                        {angle.label}
                      </StatusBadge>
                      <p className="mt-1 max-w-sm text-xs text-text-muted">
                        {angle.detail}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {row.lastSentAt ? (
                        <>
                          {fmt(row.lastSentAt)}
                          {row.mailCount > 0 ? (
                            <p className="text-text-dim">
                              {row.openCount} open · {row.replyCount} reply
                            </p>
                          ) : null}
                        </>
                      ) : row.queuedCount > 0 ? (
                        <span className="text-text-dim">In wachtrij</span>
                      ) : row.draftCount > 0 ? (
                        <span className="text-text-dim">Concept</span>
                      ) : (
                        <span className="text-text-dim">Nog niet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
