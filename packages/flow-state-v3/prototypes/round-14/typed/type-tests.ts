// What the types refuse. Each `@ts-expect-error` must be an error, or `tsc` fails: a compile-time pin of D91, not a claim.
import { Context, Effect, Schema } from "effect";
import { OutcomeUnknown } from "../../conformance/fixtures/compiled.ts";
import { actorRef, definition, ensureArgs, Flow, machine, servicesFor, subroutine, trait, transaction } from "../../conformance/compile/index.ts";

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
// Round 13 (round 12 review L1): D218 below the root trait. A trait placed in a trait, a trait placed on a node, and a subroutine's operation each reach the host.
const Outer = trait({ id: "Outer", traits: { inner: Ticker } }, () => ({}));
const OD = definition({ id: "T/Nested", states: ["A"], events: {}, internalEvents: {}, memory: {}, traits: { outer: Outer }, operations: () => ({}) });
const OM = machine(OD, ({ S }) => ({ default: S.A }));
// @ts-expect-error a boot that does not give a nested fragment's service
servicesFor(OM, Context.make(Other, { x: 1 }));
servicesFor(OM, Context.make(Clock, { now: () => 0 }));
const ND = definition({ id: "T/Node", states: [{ A: Flow.state({ traits: { ticker: Ticker } }) }, "B"], events: {}, internalEvents: {}, memory: {}, operations: () => ({}) });
const NM = machine(ND, ({ S }) => ({ default: S.A }));
// @ts-expect-error a boot that does not give a node trait's service
servicesFor(NM, Context.make(Other, { x: 1 }));
servicesFor(NM, Context.make(Clock, { now: () => 0 }));
const Sub = subroutine({ id: "Sub", internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, operations: ({ E }) => ({ t: timedOk.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }, () => ({ on: { Ok: {}, No: {}, Unsure: {} } }));
const SD = definition({ id: "T/Sub", states: ["A", { S: Sub }], events: {}, internalEvents: {}, memory: {}, operations: () => ({}) });
const SM = machine(SD, ({ S }) => ({ default: S.A }));
// @ts-expect-error a boot that does not give a subroutine's service
servicesFor(SM, Context.make(Other, { x: 1 }));
servicesFor(SM, Context.make(Clock, { now: () => 0 }));
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

// Round 14 (OD30, rule 74, 2.7.19): refs. A value ref is named by the input fields; a singleton by a literal name.
const ED = definition({ id: "T/Editor", states: ["A"], events: {}, internalEvents: {}, memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String), title: Flow.initial(Schema.String, "") }, operations: () => ({}) });
const EM = machine(ED, ({ S }) => ({ default: S.A }));
const T42 = { workspaceId: "north", ticketId: "T-42" };
const editor = actorRef(EM, T42, { persist: true });
ensureArgs(editor);
// @ts-expect-error a value-named ref takes no input at ensure: the value is the input
ensureArgs(editor, { input: T42 });
// @ts-expect-error a value missing an input field names no actor
actorRef(EM, { workspaceId: "north" });
// @ts-expect-error a fresh literal with an extra field: Flow keeps only the input fields
actorRef(EM, { workspaceId: "north", ticketId: "T-42", assignee: "ana" });
const wide = { workspaceId: "north", ticketId: "T-42", assignee: "ana" };
actorRef(EM, wide); // NOT refused: a wider value is kept to its input fields (OD29 J's rule, applied to refs)
const singleton = actorRef(EM, "main");
ensureArgs(singleton, { input: T42 });
declare const runtimeName: string;
// @ts-expect-error a singleton's name is a literal; a runtime string is a type error (OD30 Q4)
actorRef(EM, runtimeName);
const ND2 = definition({ id: "T/Counted", states: ["A"], events: {}, internalEvents: {}, memory: { n: Flow.input(Schema.Number) }, operations: () => ({}) });
const NM2 = machine(ND2, ({ S }) => ({ default: S.A }));
// @ts-expect-error identity fields encode to strings (OD30 Q6): a number field has no value form
actorRef(NM2, { n: 1 });
actorRef(NM2, "counter"); // a singleton: its input given at ensure
const NoIn = machine(definition({ id: "T/NoInput", states: ["A"], events: {}, internalEvents: {}, memory: {}, operations: () => ({}) }), ({ S }) => ({ default: S.A }));
// @ts-expect-error a machine with no input can only be a singleton
actorRef(NoIn, {});
