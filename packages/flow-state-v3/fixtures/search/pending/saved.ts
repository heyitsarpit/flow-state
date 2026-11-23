import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { saved } from "../operations/reads.ts";
import { saveSearch } from "../operations/writes.ts";

/**
 * A shopper's saved searches, named by shopper: the list as last read and a notice.
 */
export const Saved = definition({
  id: "Search/Saved",
  states: ["READY"],
  events: { Save: { q: Schema.String } },
  internalEvents: {
    Listed: { searches: Schema.Array(Schema.String) },
    ListFailed: {},
    SavedOk: { searches: Schema.Array(Schema.String) },
    SaveUnsure: Flow.uncertain({}),
    SaveRefused: { why: Schema.String },
  },
  memory: {
    shopper: Flow.input(Schema.String),
    searches: Flow.initial(Schema.Array(Schema.String), []),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    saved: saved.outcomes({
      value: E.Listed.from((v) => ({ searches: v.searches })),
      failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed },
    }),
    saveSearch: saveSearch.outcomes(
      {
        success: E.SavedOk.from((v) => ({ searches: v.searches })),
        failure: {},
        notSent: E.SaveRefused.from((n) => ({ why: n.why })),
        unknown: E.SaveUnsure,
      },
      { writes: ({ value, input }) => [saved.write({ shopper: input.shopper }, value)] },
    ),
  }),
});

/**
 * The list is placed while the shopper's saved searches show. A save writes the server's answer
 * into the read, so the list shows it at once; an unsure save marks the list stale, so it is read
 * again.
 */
export const SavedMachine = machine(Saved, ({ S, O }) => ({
  default: S.READY,
  states: {
    READY: {
      activities: [O.saved.subscribe(({ memory }) => ({ shopper: memory.shopper }))],
      on: {
        Listed: { updateMemory: ({ event }) => ({ searches: event.searches }) },
        ListFailed: { updateMemory: () => ({ notice: "saved searches unavailable" }) },
        Save: {
          actions: [
            O.saveSearch.commit(({ memory, event }) => ({ shopper: memory.shopper, q: event.q })),
          ],
        },
        SaveUnsure: {
          updateMemory: () => ({ notice: "checking your saved searches" }),
          actions: [O.saved.invalidate(({ memory }) => ({ shopper: memory.shopper }))],
        },
        SaveRefused: { updateMemory: ({ event }) => ({ notice: `save ${event.why}` }) },
      },
    },
  },
}));
