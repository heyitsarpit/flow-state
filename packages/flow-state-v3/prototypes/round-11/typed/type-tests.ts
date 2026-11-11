// What the types refuse. Each `@ts-expect-error` must be an error, or `tsc` fails: a compile-time pin of D91, not a claim.
import { Effect, Schema } from "effect";
import { OutcomeUnknown } from "../../conformance/fixtures/compiled.ts";
import { definition, Flow, machine, transaction } from "../../conformance/typed/flow.ts";

type Refused = { readonly _tag: "Refused"; readonly why: string };
const save = transaction({
  id: "t/save",
  input: { docId: Schema.String, text: Schema.String },
  key: ["docId"],
  concurrency: "reject",
  commit: (i) =>
    i.text === ""
      ? Effect.fail<Refused | OutcomeUnknown<string>>({ _tag: "Refused", why: "empty" })
      : Effect.succeed({ revision: 1 }),
});
// @ts-expect-error a key names a field that is not the input's
transaction({ id: "x", input: { a: Schema.String }, key: ["b"], concurrency: "reject", commit: () => Effect.void });

const D = definition({
  id: "T",
  states: { A: {}, B: {} },
  events: { Go: { text: Schema.String } },
  internalEvents: { Saved: { revision: Schema.Number }, Refused: { why: Schema.String }, NotSent: {} },
  memory: { n: Flow.initial(Schema.Number, 0), docId: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    save: save.outcomes({
      success: E.Saved.from((v: { revision: number }) => ({ revision: v.revision })),
      failure: {
        Refused: E.Refused.from((e: Refused) => ({ why: e.why })),
        NotSent: E.NotSent,
      },
    }),
    // @ts-expect-error `NoSuchTag` is no failure this commit has
    other: save.outcomes({ failure: { NoSuchTag: E.NotSent } }),
    // @ts-expect-error an event with a payload cannot be mapped with no `.from`
    third: save.outcomes({ success: E.Saved, failure: {} }),
  }),
});
machine(D, ({ S, O }) => ({
  default: S.A,
  on: {
    Go: [
      {
        target: S.B,
        updateMemory: ({ memory, event }) => ({ n: memory.n + event.text.length }),
        actions: [O.save.commit(({ memory }) => ({ docId: memory.docId, text: "" }))],
      },
    ],
    Saved: [
      // @ts-expect-error `text` is not on `Saved`
      { updateMemory: ({ event }) => ({ docId: event.text }) },
      // @ts-expect-error memory has no `m`
      { updateMemory: () => ({ m: 1 }) },
    ],
    Nope: {}, // NOT refused: the callback's return loses TypeScript's excess-property check. `flow check` says `UnknownEvent`
  },
  states: {
    A: {
      // @ts-expect-error no such state
      on: { Go: { target: S.C } },
    },
    C: {}, // NOT refused, the same way. `flow check` says `UnknownState`
    B: {
      on: {
        Go: {
          actions: [
            // @ts-expect-error a commit's input is the contract's
            O.save.commit(() => ({ docId: 1, text: "" })),
            // @ts-expect-error a key is the contract's key fields
            O.save.cancel.key(() => ({ text: "" })),
          ],
        },
      },
    },
  },
}));
