// What the types refuse. Each `@ts-expect-error` must be an error, or `tsc` fails: a compile-time pin of D91, not a claim.
import { Context, Effect, Schema } from "effect";
import { OutcomeUnknown } from "../../conformance/fixtures/compiled.ts";
import { actorRef, changesOf, definition, ensureArgs, entity, Flow, machine, predictionsOf, servicesFor, subroutine, trait, transaction } from "../../conformance/compile/index.ts";

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
const TD = definition({ id: "T/Timed", persist: true, states: ["A"], events: {}, internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, memory: {}, operations: ({ E }) => ({ t: timedOk.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) });
const TM = machine(TD, ({ S }) => ({ default: S.A, on: { Ok: {}, No: {}, Unsure: {} } }));
class Other extends Context.Service<Other, { readonly x: number }>()("Probe/Other") {}
// @ts-expect-error a boot that does not give a machine's service
servicesFor(TM, Context.make(Other, { x: 1 }));
servicesFor(TM, Context.make(Clock, { now: () => 0 }));
// Mid review H1 (rule 57): a fragment's operation's service reaches its host's requirements.
const Ticker = trait({ id: "Ticker", internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, operations: ({ E }) => ({ t: timedOk.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }, () => ({ on: { Ok: {}, No: {}, Unsure: {} } }));
const HD = definition({ id: "T/Host", persist: true, states: ["A"], events: {}, internalEvents: {}, memory: {}, traits: { ticker: Ticker }, operations: () => ({}) });
const HM = machine(HD, ({ S }) => ({ default: S.A }));
// @ts-expect-error a boot that does not give a placed fragment's service
servicesFor(HM, Context.make(Other, { x: 1 }));
servicesFor(HM, Context.make(Clock, { now: () => 0 }));
// Round 13 (round 12 review L1): D218 below the root trait. A trait placed in a trait, a trait placed on a node, and a subroutine's operation each reach the host.
const Outer = trait({ id: "Outer", traits: { inner: Ticker } }, () => ({}));
const OD = definition({ id: "T/Nested", persist: true, states: ["A"], events: {}, internalEvents: {}, memory: {}, traits: { outer: Outer }, operations: () => ({}) });
const OM = machine(OD, ({ S }) => ({ default: S.A }));
// @ts-expect-error a boot that does not give a nested fragment's service
servicesFor(OM, Context.make(Other, { x: 1 }));
servicesFor(OM, Context.make(Clock, { now: () => 0 }));
const ND = definition({ id: "T/Node", persist: true, states: [{ A: Flow.state({ traits: { ticker: Ticker } }) }, "B"], events: {}, internalEvents: {}, memory: {}, operations: () => ({}) });
const NM = machine(ND, ({ S }) => ({ default: S.A }));
// @ts-expect-error a boot that does not give a node trait's service
servicesFor(NM, Context.make(Other, { x: 1 }));
servicesFor(NM, Context.make(Clock, { now: () => 0 }));
const Sub = subroutine({ id: "Sub", internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, operations: ({ E }) => ({ t: timedOk.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }, () => ({ on: { Ok: {}, No: {}, Unsure: {} } }));
const SD = definition({ id: "T/Sub", persist: true, states: ["A", { S: Sub }], events: {}, internalEvents: {}, memory: {}, operations: () => ({}) });
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
  persist: true,
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

// Round 14 (OD29 E step 2, rule 39): a commit's and a lookup's context carry no `signal`; an adapter uses Effect's (`tryPromise`, `Effect.abortSignal`).
transaction({
  id: "t/nosignal",
  input: {},
  key: [],
  concurrency: "reject",
  commit: (_i, c) => {
    // @ts-expect-error the commit context has no `signal` (OD29 E step 2)
    void c.signal;
    return Effect.void;
  },
});
// Round 15 (U5, OD48; C153): `allow` is cut from v1, so `transaction` takes `reject`, `latest`, `cancel` or `serialize`.
// @ts-expect-error `allow` is cut from v1 (U5)
transaction({ id: "t/allow", input: {}, key: [], concurrency: "allow", commit: () => Effect.void });
transaction({ id: "t/cancel", input: {}, key: [], concurrency: "cancel", commit: () => Effect.void });
// Round 14 (OD28): `Flow.ignore` stands wherever a mapping takes one event.
const TI = definition({ id: "T/Ign", persist: true, states: ["A"], events: {}, internalEvents: { Ok: {} }, memory: {}, operations: ({ E }) => ({ s: save.outcomes({ success: Flow.ignore, failure: { Refused: Flow.ignore, NotSent: E.Ok }, unknown: Flow.ignore }) }) });
void TI;
// OD29 (decision 3 B): a handler's `target` may be omitted and means "self" (already accepted; pinned as compiling).
machine(TI, ({ S }) => ({ default: S.A, on: { Ok: { updateMemory: () => ({}) } } }));

// Round 14 (OD30, rule 74, 2.7.19): refs. A value ref is named by the input fields; a singleton by a literal name.
const ED = definition({ id: "T/Editor", persist: true, states: ["A"], events: {}, internalEvents: {}, memory: { workspaceId: Flow.input(Schema.String), ticketId: Flow.input(Schema.String), title: Flow.initial(Schema.String, "") }, operations: () => ({}) });
const EM = machine(ED, ({ S }) => ({ default: S.A }));
const T42 = { workspaceId: "north", ticketId: "T-42" };
const editor = actorRef(EM, T42);
ensureArgs(editor);
// @ts-expect-error a ref carries no persist: persistence is the machine's, on its definition (U15, U19)
actorRef(EM, T42, { persist: true });
const PD = definition({ id: "T/Persisted", states: ["A"], events: {}, internalEvents: {}, memory: {}, persist: true, operations: () => ({}) });
void PD;
// @ts-expect-error a value-named ref takes no input at ensure: the value is the input
ensureArgs(editor, { input: T42 });
// @ts-expect-error a value missing an input field names no actor
actorRef(EM, { workspaceId: "north" });
// @ts-expect-error a fresh literal with an extra field: Flow keeps only the input fields
actorRef(EM, { workspaceId: "north", ticketId: "T-42", assignee: "ana" });
const wide = { workspaceId: "north", ticketId: "T-42", assignee: "ana" };
actorRef(EM, wide); // NOT refused: a wider value is kept to its input fields (OD29 J's rule, applied to refs)
// @ts-expect-error a machine with input fields is named only by value (D4)
actorRef(EM, "main");
const ND2 = definition({ id: "T/Counted", persist: true, states: ["A"], events: {}, internalEvents: {}, memory: { n: Flow.input(Schema.Number) }, operations: () => ({}) });
const NM2 = machine(ND2, ({ S }) => ({ default: S.A }));
// @ts-expect-error identity fields encode to strings (OD30 Q6): a number field has no value form
actorRef(NM2, { n: 1 });
const NoIn = machine(definition({ id: "T/NoInput", persist: true, states: ["A"], events: {}, internalEvents: {}, memory: {}, operations: () => ({}) }), ({ S }) => ({ default: S.A }));
// @ts-expect-error a machine with no input can only be a singleton
actorRef(NoIn, {});
const singleton = actorRef(NoIn, "main");
ensureArgs(singleton);
// @ts-expect-error a singleton takes no input at ensure (D4)
ensureArgs(singleton, { input: {} });
declare const runtimeName: string;
// @ts-expect-error a singleton's name is a literal; a runtime string is a type error (OD30 Q4)
actorRef(NoIn, runtimeName);

// Phase 1 E round 3 (Q4 A): `patch` split into `delta` and `row`. A delta must carry the version field; a patch is a prediction only.
const Ticket = entity({ id: "Ticket", fields: { id: Schema.String, title: Schema.String, revision: Schema.Number, note: Schema.optional(Schema.String) }, primaryKey: ["id"], version: "revision" });
type TicketEvent = { readonly title: string; readonly revision: number };
changesOf((e: TicketEvent) => [Ticket.delta({ id: "t1" }, { title: e.title, revision: e.revision }), Ticket.row({ id: "t1", title: e.title, revision: e.revision }), Ticket.delete({ id: "t1" }, { version: e.revision })]);
predictionsOf((i: { readonly title: string }) => [Ticket.patch({ id: "t1" }, { title: i.title })]);
// @ts-expect-error a delta without the version field
Ticket.delta({ id: "t1" }, { title: "x" });
// @ts-expect-error a patch in a `listen` mapper: a prediction is not a server's change
changesOf((e: TicketEvent) => [Ticket.patch({ id: "t1" }, { title: e.title })]);
// @ts-expect-error a delta in `.predicts`: a server's change is not a prediction
predictionsOf((i: { readonly title: string }) => [Ticket.delta({ id: "t1" }, { title: i.title, revision: 1 })]);
// @ts-expect-error a row is whole: a required field missing is a type error (an optional one may be left out, and is then absent)
Ticket.row({ id: "t1", title: "x" });
// @ts-expect-error a removal's version is the version field's type
Ticket.delete({ id: "t1" }, { version: "3" });
// @ts-expect-error a patch names no key field
Ticket.patch({ id: "t1" }, { id: "t2" });

// Phase 1 migration (2.7.15, Q2 A): `O.x.previous[i]` takes release i's key, by its own fields, and only declared releases exist.
const rekeyed = transaction({ id: "t/rekeyed", input: { k: Schema.String, rev: Schema.String }, key: ["k", "rev"], previous: [{ key: { k: Schema.String } }], concurrency: "reject", commit: () => Effect.void });
const RD = definition({ id: "T/Rekeyed", persist: true, states: ["A"], events: { Go: {} }, internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, memory: {}, operations: ({ E }) => ({ r: rekeyed.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) });
machine(RD, ({ S, O }) => {
  // @ts-expect-error release 1's key has no `rev`: the current key's shape is not an earlier one
  void O.r.previous[0].cancel(() => ({ rev: "1" }));
  // @ts-expect-error one earlier key is declared, so there is no `previous[1]`
  void O.r.previous[1];
  return { default: S.A, on: { Go: { actions: [O.r.previous[0].cancel(() => ({ k: "a" })), O.r.previous[0].retry(() => ({ k: "a" }))] }, Ok: {}, No: {}, Unsure: {} } };
});
