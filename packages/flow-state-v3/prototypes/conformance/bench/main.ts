// The shared benchmark: bun conformance/watch.ts -- bun conformance/bench/main.ts --runtime ../round-6/adapter.ts --out ../round-6/bench.json
// Turn cost at 1, 1,000 and 10,000 actors, `seal`, persisted encode per turn at growing memory, bundle sizes. S4 is s4-run.ts, in a browser.
// A later round passes its own --runtime. A runtime keeps `driver.ts` beside its adapter; `gate.ts` if it seals.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { Scheduler } from "effect";
import type { Api } from "../fake-world.ts";
import { ringFixture } from "../fixtures/order.compiled.ts";
import { growActor, growMachine, message } from "./fixture.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const adapter = resolve(import.meta.dir, arg("--runtime", "../../round-6/adapter.ts"));
const dir = dirname(adapter);
const { createRuntime } = await import(join(dir, "driver.ts"));
const api = { call: () => undefined } as unknown as Api;
const host = (writes: { n: number; bytes: number }) => ({
  now: () => performance.now(),
  id: (() => {
    let i = 0;
    return () => `att-${++i}`;
  })(),
  setTimer: () => () => {},
  later: (f: () => void) => void queueMicrotask(f),
  scheduler: new Scheduler.MixedScheduler(),
  storage: {
    load: () => new Map(),
    write: (w: ReadonlyArray<{ value?: string }>, _p: unknown, then?: (ok: boolean) => void) => {
      writes.n++;
      for (const x of w) writes.bytes += x.value?.length ?? 0;
      then?.(true);
    },
  },
});
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const out: Record<string, unknown> = {
  runtime: adapter,
  bun: Bun.version,
  date: new Date().toISOString(),
};

// ── Turn cost: a plain turn, one send, on one of N actors.
const turnCost = (actors: number) => {
  const m = ringFixture.make(api);
  const rt = createRuntime({
    host: host({ n: 0, bytes: 0 }),
    machines: { [m.id]: m },
    modules: [],
    onEvidence: () => {},
    onIssue: () => {},
  });
  for (let i = 0; i < actors; i++)
    rt.input({ k: "ensure", actor: `Ring/${i}`, machine: "Ring", input: {} });
  const N = actors >= 10_000 ? 500 : 5000;
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t = performance.now();
    for (let i = 0; i < N; i++)
      rt.input({
        k: "send",
        actor: `Ring/${i % actors}`,
        event: { tag: "JobUnsure", payload: {} },
      });
    runs.push(((performance.now() - t) / N) * 1000);
  }
  return Math.round(median(runs) * 100) / 100;
};
out["turnUs"] = Object.fromEntries([1, 1000, 10_000].map((a) => [a, turnCost(a)]));

// ── `seal`.
if (existsSync(join(dir, "gate.ts"))) {
  const { seal } = await import(join(dir, "gate.ts"));
  const { deskListenFixture } = await import("../fixtures/desk.compiled.ts");
  const { payFixture } = await import("../fixtures/pay.compiled.ts");
  const each = (make: () => unknown) => {
    const runs: number[] = [];
    for (let r = 0; r < 5; r++) {
      const t = performance.now();
      for (let i = 0; i < 200; i++) seal(make());
      runs.push(((performance.now() - t) / 200) * 1000);
    }
    return Math.round(median(runs) * 10) / 10;
  };
  out["sealUs"] = {
    pay: each(() => payFixture.make(api)),
    desk: each(() => deskListenFixture.make(api)),
    note: "building the fixture is included; make() alone is below",
  };
  const make = (f: () => unknown) => {
    const t = performance.now();
    for (let i = 0; i < 1000; i++) f();
    return Math.round(((performance.now() - t) / 1000) * 1000 * 10) / 10;
  };
  (out["sealUs"] as any).makePay = make(() => payFixture.make(api));
  (out["sealUs"] as any).makeDesk = make(() => deskListenFixture.make(api));
}

// ── Persisted encode per turn at growing memory. Host writes go nowhere: this is the turn's own cost, what a click pays on the main thread.
const encodeCost = (size: number, persisted: boolean, bounds?: object) => {
  const writes = { n: 0, bytes: 0 };
  const m = growMachine(size, persisted);
  const rt = createRuntime({
    host: host(writes),
    machines: { [m.id]: m },
    modules: [],
    bounds: bounds ?? {},
    onEvidence: () => {},
    onIssue: () => {},
  });
  rt.input({ k: "ensure", actor: growActor, machine: m.id, input: {} });
  const turns = size >= 50_000 ? 40 : size >= 10_000 ? 100 : 400;
  const runs: number[] = [];
  let seq = size;
  for (let r = 0; r < 5; r++) {
    const t = performance.now();
    for (let i = 0; i < turns; i++)
      rt.input({
        k: "send",
        actor: growActor,
        event: { tag: "Add", payload: { message: message(seq++) } },
      });
    runs.push((performance.now() - t) / turns);
  }
  return { ms: Math.round(median(runs) * 1000) / 1000, writes: writes.n };
};
const sizes = [100, 1000, 10_000, 50_000];
out["valueMs"] = {
  note: "one value appended, a whole turn. The machine's own array copy is included in all columns.",
  notPersisted: Object.fromEntries(sizes.map((s) => [s, encodeCost(s, false).ms])),
  persistedAtOnce: Object.fromEntries(
    sizes.map((s) => [s, encodeCost(s, true, { captureMs: 0 }).ms]),
  ),
  persistedCoalesced: Object.fromEntries(
    sizes.map((s) => [s, encodeCost(s, true, { captureMs: 100 }).ms]),
  ),
};

// ── Bundles: bun build --minify, gzip, effect external.
const bundle = async (entries: string[]) => {
  const r = await Bun.build({
    entrypoints: entries.map((e) => join(dir, e)).filter(existsSync),
    target: "browser",
    minify: true,
    external: ["effect"],
    format: "esm",
  });
  if (!r.success) throw new Error("bundle");
  let raw = 0;
  let gz = 0;
  for (const o of r.outputs) {
    const b = new Uint8Array(await o.arrayBuffer());
    raw += b.length;
    gz += gzipSync(b).length;
  }
  return { rawKB: Math.round(raw / 102.4) / 10, gzipKB: Math.round(gz / 102.4) / 10 };
};
const core = await bundle(["driver.ts"]);
const withEntities = await bundle(["driver.ts", "entities.ts"]);
out["bundle"] = {
  coreWithDriver: core,
  entities: await bundle(["entities.ts"]),
  sessions: await bundle(["sessions.ts"]),
  coreAndEntities: withEntities,
};
const text = JSON.stringify(out, null, 1);
console.log(text);
const dest = arg("--out", "");
if (dest) writeFileSync(resolve(import.meta.dir, dest), text + "\n");
void gzipSync;
