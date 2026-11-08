// Round 15: the design rulings the runtime still owed (OD48). `Lab/R15Late`: rule 15's cancel exemption over a head promoted at settlement. A commit per
// `Go`, re-entering W; after `Cancelling`, the late `Ok` handler cancels the lane it leaves (key-less).
import { Schema } from "effect";
import { definition, deny, Flow, machine, transaction } from "../compile/index.ts";
import type { Compiled } from "../fixtures/compiled.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import type { Fixture } from "../harness.ts";
import { FakeApi, fixture, write } from "./lab.ts";
import { keyStampFixture } from "./round13.ts";

const S = Schema;
export const R15LateId = "Lab/R15Late";
const charge = transaction({ id: "lab/r15Charge", input: { who: S.Unknown }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("charge") });
const late = definition({
  id: R15LateId,
  states: ["A", "W"],
  events: { Go: {}, Cancelling: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: { cancelling: Flow.initial(S.Boolean, false) },
  operations: ({ E }) => ({ charge: charge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const lateFx = fixture(
  machine(late, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.charge.commit(() => ({ who: "a" }))] },
      Cancelling: { updateMemory: () => ({ cancelling: true }) },
      Ok: [{ guard: [({ memory }) => memory.cancelling || deny("plain")], target: St.A, actions: [O.charge.cancel] }, { target: St.A }],
      No: St.A,
      Unsure: [{ guard: [({ memory }) => memory.cancelling || deny("plain")], target: St.A, actions: [O.charge.cancel] }, { target: St.A }],
    },
  })),
);
export const r15LateFixture = () => lateFx;

// Rule 15 as ruled for round 15 (R1): an author who gives up live work cancels it in an alternative that stays put, so the work ends as a current ending
// and the current activation moves. `Unsure` (late) stays and cancels the lane twice: the first releases its own hold, the second cancels the promoted head.
export const R15StayId = "Lab/R15Stay";
const stay = definition({
  id: R15StayId,
  states: ["A", "W"],
  events: { Go: {}, Drop: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({ charge: charge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const stayFx = fixture(
  machine(stay, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.charge.commit(() => ({ who: "a" }))] },
      Ok: St.A,
      No: St.A,
      Unsure: { actions: [O.charge.cancel, O.charge.cancel] },
      Drop: { actions: [O.charge.cancel] },
    },
  })),
);
export const r15StayFixture = () => stayFx;

// U17's stamp across a Flow upgrade (R3): release 0 is the same machine as KeyStamp's release 1, compiled by a Flow from before Schema versions joined the
// stamp (no `keyVersion`), so its lanes are stamped with bare field names.
export const preVersionStampFixture = (rel: Release): Fixture => {
  const fx = keyStampFixture(rel);
  const bare = (c: Compiled): Compiled => ({ ...c, ops: Object.fromEntries(Object.entries(c.ops).map(([k, { keyVersion: _v, ...o }]) => [k, o])) });
  return { ...fx, make: (api) => (rel.v === 0 ? bare(fx.make(api)) : fx.make(api)) };
};
