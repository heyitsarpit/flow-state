// Round 15: the design rulings the runtime still owed (OD48). `Lab/R15Late`: rule 15's cancel exemption over a head promoted at settlement. A commit per
// `Go`, re-entering W; after `Cancelling`, the late `Ok` handler cancels the lane it leaves (key-less).
import { Schema } from "effect";
import { definition, deny, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

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
      Unsure: { target: St.A, actions: [O.charge.cancel] },
    },
  })),
);
export const r15LateFixture = () => lateFx;
