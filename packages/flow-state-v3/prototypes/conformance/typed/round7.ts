// Round 11: `fixtures/round7.compiled.ts`, written in the public API. The same machines, ids, events and behaviour; the hand file stays as prior art.
import { Effect, Schema } from "effect";
import { deny, definition, Flow, machine, trait, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

export const BareId = "Lab/Bare";
const S = Schema;
const charge = transaction({
  id: "lab/charge",
  input: { who: S.Unknown },
  key: [],
  concurrency: "reject",
  services: [FakeApi], commit: write("charge"),
});
const bare = (persisted: boolean) => {
  const d = definition({
    id: BareId,
    states: ["A", "W", "B", "U"],
    events: {
      Go: {}, GoBad: {}, IfIdle: {}, Retry: {}, Forget: {}, Note: { text: S.String }, Peek: {}, NoteBad: {}, NoteGetter: {},
    },
    internalEvents: { Ok: { value: S.Unknown }, No: {}, Unsure: Flow.uncertain({}) },
    memory: {
      note: Flow.initial(S.Unknown, ""),
      noteCopy: Flow.initial(S.Unknown, ""),
      peeks: Flow.initial(S.Number, 0),
      last: Flow.initial(S.Unknown, null),
      who: Flow.input(S.Unknown.pipe(S.withDecodingDefaultKey(Effect.succeed("a")), S.withConstructorDefault(Effect.succeed("a")))), // D222: creation's default, and restore's
    },
    persisted,
    operations: ({ E }) => ({
      charge: charge.outcomes({ success: E.Ok.from((v: unknown) => ({ value: v })), failure: { NotSent: E.No }, unknown: E.Unsure }),
    }),
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.charge.commit(({ memory }) => ({ who: memory.who }))] },
      // A value the door refuses, on purpose: the contract's input says otherwise, so only a cast writes it (finding F1).
      GoBad: { target: St.W, actions: [O.charge.commit(() => ({ big: 1n }) as never)] },
      // A real guard on the lane: `idle`, so a quarantined lane's hold is read by a token (D88).
      IfIdle: [{ guard: [O.charge.idle(() => ({}))], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
      Retry: { actions: [O.charge.retry(() => ({}))] },
      Forget: { target: St.A, actions: [O.charge.cancel(() => ({}))] },
      Note: { updateMemory: ({ event }) => ({ note: event.text, noteCopy: event.text }) },
      // Oracle (d) of SEARCH-FLUSH: `note` and `noteCopy` change only together, so a guard that sees them differ saw two turns.
      Peek: [{ guard: [({ memory }) => memory.note === memory.noteCopy || deny("Mixed")], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
      NoteBad: { updateMemory: () => ({ note: 1n }) },
      // Review M11: a class instance with a throwing own getter, from a patch. Not a memory value any Schema decodes (finding F1).
      NoteGetter: {
        updateMemory: () =>
          Object.defineProperty(new (class Odd {})(), "note", {
            enumerable: true,
            get() {
              throw new Error("a getter");
            },
          }) as never,
      },
      Ok: { target: St.B, updateMemory: ({ event }) => ({ last: event.value ?? null }) },
      No: St.A,
      Unsure: St.U,
    },
  }));
};
const bareP = fixture(bare(true));
const bareU = fixture(bare(false));
export const bareFixture = (o: { persisted?: boolean } = {}) => ((o.persisted ?? true) ? bareP : bareU);

// The same for a fragment: a trait with a write and a pair, resumable, on a persisted host that can leave it.
export const FragPairId = "Lab/FragPair";
const put = transaction({ id: "lab/put", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write("put") });
const PairTrait = trait(
  {
    id: "PairTrait",
    events: { Set: { n: S.Number }, Peek: {}, Go: {}, Retry: {}, Forget: {} },
    internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
    memory: { a: Flow.initial(S.Number, 0), b: Flow.initial(S.Number, 0), peeks: Flow.initial(S.Number, 0) },
    operations: ({ E }) => ({ put: put.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
  },
  ({ O }) => ({
    on: {
      Set: { updateMemory: ({ event }) => ({ a: event.n, b: event.n }) },
      Peek: [{ guard: [({ memory }) => memory.a === memory.b || deny("Mixed")], updateMemory: ({ memory }) => ({ peeks: memory.peeks + 1 }) }, {}],
      Go: { actions: [O.put.commit(() => ({}))] },
      Retry: { actions: [O.put.retry(() => ({}))] },
      Forget: { actions: [O.put.cancel(() => ({}))] },
      Ok: {},
      No: {},
      Unsure: {},
    },
  }),
);
const pair = definition({
  id: FragPairId,
  states: [{ TAB: Flow.state({ traits: { t: PairTrait.resumable() } }) }, "AWAY"],
  events: { Away: {}, Back: {} },
  internalEvents: {},
  memory: {},
  operations: () => ({}),
});
export const fragPairFixture = fixture(
  machine(pair, ({ S: St }) => ({
    default: St.TAB,
    on: { Away: St.AWAY, Back: St.TAB },
  })),
);
