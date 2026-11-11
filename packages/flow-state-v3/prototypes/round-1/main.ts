// Measurement only. bun packages/flow-state-v3/prototypes/round-1/main.ts. Bun, this Mac, one process, labelled in RESULTS.
import { makeHarness } from "./adapter.ts";
import { FakeWorld } from "../conformance/fake-world.ts";
import { payFixture } from "../conformance/fixtures/pay.compiled.ts";
import { A, CART } from "../conformance/scenarios/pay.scenario.ts";
import { persistence } from "./persistence.ts";
import { emptyWorld, step } from "./step.ts";
import type { Env, Input, Machines, Module, World } from "./world.ts";

const fake = new FakeWorld(1);
const compiled = payFixture.make(fake.api);
const machines: Machines = { [compiled.id]: compiled };
const actor = `${A.actor}/${A.id}`;
const env: Env = { now: 0, id: () => "x" };

const bench = (name: string, modules: readonly Module[], N: number) => {
  let w: World = emptyWorld;
  const go = (i: Input) => (w = step(w, i, env, machines, modules).world);
  go({ k: "boot", records: [] });
  go({ k: "ensure", actor, machine: compiled.id, input: {} });
  go({ k: "send", actor, event: { tag: "Start", payload: CART } });
  go({ k: "turn" });
  const samples: number[] = [];
  for (let round = 0; round < 5; round++) {
    const t0 = performance.now();
    for (let n = 0; n < N; n++) {
      go({ k: "send", actor, event: { tag: "CardChosen", payload: { paymentMethodId: `m${n}` } } });
      go({ k: "turn" });
    }
    samples.push(((performance.now() - t0) / N) * 1000);
  }
  samples.sort((a, b) => a - b);
  console.log(
    `${name.padEnd(46)} median ${samples[2]!.toFixed(2)} us/turn  (min ${samples[0]!.toFixed(2)}, max ${samples[4]!.toFixed(2)}, N=${N} x5)`,
  );
};
console.log(`bun ${Bun.version}`);
bench("event turn, one actor, no module", [], 50_000);
bench("event turn, one actor, persistence captures", [persistence], 50_000);

const paidPath = () => {
  const h = makeHarness();
  h.start({ machines: [payFixture], seed: 1 });
  h.do({ ensure: A });
  h.do({ send: A, event: "Start", payload: CART });
  h.do({ send: A, event: "PayRequested", payload: { paymentMethodId: "v" } });
  h.do({ storage: "ack" });
  h.do({ answer: "pay", with: { ok: { status: "requires_capture", clientSecret: "" } } });
  h.do({ storage: "ack" });
  h.do({ answer: "place", with: { ok: { orderId: "o1" } } });
  if (h.read.state(A) !== "PAID") throw new Error("not paid");
};
const t0 = performance.now();
for (let i = 0; i < 2000; i++) paidPath();
console.log(
  `whole paid path through harness, real fibers: ${(((performance.now() - t0) / 2000) * 1000).toFixed(0)} us per run (7 do(), 2 fibers, N=2000)`,
);

// The stuck worlds SEARCH-PAY's probe found, as plain traces.
const trace = (
  name: string,
  steps: ReadonlyArray<Parameters<ReturnType<typeof makeHarness>["do"]>[0]>,
  advance = 3_600_000,
) => {
  const h = makeHarness();
  h.start({ machines: [payFixture], seed: 1 });
  h.do({ ensure: A });
  h.do({ send: A, event: "Start", payload: CART });
  for (const s of steps) h.do(s);
  const before = h.read.requests().length;
  h.do({ advance });
  console.log(
    `${name}: state ${h.read.state(A)}, row ${JSON.stringify(h.read.row(A, "pay", { intentId: "pi1" }))}, new requests after ${advance} ms ${h.read.requests().length - before}, charges ${h.read.truth().charges}, authorized ${h.read.memory(A).authorized}, waits ${JSON.stringify(h.read.quiet().waits)}`,
  );
};
const pay = { send: A, event: "PayRequested", payload: { paymentMethodId: "v" } };
const CAP = { ok: { status: "requires_capture", clientSecret: "" } };
trace("press Pay in UNSURE", [
  pay,
  { storage: "ack" },
  { answer: "pay", with: { lost: true } },
  pay,
]);
trace("late Confirmed in a new PAYING", [
  pay,
  { storage: "ack" },
  { send: A, event: "Leave", payload: {} },
  { send: A, event: "Start", payload: CART },
  pay,
  { answer: "pay", with: CAP },
]);
trace("throwing guard on Confirmed, then Leave", [
  pay,
  { storage: "ack" },
  { fault: { throwIn: "states.PAYING.on.Confirmed[1].guard[0]" } },
  { answer: "pay", with: CAP },
  { send: A, event: "Leave", payload: {} },
]);
trace(
  "a module throws on the step of the only completion (D10), read at once",
  [pay, { storage: "ack" }, { fault: { throwInModule: "onCommit" } }, { answer: "pay", with: CAP }],
  0,
);
trace(
  "the same, 61 s later",
  [pay, { storage: "ack" }, { fault: { throwInModule: "onCommit" } }, { answer: "pay", with: CAP }],
  61_000,
);
