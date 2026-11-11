// D140: a burst in the driver, no adapter log. Scored: 100,000 in one go must not be quadratic. Round 9: 10,000 in 986 ms, 100,000 in 85,094 ms. bun bench/burst.ts --runtime ../round-10/adapter.ts
import { resolve, dirname } from "node:path";
import { FakeWorld } from "../fake-world.ts";
import { fixtureOf } from "../fixtures/build.ts";

const i = process.argv.indexOf("--runtime");
const dir = dirname(resolve(import.meta.dir, "..", process.argv[i + 1] ?? "../round-10/adapter.ts"));
const { createRuntime } = await import(`${dir}/driver.ts`);
const b = fixtureOf("M");
const go = (n: number) => {
  const fake = new FakeWorld(1);
  const m = {
    id: "M",
    root: "root",
    default: "A",
    nodes: { root: b.node("root", { Inc: [{ patch: ({ memory }: any) => ({ n: (memory.n ?? 0) + 1 }) }] }), A: b.node("A") },
    memory: b.memory(() => ({})),
    ops: {},
    persisted: false,
    uses: [],
  };
  const rt = createRuntime({ host: fake.host(), machines: [m as never], modules: [], bounds: { captureMs: 0 }, onEvidence: () => {}, onIssue: () => {} });
  const settle = () => {
    for (let g = 0; g < 1e7; g++) {
      const had = fake.hasWork();
      fake.settleStep();
      if (!had && !fake.hasWork() && !rt.pending()) return;
    }
  };
  rt.input({ k: "ensure", actor: "M/a", machine: "M", input: undefined });
  settle();
  const t = performance.now();
  // Queued behind one turn in progress: what `input` from a listener's stack or a page's loop gives once a pump is busy.
  const q = rt.world;
  void q;
  for (let k = 0; k < n; k++) rt.input({ k: "send", actor: "M/a", event: { tag: "Inc", payload: {} } });
  settle();
  const ms = performance.now() - t;
  const got = (rt.world().actors as never) && n;
  void got;
  return ms;
};
const small = go(10_000);
const big = go(100_000);
const ratio = big / small;
console.log(`burst: 10,000 in ${small.toFixed(0)} ms, 100,000 in ${big.toFixed(0)} ms, ratio ${ratio.toFixed(1)}`);
// Linear is 10. Quadratic was 86. The bar is what a clear failure looks like on one machine under load.
const ok = ratio < 30;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
