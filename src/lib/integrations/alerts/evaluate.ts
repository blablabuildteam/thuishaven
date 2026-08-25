import { and, eq, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  raListings,
  ticketInventory,
  ticketswapListings,
} from "@/lib/db/schema";
import type { AlertRule } from "@/lib/integrations/alerts/rules";
import type {
  SecondaryChannel,
  SecondarySoldOutConflict,
} from "@/lib/integrations/alerts/types";
import { ticketswapVenueUrl } from "@/lib/integrations/ticketswap/client";

const weeztixInv = alias(ticketInventory, "eval_weeztix_inv");
const appicInv = alias(ticketInventory, "eval_appic_inv");

export type EditionAlertSnapshot = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  weeztixSold: number;
  weeztixSoldOut: boolean;
  raOpen: boolean;
  raTitle: string | null;
  raUrl: string | null;
  tsAvailable: number | null;
  tsUrl: string | null;
  tsTitle: string | null;
  appicAvailable: number | null;
};

export type RuleMatch = SecondarySoldOutConflict & {
  ruleId: string;
  weeztixSold: number;
};

function since(): Date {
  return new Date(Date.now() - 12 * 60 * 60 * 1000);
}

export function ruleTriggerMet(
  snap: EditionAlertSnapshot,
  rule: AlertRule,
): boolean {
  if (snap.weeztixSoldOut) return true;
  if (rule.soldThreshold != null && snap.weeztixSold >= rule.soldThreshold) {
    return true;
  }
  return false;
}

export async function loadEditionAlertSnapshots(): Promise<
  EditionAlertSnapshot[]
> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      startsAt: editions.startsAt,
      weeztixSold: weeztixInv.sold,
      weeztixSoldOut: weeztixInv.isSoldOut,
      raOpen: raListings.ticketsAvailable,
      raTitle: raListings.title,
      raUrl: raListings.contentUrl,
      tsAvailable: ticketswapListings.availableCount,
      tsUrl: ticketswapListings.contentUrl,
      tsTitle: ticketswapListings.title,
      appicAvailable: appicInv.available,
    })
    .from(editions)
    .innerJoin(
      weeztixInv,
      and(
        eq(weeztixInv.editionId, editions.id),
        eq(weeztixInv.platform, "weeztix"),
      ),
    )
    .leftJoin(raListings, eq(raListings.editionId, editions.id))
    .leftJoin(ticketswapListings, eq(ticketswapListings.editionId, editions.id))
    .leftJoin(
      appicInv,
      and(eq(appicInv.editionId, editions.id), eq(appicInv.platform, "appic")),
    )
    .where(gte(editions.startsAt, since()));

  const byEdition = new Map<string, EditionAlertSnapshot>();
  for (const row of rows) {
    const prev = byEdition.get(row.editionId);
    const tsAvailable =
      row.tsAvailable != null
        ? Math.max(row.tsAvailable, prev?.tsAvailable ?? 0)
        : prev?.tsAvailable ?? null;
    byEdition.set(row.editionId, {
      editionId: row.editionId,
      editionName: row.editionName,
      startsAt: row.startsAt,
      weeztixSold: row.weeztixSold ?? prev?.weeztixSold ?? 0,
      weeztixSoldOut: Boolean(row.weeztixSoldOut || prev?.weeztixSoldOut),
      raOpen: Boolean(row.raOpen || prev?.raOpen),
      raTitle: row.raTitle ?? prev?.raTitle ?? null,
      raUrl: row.raUrl ?? prev?.raUrl ?? null,
      tsAvailable,
      tsUrl: row.tsUrl ?? prev?.tsUrl ?? null,
      tsTitle: row.tsTitle ?? prev?.tsTitle ?? null,
      appicAvailable:
        row.appicAvailable ?? prev?.appicAvailable ?? null,
    });
  }
  return [...byEdition.values()];
}

function triggerLabel(snap: EditionAlertSnapshot, rule: AlertRule): string {
  if (snap.weeztixSoldOut) return "Weeztix is uitverkocht";
  if (rule.soldThreshold != null) {
    return `Weeztix heeft ${snap.weeztixSold} tickets verkocht (drempel ${rule.soldThreshold})`;
  }
  return "Weeztix-drempel bereikt";
}

export function matchesForRule(
  snaps: EditionAlertSnapshot[],
  rule: AlertRule,
): RuleMatch[] {
  if (!rule.enabled) return [];
  const out: RuleMatch[] = [];

  for (const snap of snaps) {
    if (!ruleTriggerMet(snap, rule)) continue;

    const why = triggerLabel(snap, rule);

    if (rule.checkRa && snap.raOpen) {
      out.push({
        ruleId: rule.id,
        weeztixSold: snap.weeztixSold,
        editionId: snap.editionId,
        editionName: snap.editionName,
        startsAt: snap.startsAt,
        channel: "resident_advisor",
        channelLabel: "Resident Advisor",
        kind: "overbooking",
        title: `${snap.editionName} is bij Weeztix vol, maar staat nog te koop op RA`,
        message: `${why}. Op Resident Advisor (${snap.raTitle ?? "listing"}) zijn nog tickets beschikbaar. Zet de RA-verkoop uit om overboeking te voorkomen.`,
        availableCount: null,
        url: snap.raUrl,
      });
    }

    if (rule.checkTicketswap && (snap.tsAvailable ?? 0) > 0) {
      const n = snap.tsAvailable ?? 0;
      out.push({
        ruleId: rule.id,
        weeztixSold: snap.weeztixSold,
        editionId: snap.editionId,
        editionName: snap.editionName,
        startsAt: snap.startsAt,
        channel: "ticketswap",
        channelLabel: "TicketSwap",
        kind: "revenue_leak",
        title: `${snap.editionName}: TicketSwap actief na Weeztix-drempel`,
        message: `${why}, maar er ${n === 1 ? "staat nog 1 ticket" : `staan nog ${n} tickets`} op TicketSwap. Mogelijke omzetlek.`,
        availableCount: n,
        url: snap.tsUrl ?? ticketswapVenueUrl(),
      });
    }

    if (rule.checkAppic && (snap.appicAvailable ?? 0) > 0) {
      const n = snap.appicAvailable ?? 0;
      out.push({
        ruleId: rule.id,
        weeztixSold: snap.weeztixSold,
        editionId: snap.editionId,
        editionName: snap.editionName,
        startsAt: snap.startsAt,
        channel: "appic",
        channelLabel: "Appic",
        kind: "revenue_leak",
        title: `${snap.editionName}: Appic actief na Weeztix-drempel`,
        message: `${why}, maar Appic toont nog ${n === 1 ? "1 ticket" : `${n} tickets`}. Mogelijke omzetlek.`,
        availableCount: n,
        url: null,
      });
    }
  }

  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

export function matchesForRules(
  snaps: EditionAlertSnapshot[],
  rules: AlertRule[],
): RuleMatch[] {
  return rules.flatMap((rule) => matchesForRule(snaps, rule));
}

export function channelToAlertType(
  channel: SecondaryChannel,
): "ticketswap_after_soldout" | "weeztix_soldout_ra_open" | "custom" {
  if (channel === "resident_advisor") return "weeztix_soldout_ra_open";
  if (channel === "ticketswap") return "ticketswap_after_soldout";
  return "custom";
}
