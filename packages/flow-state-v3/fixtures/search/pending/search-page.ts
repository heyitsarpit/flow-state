/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call -- each line under an `@ts-expect-error` uses a read member or mapper context the Operations Spec adds and the package lacks, so its values type as any until it lands */
import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { results } from "../operations/reads.ts";

/**
 * The results page: the query and page shown, its rows and total as last read, and a notice.
 */
export const SearchPage = definition({
  id: "Search/SearchPage",
  states: ["EMPTY", "RESULTS"],
  events: {
    Search: { q: Schema.String },
    Page: { page: Schema.Int },
    Refresh: {},
    ClearResults: {},
    Close: {},
  },
  internalEvents: {
    Shown: { rows: Schema.Array(Schema.String), total: Schema.Number },
    Failed: {},
  },
  memory: {
    q: Flow.initial(Schema.String, ""),
    page: Flow.initial(Schema.Int, 0),
    rows: Flow.initial(Schema.Array(Schema.String), []),
    total: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    results: results.outcomes({
      // @ts-expect-error Operations O2: a placed read maps `value`
      value: E.Shown.from((v) => ({ rows: v.rows, total: v.total })),
      failure: { NoResponse: E.Failed, Defect: E.Failed, Interrupted: E.Failed },
    }),
  }),
});

/**
 * A query, once it has text, shows its first page; the shown page is placed while the page is
 * open, so it is read when missing or stale and kept while shown. Refresh reads it again now;
 * clearing drops what was read; closing leaves it.
 */
export const SearchPageMachine = machine(SearchPage, ({ S, O }) => ({
  default: S.EMPTY,
  on: {
    Search: {
      target: S.RESULTS,
      guard: [({ event }) => event.q.trim() !== "" || deny("EmptyQuery")],
      updateMemory: ({ event }) => ({ q: event.q.trim(), page: 0, notice: "" }),
    },
  },
  states: {
    EMPTY: {},
    RESULTS: {
      // @ts-expect-error Operations O2: a state places a read with `subscribe` in `activities`
      activities: [O.results.subscribe(({ memory }) => ({ q: memory.q, page: memory.page }))],
      on: {
        Page: { updateMemory: ({ event }) => ({ page: event.page }) },
        Shown: { updateMemory: ({ event }) => ({ rows: event.rows, total: event.total }) },
        Failed: { updateMemory: () => ({ notice: "results unavailable" }) },
        Refresh: { actions: [O.results.refetch] },
        ClearResults: { actions: [O.results.clear(({ memory }) => ({ q: memory.q }))] },
        Close: { target: S.EMPTY, updateMemory: () => ({ rows: [], total: 0 }) },
      },
    },
  },
}));
