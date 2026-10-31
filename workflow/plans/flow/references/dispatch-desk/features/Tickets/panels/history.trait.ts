// The History tab: the ticket's history, newest first, with "load earlier" and "pin this note". A WRITING trait
// placed `.resumable()` on its tab node (F2, F12; rule 48 allows a mapped write under a resumable trait).
//
// What a freeze does to each of its operations, side by side (rules 52, 53):
//   - `latest` (a live read) is released on freeze and placed again on thaw from the thawed memory;
//   - `earlier` (a one-off read the tab waits on) is CUT by a freeze: it ends `failure { Interrupted }`, parked with
//     the frozen slice, and delivered first at thaw, where the handler asks again;
//   - `pin` (a write) OUTLIVES the freeze: its lane is unplaced while frozen, its ending is parked for the subject,
//     and the thawed incarnation adopts it (rule 54). Nothing is released on leave: a pin is intent.
import { Schema } from "effect";
import { Flow, trait } from "flow-state";
import { HistoryEntry } from "../editor/details-api.js";
import { historyOf, pinHistoryNote } from "../editor/fields.contracts.js";

export const History = trait(
  {
    id: "History",
    events: {
      LoadEarlier: {},
      Pin: { entryId: Schema.String, pinned: Schema.Boolean },
      Scrolled: { anchor: Schema.String },
    },
    hostEvents: { Highlight: { entryId: Schema.String } }, // a deep link, raised by the panels machine (F16)
    internalEvents: {
      EarlierLoaded: { entries: Schema.Array(HistoryEntry), older: Schema.optional(Schema.String) },
      EarlierCut: {}, // a freeze ended the lookup (`Interrupted`) or it failed: ask again on thaw
      Pinned: {},
      PinFailed: {},
      PinUnsure: Flow.uncertain({}),
    },
    memory: {
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String),
      earlier: Flow.initial(Schema.Array(HistoryEntry), []),
      older: Schema.optionalKey(Schema.String), // the next page to ask for; absent before the first or at the start
      highlighted: Flow.initial(Schema.NullOr(Schema.String), null),
      scrollAnchor: Flow.private(Flow.initial(Schema.NullOr(Schema.String), null)), // F19: only the tab reads it
    },
    operations: ({ E }) => ({
      latest: historyOf, // bare: the newest page is the row's data
      earlier: historyOf.outcomes({
        success: E.EarlierLoaded.from((page) => ({ entries: page.entries, older: page.older })),
        failure: { NoResponse: E.EarlierCut, Defect: E.EarlierCut, Interrupted: E.EarlierCut },
      }),
      pin: pinHistoryNote.outcomes({
        success: E.Pinned,
        failure: { NotSent: E.PinFailed }, // Rejected on another subject's path, or Restored
        unknown: E.PinUnsure,
      }),
    }),
  },
  ({ O }) => {
    const ticket = ({ memory }: { memory: { workspaceId: string; ticketId: string } }) => ({
      workspaceId: memory.workspaceId,
      ticketId: memory.ticketId,
    });

    const lookEarlier = O.earlier.lookup(({ memory, operations }) => {
      const before = memory.older ?? operations.latest?.data?.older;

      return before === undefined ? ticket({ memory }) : { ...ticket({ memory }), before };
    });

    return {
      activities: [O.latest.subscribe(ticket)],
      on: {
        LoadEarlier: { target: "self", actions: [lookEarlier] },
        EarlierLoaded: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            earlier: [...memory.earlier, ...event.entries],
            older: event.older,
          }),
        },
        // At thaw this arrives first among the parked endings (rule 52): the tab asks for the page again.
        EarlierCut: { target: "self", actions: [lookEarlier] },
        Highlight: {
          target: "self",
          updateMemory: ({ event }) => ({ highlighted: event.entryId }),
        },
        Scrolled: { target: "self", updateMemory: ({ event }) => ({ scrollAnchor: event.anchor }) },
        Pin: {
          target: "self",
          guard: [
            O.pin.idle(({ memory, event }) => ({ ...ticket({ memory }), entryId: event.entryId })),
          ],
          actions: [
            O.pin.commit(({ memory, event }) => ({
              ...ticket({ memory }),
              entryId: event.entryId,
              pinned: event.pinned,
            })),
          ],
        },
        Pinned: { target: "self", actions: [O.latest.refetch] },
        PinFailed: { target: "self" },
        PinUnsure: [
          { target: "self", guard: [O.pin.retryable({ times: 2 })], actions: [O.pin.retry] },
          { target: "self", actions: [O.pin.cancel] },
        ],
      },
    };
  },
);
