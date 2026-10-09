/**
 * Server-only funnel counts over CRM rows.
 * Do not import from client components (pulls in postgres via crm.ts).
 */

import { listCrmRecords, type CrmRecord } from "@/lib/outreach/crm";
import { isReadyToMail, mailAngleFor } from "@/lib/outreach/mail-angle";

export type OutreachPipelineStatus = {
  /** Non-partner, non-existing-customer. */
  totalCompanies: number;
  /** mailCount > 0 */
  mailed: number;
  /** queuedCount > 0, not mailed */
  inQueue: number;
  /** Zie isReadyToMail — zelfde definitie als Bedrijven en Mailen. */
  readyToMail: number;
  /** Among not-yet-mailed */
  missingEmail: number;
  /** incomplete && email && not mailed */
  incompleteButHasEmail: number;
  /** doelgroepFit onbekend / ontbreekt — hebben mail, nog niet gemaild */
  fitUnknown: number;
  /** doelgroepFit = nee — niet mailen tot herbeoordeeld */
  fitNo: number;
  /** In wachtrij of als concept-draft (te beoordelen) */
  needsReview: number;
  /** Concept drafts (nog niet promoted) */
  drafts: number;
  /** KvK non-mailing — nooit ongevraagd mailen */
  nonMailing: number;
};

function eligible(rows: CrmRecord[]): CrmRecord[] {
  return rows.filter((r) => !r.partner && !r.existingCustomer);
}

export function computeOutreachPipelineStatus(
  rows: CrmRecord[],
): OutreachPipelineStatus {
  const companies = eligible(rows);

  let mailed = 0;
  let inQueue = 0;
  let drafts = 0;
  let readyToMail = 0;
  let missingEmail = 0;
  let incompleteButHasEmail = 0;
  let fitUnknown = 0;
  let fitNo = 0;
  let nonMailing = 0;

  for (const row of companies) {
    const hasMailed = row.mailCount > 0;
    const queued = row.queuedCount > 0;
    const hasDraft = row.draftCount > 0;

    if (hasMailed) {
      mailed += 1;
      continue;
    }
    if (row.nonMailing) {
      nonMailing += 1;
      continue;
    }

    if (queued) {
      inQueue += 1;
    }
    if (hasDraft && !queued) {
      drafts += 1;
    }

    if (!row.email) {
      missingEmail += 1;
    } else if (row.incomplete) {
      incompleteButHasEmail += 1;
    }

    if (row.email && !hasMailed) {
      if (row.doelgroepFit === "nee") fitNo += 1;
      else if (!row.doelgroepFit || row.doelgroepFit === "onbekend") {
        fitUnknown += 1;
      }
    }

    const angle = mailAngleFor({
      status: row.status,
      existingCustomer: row.existingCustomer,
      doelgroepFit: row.doelgroepFit,
      doelgroepReason: row.doelgroepReason,
      anniversaryYears: row.anniversaryYears,
      nonMailing: row.nonMailing,
    });
    if (
      isReadyToMail({
        angleId: angle.id,
        email: row.email,
        mailCount: row.mailCount,
        queuedCount: row.queuedCount,
        draftCount: row.draftCount,
      })
    ) {
      readyToMail += 1;
    }
  }

  return {
    totalCompanies: companies.length,
    mailed,
    inQueue,
    readyToMail,
    missingEmail,
    incompleteButHasEmail,
    fitUnknown,
    fitNo,
    needsReview: inQueue + drafts,
    drafts,
    nonMailing,
  };
}

export async function getOutreachPipelineStatus(): Promise<OutreachPipelineStatus> {
  const { rows } = await listCrmRecords();
  return computeOutreachPipelineStatus(rows);
}
