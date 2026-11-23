import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { document, outline } from "../operations/reads.ts";

/**
 * The author's library: the document shown last, by its title, revision and outline headings, as
 * last read.
 */
export const Library = definition({
  id: "Draft/Library",
  persist: true,
  states: ["BROWSING"],
  events: { Show: { id: Schema.String } },
  internalEvents: {
    Shown: { title: Schema.String, revision: Schema.Number },
    Outlined: { headings: Schema.Array(Schema.String) },
    Unavailable: {},
  },
  memory: {
    title: Flow.initial(Schema.String, ""),
    revision: Flow.initial(Schema.Number, 0),
    headings: Flow.initial(Schema.Array(Schema.String), []),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    document: document.outcomes({
      success: E.Shown.from((v) => ({ title: v.title, revision: v.revision })),
      failure: { NoResponse: E.Unavailable, Defect: E.Unavailable, Interrupted: E.Unavailable },
    }),
    outline: outline.outcomes({
      success: E.Outlined.from((v) => ({ headings: v.headings })),
      failure: { NoResponse: E.Unavailable, Defect: E.Unavailable, Interrupted: E.Unavailable },
    }),
  }),
});

/**
 * Showing a document reads it and its outline; what was read shows in the library.
 */
export const LibraryMachine = machine(Library, ({ S, O }) => ({
  default: S.BROWSING,
  on: {
    Show: {
      actions: [
        O.document.lookup(({ event }) => ({ id: event.id })),
        O.outline.lookup(({ event }) => ({ id: event.id })),
      ],
    },
    Shown: { updateMemory: ({ event }) => ({ title: event.title, revision: event.revision }) },
    Outlined: { updateMemory: ({ event }) => ({ headings: event.headings }) },
    Unavailable: { updateMemory: () => ({ notice: "offline" }) },
  },
  states: { BROWSING: {} },
}));
