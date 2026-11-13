// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: error VerbMismatch  WrongVerb.list: `lookup` on an operation that maps `value` (live): a mapping and its verb must agree (2.7.3)
import { Schema } from "effect";
import { definition, machine } from "flow-state";
import { TicketsDomain } from "../../features/Tickets/ticket.domain.js";

export const WrongVerb = definition({
  id: "Findings/WrongVerb",
  states: ["OPEN"],
  events: { Look: {} },
  internalEvents: { Listed: {}, Failed: {} },
  memory: { workspaceId: Schema.optionalKey(Schema.String) },
  operations: ({ E }) => ({
    list: TicketsDomain.list.outcomes({
      value: E.Listed,
      failure: {
        QueueUnavailable: E.Failed,
        NoResponse: E.Failed,
        Defect: E.Failed,
        Interrupted: E.Failed,
      },
    }),
  }),
});

// WRONG: `value` means live; this looks it up once. Map `success:` for a one-off read, or `subscribe` it.
export const WrongVerbMachine = machine(WrongVerb, ({ S, O }) => ({
  default: S.OPEN,
  on: { Listed: { target: "self" }, Failed: { target: "self" } },
  states: {
    OPEN: {
      on: { Look: { target: "self", actions: [O.list.lookup(() => ({ workspaceId: "north" }))] } },
    },
  },
}));

export const expected = { code: "VerbMismatch", level: "error", at: "WrongVerb.list" } as const;
