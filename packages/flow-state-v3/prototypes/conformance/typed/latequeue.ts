// Round 14 finish: rule 15's late-ending clause over a `serialize` queue. A commit per `Go`, re-entering W; `Away` leaves W for B; after
// `Cancelling`, `Unsure`'s late handler cancels the lane it leaves (key-less).
import { Schema } from "effect";
import { definition, deny, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
export const LateQueueId = "Lab/LateQueue";
const charge = transaction({ id: "lab/lateCharge", input: { who: S.Unknown }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("charge") });
const d = definition({
  id: LateQueueId,
  states: ["A", "W", "B"],
  events: { Go: {}, Away: {}, Cancelling: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: { cancelling: Flow.initial(S.Boolean, false) },
  operations: ({ E }) => ({ charge: charge.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const fx = fixture(
  machine(d, ({ S: St, O }) => ({
    default: St.A,
    on: {
      Go: { target: St.W, actions: [O.charge.commit(() => ({ who: "a" }))] },
      Away: St.B,
      Cancelling: { updateMemory: () => ({ cancelling: true }) },
      Ok: St.B,
      No: St.A,
      Unsure: [{ guard: [({ memory }) => memory.cancelling || deny("plain")], target: St.A, actions: [O.charge.cancel] }, { target: St.A }],
    },
  })),
);
export const lateQueueFixture = () => fx;
