// Review H2: a typed `Schema.Date` must survive a reload. Goes through the adapter, as any runtime would. bun round-9/typed/date-check.ts
import { Effect, Schema } from "effect";
import { makeHarness } from "../../conformance/drive.ts";
import type { Fixture } from "../../conformance/harness.ts";
import { port } from "../adapter.ts";
import { definition, Flow, machine, transaction } from "./flow.ts";

const save = transaction({ id: "t/save", input: { id: Schema.String }, key: ["id"], concurrency: "reject", commit: () => Effect.void });
const D = definition({
  id: "T/Date",
  states: { A: {} },
  events: { Touch: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: {} },
  memory: { at: Flow.initial(Schema.Date, new Date(0)), n: Flow.initial(Schema.Number, Number.NaN), big: Flow.initial(Schema.BigInt, 1n) },
  operations: ({ E }) => ({ save: save.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const M = machine(D, ({ S }) => ({
  default: S.A,
  on: { Touch: { updateMemory: () => ({ at: new Date(86_400_000), big: 2n }) }, Ok: {}, No: {}, Unsure: {} },
}));
const f: Fixture = { id: "T/Date", make: () => M.compiled };
const h = makeHarness(port)();
const A = { actor: "T/Date", id: "a" };
h.start({ machines: [f], seed: 1 });
h.do({ ensure: A });
h.do({ send: A, event: "Touch", payload: {} });
h.do({ reload: true });
const m = h.read.memory(A) as any;
const ok = m?.at instanceof Date && m.at.getTime() === 86_400_000 && Number.isNaN(m.n) && m.big === 2n;
console.log(ok ? "PASS" : "FAIL", String(m?.at), m?.n, String(m?.big), JSON.stringify(h.read.issues()));
process.exit(ok ? 0 : 1);
