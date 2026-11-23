import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { suggestions } from "../operations/reads.ts";

/**
 * The search box: what is typed and the suggestions for it, the latest query's only.
 */
export const Typeahead = definition({
  id: "Search/Typeahead",
  states: ["IDLE", "SUGGESTING"],
  events: { Type: { text: Schema.String } },
  internalEvents: {
    Suggested: { suggestions: Schema.Array(Schema.String) },
    NoSuggestions: {},
  },
  memory: {
    text: Flow.initial(Schema.String, ""),
    suggestions: Flow.initial(Schema.Array(Schema.String), []),
  },
  operations: ({ E }) => ({
    suggestions: suggestions.outcomes({
      success: E.Suggested.from((v) => ({ suggestions: v.suggestions })),
      failure: {
        NoResponse: E.NoSuggestions,
        Defect: E.NoSuggestions,
        Interrupted: E.NoSuggestions,
      },
    }),
  }),
});

/**
 * Each keystroke asks for suggestions for the text as trimmed; a newer keystroke replaces the
 * older one's wait.
 */
export const TypeaheadMachine = machine(Typeahead, ({ S, O }) => ({
  default: S.IDLE,
  on: {
    Type: {
      target: S.SUGGESTING,
      updateMemory: ({ event }) => ({ text: event.text }),
      actions: [O.suggestions.lookup(({ memory }) => ({ q: memory.text.trim() }))],
    },
    Suggested: {
      target: S.IDLE,
      updateMemory: ({ event }) => ({ suggestions: event.suggestions }),
    },
    NoSuggestions: { target: S.IDLE, updateMemory: () => ({ suggestions: [] }) },
  },
  states: { IDLE: {}, SUGGESTING: {} },
}));
