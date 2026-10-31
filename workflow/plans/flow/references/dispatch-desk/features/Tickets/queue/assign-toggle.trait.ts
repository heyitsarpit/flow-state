// One row's "assign" toggle: a copy per visible row (`.each`) that OWNS its write (F6). The queue does not assign;
// the row does, so a burst of taps on one row is that row's business, and a row the list drops keeps its write
// going (its lane is parked for the row's key and the next copy of that row adopts it, rule 54).
//
// How it differs from the other copies that own writes: on `latest` with no budget-and-schedule of its own. A tap
// while the previous one is unsure waits behind the hold (O5), and the hold is reconciled once, at once, in the
// ending's turn: the hand-written re-send trio belongs to the editor's title (COVERAGE.md section 3).
import { Schema } from "effect";
import { Flow, trait } from "flow-state";
import { TicketsDomain } from "../ticket.domain.js";

export const AssignToggle = trait(
  {
    id: "AssignToggle",
    events: { Toggle: { assignee: Schema.NullOr(Schema.String) } }, // the view sends me, or null to release
    internalEvents: {
      Set: {},
      Held: { holder: Schema.String },
      Gone: {},
      NotSent: {},
      Unsure: Flow.uncertain({}),
    },
    callbacks: {
      onHeld: Flow.optional(Flow.Callback({ ticketId: Schema.String, holder: Schema.String })),
    },
    memory: {
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String),
      problem: Flow.initial(Schema.NullOr(Schema.Literals(["held", "gone", "unsure"])), null),
    },
    operations: ({ E }) => ({
      set: TicketsDomain.setAssignee.outcomes({
        success: E.Set,
        failure: {
          AlreadyAssigned: E.Held.from((e) => ({ holder: e.assignee })),
          TicketNotFound: E.Gone,
          NotSent: E.NotSent, // another path's lane, Overloaded on a record queue, or Restored
        },
        unknown: E.Unsure,
      }),
    }),
  },
  ({ O, callbacks }) => ({
    on: {
      // No `idle`: under `latest` a tap while one is on the wire replaces the queued one; while one is unsure, it
      // waits behind the hold.
      Toggle: {
        target: "self",
        updateMemory: () => ({ problem: null }),
        actions: [
          O.set.commit(({ memory, event }) => ({
            workspaceId: memory.workspaceId,
            ticketId: memory.ticketId,
            assignee: event.assignee,
          })),
        ],
      },
      Set: { target: "self" },
      Held: {
        target: "self",
        updateMemory: () => ({ problem: "held" as const }),
        notify: [
          callbacks.onHeld.from(({ memory, event }) => ({
            ticketId: memory.ticketId,
            holder: event.holder,
          })),
        ],
      },
      Gone: { target: "self", updateMemory: () => ({ problem: "gone" as const }) },
      NotSent: { target: "self" },
      // Ask once more with the same Attempt; then release, and a tap that waited goes next (OD7).
      Unsure: [
        { target: "self", guard: [O.set.retryable({ times: 1 })], actions: [O.set.retry] },
        {
          target: "self",
          updateMemory: () => ({ problem: "unsure" as const }),
          actions: [O.set.cancel],
        },
      ],
    },
  }),
);
