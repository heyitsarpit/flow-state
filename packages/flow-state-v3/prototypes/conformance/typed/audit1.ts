// Audit 1's cases (rounds 14-15b and area H): fixtures, each for a design sentence an auditor's wrong runtime broke with the suite green.
import { Schema } from "effect";
import { definition, Flow, machine, subroutine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
// Q3 A (rule 24, 2.7.13): `cancelAll(k)` takes its key as `cancel` does. A keyed `serialize` op; `AllOf` cancels one key's lane, outside an ending.
export const A1KeyedId = "Lab/A1Keyed";
const kput = transaction({ id: "lab/a1Put", input: { k: S.String, n: S.Number }, key: ["k"], concurrency: "serialize", services: [FakeApi], commit: write("put") });
const keyedFx = fixture(
  machine(
    definition({
      id: A1KeyedId,
      persist: false,
      states: ["A"],
      events: { Go: { k: S.String, n: S.Number }, AllOf: { k: S.String } },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({ put: kput.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.A,
      on: { Go: { actions: [O.put.commit(({ event }) => ({ k: event.k, n: event.n }))] }, AllOf: { actions: [O.put.cancelAll(({ event }) => ({ k: event.k }))] }, Ok: {}, No: {}, Unsure: {} },
    }),
  ),
);
export const a1KeyedFixture = () => keyedFx;

// Rule 43 (R2, OD50): on an unkeyed operation a key-less member names its one lane in every handler, a NotSent ending's included. A `reject` op: a
// second `Go` while the first is on the wire ends NotSent { Rejected }, and that handler's key-less `cancel` names the lane, so the first is cancelled.
export const A1RejectId = "Lab/A1Reject";
const once = transaction({ id: "lab/a1Once", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("once") });
const rejectFx = fixture(
  machine(
    definition({
      id: A1RejectId,
      persist: false,
      states: ["A"],
      events: { Go: { n: S.Number } },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({ once: once.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({ default: St.A, on: { Go: { actions: [O.once.commit(({ event }) => ({ n: event.n }))] }, No: { actions: [O.once.cancel] }, Ok: {}, Unsure: {} } }),
  ),
);
export const a1RejectFixture = () => rejectFx;

// Rule 15: a late turn may not leave a state that owns an active subroutine. `Go` commits from the root into W (W owns it); `Open` moves W to SUB,
// where `A1Mini` runs; the root's `Ok` (late: W is left) would leave SUB.
const Mini = subroutine({ id: "A1Mini", events: { Fin: {} }, exits: { Done: Flow.Exit({}) } }, ({ exits }) => ({ on: { Fin: exits.Done } }));
export const A1SubId = "Lab/A1Sub";
const pay = transaction({ id: "lab/a1Pay", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("pay") });
const subFx = fixture(
  machine(
    definition({
      id: A1SubId,
      persist: false,
      states: ["IDLE", "W", { SUB: Mini }],
      events: { Go: {}, Open: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({ pay: pay.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.IDLE,
      on: { Go: { target: St.W, actions: [O.pay.commit(() => ({ n: 1 }))] }, Ok: St.IDLE, No: St.IDLE, Unsure: St.IDLE },
      states: { W: { on: { Open: St.SUB } }, SUB: { exits: { Done: St.IDLE } } },
    }),
  ),
);
export const a1SubFixture = () => subFx;
