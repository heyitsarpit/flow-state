// Round 15: the design rulings the runtime still owed (OD48). `Lab/R15Late`: rule 15 with no cancel exemption (R1): a commit per `Go`, re-entering W;
// after `Cancelling`, the late `Ok` handler cancels the lane it leaves (key-less), and is denied while the lane holds work of the exited activation.
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
  persist: true,
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
// and the current activation moves. `Unsure` (late) stays and cancels the whole lane (Q3 A, `cancelAll`): its own hold is released and every queued commit
// ends NotSent { Cancelled }.
export const R15StayId = "Lab/R15Stay";
const stay = definition({
  id: R15StayId,
  persist: true,
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
      Unsure: { actions: [O.charge.cancelAll] },
      Drop: { actions: [O.charge.cancel] },
    },
  })),
);
export const r15StayFixture = () => stayFx;

// Q5 A: `persist` is opt-in. The same machine as R15Stay with no `persist` on its definition.
export const R15PlainId = "Lab/R15Plain";
const plainFx = fixture(
  machine(
    definition({ id: R15PlainId, states: ["A", "W"], events: { Go: {} }, internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, memory: {}, operations: ({ E }) => ({ charge: charge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }),
    ({ S: St, O }) => ({ default: St.A, on: { Go: { target: St.W, actions: [O.charge.commit(() => ({ who: "a" }))] }, Ok: St.A, No: St.A, Unsure: St.A } }),
  ),
);
export const r15PlainFixture = () => plainFx;

// C153: `concurrency: "cancel"`, 2.7.13's table for the policy that does not hold. One unkeyed lane; `Unsure` re-sends (key-less) while `retrying`.
export const R15SwitchId = "Lab/R15Switch";
const search = transaction({ id: "lab/r15Search", input: { q: S.String }, key: [], concurrency: "cancel", services: [FakeApi], commit: write("search") });
const switchFx = fixture(
  machine(
    definition({
      id: R15SwitchId,
      persist: true,
      states: ["A", "W"],
      events: { Go: { q: S.String }, Retrying: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: { retrying: Flow.initial(S.Boolean, false), oks: Flow.initial(S.Number, 0) },
      operations: ({ E }) => ({ search: search.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({
      default: St.A,
      on: {
        Go: { target: St.W, actions: [O.search.commit(({ event }) => ({ q: event.q }))] },
        Retrying: { updateMemory: () => ({ retrying: true }) },
        Ok: { target: St.A, updateMemory: ({ memory }) => ({ oks: memory.oks + 1 }) },
        No: St.A,
        Unsure: [{ guard: [({ memory }) => memory.retrying || deny("plain")], actions: [O.search.retry] }, { target: St.A }],
      },
    }),
  ),
);
export const r15SwitchFixture = () => switchFx;

// U17's stamp across a Flow upgrade (R3): release 0 is the same machine as KeyStamp's release 1, compiled by a Flow from before Schema versions joined the
// stamp (no `keyVersion`), so its lanes are stamped with bare field names.
export const preVersionStampFixture = (rel: Release): Fixture => {
  const fx = keyStampFixture(rel);
  const bare = (c: Compiled): Compiled => ({ ...c, ops: Object.fromEntries(Object.entries(c.ops).map(([k, { keyVersion: _v, ...o }]) => [k, o])) });
  return { ...fx, make: (api) => (rel.v === 0 ? bare(fx.make(api)) : fx.make(api)) };
};
