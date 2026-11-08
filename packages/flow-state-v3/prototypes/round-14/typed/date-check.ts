// Review H2: a typed `Schema.Date` must survive a reload. Goes through the adapter, as any runtime would. bun round-9/typed/date-check.ts
import type { Fixture } from "../../conformance/harness.ts";
import { checkItems, stated } from "../../conformance/verdicts/state.ts";

await stated("typed/date-check.ts", async () => {
const { Effect, Schema } = await import("effect");
const { makeHarness } = await import("../../conformance/drive.ts");
const { port } = await import("../adapter.ts");
const { definition, Flow, machine, transaction } = await import("../../conformance/compile/index.ts");
const save = transaction({ id: "t/save", input: { id: Schema.String }, key: ["id"], concurrency: "reject", commit: () => Effect.void });
const D = definition({
  id: "T/Date",
  persist: true,
  states: ["A"],
  events: { Touch: {} },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
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
return checkItems("date", ok ? [] : ["a typed Schema.Date, NaN or BigInt did not survive a reload"]);
});
