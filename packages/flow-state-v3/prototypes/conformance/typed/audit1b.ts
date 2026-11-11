// Audit 1b's cases (the re-audit of rounds 14-15b and area H): fixtures, each for a design sentence an auditor's wrong runtime broke with the suite green.
import { Schema } from "effect";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
// Rule 15: "A call started in a late turn is an ordinary call with its own owner: lateness is not transitive". `Go` commits `charge` owned by W;
// `Leave` exits W for B, so its `Ok` is late and routes from the root, whose `Ok` stays put and commits `note` (owned by the root, alive). `note`'s
// `Noted` is then current and routes from the active leaf, B.
export const A1bTransId = "Lab/A1bTrans";
const tCharge = transaction({ id: "lab/a1bCharge", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("charge") });
const tNote = transaction({ id: "lab/a1bNote", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("note") });
const transFx = fixture(
  machine(
    definition({
      id: A1bTransId,
      persist: false,
      states: ["A", "W", "B"],
      events: { Go: {}, Leave: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}), Noted: {}, NoteFailed: {}, NoteUnsure: Flow.uncertain({}) },
      memory: { noted: Flow.initial(S.String, "") },
      operations: ({ E }) => ({
        charge: tCharge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }),
        note: tNote.outcomes({ success: E.Noted, failure: { NotSent: E.NoteFailed }, unknown: E.NoteUnsure }),
      }),
    }),
    ({ S: St, O }) => ({
      default: St.A,
      on: {
        Go: { target: St.W, actions: [O.charge.commit(() => ({ n: 1 }))] },
        Leave: St.B,
        Ok: { actions: [O.note.commit(() => ({ n: 2 }))] },
        No: {},
        Unsure: {},
        Noted: { updateMemory: () => ({ noted: "root" }) },
        NoteFailed: {},
        NoteUnsure: {},
      },
      states: { B: { on: { Noted: { updateMemory: () => ({ noted: "B" }) } } } },
    }),
  ),
);
export const a1bTransFixture = () => transFx;

// Rule 15 / 2.7.13 (F8): "an ending admitted in a turn denied this way still counts as delivered and keeps its lane effect ..., and a hold it leaves
// stays until a later turn's keyed `cancel(k)` or `cancelAll(k)`". LateQueue's shape (a `serialize` commit per `Go`, re-entering W), with `Stop`, a
// `cancelAll` at the root.
export const A1bDenyId = "Lab/A1bDeny";
const dCharge = transaction({ id: "lab/a1bDenyCharge", input: { who: S.Unknown }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("charge") });
const denyFx = fixture(
  machine(
    definition({
      id: A1bDenyId,
      persist: true,
      states: ["A", "W", "B"],
      events: { Go: {}, Stop: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({ charge: dCharge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.A,
      on: { Go: { target: St.W, actions: [O.charge.commit(() => ({ who: "a" }))] }, Stop: { actions: [O.charge.cancelAll] }, Ok: St.B, No: {}, Unsure: St.A },
    }),
  ),
);
export const a1bDenyFixture = () => denyFx;

// Rule 14 (OD49): "so is any other re-entry (a history target, rule 1, is one case). A call the old activation owns is then late when it ends". `Go`
// commits `charge` owned by X; `Reset` targets `P.history` from inside P, so P and X are exited and re-entered. The `Ok` is late (from the root).
export const A1bHistId = "Lab/A1bHist";
const hCharge = transaction({ id: "lab/a1bHistCharge", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("charge") });
const histFx = fixture(
  machine(
    definition({
      id: A1bHistId,
      persist: false,
      states: [{ P: ["X", "Y"] }],
      events: { Go: {}, Reset: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: { heard: Flow.initial(S.String, "") },
      operations: ({ E }) => ({ charge: hCharge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.P,
      on: {
        Go: { target: St.P.X, actions: [O.charge.commit(() => ({ n: 1 }))] },
        Reset: St.P.history,
        Ok: { updateMemory: () => ({ heard: "root" }) },
        No: {},
        Unsure: {},
      },
      states: { P: { default: St.P.X, states: { X: { on: { Ok: { updateMemory: () => ({ heard: "X" }) } } } } } },
    }),
  ),
);
export const a1bHistFixture = () => histFx;

// Rule 15 (OD49): "The live work an alternative would leave is every call owned by an activation it exits: a lookup or write head that is
// `InFlight`, and every queued commit"; "A `Held` head is not live work". `Hold` commits `charge` owned by H; `Start` commits `pay` owned by L;
// `ToM` exits L, so `pay`'s `Paid` is late and routes from H, whose `Paid` leaves H for OUT. It leaves `charge`: live work while InFlight, not once
// Held. The two ops are different, so the check reads other operations' lanes too.
export const A1bHeldId = "Lab/A1bHeld";
const bCharge = transaction({ id: "lab/a1bHeldCharge", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("charge") });
const bPay = transaction({ id: "lab/a1bHeldPay", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("pay") });
const heldFx = fixture(
  machine(
    definition({
      id: A1bHeldId,
      persist: false,
      states: [{ H: ["L", "M"] }, "OUT"],
      events: { Hold: {}, Start: {}, ToM: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}), Paid: {}, PayFailed: {}, PayUnsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({
        charge: bCharge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }),
        pay: bPay.outcomes({ success: E.Paid, failure: { NotSent: E.PayFailed }, unknown: E.PayUnsure }),
      }),
    }),
    ({ S: St, O }) => ({
      default: St.H,
      on: {
        Hold: { target: St.H, actions: [O.charge.commit(() => ({ n: 1 }))] },
        Start: { target: St.H.L, actions: [O.pay.commit(() => ({ n: 2 }))] },
        ToM: St.H.M,
        Ok: {},
        No: {},
        Unsure: {},
        Paid: {},
        PayFailed: {},
        PayUnsure: {},
      },
      states: { H: { default: St.H.L, on: { Paid: St.OUT } } },
    }),
  ),
);
export const a1bHeldFixture = () => heldFx;
