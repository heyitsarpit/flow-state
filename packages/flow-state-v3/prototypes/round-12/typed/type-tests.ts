// What the types refuse. Each `@ts-expect-error` must be an error, or `tsc` fails: a compile-time pin of D91, not a claim.
import { Context, Effect, Schema } from "effect";
import { OutcomeUnknown } from "../../conformance/fixtures/compiled.ts";
import { definition, Flow, machine, servicesFor, trait, transaction } from "../../conformance/compile/index.ts";

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

// Round 12 (D213, review H1): what a commit needs is named on its contract, and given at the boot.
class Clock extends Context.Service<Clock, { readonly now: () => number }>()("Probe/Clock") {}
const timed = transaction({ id: "t/timed", input: {}, key: [], concurrency: "reject", commit: () => Effect.map(Effect.service(Clock), (c) => c.now()) });
// @ts-expect-error a contract that does not name its commit's service has no `outcomes`
void timed.outcomes;
const timedOk = transaction({ id: "t/timed", input: {}, key: [], concurrency: "reject", services: [Clock], commit: () => Effect.map(Effect.service(Clock), (c) => c.now()) });
const TD = definition({ id: "T/Timed", states: ["A"], events: {}, internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, memory: {}, operations: ({ E }) => ({ t: timedOk.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) });
const TM = machine(TD, ({ S }) => ({ default: S.A, on: { Ok: {}, No: {}, Unsure: {} } }));
class Other extends Context.Service<Other, { readonly x: number }>()("Probe/Other") {}
// @ts-expect-error a boot that does not give a machine's service
servicesFor(TM, Context.make(Other, { x: 1 }));
servicesFor(TM, Context.make(Clock, { now: () => 0 }));
// Mid review H1 (rule 57): a fragment's operation's service reaches its host's requirements.
const Ticker = trait({ id: "Ticker", internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, operations: ({ E }) => ({ t: timedOk.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }, () => ({ on: { Ok: {}, No: {}, Unsure: {} } }));
const HD = definition({ id: "T/Host", states: ["A"], events: {}, internalEvents: {}, memory: {}, traits: { ticker: Ticker }, operations: () => ({}) });
const HM = machine(HD, ({ S }) => ({ default: S.A }));
// @ts-expect-error a boot that does not give a placed fragment's service
servicesFor(HM, Context.make(Other, { x: 1 }));
servicesFor(HM, Context.make(Clock, { now: () => 0 }));
// Mid review L1: a services list widened to an array type is refused.
const widened: ReadonlyArray<Context.Key<any, any>> = [];
const loose = transaction({ id: "t/loose", input: {}, key: [], concurrency: "reject", services: widened, commit: () => Effect.map(Effect.service(Clock), (c) => c.now()) });
// @ts-expect-error a services list that is not a tuple has no `outcomes`
void loose.outcomes;

const D = definition({
  id: "T",
  states: ["A", "B"],
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
      // Round 12 (2.7.3, "the select is typed where it is used"): a commit's select reads its own handler's event.
      // @ts-expect-error a select reads its handler's event: `Saved` has no `text`
      { actions: [O.save.commit(({ event }) => ({ docId: "d", text: event.text }))] },
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
            O.save.cancel(() => ({ text: "" })),
          ],
        },
      },
    },
  },
}));
