// Round 11, codec/BRIEF.md "What to measure": load, fidelity, bundle size, tools, for each option in `codec.ts`. Bun only; a browser's numbers are `browser.ts`.
// bun round-11/codec/measure.ts [--fixtures]   (--fixtures: every hand and typed machine the suite boots, through `toData`)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import type { Api } from "../../conformance/fake-world.ts";
import { payFixture } from "../../conformance/fixtures/pay.compiled.ts";
import { payFullFixture } from "../../conformance/fixtures/pay-full.compiled.ts";
import { explain } from "../cli/explain.ts";
import { check } from "../cli/check.ts";
import { seal } from "../gate.ts";
import { compilePay, shopFrom } from "../../conformance/typed/pay.ts";
import { provide } from "../../conformance/typed/flow.ts";
import { CompiledData, CompiledLoaded, decodeWith, emitModule, load, toData } from "./codec.ts";

const api = new Proxy({}, { get: () => () => undefined }) as Api;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const time = (f: () => unknown, runs = 200): number => {
  for (let i = 0; i < 20; i++) f();
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    f();
    xs.push(performance.now() - t);
  }
  return median(xs);
};
const ms = (x: number) => `${x.toFixed(3)} ms`;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const gz = (s: string | Uint8Array) => Bun.gzipSync(typeof s === "string" ? new TextEncoder().encode(s) : s).length;
const out: string[] = [];
const say = (l: string) => (console.log(l), out.push(l));

// ── Load: Pay, one machine.
const typedPay = () => provide(compilePay(), shopFrom(api));
const pay = typedPay();
const { data, table, losses } = toData(pay);
const json = JSON.stringify(data);
const strict = { onExcessProperty: "error" } as const;
say(`# Load, Pay (typed): ${Object.keys(pay.nodes).length} nodes, ${table.size} Slots, data ${kb(json.length)} as JSON, losses ${losses.length}`);
say(`in-process   machine() + provide        ${ms(time(typedPay))}`);
say(`in-process   + seal                     ${ms(time(() => seal(typedPay())))}`);
say(`data         JSON.parse                 ${ms(time(() => JSON.parse(json)))}`);
say(`data         JSON.parse + rebind        ${ms(time(() => load(JSON.parse(json), table)))}`);
say(`data         + seal                     ${ms(time(() => seal(load(JSON.parse(json), table))))}`);
say(`data         the table, from machine()  ${ms(time(() => toData(typedPay()).table))}  (what data and module still pay: the closures come from evaluating the definition)`);
const contract = Schema.decodeUnknownSync(CompiledData as never, strict);
const loadedContract = Schema.decodeUnknownSync(CompiledLoaded as never, strict);
const codec = Schema.decodeUnknownSync(decodeWith(table) as never, strict);
say(`schema       contract on data           ${ms(time(() => contract(data), 50))}`);
say(`schema       contract on loaded         ${ms(time(() => loadedContract(pay), 50))}`);
say(`schema       codec, data to Compiled    ${ms(time(() => codec(JSON.parse(json)), 50))}`);
const hand = payFixture.make(api);
say(`hand fixture make()                     ${ms(time(() => payFixture.make(api)))}  (bare commit: not loadable by data or schema)`);

// ── Load: many machines. 50 Pays under 50 ids, as an app with 50 machines would boot.
const N = 50;
const many = () => Array.from({ length: N }, (_, i) => provide(compilePay(`Pay${i}`), shopFrom(api)));
const manyData = many().map((c) => toData(c));
const manyJson = manyData.map((d) => JSON.stringify(d.data));
const manyTable = new Map(manyData.flatMap((d) => [...d.table]));
say(`\n# Load, ${N} machines`);
say(`in-process   ${N}× machine()               ${ms(time(many, 20))}`);
say(`data         ${N}× parse + rebind          ${ms(time(() => manyJson.map((s) => load(JSON.parse(s), manyTable)), 20))}`);
say(`schema       ${N}× contract on data        ${ms(time(() => manyData.map((d) => contract(d.data)), 5))}`);

// ── Load: a fragment-heavy machine. pay-full has ThreeDS and Countdown; hand-written, so data only (its commits are bare: closures are counted as losses).
const full = payFullFixture.make(api);
const fullD = toData(full);
const fullJson = JSON.stringify(fullD.data);
say(`\n# Load, pay-full (hand, 2 fragments): ${fullD.table.size} Slots, data ${kb(fullJson.length)}, losses ${fullD.losses.length} (${[...new Set(fullD.losses.map((l) => l.kind))].join(", ")})`);
say(`data         JSON.parse + rebind        ${ms(time(() => load(JSON.parse(fullJson), fullD.table)))}`);
say(`hand fixture make()                     ${ms(time(() => payFullFixture.make(api)))}`);

// ── Generated module: evaluated by the engine. Each import is of a new file, so none is cached.
const dir = join(import.meta.dir, ".gen");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
(globalThis as Record<string, unknown>)["__codecTable"] = table;
writeFileSync(join(dir, "table.ts"), `export const table = globalThis.__codecTable;\n`);
const src = emitModule(data, { from: "./table.ts", name: "table" });
const K = 30;
for (let i = 0; i < K; i++) writeFileSync(join(dir, `pay${i}.ts`), src);
const xs: number[] = [];
for (let i = 0; i < K; i++) {
  const t = performance.now();
  await import(join(dir, `pay${i}.ts`));
  xs.push(performance.now() - t);
}
say(`\n# Generated module, Pay: source ${kb(src.length)}, gzip ${kb(gz(src))}`);
say(`module       first import (transpile + evaluate)  ${ms(median(xs.slice(5)))}`);
const gen = (await import(join(dir, "pay0.ts"))).default;
say(`module       same shape as in-process: ${JSON.stringify(toData(gen).data) === json}`);
rmSync(dir, { recursive: true, force: true });

// ── Bundle size: what each option ships, minified, `effect` left out (every option ships it).
const bundle = async (entry: string) => {
  const r = await Bun.build({ entrypoints: [entry], minify: true, external: ["effect"], target: "browser" });
  if (!r.success) throw new Error(r.logs.join("\n"));
  const text = await r.outputs[0]!.text();
  return { raw: text.length, gzip: gz(text) };
};
const tmp = join(import.meta.dir, ".bundle");
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, "hand.ts"), `export { payFixture } from "../../../conformance/fixtures/pay.compiled.ts";\n`);
writeFileSync(join(tmp, "typed.ts"), `export { payCompiled } from "../../../conformance/typed/pay.ts";\n`);
writeFileSync(join(tmp, "front.ts"), `export * from "../../../conformance/typed/flow.ts";\n`);
const b = { hand: await bundle(join(tmp, "hand.ts")), typed: await bundle(join(tmp, "typed.ts")), front: await bundle(join(tmp, "front.ts")) };
rmSync(tmp, { recursive: true, force: true });
say(`\n# Bundle, Pay, minified, gzip (effect excluded)`);
say(`hand fixture (pay.compiled.ts)           ${kb(b.hand.raw)} raw, ${kb(b.hand.gzip)} gzip`);
say(`in-process: definition + front end      ${kb(b.typed.raw)} raw, ${kb(b.typed.gzip)} gzip (front end alone ${kb(b.front.gzip)} gzip)`);
say(`data: in-process + the JSON              + ${kb(gz(json))} gzip of JSON (${kb(json.length)} raw)`);
say(`module: in-process + the generated file  + ${kb(gz(src))} gzip`);

// ── Fidelity: one value of each kind, through each option.
const probe = {
  ...pay,
  nodes: { ...pay.nodes, IDLE: { ...pay.nodes["IDLE"]!, schedules: [{ id: "x", send: "Leave", schedule: { ms: Infinity }, armOn: ["entry"], disarmOn: [] }] } },
  ops: { ...pay.ops, pay: { ...pay.ops["pay"]!, timeoutMs: undefined, stray: () => 1, big: 1n, at: new Date(0) } },
  events: { external: ["Leave"], internal: ["Leave"] },
};
probe.events = { ...probe.events, internal: probe.events.external } as never; // shared identity
const pd = toData(probe);
const back = load(JSON.parse(JSON.stringify(pd.data)), pd.table) as unknown as typeof probe;
const kinds = [...new Set(pd.losses.map((l) => l.kind))];
say(`\n# Fidelity probe: Infinity, bigint, undefined, Date, shared identity, a stray closure`);
say(`toData names: ${kinds.join(", ")}`);
say(`after JSON:   Infinity -> ${JSON.stringify(back.nodes["IDLE"]!.schedules[0]!.schedule)}; bigint -> ${String((back.ops["pay"] as Record<string, unknown>)["big"])}; Date -> ${String((back.ops["pay"] as Record<string, unknown>)["at"])}; stray -> ${typeof (back.ops["pay"] as Record<string, unknown>)["stray"]}; timeoutMs key present: ${"timeoutMs" in back.ops["pay"]!}; shared: ${back.events.internal === back.events.external}`);
const verdict = (f: () => unknown) => {
  try {
    f();
    return "passes";
  } catch (e) {
    return `refuses (${String((e as Error).message).split("\n")[0]!.slice(0, 70)})`;
  }
};
say(`schema contract on the probe (loaded):  ${verdict(() => loadedContract(probe))}`);
say(`seal on the probe:                      ${verdict(() => seal(probe as never))}`);

// ── Tools: `flow check` and `explain` on the data form, every Slot poisoned (no closure at all), against in-process.
const poisoned = load(data, new Map([...table].map(([k]) => [k, () => { throw new Error("a Slot ran in a static command"); }])));
const c1 = JSON.stringify(check(pay as never));
const c2 = JSON.stringify(check(poisoned as never));
const e1 = JSON.stringify(explain(pay as never, "PAYING", "Confirmed"));
const e2 = JSON.stringify(explain(poisoned as never, "PAYING", "Confirmed"));
say(`\n# Tools: check on data = check in-process: ${c1 === c2}; explain on data = in-process: ${e1 === e2}`);

if (process.argv.includes("--fixtures")) {
  const { readFileSync } = await import("node:fs");
  void readFileSync;
}
await Bun.write(join(import.meta.dir, "measure.txt"), out.join("\n") + "\n");
