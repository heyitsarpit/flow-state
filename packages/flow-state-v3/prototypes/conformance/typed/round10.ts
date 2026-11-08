// Round 11: round 10's scenario-local `Lab/Let`, written in the public API. Review part two, `letgo-takes-all`: a resumable fragment's unkeyed op has the
// host's subject, so the host's `cancel` reaches a frozen life's lane. Its kept ending must survive the cancel of the ordinary one.
// Not here: round 10's `small(...)` machines (V, M, S, R, N, M/x), whose `Set` writes any key into memory: an open record has no field list (finding F11).
import { Schema } from "effect";
import { definition, Flow, labHostOp, machine, trait, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const job = transaction({ id: "lab/job", input: { id: Schema.Unknown }, key: ["id"], concurrency: "serialize", services: [FakeApi], commit: write("job") });
const LetFrag = trait(
  {
    id: "LetFrag",
    events: { Do: {} },
    internalEvents: { JobOk: {}, JobNo: {}, JobUnsure: Flow.uncertain({}) },
    memory: { heard: Flow.initial(Schema.Number, 0) },
    operations: ({ E }) => ({ job: job.outcomes({ success: E.JobOk, failure: { NotSent: E.JobNo }, unknown: E.JobUnsure }) }),
  },
  ({ O }) => ({
    on: { Do: { actions: [O.job.commit(() => ({ id: "k" }))] }, JobOk: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) }, JobNo: {}, JobUnsure: {} },
  }),
);
const d = definition({
  id: "Lab/Let",
  states: ["A", { F: Flow.state({ traits: { f: LetFrag.resumable() } }) }],
  events: { ToF: {}, Out: {}, Forget: {} },
  internalEvents: {},
  memory: {},
  persist: false,
  operations: () => ({}),
});
// The host's `cancel` of its fragment's op: rule 50 forbids it, so it is the named seam `labHostOp` (D212, finding F3).
export const letFixture = fixture(
  machine(d, ({ S: St }) => ({
    default: St.A,
    on: { ToF: St.F, Out: St.A, Forget: { actions: [labHostOp("job").cancel] } },
  })),
);
