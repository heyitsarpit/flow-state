import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { results } from "../operations/reads.ts";

/**
 * One results list a view makes for itself, named by the view, showing a query's first page.
 */
export const ResultList = definition({
  id: "Search/ResultList",
  states: ["LOADING", "SHOWN"],
  events: { Load: {} },
  internalEvents: { Shown: { rows: Schema.Array(Schema.String) }, Failed: {} },
  memory: {
    list: Flow.input(Schema.String),
    q: Flow.initial(Schema.String, "sho"),
    rows: Flow.initial(Schema.Array(Schema.String), []),
  },
  operations: ({ E }) => ({
    results: results.outcomes({
      success: E.Shown.from((v) => ({ rows: v.rows })),
      failure: { NoResponse: E.Failed, Defect: E.Failed, Interrupted: E.Failed },
    }),
  }),
  schedules: { mount: {} },
});

/**
 * A list reads the query's first page as soon as it is made.
 */
export const ResultListMachine = machine(ResultList, ({ S, E, O }) => ({
  default: S.LOADING,
  on: {
    Load: { actions: [O.results.lookup(({ memory }) => ({ q: memory.q, page: 0 }))] },
    Shown: { target: S.SHOWN, updateMemory: ({ event }) => ({ rows: event.rows }) },
  },
  states: {
    LOADING: { schedules: { mount: { schedule: 0, send: E.Load, armOn: [Flow.entry] } } },
    SHOWN: {},
  },
}));
