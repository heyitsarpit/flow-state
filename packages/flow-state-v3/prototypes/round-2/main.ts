// Measurement only: bun round-2/main.ts. Bun, this Mac, one process. Item 13: what plain copies cost at 1,000 actors, against
// Effect's HashMap for the same operation. A microbenchmark: says nothing about a phone (S4 is that).
import { HashMap } from "effect";
import { FakeWorld } from "../conformance/fake-world.ts";
import { ringFixture } from "../conformance/fixtures/order.compiled.ts";
import { issuesFixture } from "../conformance/fixtures/issues.compiled.ts";
import { entities } from "./entities.ts";
import { step } from "./step.ts";
import { defaultBounds, emptyWorld, type Env, type Input, type World } from "./world.ts";

const fake = new FakeWorld(1);
const ring = ringFixture.make(fake.api);
const issues = issuesFixture.make(fake.api);
const sys = {
  machines: { Ring: ring, [issues.id]: issues },
  modules: [entities],
  bounds: defaultBounds,
};
let n = 0;
const env: Env = { now: 0, id: () => `att-${++n}` };
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const bench = (
  name: string,
  actors: number,
  N: number,
  make: (i: number) => Input[],
  setup: (go: (i: Input) => void) => void = () => {},
) => {
  let w: World = emptyWorld;
  const go = (i: Input) => (w = step(w, i, env, sys).world);
  go({ k: "boot", records: [] });
  for (let i = 0; i < actors; i++)
    go({ k: "ensure", actor: `Ring/${i}`, machine: "Ring", input: {} });
  setup(go);
  const samples: number[] = [];
  for (let round = 0; round < 5; round++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) for (const x of make(i)) go(x);
    samples.push(((performance.now() - t0) / N) * 1000);
  }
  console.log(
    `${name.padEnd(52)} actors ${String(actors).padStart(6)}  median ${median(samples).toFixed(2)} us/turn  (N=${N} x5)`,
  );
};
console.log(`bun ${Bun.version}`);
for (const actors of [1, 100, 1000, 10000]) {
  const N = actors >= 10000 ? 500 : 5000;
  bench("plain turn: send and admit, one actor's memory", actors, N, (i) => [
    { k: "send", actor: `Ring/${i % actors}`, event: { tag: "JobUnsure", payload: {} } },
    { k: "turn" },
  ]);
}
const keys = Array.from({ length: 1000 }, (_, i) => `Ring/${i}`);
const obj: Record<string, { a: number }> = Object.fromEntries(keys.map((k) => [k, { a: 1 }]));
let map = HashMap.empty<string, { a: number }>();
for (const k of keys) map = HashMap.set(map, k, { a: 1 });
const timed = (name: string, f: (i: number) => void, N = 20000) => {
  const s: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) f(i);
    s.push(((performance.now() - t0) / N) * 1000);
  }
  console.log(`${name.padEnd(52)} median ${median(s).toFixed(3)} us`);
};
timed(
  "object spread, replace one of 1,000 keys",
  (i) => void { ...obj, [keys[i % 1000]!]: { a: i } },
  5000,
);
timed(
  "Effect HashMap.set, one of 1,000 keys",
  (i) => void HashMap.set(map, keys[i % 1000]!, { a: i }),
);
