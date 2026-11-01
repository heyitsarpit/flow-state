// The command palette: find a ticket, a customer or a part. One-off reads only.
//
// How this module is different (COVERAGE.md 5.2): no write and no live placement. One lookup operation, so one
// lane: a newer lookup releases the older one, whose answer is never delivered (`Superseded`, 2.7.9), and an empty
// box is a key-less `cancel` of the lookup in flight. No stale guard, no request id, no memory of "which query".
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { Hit } from "./find-api.js";
import { searchEverything } from "./find.contracts.js";

export const MIN_QUERY = 2;

const Kind = Schema.Literals(["ticket", "customer", "part"]);

const Chosen = Schema.Struct({ kind: Kind, id: Schema.String });

export const Find = definition({
  id: "DispatchDesk/Find",
  states: ["PALETTE"],
  events: {
    Typed: { q: Schema.String },
    Search: {}, // Enter: search now, without waiting for the pause
    Choose: Chosen.fields,
  },
  internalEvents: {
    SearchDue: {},
    Found: { hits: Schema.Array(Hit) },
    FindFailed: {},
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    q: Flow.initial(Schema.String, ""),
    hits: Flow.initial(Schema.Array(Hit), []), // the last answer, kept (and dimmed) when a newer one fails
    failed: Flow.initial(Schema.Boolean, false),
    chosen: Flow.initial(Schema.NullOr(Chosen), null),
  },
  operations: ({ E }) => ({
    // Maps `success`: the machine must use `lookup` (VerbMismatch otherwise). Flow's two arrive on `failure` (rule 37).
    results: searchEverything.outcomes({
      success: E.Found.from((hits) => ({ hits })),
      failure: { NoResponse: E.FindFailed, Defect: E.FindFailed, Interrupted: E.FindFailed },
    }),
  }),
});
