// Round 11, review H3, M1, M3, M6: what the front end must compile, pinned by its output, and the data contract run on every typed machine the suite boots.
// Gated by mutate-one.ts, as every `checks/*.ts` of a round. bun round-11/checks/front-check.ts. Exits 1 on any failure, and on a corruption it fails to see.
import { Context, Effect, Schema } from "effect";
import type { Api } from "../../conformance/fake-world.ts";
import type { Alternative, Compiled, Fragment, Node } from "../../conformance/fixtures/compiled.ts";
import { legacySlots } from "../../conformance/legacy.ts";
import { definition, deny, Flow, machine, subroutine, trait, transaction } from "../../conformance/compile/index.ts";
import { CompiledData, toData } from "../codec/codec.ts";
import { seal } from "../gate.ts";
import { pairs } from "../typed/pairs.ts";

class ProbeClock extends Context.Service<ProbeClock, { readonly now: () => number }>()("Probe/Clock") {}

const fails: string[] = [];
let pins = 0;
const eq = (what: string, got: unknown, want: unknown) => {
  pins++;
  if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const S = Schema;

// ── 1. Pins, one per feature the review's mutants could not reach (M6) and the two path bugs (H3, M1).
const put = transaction({ id: "t/put", input: { a: S.String, b: S.String }, key: ["a", "b"], concurrency: "reject", commit: () => Effect.void });
const Kid = trait(
  { id: "Kid", events: { Go: {} }, hostEvents: { Poke: { n: S.Number } }, guards: { may: Flow.Guard }, callbacks: { done: Flow.Callback({}) } },
  ({ guards, callbacks }) => ({ on: { Go: { guard: [guards.may], notify: [callbacks.done] }, Poke: {} }, whenAbandoned: [callbacks.done] }),
);
const d = definition({
  id: "T/Front",
  states: [{ A: ["A1", "A2"] }, { B: Flow.state({ traits: { kid: Kid } }) }],
  events: { Back: {}, Back2: {}, Go: {}, Mixed: {}, Stop: {}, Hit: {} },
  internalEvents: { Ok: {}, No: {}, Lost: Flow.uncertain({}), Gone: Flow.uncertain({}), Tick: {} },
  memory: { n: Flow.initial(S.Number, 0), maybe: S.optionalKey(S.String) },
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
eq("no key closure is written (D215)", "key" in c.ops["put"]!, false);
eq("its input fields (D215)", c.ops["put"]!.inputFields, ["a", "b"]);
eq("its projection, made by the seal from keyFields", (seal(c as Compiled, new Set()).ops["put"]!.key!.run as (i: object) => unknown)({ b: "2", a: "1", z: 0 }), { a: "1", b: "2" });
eq("a guard port", (c.fragments!["Kid"]!.nodes["root"]!.on["Go"]![0]!.tokens[0] as { port?: string }).port, "may");
eq("its filling", Object.keys(c.nodes["B"]!.placements![0]!.guards ?? {}), ["may"]);
eq("an optional key starts absent", "maybe" in (c.memory.initial.run(undefined) as object), false);
eq("and stays absent at restore", "maybe" in (c.memory.restore!.run({ n: 1 }) as object), false);
eq("and comes back when stored", (c.memory.restore!.run({ n: 1, maybe: "x" }) as { maybe?: string }).maybe, "x");

// ── 1b. Round 12: the review's survivors and the `Compiled` changes, pinned by output (review M1, M2, M3, L1, L2; H1).
const threw = (f: () => unknown): string => {
  try {
    f();
    return "";
  } catch (e) {
    return String((e as Error).message).split(":")[0]!;
  }
};
// D214, M2: memory as fields; creation decodes the input; the restore rule for a field a release adds.
const memD = definition({
  id: "T/Mem",
  states: ["A"],
  events: {},
  internalEvents: {},
  memory: {
    who: Flow.input(S.String),
    n: Flow.initial(S.Number, 0),
    twice: Flow.initial(S.Number, ({ n }) => (n as number) + 1),
    greet: Flow.initial(S.String, ({ who }) => `hi ${who as string}`), // mem.initial-computed-blind: a computed initial that reads an input field
    secret: Flow.private(Flow.initial(S.Boolean, false)),
    at: Flow.initial(S.Date, new Date(0)),
  },
  operations: () => ({}),
});
const mem = machine(memD, ({ S: St }) => ({ default: St.A })).compiled;
eq("fields as data", Object.fromEntries(Object.entries(mem.memory.fields).map(([k, f]) => [k, [f.source, f.private ?? false]])), {
  who: ["input", false], n: ["initial", false], twice: ["computed", false], greet: ["computed", false], secret: ["initial", true], at: ["initial", false],
});
eq("a computed initial reads an input field", (mem.memory.initial.run({ who: "ada" }) as { greet: string }).greet, "hi ada");
eq("a required input missing is refused", threw(() => mem.memory.initial.run({})), "InputMissing");
eq("an input of the wrong type is refused", threw(() => mem.memory.initial.run({ who: 5 })), "InputRefused");
eq("a computed field a release adds is computed from the restored fields", (mem.memory.restore.run({ who: "a", n: 3, greet: "x", secret: false, at: "1970-01-01T00:00:00.000Z" }) as { twice: number }).twice, 4);
eq("and a field the record has is never recomputed", (mem.memory.restore.run({ who: "a", n: 3, twice: 9, greet: "x", secret: false, at: "1970-01-01T00:00:00.000Z" }) as { twice: number }).twice, 9);
eq("an input a release adds with no default refuses the record", threw(() => mem.memory.restore.run({ n: 3, twice: 4, greet: "x", secret: false, at: "1970-01-01T00:00:00.000Z" })), "RestoreMissingInput");
eq("a Date round-trips through encode and restore", (mem.memory.restore.run(mem.memory.encode.run({ who: "a", n: 1, twice: 2, greet: "x", secret: false, at: new Date(5) })) as { at: Date }).at.getTime(), 5);
// D215, M3: a key field the input does not have is refused at the seal, and so is a table with a key closure beside keyFields.
const sealOf = (cc: unknown, given: ReadonlySet<string> = new Set()) => threw(() => seal(cc as Compiled, given));
const withOp = (f: (o: Record<string, unknown>) => Record<string, unknown>) => ({ ...c, ops: { put: f(c.ops["put"] as unknown as Record<string, unknown>) } });
eq("SealKeyField", sealOf(withOp((o) => ({ ...o, keyFields: ["nope"] }))), "SealKeyField");
eq("SealKeyTwice", sealOf(withOp((o) => ({ ...o, key: { run: () => ({}), at: { definition: "T/Front", path: "operations.put.key" } } }))), "SealKeyTwice");
eq("SealNoKey", sealOf(withOp(({ keyFields: _k, ...o }) => o)), "SealNoKey");
// D213, H1: a commit that needs a service the boot does not give is refused at the seal, by name.
const svcD = definition({
  id: "T/Svc",
  states: ["A"],
  events: {},
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({ go: transaction({ id: "t/go", input: {}, key: [], concurrency: "reject", services: [ProbeClock], commit: () => Effect.map(Effect.service(ProbeClock), (k) => k.now()) }).outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
});
const svc = machine(svcD, ({ S: St }) => ({ default: St.A, on: { Ok: {}, No: {}, Unsure: {} } })).compiled;
eq("services as data", svc.ops["go"]!.services, ["Probe/Clock"]);
eq("SealMissingService", sealOf(svc), "SealMissingService");
eq("and given, it seals", sealOf(svc, new Set(["Probe/Clock"])), "");
// D207, M1: the seal's two refusals of round 11, now pinned.
const dupPath = { ...c, nodes: { ...c.nodes, root: { ...root, on: { ...root.on, Mixed: [{ ...alt("Mixed"), guards: [alt("Mixed").guards[0]!, { ...alt("Mixed").guards[1]!, at: alt("Mixed").guards[0]!.at }] }] } } } };
eq("SealDuplicatePath", sealOf(dupPath), "SealDuplicatePath");
eq("a bare function below ops", sealOf(withOp((o) => ({ ...o, outcomes: { ...(o["outcomes"] as object), success: { event: "Ok", from: () => ({}) } } }))), "SealUnknownClosure");
eq("SealIncomplete without events", sealOf({ ...c, events: undefined }), "SealIncomplete");
// L2: rule 51 at the front end.
const Twin = trait({ id: "Twin", internalEvents: { Ok: {} }, operations: ({ E }) => ({ put: put.outcomes({ success: E.Ok, failure: {} }) }) }, () => ({ on: { Ok: {} } }));
const twinD = definition({ id: "T/Twin", states: ["A"], events: {}, internalEvents: { Ok: {} }, memory: {}, traits: { twin: Twin }, operations: ({ E }) => ({ put: put.outcomes({ success: E.Ok, failure: {} }) }) });
eq("DuplicateOperation (rule 51)", threw(() => machine(twinD, ({ S: St }) => ({ default: St.A, on: { Ok: {} } }))), "DuplicateOperation");
// L1: F6's guarded exit keeps its guard; round 12 writes it as the design does, `target: exits.Done` behind a guard.
const Step = subroutine(
  { id: "Step", events: { Confirm: {} }, exits: { Done: Flow.Exit({}) } },
  ({ exits }) => ({ on: { Confirm: { guard: [() => deny("Bad")], target: exits.Done } } }),
);
eq("F6 an exit behind a guard keeps the guard", Step.compiled.nodes["root"]!.on["Confirm"]![0]!.guards.length, 1);
eq("and is an exit", Step.compiled.nodes["root"]!.on["Confirm"]![0]!.exit?.name, "Done");
// Round 12, the compile prototypes: rule 13's `Flow.uncertain` is checked; placement is in the definition; a body for a state that is not there is refused.
const plain = transaction({ id: "t/plain", input: {}, key: [], concurrency: "reject", commit: () => Effect.void });
eq("UnknownNotUncertain", threw(() => definition({ id: "T/U", states: ["A"], events: {}, internalEvents: { Ok: {}, Sure: {} }, memory: {}, operations: ({ E }) => ({ p: plain.outcomes({ success: E.Ok, failure: {}, unknown: E.Sure }) }) })), "");
eq("UnknownNotUncertain at the compile", threw(() => machine(definition({ id: "T/U", states: ["A"], events: {}, internalEvents: { Ok: {}, Sure: {} }, memory: {}, operations: ({ E }) => ({ p: plain.outcomes({ success: E.Ok, failure: {}, unknown: E.Sure }) }) }), ({ S: St }) => ({ default: St.A }))), "UnknownNotUncertain");
eq("UnknownTrait", threw(() => machine(twinD as never, () => ({ default: { node: "A" }, traits: { nope: {} } }) as never)), "UnknownTrait");
eq("UnknownState under its parent", threw(() => machine(d, ({ S: St }) => ({ default: St.A, states: { A: { states: { B: {} } } } }) as never)), "UnknownState");
eq("each and resumable from the definition", [c.nodes["B"]!.placements![0]!.fragment, c.nodes["B"]!.placements![0]!.resumable ?? false], ["Kid", false]);
// M1: `legacy.ts` slots a hand commit and each hand read under its own place.
const hand = legacySlots({
  id: "T/Hand", nodes: { root: { id: "root", on: {}, schedules: [] } }, root: "root", default: "root", memory: { initial: { run: () => ({}), at: { definition: "T/Hand", path: "memory.initial" } } },
  ops: { put: { id: "put", contract: "t", kind: "write", key: { run: () => ({}), at: { definition: "T/Hand", path: "operations.put.key" } }, concurrency: "reject", commit: () => Effect.void, outcomes: { failure: {} } } },
  persisted: true, uses: [],
  domain: { writes: {}, reads: { a: () => [], b: () => [] }, repair: () => Effect.void },
  streams: { s: { id: "s", key: () => ({}), backoff: () => 1, subscribe: () => null, reconnectWhile: () => true } },
} as unknown as Compiled);
eq("a hand stream's closures under their own places", Object.entries((hand.streams as unknown as { s: Record<string, { at?: { path: string } }> }).s).flatMap(([, v]) => (typeof v === "object" && v?.at ? [v.at.path] : [])), ["streams.s.key", "streams.s.backoff", "streams.s.subscribe", "streams.s.reconnect.while"]);
eq("a hand commit at operations.<op>.commit", (hand.ops["put"]!.commit as { at: { path: string } }).at.path, "operations.put.commit");
eq("each hand read under its own name", Object.values((hand.domain as unknown as { reads: Record<string, { at: { path: string } }> }).reads).map((r) => r.at.path), ["domain.reads.a", "domain.reads.b"]);
eq("hand data gets identity restore and encode, and events", [typeof hand.memory.restore?.run, typeof hand.memory.encode?.run, hand.events], ["function", "function", { external: [], internal: [] }]);

// ── 1c. Round 13: round 12's final review (M2, M3, L2, L3, L4, D124's union), pinned by output.
class ProbeLog extends Context.Service<ProbeLog, { readonly log: (s: string) => void }>()("Probe/Log") {}
// L2: an input field that is not a key field, so `inputFields` is not `keyFields` by accident.
const note = transaction({ id: "t/note", input: { a: S.String, note: S.String }, key: ["a"], concurrency: "reject", commit: () => Effect.void });
// L3: an op that names two services; D124: a union whose second member cannot go.
const two = transaction({
  id: "t/two",
  input: { a: S.String, v: S.Union([S.String, S.BigInt]) },
  key: ["a"],
  concurrency: "reject",
  services: [ProbeClock, ProbeLog],
  commit: () => Effect.flatMap(Effect.service(ProbeClock), () => Effect.map(Effect.service(ProbeLog), (l) => l.log("x"))),
});
const r13D = definition({
  id: "T/R13",
  states: ["A"],
  events: { Go: { n: S.Number } },
  internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
  memory: { k: Flow.input(S.Number.pipe(S.withConstructorDefault(Effect.succeed(7)))) },
  traits: { kid: Kid },
  operations: ({ E }) => ({
    note: note.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }),
    two: two.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }),
  }),
});
const r13 = machine(r13D, ({ S: St }) => ({ default: St.A, on: { Go: {}, Ok: {}, No: {}, Unsure: {} }, traits: { kid: { guards: { may: () => true }, callbacks: { done: {} } } } })).compiled;
eq("L2 input fields beyond the key", [r13.ops["note"]!.inputFields, r13.ops["note"]!.keyFields], [["a", "note"], ["a"]]);
eq("L3 two services, in order", r13.ops["two"]!.services, ["Probe/Clock", "Probe/Log"]);
eq("L3 the second missing is refused by name", threw(() => seal(r13 as Compiled, new Set(["Probe/Clock"]))), "SealMissingService");
eq("L3 the first missing too", threw(() => seal(r13 as Compiled, new Set(["Probe/Log"]))), "SealMissingService");
eq("D124 a union's second member", r13.ops["two"]!.inputNotCarried, ["v"]);
eq("L4 the seal requires memory fields", sealOf({ ...svc, memory: { ...svc.memory, fields: undefined } }, new Set(["Probe/Clock"])), "SealIncomplete");
eq("M2 an absent input takes its constructor default", r13.memory.initial.run({}), { k: 7 });
// D222: one default per field, at both doors; two different ones, or a default beside `Flow.initial`, refused at the compile.
const memOf = (memory: Record<string, unknown>) => () => machine(definition({ id: "T/Def", states: ["A"], events: {}, internalEvents: {}, memory: memory as never, operations: () => ({}) }), ({ S: St }) => ({ default: St.A }));
eq("D222 the restore door takes the constructor default too", (r13.memory.restore.run({}) as { k: number }).k, 7);
eq("D222 a decoding default at creation", (memOf({ n: Flow.input(S.Number.pipe(S.withDecodingDefaultKey(Effect.succeed(4)))) })().compiled.memory.initial.run({}) as { n: number }).n, 4);
eq("D222 two different defaults", threw(memOf({ n: Flow.input(S.Number.pipe(S.withDecodingDefaultKey(Effect.succeed(4)), S.withConstructorDefault(Effect.succeed(7)))) })), "TwoDefaults");
eq("D222 a default beside Flow.initial", threw(memOf({ n: Flow.initial(S.Number.pipe(S.withConstructorDefault(Effect.succeed(7))), 1) })), "TwoDefaults");
// D221 (rule 39): a key field is required and has no default.
const keyed = (k: Schema.Top) => () =>
  machine(definition({ id: "T/Key", states: ["A"], events: {}, internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, memory: {}, operations: ({ E }) => ({ o: transaction({ id: "t/key", input: { k }, key: ["k"], concurrency: "reject", commit: () => Effect.void }).outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }), ({ S: St }) => ({ default: St.A, on: { Ok: {}, No: {}, Unsure: {} } }));
eq("D221 an optional key field is refused", threw(keyed(S.optionalKey(S.String))), "KeyFieldOptional");
eq("D221 a key field with a decoding default is refused", threw(keyed(S.String.pipe(S.withDecodingDefaultKey(Effect.succeed("a"))))), "KeyFieldOptional");
eq("D221 a key field with a constructor default is refused", threw(keyed(S.String.pipe(S.withConstructorDefault(Effect.succeed("a"))))), "KeyFieldOptional");
eq("D221 a required key field compiles", threw(keyed(S.String)), "");
eq("M3 a machine's event payloads", Object.keys(r13.events.payloads["Go"] ?? {}), ["n"]);
eq("mid L4 Flow.uncertain survives as data", r13.events.uncertain, ["Unsure"]);
const kidC = r13.fragments!["Kid"]!;
eq("M3 a fragment's kind", kidC.kind, "trait");
eq("M3 its events by direction", [kidC.events.external, kidC.events.host, kidC.events.internal], [["Go"], ["Poke"], []]);
eq("M3 a host event's payload", Object.keys(kidC.events.payloads["Poke"] ?? {}), ["n"]);
eq("M3 its ports", [Object.keys(kidC.ports.callbacks), Object.keys(kidC.ports.exits), Object.keys(kidC.ports.guards)], [["done"], [], ["may"]]);
eq("M3 a subroutine's kind and exit", [Step.compiled.kind, Object.keys(Step.compiled.ports.exits)], ["subroutine", ["Done"]]);

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
    // Round 12 (D215, review M3): the check the convergence claimed. A key field must be an input field.
    for (const f of kf) if (!(op.inputFields ?? []).includes(f)) out.push(`${cc.id} op ${k}: key field ${f} is not an input field`);
  }
  if (!cc.events) out.push(`${cc.id}: no events`);
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
  const keys = Object.values(x["ops"] as Record<string, any>).some((o) => o.keyFields && (new Set(o.keyFields).size !== o.keyFields.length || o.keyFields.some((f: string) => !(o.inputFields ?? []).includes(f))));
  return caught || dangling || keys;
};
const attacks: Array<[string, (x: Record<string, any>) => void]> = [
  ["an op kind no runtime knows", (x) => (Object.values(x["ops"])[0] as any).kind = "writ"],
  ["a target that names no node", (x) => (Object.values(x["nodes"]["root"].on)[0] as any)[0].target = "NOPE"],
  ["a key field twice", (x) => (Object.values(x["ops"])[0] as any).keyFields = ["k", "k"]],
  ["a key field that names no input field (review M3)", (x) => (Object.values(x["ops"])[0] as any).keyFields = ["nope"]],
  ["no events (D216)", (x) => delete x["events"]],
  ["a memory with no restore (D214)", (x) => delete x["memory"]["restore"]],
];
for (const [what, f] of attacks) if (!seenBy(corrupt(f))) fails.push(`the check missed: ${what}`);

for (const f of fails) console.log(`FAIL  ${f}`);
console.log(`${fails.length ? "FRONT FAIL" : "FRONT PASS"}  ${pins} pins, ${machines} typed machines through CompiledData and the structure check, ${attacks.length} corruptions seen`);
process.exit(fails.length ? 1 : 0);
