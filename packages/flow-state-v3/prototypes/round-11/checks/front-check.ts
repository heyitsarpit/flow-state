// Round 11, review H3, M1, M3, M6: what the front end must compile, pinned by its output, and the data contract run on every typed machine the suite boots.
// Gated by mutate-one.ts, as every `checks/*.ts` of a round. bun round-11/checks/front-check.ts. Exits 1 on any failure, and on a corruption it fails to see.
import { Effect, Schema } from "effect";
import type { Api } from "../../conformance/fake-world.ts";
import type { Alternative, Compiled, Fragment, Node } from "../../conformance/fixtures/compiled.ts";
import { definition, deny, Flow, fragment, machine, transaction } from "../../conformance/typed/flow.ts";
import { CompiledData, toData } from "../codec/codec.ts";
import { pairs } from "../typed/pairs.ts";

const fails: string[] = [];
let pins = 0;
const eq = (what: string, got: unknown, want: unknown) => {
  pins++;
  if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const S = Schema;

// ── 1. Pins, one per feature the review's mutants could not reach (M6) and the two path bugs (H3, M1).
const put = transaction({ id: "t/put", input: { a: S.String, b: S.String }, key: ["a", "b"], concurrency: "reject", commit: () => Effect.void });
const Kid = fragment(
  { id: "Kid", events: { Go: {} }, hostEvents: { Poke: { n: S.Number } }, guards: { may: Flow.Guard }, callbacks: { done: Flow.Callback({}) } },
  ({ guards, callbacks }) => ({ on: { Go: { guard: [guards.may], notify: [callbacks.done] }, Poke: {} }, whenAbandoned: [callbacks.done] }),
);
const d = definition({
  id: "T/Front",
  states: { A: { A1: {}, A2: {} }, B: {} },
  events: { Back: {}, Back2: {}, Go: {}, Mixed: {}, Stop: {}, Hit: {} },
  internalEvents: { Ok: {}, No: {}, Lost: {}, Gone: {}, Tick: {} },
  memory: { n: Flow.initial(S.Number, 0), maybe: S.optionalKey(S.String) },
  places: { kid: Kid },
  operations: ({ E }) => ({ put: put.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: { NoResponse: E.Lost, Cancelled: E.Gone } }) }),
});
const m = machine(d, ({ S: St, E, O }) => ({
  default: St.A,
  on: {
    Back: St.A.history, // the bare history token
    Back2: { target: St.A.history, updateMemory: ({ memory }) => ({ n: memory.n + 1 }) }, // H3: the same, as an object's target
    // M1: a token's key and two closures in one array, each its own path by its place
    Mixed: { guard: [O.put.idle(() => ({ a: "x", b: "y" })), () => true, ({ memory }) => memory.n > 0 || deny("Zero")] },
    // M6 (mutant M1): a bare token after a guarded alternative still targets its state
    Go: [{ guard: [() => deny("No")] }, St.B],
    Hit: { raise: [E.kid.Poke.from(() => ({ n: 1 }))] },
    Ok: {},
    No: {},
    Lost: {},
    Gone: {},
  },
  states: {
    A: { default: St.A.A1, schedules: { t: { schedule: "1 second", send: E.Tick, armOn: ["entry"], disarmOn: ["Stop"] } } }, // M6 (M11): disarmOn
    B: { traits: { kid: { guards: { may: () => true }, callbacks: { done: {} } } } }, // a guard port, filled
  },
}));
const c = m.compiled;
const root = c.nodes["root"]!;
const alt = (ev: string, i = 0) => root.on[ev]![i]!;
eq("H3 bare history", [alt("Back").target, alt("Back").history], ["A", true]);
eq("H3 object history", [alt("Back2").target, alt("Back2").history], ["A", true]);
eq("M1 guard paths by place", [(alt("Mixed").tokens[0] as { key?: { at: { path: string } } }).key?.at.path, ...alt("Mixed").guards.map((g) => g.at.path)], ["on.Mixed[0].guard[0]", "on.Mixed[0].guard[1]", "on.Mixed[0].guard[2]"]);
eq("M6 two closures kept", alt("Mixed").guards.length, 2);
eq("M6 bare token after a guarded one", alt("Go", 1).target, "B");
eq("M6 disarmOn", c.nodes["A"]!.schedules[0]!.disarmOn, ["Stop"]);
eq("unknown by reason", Object.keys((c.ops["put"]!.outcomes.unknown as { byReason: object }).byReason), ["NoResponse", "Cancelled"]);
eq("a multi-field key", c.ops["put"]!.keyFields, ["a", "b"]);
eq("its projection", (c.ops["put"]!.key.run as (i: object) => unknown)({ b: "2", a: "1", z: 0 }), { a: "1", b: "2" });
eq("a guard port", (c.fragments!["Kid"]!.nodes["root"]!.on["Go"]![0]!.tokens[0] as { port?: string }).port, "may");
eq("its filling", Object.keys(c.nodes["B"]!.placements![0]!.guards ?? {}), ["may"]);
eq("an optional key starts absent", "maybe" in (c.memory.initial.run(undefined) as object), false);
eq("and stays absent at restore", "maybe" in (c.memory.restore!.run({ n: 1 }) as object), false);
eq("and comes back when stored", (c.memory.restore!.run({ n: 1, maybe: "x" }) as { maybe?: string }).maybe, "x");

// ── 2. M3: the data contract and the structure, on every typed machine the suite boots (through `pairs.ts`'s typed side).
const api = new Proxy({}, { get: () => () => undefined }) as Api;
const strict = { onExcessProperty: "error" } as const;
const decode = Schema.decodeUnknownSync(CompiledData as never, strict);
const structure = (cc: Compiled): string[] => {
  const out: string[] = [];
  const body = (where: string, nodes: Readonly<Record<string, Node>>, dflt: string) => {
    if (!nodes[dflt]) out.push(`${where}: default ${dflt} names no node`);
    for (const [id, n] of Object.entries(nodes)) {
      if (n.parent !== undefined && !nodes[n.parent]) out.push(`${where}.${id}: parent ${n.parent} names no node`);
      if (n.default !== undefined && !nodes[n.default]) out.push(`${where}.${id}: default ${n.default} names no node`);
      const alts: Alternative[] = [
        ...Object.values(n.on).flat(),
        ...[...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])].flatMap((p) => {
          if (!cc.fragments?.[p.fragment]) out.push(`${where}.${id}: places ${p.fragment}, no such fragment`);
          return [...Object.values(p.callbacks ?? {}), ...Object.values(p.exits ?? {})].flat();
        }),
      ];
      for (const a of alts) if (a.target !== "self" && !nodes[a.target]) out.push(`${where}.${id} ${a.at.path}: target ${a.target} names no node`);
    }
  };
  body(cc.id, cc.nodes, cc.default);
  for (const [k, f] of Object.entries(cc.fragments ?? {}) as Array<[string, Fragment]>) body(`${cc.id} ${k}`, f.nodes, f.default);
  for (const [k, op] of Object.entries(cc.ops)) {
    if (op.fragment !== undefined && !cc.fragments?.[op.fragment]) out.push(`${cc.id} op ${k}: fragment ${op.fragment} not placed`);
    const kf = op.keyFields ?? [];
    if (new Set(kf).size !== kf.length || kf.some((x) => typeof x !== "string" || x === "")) out.push(`${cc.id} op ${k}: keyFields ${JSON.stringify(kf)}`);
    if (op.keyFields === undefined) out.push(`${cc.id} op ${k}: no keyFields`);
  }
  return out;
};
let machines = 0;
const seen = new Set<string>();
for (const p of pairs) {
  const cc = p.typed.make(api);
  const k = JSON.stringify(toData(cc).data);
  if (seen.has(k)) continue;
  seen.add(k);
  machines++;
  const { data, losses } = toData(cc);
  // Stated: Lab/Engine's `idleMs: Infinity`, kept from the hand fixture (in-process it is a number; the data view names it). Nothing else may be lost.
  for (const l of losses) if (!(cc.id === "Lab/Engine" && l.kind === "non-finite number")) fails.push(`${p.name}: toData loses ${l.kind} at ${l.path}`);
  try {
    decode(data);
  } catch (e) {
    fails.push(`${p.name}: CompiledData refuses: ${String((e as Error).message).split("\n").slice(0, 2).join(" ")}`);
  }
  for (const x of structure(cc)) fails.push(`${p.name}: ${x}`);
}
// ── 3. The check can fail: three corruptions of one typed machine, each must be seen.
const base = pairs[0]!.typed.make(api);
const corrupt = (f: (x: Record<string, any>) => void) => {
  const x = JSON.parse(JSON.stringify(toData(base).data)) as Record<string, any>;
  f(x);
  return x;
};
const seenBy = (x: Record<string, any>) => {
  let caught = false;
  try {
    decode(x);
  } catch {
    caught = true;
  }
  const nodes = x["nodes"] as Record<string, any>;
  const dangling = Object.values(nodes).some((n) => Object.values(n.on as Record<string, any[]>).flat().some((a) => a.target !== "self" && !nodes[a.target]));
  const keys = Object.values(x["ops"] as Record<string, any>).some((o) => o.keyFields && new Set(o.keyFields).size !== o.keyFields.length);
  return caught || dangling || keys;
};
const attacks: Array<[string, (x: Record<string, any>) => void]> = [
  ["an op kind no runtime knows", (x) => (Object.values(x["ops"])[0] as any).kind = "writ"],
  ["a target that names no node", (x) => (Object.values(x["nodes"]["root"].on)[0] as any)[0].target = "NOPE"],
  ["a key field twice", (x) => (Object.values(x["ops"])[0] as any).keyFields = ["k", "k"]],
];
for (const [what, f] of attacks) if (!seenBy(corrupt(f))) fails.push(`the check missed: ${what}`);

for (const f of fails) console.log(`FAIL  ${f}`);
console.log(`${fails.length ? "FRONT FAIL" : "FRONT PASS"}  ${pins} pins, ${machines} typed machines through CompiledData and the structure check, ${attacks.length} corruptions seen`);
process.exit(fails.length ? 1 : 0);
