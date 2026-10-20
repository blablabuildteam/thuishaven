"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { StatusBadge } from "@/components/ui/status-badge";
import { MailDrawer } from "@/components/outreach/mail-drawer";
import {
  QUEUE_STATUS_NL,
  QUEUE_STATUS_TONE,
} from "@/components/outreach/queue-mail-panel";
import { statusLabels } from "@/lib/mock/outreach";
import {
  type MailAngleId,
  isMailableAngle,
  mailAngleTone,
  suggestedVariantForAngle,
} from "@/lib/outreach/mail-angle";
import type { QueueItem } from "@/lib/outreach/queue";
import {
  DEFAULT_SENDER_PROFILE_ID,
  OUTREACH_SENDER_PROFILES,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import { leadTierTone, type LeadScore } from "@/lib/outreach/lead-score";
import {
  contactTargetTier,
  rankMailTargets,
  type EmailCheck,
  type TargetTier,
} from "@/lib/outreach/contact-ranking";
import {
  OUTREACH_VARIANTS,
  type OutreachVariantId,
} from "@/lib/outreach/tone";

const FOLLOW_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Same cap as the generate API: one contact = one mail. */
const MAX_WRITE_MAILS = 80;
const PICK_TOP = 20;
/** Small chunks: each mail = address check + AI, keep requests under the time limit. */
const WRITE_CHUNK = 6;

const HANDOFF_VARIANT_IDS = new Set(
  OUTREACH_VARIANTS.map((v) => v.id),
);

/** Map angle filter → default template when writing. */
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
  website?: string | null;
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
    emailSource?: string;
  }>;
  emailChecks?: Record<string, EmailCheck>;
  mailedEmails?: string[];
  pendingEmails?: string[];
  kvkMatchWeak?: boolean;
};

function openMailTargets(row: CrmRow) {
  return rankMailTargets({
    contacts: row.contacts,
    company: { website: row.website, companyName: row.companyName },
    companyEmail: row.email,
    checks: row.emailChecks,
    exclude: [...(row.mailedEmails ?? []), ...(row.pendingEmails ?? [])],
  }).targets;
}

function hasOpenMailTarget(row: CrmRow): boolean {
  return openMailTargets(row).length > 0;
}

const PERSON_VERDICT: Record<TargetTier, { label: string; tone: string }> = {
  0: { label: "Lijkt de juiste", tone: "text-text" },
  1: { label: "Lijkt de juiste", tone: "text-text" },
  2: { label: "Twijfelachtig", tone: "text-warn-fg" },
  3: { label: "Algemeen adres", tone: "text-warn-fg" },
  9: { label: "Niet de juiste functie", tone: "text-text-dim" },
};

type FoundPerson = {
  name: string;
  title: string | null;
  email: string | null;
  tier: TargetTier;
  label: string;
  tone: string;
};

function foundPeople(row: CrmRow): FoundPerson[] {
  const company = { website: row.website, companyName: row.companyName };
  return row.contacts
    .filter((c) => c.name?.trim())
    .map((c) => {
      const email = c.email?.trim() || null;
      const tier = email
        ? contactTargetTier(
            {
              name: c.name,
              title: c.title,
              email,
              emailSource: c.emailSource,
            },
            company,
          )
        : 9;
      const verdict = email
        ? PERSON_VERDICT[tier]
        : { label: "Geen e-mailadres", tone: "text-text-dim" };
      return {
        name: c.name,
        title: c.title?.trim() || null,
        email,
        tier,
        label: verdict.label,
        tone: verdict.tone,
      };
    });
}

function fmtEmployees(count: number | null): string {
  if (count == null) return "Onbekend";
  return new Intl.NumberFormat("nl-NL").format(count);
}

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

export type WerklijstStage =
  | "all"
  | "nog"
  | "check"
  | "gepland"
  | "verlopen"
  | "verstuurd";

type Props = {
  rows: Row[];
  queueItems?: QueueItem[];
  liveSendBlockReason?: string | null;
  testSendBlockReason?: string | null;
  defaultTestTo?: string;
  aiConfigured?: boolean;
  initialStage?: WerklijstStage;
  /** Preselect + show this company (e.g. from a dossier link). */
  initialProspectId?: string | null;
};

const STAGES: { id: WerklijstStage; label: string; hint: string }[] = [
  { id: "all", label: "Alles", hint: "Alle bedrijven in dit filter" },
  { id: "nog", label: "Nog mailen", hint: "Mailbaar contact, nog geen mail" },
  { id: "check", label: "Te checken", hint: "Mail geschreven: lezen, testen, plannen" },
  { id: "gepland", label: "Gepland", hint: "Gaat op het geplande moment" },
  { id: "verlopen", label: "Verlopen", hint: "Tijdstip voorbij, opnieuw plannen" },
  { id: "verstuurd", label: "Verstuurd", hint: "Minstens één echte mail" },
];

function rowStage(
  row: CrmRow,
  pending: QueueItem[],
  canMail: boolean,
): Exclude<WerklijstStage, "all"> | null {
  if (pending.some((i) => i.statusLabel === "verlopen")) return "verlopen";
  if (pending.some((i) => i.statusLabel === "review" || i.statusLabel === "concept")) {
    return "check";
  }
  if (pending.some((i) => i.statusLabel === "gepland")) return "gepland";
  if (row.mailCount > 0) return "verstuurd";
  if (canMail) return "nog";
  return null;
}

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
      return isMailableAngle(angle.id) && hasOpenMailTarget(row);
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

export function CrmCompaniesTable({
  rows,
  queueItems = [],
  liveSendBlockReason = null,
  testSendBlockReason = null,
  defaultTestTo = "team@blablabuild.com",
  aiConfigured = true,
  initialStage = "all",
  initialProspectId = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** "auto" = invalshoek per bedrijf; anders één template voor de hele selectie. */
  const [writeVariant, setWriteVariant] = useState<
    OutreachVariantId | "auto"
  >("auto");
  const [senderProfileId, setSenderProfileId] =
    useState<OutreachSenderProfileId>(DEFAULT_SENDER_PROFILE_ID);
  const [confirmPlan, setConfirmPlan] = useState(false);
  const [stage, setStage] = useState<WerklijstStage>(
    initialProspectId ? "all" : initialStage,
  );
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [mail, setMail] = useState<MailFilter>(
    initialProspectId || initialStage !== "all" ? "all" : "kans",
  );
  const [region, setRegion] = useState<RegionFilter>("all");
  const [completeness, setCompleteness] =
    useState<CompletenessFilter>("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [moreOpen, setMoreOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(initialProspectId ? [initialProspectId] : []),
  );
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ name: "", title: "", email: "" });
  const closeDrawer = useCallback(() => setDrawerId(null), []);

  const pendingByProspect = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    for (const item of queueItems) {
      const list = map.get(item.prospectId) ?? [];
      list.push(item);
      map.set(item.prospectId, list);
    }
    return map;
  }, [queueItems]);

  const meta = useMemo(() => {
    const map = new Map<
      string,
      {
        canMail: boolean;
        pending: QueueItem[];
        stage: Exclude<WerklijstStage, "all"> | null;
      }
    >();
    for (const { row, angle } of rows) {
      const canMail = isMailableAngle(angle.id) && hasOpenMailTarget(row);
      const pendingMails = pendingByProspect.get(row.id) ?? [];
      map.set(row.id, {
        canMail,
        pending: pendingMails,
        stage: rowStage(row, pendingMails, canMail),
      });
    }
    return map;
  }, [rows, pendingByProspect]);

  const stageCounts = useMemo(() => {
    const c: Record<WerklijstStage, number> = {
      all: rows.length,
      nog: 0,
      check: 0,
      gepland: 0,
      verlopen: 0,
      verstuurd: 0,
    };
    for (const m of meta.values()) if (m.stage) c[m.stage] += 1;
    return c;
  }, [rows.length, meta]);

  function pickStage(next: WerklijstStage) {
    setStage(next);
    if (next !== "all" && next !== "nog") setMail("all");
    setPicked(new Set());
    setConfirmPlan(false);
  }

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

      if (stage !== "all" && meta.get(row.id)?.stage !== stage) return false;

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
  }, [rows, q, mail, region, completeness, sort, stage, meta]);

  const byId = useMemo(
    () => new Map(rows.map((r) => [r.row.id, r])),
    [rows],
  );
  const pickedRows = [...picked]
    .map((id) => byId.get(id))
    .filter((r): r is Row => Boolean(r));
  const writeRows = pickedRows.filter((r) => meta.get(r.row.id)?.canMail);
  const pickedEmailIds = pickedRows.flatMap(
    (r) => meta.get(r.row.id)?.pending.map((i) => i.emailId) ?? [],
  );
  const drawerRow = drawerId ? byId.get(drawerId) : undefined;

  function togglePick(id: string) {
    setConfirmPlan(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickTopMailable() {
    setPicked(
      new Set(
        filtered
          .filter(({ row }) => meta.get(row.id)?.stage === "nog")
          .slice(0, PICK_TOP)
          .map(({ row }) => row.id),
      ),
    );
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/outreach/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (data.error as string | undefined) ?? "Actie mislukt" };
    }
    return data as Record<string, unknown>;
  }

  async function addPerson(row: CrmRow) {
    const name = addForm.name.trim();
    const email = addForm.email.trim();
    const title = addForm.title.trim();
    if (name.length < 2) {
      setError("Vul minimaal een naam in");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Dit e-mailadres klopt niet");
      return;
    }
    const existing = row.contacts
      .filter((c) => c.name.trim().length >= 2)
      .map((c) => ({
        name: c.name.trim(),
        ...(c.title?.trim() ? { title: c.title.trim() } : {}),
        ...(c.email?.trim() ? { email: c.email.trim() } : {}),
        ...(c.linkedinUrl?.trim() ? { linkedinUrl: c.linkedinUrl.trim() } : {}),
      }));
    const matched = existing.findIndex(
      (c) => c.email?.toLowerCase() === row.email?.trim().toLowerCase(),
    );
    const primaryIndex = matched >= 0 ? matched : existing.length;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/outreach/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: row.id,
          contacts: [
            ...existing,
            {
              name,
              ...(title ? { title } : {}),
              ...(email ? { email } : {}),
            },
          ],
          primaryIndex,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      setMessage(`${name} toegevoegd bij ${row.companyName}`);
      setAddingId(null);
      setAddForm({ name: "", title: "", email: "" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  function variantForRow(r: Row): OutreachVariantId {
    if (writeVariant !== "auto") return writeVariant;
    return (
      variantFromMailFilter(mail) ??
      suggestedVariantForAngle(r.angle.id) ??
      "warm_tour"
    );
  }

  async function writeMails() {
    setError(null);
    setMessage(null);
    const items = writeRows.flatMap((r) =>
      openMailTargets(r.row).map((t) => ({
        prospectId: r.row.id,
        variantId: variantForRow(r),
        recipientEmail: t.email,
        ...(t.name?.trim() ? { recipientName: t.name.trim() } : {}),
      })),
    );
    if (!items.length) {
      setError("Geen mailbare contacten in de selectie");
      return;
    }
    if (items.length > MAX_WRITE_MAILS) {
      setError(
        `Dat zijn ${items.length} mails. Kies minder bedrijven (max ${MAX_WRITE_MAILS} mails per keer).`,
      );
      return;
    }
    setBusy(true);
    let made = 0;
    let ai = 0;
    const failures: string[] = [];
    try {
      for (let i = 0; i < items.length; i += WRITE_CHUNK) {
        const chunk = items.slice(i, i + WRITE_CHUNK);
        if (items.length > WRITE_CHUNK) {
          setMessage(`Bezig met schrijven… ${i} van ${items.length} mails`);
        }
        const data = await post({ items: chunk, senderProfileId });
        if (typeof data.error === "string") {
          failures.push(data.error);
          continue;
        }
        const results = (
          data.emailId ? [data] : ((data.results ?? []) as Record<string, unknown>[])
        ) as Array<{ emailId?: string; source?: string; error?: string }>;
        for (const r of results) {
          if (r.emailId) {
            made += 1;
            if (r.source === "ai") ai += 1;
          } else if (r.error) {
            failures.push(r.error);
          }
        }
      }
    } finally {
      setBusy(false);
    }
    const reasons = [...new Set(failures)].slice(0, 2).join(" · ");
    if (!made) {
      setError(
        `Geen mails geschreven${failures.length ? ` (${failures.length} mislukt: ${reasons})` : ""}`,
      );
      return;
    }
    setMessage(
      `${made} mail${made === 1 ? "" : "s"} geschreven` +
        (ai < made ? ` · ${made - ai} met standaardtekst` : "") +
        (failures.length ? ` · ${failures.length} mislukt (${reasons})` : "") +
        ". Ze staan nu bij Te checken: klik op een bedrijf om te lezen en te testen.",
    );
    setPicked(new Set());
    setStage("check");
    setMail("all");
    startTransition(() => router.refresh());
  }

  async function bulk(
    action: "schedule-queue" | "clear-queue-schedule" | "send-test",
  ) {
    if (!pickedEmailIds.length) return;
    setError(null);
    setMessage(null);
    setConfirmPlan(false);
    setBusy(true);
    try {
      const data = await post(
        action === "send-test"
          ? { action, emailIds: pickedEmailIds.slice(0, 40), testTo: defaultTestTo }
          : { action, emailIds: pickedEmailIds },
      );
      if ("error" in data && typeof data.error === "string") {
        setError(data.error);
        return;
      }
      if (action === "schedule-queue") {
        const first =
          typeof data.firstAt === "string"
            ? new Date(data.firstAt).toLocaleString("nl-NL", {
                timeZone: "Europe/Amsterdam",
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : null;
        setMessage(
          `${data.scheduled} mail${data.scheduled === 1 ? "" : "s"} gespreid ingepland${first ? `, vanaf ${first}` : ""}`,
        );
      } else if (action === "clear-queue-schedule") {
        setMessage(`Planning geannuleerd voor ${data.cleared} mails`);
      } else {
        const n = typeof data.ok === "number" ? data.ok : 1;
        setMessage(
          `${n} testmail${n === 1 ? "" : "s"} naar ${defaultTestTo}` +
            (data.failed ? ` · ${data.failed} mislukt` : ""),
        );
      }
      setPicked(new Set());
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <nav
        aria-label="Mailstatus"
        data-tour="crm-stages"
        className="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-border pb-3 text-sm"
      >
        {STAGES.map((st) => {
          const n = stageCounts[st.id];
          if (st.id === "verlopen" && n === 0 && stage !== "verlopen") return null;
          const on = stage === st.id;
          return (
            <button
              key={st.id}
              type="button"
              title={st.hint}
              onClick={() => pickStage(st.id)}
              className={`border-b-2 pb-1 ${
                on
                  ? "border-accent text-text"
                  : "border-transparent text-text-muted hover:text-text"
              }`}
            >
              <span className="font-display tabular-nums tracking-wide">{n}</span>
              <span className="ml-1.5">{st.label}</span>
            </button>
          );
        })}
      </nav>

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
              {(
                [
                  "jubileum",
                  "seizoen",
                  "funding",
                  "recordjaar",
                  "cold",
                ] as MailFilter[]
              ).includes(mail) ? (
                <option value={mail}>
                  {mail === "jubileum"
                    ? `Jubileum (${counts.jubileum})`
                    : mail === "seizoen"
                      ? `Seizoen (${counts.seizoen})`
                      : mail === "funding"
                        ? `Deal / funding (${counts.funding})`
                        : mail === "recordjaar"
                          ? `Recordjaar (${counts.recordjaar})`
                          : `Algemeen (${counts.cold})`}
                </option>
              ) : null}
              <option value="kans">Mailkans ({counts.kans})</option>
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

      </div>

      {picked.size > 0 ? (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 border border-border bg-bg px-3 py-2 text-sm">
          <span className="text-text-dim">{picked.size} aangevinkt</span>
          <button
            type="button"
            onClick={() => {
              setPicked(new Set());
              setConfirmPlan(false);
            }}
            className="text-xs text-text-dim underline"
          >
            Wis
          </button>
          {writeRows.length > 0 ? (
            <span className="flex flex-wrap items-center gap-2 border-l border-border pl-2">
              <label className="block">
                <span className="sr-only">Invalshoek</span>
                <select
                  value={writeVariant}
                  onChange={(e) =>
                    setWriteVariant(e.target.value as OutreachVariantId | "auto")
                  }
                  className="block min-w-[10rem] border border-border bg-bg px-2 py-1 text-xs text-text"
                  title="Welke invalshoek de mails krijgen"
                >
                  <option value="auto">
                    Invalshoek:{" "}
                    {variantFromMailFilter(mail)
                      ? (COMPANY_HANDOFF_VARIANTS.find(
                          (v) => v.id === variantFromMailFilter(mail),
                        )?.name ?? variantFromMailFilter(mail))
                      : "per bedrijf"}
                  </option>
                  {COMPANY_HANDOFF_VARIANTS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Afzender</span>
                <select
                  value={senderProfileId}
                  onChange={(e) =>
                    setSenderProfileId(e.target.value as OutreachSenderProfileId)
                  }
                  className="block border border-border bg-bg px-2 py-1 text-xs text-text"
                  title="Namens wie de mail gaat"
                >
                  {OUTREACH_SENDER_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || pending}
                onClick={() => void writeMails()}
                className="bg-accent px-3 py-1 font-display text-xs tracking-[0.1em] text-accent-contrast disabled:opacity-50"
                title="Per contact een persoonlijke mail laten schrijven (max 3 per bedrijf)"
              >
                {busy ? "Bezig…" : `Schrijf mails (${writeRows.length})`}
              </button>
            </span>
          ) : null}
          {pickedEmailIds.length > 0 ? (
            <span className="flex flex-wrap items-center gap-2 border-l border-border pl-2">
              <button
                type="button"
                disabled={busy || pending || Boolean(testSendBlockReason)}
                onClick={() => void bulk("send-test")}
                className="border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
                title={testSendBlockReason ?? `Als test naar ${defaultTestTo}`}
              >
                Stuur test
              </button>
              {confirmPlan ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-text">
                    {pickedEmailIds.length} mail
                    {pickedEmailIds.length === 1 ? "" : "s"} gespreid inplannen
                    op de vaste verzenddagen?
                  </span>
                  <button
                    type="button"
                    disabled={busy || pending}
                    onClick={() => void bulk("schedule-queue")}
                    className="bg-accent px-2 py-1 text-accent-contrast disabled:opacity-50"
                  >
                    Ja, plan in
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPlan(false)}
                    className="underline"
                  >
                    Nee
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy || pending}
                  onClick={() => setConfirmPlan(true)}
                  className="border border-accent px-2 py-1 text-xs text-text disabled:opacity-50"
                >
                  Plan in ({pickedEmailIds.length})
                </button>
              )}
              <button
                type="button"
                disabled={busy || pending}
                onClick={() => void bulk("clear-queue-schedule")}
                className="text-xs underline"
              >
                Planning annuleren
              </button>
            </span>
          ) : null}
        </div>
      ) : stageCounts.nog > 0 && (stage === "all" || stage === "nog") ? (
        <button
          type="button"
          onClick={pickTopMailable}
          className="mb-4 text-xs text-text-muted underline-offset-2 hover:underline"
          title="Vinkt de bedrijven met de hoogste score aan die nog geen mail hebben"
        >
          Vink top {PICK_TOP} nog te mailen aan
        </button>
      ) : null}
      {error ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-3 text-sm text-text-muted" role="status">
          {message}
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
        {" · vink aan om mails te schrijven of in te plannen, klik de naam voor het dossier"}
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
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-dim">
              <tr>
                <th className="w-10 py-2.5 pr-2 font-medium">
                  <span className="sr-only">Selecteer</span>
                </th>
                <th className="px-0 py-2.5 pr-4 font-medium">Bedrijf</th>
                <th className="px-4 py-2.5 font-medium">Grootte</th>
                <th className="px-4 py-2.5 font-medium">Personen</th>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Waarom nu</th>
                <th className="px-4 py-2.5 font-medium">Mail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ row, angle, score }) => {
                const on = picked.has(row.id);
                const rowMeta = meta.get(row.id);
                const canMail = rowMeta?.canMail ?? false;
                const pendingMails = rowMeta?.pending ?? [];
                const headMail =
                  pendingMails.find((i) => i.statusLabel === "verlopen") ??
                  pendingMails.find(
                    (i) => i.statusLabel === "review" || i.statusLabel === "concept",
                  ) ??
                  pendingMails[0];
                const topReason =
                  score.reasons[0]?.replace(/^\+\d+\s*/, "") ?? null;
                const missing = missingDataLabels(row);
                const showIncompleteBadge =
                  row.incomplete && row.mailCount === 0;
                const people = foundPeople(row);
                const shownPeople = people.slice(0, 3);
                const hasRightPerson = people.some(
                  (p) => p.tier === 0 || p.tier === 1,
                );
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
                        disabled={!canMail && pendingMails.length === 0 && !on}
                        title={
                          pendingMails.length > 0
                            ? "Selecteer om te testen of in te plannen"
                            : canMail
                              ? "Selecteer om een mail te laten schrijven"
                              : row.mailCount > 0
                                ? "Al verstuurd"
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
                            className="inline-flex border border-warn/50 bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-warn-fg"
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
                      </p>
                    </td>
                    <td
                      className="px-4 py-3 tabular-nums text-text"
                      title={
                        row.employeeCount == null
                          ? "Aantal medewerkers nog niet bekend"
                          : "Aantal medewerkers"
                      }
                    >
                      {fmtEmployees(row.employeeCount)}
                    </td>
                    <td className="px-4 py-3">
                      {shownPeople.length > 0 ? (
                        <ul className="space-y-2">
                          {shownPeople.map((person, personIndex) => (
                            <li key={`${person.name}-${person.email ?? personIndex}`}>
                              <p className="font-medium text-text">
                                {person.name}
                              </p>
                              <p className="max-w-[16rem] text-xs text-text-muted">
                                {person.title ?? "Functie onbekend"}
                                {person.email ? ` · ${person.email}` : ""}
                              </p>
                              <p className={`text-xs ${person.tone}`}>
                                {person.label}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-warn-fg">
                          Nog niemand gevonden
                        </p>
                      )}
                      {people.length > shownPeople.length ? (
                        <p className="mt-1 text-[11px] text-text-dim">
                          +{people.length - shownPeople.length} andere
                        </p>
                      ) : null}
                      {!hasRightPerson ? (
                        <p className="mt-1 text-xs text-warn-fg">
                          Verder zoeken
                        </p>
                      ) : null}
                      {addingId === row.id ? (
                        <form
                          className="mt-2 space-y-1.5"
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            void addPerson(row);
                          }}
                        >
                          <input
                            required
                            aria-label="Naam"
                            placeholder="Naam"
                            value={addForm.name}
                            onChange={(ev) =>
                              setAddForm((f) => ({ ...f, name: ev.target.value }))
                            }
                            className="block w-full max-w-[16rem] border border-border bg-bg px-2 py-1 text-xs text-text"
                          />
                          <input
                            aria-label="Functie"
                            placeholder="Functie"
                            value={addForm.title}
                            onChange={(ev) =>
                              setAddForm((f) => ({
                                ...f,
                                title: ev.target.value,
                              }))
                            }
                            className="block w-full max-w-[16rem] border border-border bg-bg px-2 py-1 text-xs text-text"
                          />
                          <input
                            aria-label="E-mail"
                            placeholder="E-mail"
                            value={addForm.email}
                            onChange={(ev) =>
                              setAddForm((f) => ({
                                ...f,
                                email: ev.target.value,
                              }))
                            }
                            className="block w-full max-w-[16rem] border border-border bg-bg px-2 py-1 text-xs text-text"
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={busy}
                              className="bg-accent px-2 py-1 text-xs text-accent-contrast disabled:opacity-50"
                            >
                              Opslaan
                            </button>
                            <button
                              type="button"
                              className="text-xs text-text-dim underline"
                              onClick={() => setAddingId(null)}
                            >
                              Annuleer
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="mt-1 text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
                          onClick={() => {
                            setAddingId(row.id);
                            setAddForm({ name: "", title: "", email: "" });
                            setError(null);
                          }}
                        >
                          Persoon toevoegen
                        </button>
                      )}
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
                      {headMail ? (
                        <button
                          type="button"
                          onClick={() => setDrawerId(row.id)}
                          className="group block text-left"
                          title="Open de mail om te lezen, testen of plannen"
                        >
                          <StatusBadge tone={QUEUE_STATUS_TONE[headMail.statusLabel]}>
                            {QUEUE_STATUS_NL[headMail.statusLabel]}
                          </StatusBadge>
                          {headMail.statusLabel === "gepland" &&
                          headMail.scheduledLabel ? (
                            <span className="mt-1 block tabular-nums text-text-dim">
                              {headMail.scheduledLabel}
                            </span>
                          ) : null}
                          <span className="mt-1 block text-accent group-hover:underline">
                            {pendingMails.length > 1
                              ? `Open ${pendingMails.length} mails`
                              : "Open mail"}
                          </span>
                        </button>
                      ) : null}
                      {row.lastSentAt ? (
                        <div className={headMail ? "mt-2" : undefined}>
                          Verstuurd {fmt(row.lastSentAt)}
                          <p className="text-text-dim">
                            {row.openCount} open · {row.replyCount} reply
                          </p>
                        </div>
                      ) : !headMail ? (
                        <span className="text-text-dim">Nog niet</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawerRow ? (
        <MailDrawer
          prospectId={drawerRow.row.id}
          companyName={drawerRow.row.companyName}
          items={meta.get(drawerRow.row.id)?.pending ?? []}
          testTo={defaultTestTo}
          testSendBlockReason={testSendBlockReason}
          liveSendBlockReason={liveSendBlockReason}
          aiConfigured={aiConfigured}
          onClose={closeDrawer}
        />
      ) : null}
    </div>
  );
}
