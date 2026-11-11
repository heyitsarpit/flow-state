import { Schema } from "effect";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const S = Schema;

export const R15KeyedId = "Lab/R15Keyed";
const keyedWrite = transaction({ id: "lab/r15Keyed", input: { k: S.String }, key: ["k"], concurrency: "serialize", services: [FakeApi], commit: write("keyed") });
const keyed = definition({
  id: R15KeyedId,
  persist: true,
  states: ["A", "W"],
  events: { Go: { k: S.String } },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({ keyed: keyedWrite.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const keyedFx = fixture(
  machine(keyed, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.keyed.commit(({ event }) => ({ k: event.k }))] },
      Ok: { actions: [O.keyed.cancel] },
      No: St.W,
      Unsure: St.W,
    },
  })),
);
export const r15KeyedFixture = () => keyedFx;

export const R15RejectId = "Lab/R15Reject";
const rejectWrite = transaction({ id: "lab/r15Reject", input: { k: S.String }, key: ["k"], concurrency: "reject", services: [FakeApi], commit: write("rej") });
const reject = definition({
  id: R15RejectId,
  persist: true,
  states: ["A", "W", "B"],
  events: { Go: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({ rej: rejectWrite.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const rejectFx = fixture(
  machine(reject, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.rej.commit(() => ({ k: "a" }))] },
      Ok: St.B,
      No: { actions: [O.rej.cancel] },
      Unsure: St.W,
    },
  })),
);
export const r15RejectFixture = () => rejectFx;

export const R15FailId = "Lab/R15Fail";
const declining = transaction({
  id: "lab/r15Fail",
  input: { k: S.String },
  key: ["k"],
  concurrency: "serialize",
  services: [FakeApi],
  commit: write<unknown, "Declined">("declining"),
});
const fail = definition({
  id: R15FailId,
  persist: true,
  states: ["A", "W"],
  events: { Go: { k: S.String } },
  internalEvents: { Ok: {}, Fail: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({ declining: declining.outcomes({ success: E.Ok, failure: { Declined: E.Fail }, unknown: E.Unsure }) }),
});
const failFx = fixture(
  machine(fail, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.declining.commit(({ event }) => ({ k: event.k }))] },
      Ok: St.A,
      Fail: { actions: [O.declining.cancel] },
      Unsure: St.W,
    },
  })),
);
export const r15FailFixture = () => failFx;

export const R15HeldId = "Lab/R15Held";
const holding = transaction({ id: "lab/r15Held", input: { k: S.String }, key: ["k"], concurrency: "serialize", services: [FakeApi], commit: write("holding") });
const held = definition({
  id: R15HeldId,
  persist: true,
  states: ["A", "W"],
  events: { Go: { k: S.String }, GoBad: { k: S.String } },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({ holding: holding.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const heldFx = fixture(
  machine(held, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.holding.commit(({ event }) => ({ k: event.k }))] },
      GoBad: { actions: [O.holding.commit(({ event }) => ({ k: event.k, big: 1n }) as never)] },
      Ok: St.A,
      No: { actions: [O.holding.cancel] },
      Unsure: St.W,
    },
  })),
);
export const r15HeldFixture = () => heldFx;

export const R15NumId = "Lab/R15Num";
const numIn = definition({ id: R15NumId, persist: true, states: [], events: {}, internalEvents: {}, memory: { n: Flow.input(S.NumberFromString) }, operations: () => ({}) });
const numFx = fixture(machine(numIn, () => ({ default: { node: "root" } })));
export const r15NumFixture = () => numFx;

export const R15NonEmptyId = "Lab/R15NonEmpty";
const nonEmptyIn = definition({ id: R15NonEmptyId, persist: true, states: [], events: {}, internalEvents: {}, memory: { s: Flow.input(S.NonEmptyString) }, operations: () => ({}) });
const nonEmptyFx = fixture(machine(nonEmptyIn, () => ({ default: { node: "root" } })));
export const r15NonEmptyFixture = () => nonEmptyFx;
