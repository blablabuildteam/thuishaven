/**
 * Apollo search coverage ledger: per zone × headcount bucket × keywords we
 * remember how far we paged, so widening filters only fetches what's new.
 */

import {
  searchDoelgroepCompanies,
} from "@/lib/integrations/apollo/client";
import {
  keepForIntake,
  placesForZone,
  sliceLabel,
  slicesForCriteria,
  splitByRegion,
  type ApolloSearchCriteria,
  type SearchSlice,
  type SearchZone,
} from "@/lib/integrations/apollo/criteria";
import { APOLLO_PAGE_SIZE } from "./batch-costs";
import { addProspects } from "./intake";
import {
  readCursorMeta,
  rememberApolloUniverse,
  upsertApolloCursor,
} from "./apollo-page";

export type SliceState = {
  key: string;
  zone: SearchZone;
  range: string;
  keywords: string[];
  label: string;
  /** Apollo's reported match count; null = never counted. */
  total: number | null;
  countedAt: string | null;
  pagesFetched: number;
  /** Organisations Apollo returned across fetched pages. */
  seen: number;
  /** New rows added to our list from this slice. */
  created: number;
  done: boolean;
  lastRunAt: string | null;
};

function emptyState(slice: SearchSlice): SliceState {
  return {
    ...slice,
    label: sliceLabel(slice),
    total: null,
    countedAt: null,
    pagesFetched: 0,
    seen: 0,
    created: 0,
    done: false,
    lastRunAt: null,
  };
}

export async function readCoverage(): Promise<Record<string, SliceState>> {
  const meta = await readCursorMeta();
  const raw = meta.apolloSlices;
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, SliceState>;
}

async function saveSlice(state: SliceState): Promise<void> {
  const all = await readCoverage();
  all[state.key] = state;
  await upsertApolloCursor({ apolloSlices: all });
}

export function pagesLeft(s: SliceState): number | null {
  if (s.done) return 0;
  if (s.total == null) return null;
  return Math.max(0, Math.ceil(s.total / APOLLO_PAGE_SIZE) - s.pagesFetched);
}

function criteriaForSlice(
  slice: SearchSlice,
  base: ApolloSearchCriteria,
): ApolloSearchCriteria {
  return {
    ...base,
    employeeRanges: [slice.range],
    keywordTags: slice.keywords,
  };
}

/** Count slices we haven't counted yet (1 credit each). */
export async function countSlices(input: {
  criteria: ApolloSearchCriteria;
  recount?: boolean;
}): Promise<
  | { ok: true; counted: number; states: SliceState[]; total: number }
  | { ok: false; error: string }
> {
  const coverage = await readCoverage();
  const states: SliceState[] = [];
  let counted = 0;

  for (const slice of slicesForCriteria(input.criteria)) {
    const state = coverage[slice.key] ?? emptyState(slice);
    if (state.total != null && !input.recount) {
      states.push(state);
      continue;
    }
    const search = await searchDoelgroepCompanies({
      page: 1,
      perPage: 1,
      criteria: criteriaForSlice(slice, input.criteria),
      places: placesForZone(slice.zone),
    });
    if (!search.ok) return { ok: false, error: search.error ?? "Apollo-fout" };
    counted += 1;
    const next: SliceState = {
      ...state,
      total: search.total,
      countedAt: new Date().toISOString(),
      done:
        search.total === 0 ||
        state.pagesFetched * APOLLO_PAGE_SIZE >= search.total,
    };
    await saveSlice(next);
    states.push(next);
  }

  const total = states.reduce((s, x) => s + (x.total ?? 0), 0);
  await rememberApolloUniverse({ total, criteria: input.criteria });
  return { ok: true, counted, states, total };
}

/** Page through every unfinished slice, resuming where each one stopped. */
export async function drainSlices(input: {
  criteria: ApolloSearchCriteria;
  maxPages: number;
}): Promise<
  | {
      ok: true;
      pages: number;
      created: number;
      duplicate: number;
      outOfRegion: number;
      done: boolean;
      states: SliceState[];
    }
  | { ok: false; error: string; pages: number; created: number }
> {
  const coverage = await readCoverage();
  let pages = 0;
  let created = 0;
  let duplicate = 0;
  let outOfRegion = 0;
  const states: SliceState[] = [];

  for (const slice of slicesForCriteria(input.criteria)) {
    let state = coverage[slice.key] ?? emptyState(slice);
    while (!state.done && pages < input.maxPages) {
      const page = state.pagesFetched + 1;
      const search = await searchDoelgroepCompanies({
        page,
        perPage: APOLLO_PAGE_SIZE,
        criteria: criteriaForSlice(slice, input.criteria),
        places: placesForZone(slice.zone),
      });
      if (!search.ok) {
        return { ok: false, error: search.error ?? "Apollo-fout", pages, created };
      }
      pages += 1;

      const keep = keepForIntake(search.companies);
      outOfRegion += splitByRegion(search.companies).outOfRegion.length;
      const result = await addProspects({
        type: "company",
        source: "apollo",
        drafts: keep.map((c) => ({
          companyName: c.name,
          website: c.website ?? null,
          linkedinUrl: c.linkedinUrl ?? null,
          city: c.city ?? null,
          employeeCount: c.employeeCount ?? null,
          sector: c.industry ?? null,
          apolloPage: page,
          apolloSearch: slice.key,
          apolloSearchLabel: sliceLabel(slice),
        })),
      });
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Opslaan mislukt", pages, created };
      }
      created += result.created;
      duplicate += result.duplicate;

      const raw = search.companies.length;
      state = {
        ...state,
        total: search.total,
        countedAt: state.countedAt ?? new Date().toISOString(),
        pagesFetched: page,
        seen: state.seen + raw,
        created: state.created + result.created,
        done: raw < APOLLO_PAGE_SIZE || page * APOLLO_PAGE_SIZE >= search.total,
        lastRunAt: new Date().toISOString(),
      };
      await saveSlice(state);
    }
    states.push(state);
  }

  return {
    ok: true,
    pages,
    created,
    duplicate,
    outOfRegion,
    done: states.every((s) => s.done),
    states,
  };
}
