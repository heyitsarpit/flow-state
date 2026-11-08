// Round 11, codec/BRIEF.md: the three ways to get `Compiled` from the compiler to the runtime, built so they can be measured.
//   in-process  the typed module is imported and `machine()` runs; Slots are the closures themselves (option 1 in its plain form)
//   data        `toData` gives JSON-safe data with each Slot as `{ $slot: at }`; `load` rebinds by a code table (option 2)
//   module      `emitModule` writes that data as a TypeScript module whose Slots are lookups in the table (option 1 as generated code)
//   schema      `CompiledData`, an Effect Schema of the data form, as a contract; `decodeWith(table)` as a codec (option 3)
// What each loses is said by `toData`'s `losses`, so a check can refuse it instead of JSON dropping it quietly.
import { Schema, SchemaTransformation } from "effect";
import type { At, Compiled } from "../../conformance/fixtures/compiled.ts";

export type SlotRef = { readonly $slot: At };
export type Loss = { readonly path: string; readonly kind: "bare closure" | "non-finite number" | "bigint" | "undefined in array" | "undefined value" | "Date" | "class instance" | "shared object" | "duplicate path" };
export type Table = ReadonlyMap<string, (...a: never[]) => unknown>;
const keyOf = (at: At) => `${at.definition}\u0000${at.path}`;
const isSlot = (o: Record<string, unknown>) => typeof o["run"] === "function" && typeof o["at"] === "object" && o["at"] !== null;

// One walk: the data form, the table of every Slot's closure by its definition path, and what JSON would lose.
export const toData = (c: unknown): { readonly data: unknown; readonly table: Table; readonly losses: readonly Loss[] } => {
  const table = new Map<string, (...a: never[]) => unknown>();
  const losses: Loss[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown, p: string): unknown => {
    // Round 12 (D214): a memory field's Schema, rendered for tools as its JSON Schema (or its AST's tag when it has none). In-process it stays the Schema, and
    // one Schema on two fields is not a shared object of `Compiled`'s.
    if (Schema.isSchema(v)) {
      try {
        return { $schema: Schema.toJsonSchemaDocument(v as Schema.Top).schema };
      } catch {
        return { $schema: { tag: (v as Schema.Top).ast._tag } };
      }
    }
    if (typeof v === "function") return void losses.push({ path: p, kind: "bare closure" });
    if (typeof v === "bigint") return void losses.push({ path: p, kind: "bigint" });
    if (typeof v === "number" && !Number.isFinite(v)) return void losses.push({ path: p, kind: "non-finite number" }), null;
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) losses.push({ path: p, kind: "shared object" });
    seen.add(v);
    if (v instanceof Date) return void losses.push({ path: p, kind: "Date" });
    if (Array.isArray(v))
      return v.map((x, i) => {
        if (x === undefined) losses.push({ path: `${p}[${i}]`, kind: "undefined in array" });
        return walk(x, `${p}[${i}]`);
      });
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return void losses.push({ path: p, kind: "class instance" });
    const o = v as Record<string, unknown>;
    if (isSlot(o)) {
      const at = o["at"] as At;
      const k = keyOf(at);
      const had = table.get(k);
      if (had && had !== o["run"]) losses.push({ path: `${p} (${at.path})`, kind: "duplicate path" });
      table.set(k, o["run"] as (...a: never[]) => unknown);
      return { $slot: { definition: at.definition, path: at.path } };
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      if (o[k] === undefined) {
        losses.push({ path: `${p}.${k}`, kind: "undefined value" });
        continue;
      }
      out[k] = walk(o[k], p ? `${p}.${k}` : k);
    }
    return out;
  };
  const data = walk(c, "");
  return { data, table, losses };
};

// Option 2's load: the data, each `$slot` rebound from the table. A Slot the table lacks is a wiring error at load, not a hole at run time.
export const load = (data: unknown, table: Table): Compiled => {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    const o = v as Record<string, unknown>;
    if (o["$slot"] !== undefined) {
      const at = o["$slot"] as At;
      const run = table.get(keyOf(at));
      if (!run) throw new Error(`SlotMissing: ${at.definition} ${at.path}`);
      return { run, at };
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = walk(o[k]);
    return out;
  };
  return walk(data) as Compiled;
};

// Option 1 as generated code: the data as a literal, each Slot a lookup in the table the definition module exports. The table still has to
// come from evaluating the definition, since a Slot is a closure over the author's module, which no generator can copy out as source.
export const emitModule = (data: unknown, tableImport: { readonly from: string; readonly name: string }): string => {
  const slots: At[] = [];
  const json = JSON.stringify(data, (_k, v) => {
    if (v && typeof v === "object" && "$slot" in v) {
      slots.push(v.$slot as At);
      return `@@flow-slot:${slots.length - 1}@@`; // JSON escapes a control character, so the mark is printable
    }
    return v;
  });
  const body = json.replace(/"@@flow-slot:(\d+)@@"/g, (_m, i) => {
    const at = slots[Number(i)]!;
    return `{run:s(${JSON.stringify(keyOf(at))}),at:${JSON.stringify(at)}}`;
  });
  return [
    `import { ${tableImport.name} as t } from ${JSON.stringify(tableImport.from)};`,
    `const s = (k) => { const f = t.get(k); if (!f) throw new Error("SlotMissing: " + k); return f; };`,
    `export default ${body};`,
    "",
  ].join("\n");
};

// ── Option 3: `Compiled`'s data form as an Effect Schema. As a contract it checks a loaded value's shape, Slots included; as a codec it decodes
// a `$slot` into a Slot by a table given at decode time.
const S = Schema;
const AtS = S.Struct({ definition: S.String, path: S.String });
const SlotRefS = S.Struct({ $slot: AtS });
const slotOr = (slot: S.Top) => slot;
const build = (Slot: S.Top) => {
  const opt = <X extends S.Top>(x: X) => S.optionalKey(x);
  const Notify = S.Struct({ name: S.String, from: opt(Slot) });
  const Raise = S.Struct({ to: S.String, key: opt(Slot), event: S.String, from: opt(Slot) });
  const TokenGuard = S.Union([
    S.Struct({ node: S.String }),
    S.Struct({ port: S.String }),
    S.Struct({ op: S.String, verb: S.Literals(["idle", "retryable"]), times: opt(S.Number), key: opt(Slot) }),
  ]);
  const Member = S.Union([
    S.Struct({ op: S.String, verb: S.Literals(["commit", "lookup"]), input: Slot }),
    S.Struct({ op: S.String, verb: S.Literals(["retry", "cancel", "cancelAll"]), key: opt(Slot) }),
    S.Struct({ op: S.String, verb: S.Literal("module"), module: S.String, name: S.String, value: opt(Slot) }),
  ]);
  const Alternative = S.Struct({
    target: S.String,
    at: AtS,
    tokens: S.Array(TokenGuard),
    guards: S.Array(Slot),
    patch: opt(Slot),
    members: S.Array(Member),
    followUps: opt(S.Array(Slot)),
    raises: opt(S.Array(Raise)),
    notify: opt(S.Array(Notify)),
    exit: opt(Notify),
    history: opt(S.Literal(true)),
  });
  const Alts = S.Record(S.String, S.Array(Alternative));
  const Placement = S.Struct({
    name: S.String,
    fragment: S.String,
    input: opt(Slot),
    resetOn: opt(Slot),
    each: opt(S.Struct({ of: S.String, by: opt(S.String), max: S.Number })),
    resumable: opt(S.Literal(true)),
    guards: opt(S.Record(S.String, Slot)),
    callbacks: opt(Alts),
    exits: opt(Alts),
  });
  const Schedule = S.Struct({
    id: S.String,
    send: S.String,
    schedule: S.Union([S.Struct({ ms: S.Finite }), Slot]),
    armOn: S.Array(S.String),
    disarmOn: S.Array(S.String),
  });
  const Activity = S.Struct({ op: S.String, input: Slot, when: opt(Slot) });
  const Node = S.Struct({
    id: S.String,
    parent: opt(S.String),
    on: Alts,
    schedules: S.Array(Schedule),
    default: opt(S.String),
    placements: opt(S.Array(Placement)),
    subroutine: opt(Placement),
    activities: opt(S.Array(Activity)),
  });
  // Round 12 (D214): memory as fields, and the three Slots required.
  const Field = S.Struct({ source: S.Literals(["input", "initial", "computed", "absent"]), schema: S.Unknown, private: opt(S.Literal(true)) });
  const Memory = S.Struct({ fields: S.Record(S.String, Field), initial: Slot, restore: Slot, encode: Slot });
  // Round 13 (round 12 review M3): what a definition and a fragment declare, payload Schemas included (each rendered by `toData`).
  const Payloads = S.Record(S.String, S.Record(S.String, S.Unknown));
  const Events = S.Struct({ external: S.Array(S.String), internal: S.Array(S.String), host: opt(S.Array(S.String)), payloads: Payloads, uncertain: S.Array(S.String) });
  const PortS = S.Struct({ fields: S.Record(S.String, S.Unknown), optional: opt(S.Literal(true)) });
  const Fragment = S.Struct({
    id: S.String,
    kind: S.Literals(["trait", "subroutine"]),
    events: S.Struct({ external: S.Array(S.String), host: S.Array(S.String), internal: S.Array(S.String), payloads: Payloads, uncertain: S.Array(S.String) }),
    ports: S.Struct({ exits: S.Record(S.String, PortS), callbacks: S.Record(S.String, PortS), guards: S.Record(S.String, S.Struct({ optional: opt(S.Literal(true)) })) }),
    nodes: S.Record(S.String, Node),
    root: S.String,
    default: S.String,
    memory: Memory,
    whenAbandoned: opt(S.Struct({ notify: opt(S.Array(Notify)), release: opt(S.Array(S.String)) })),
  });
  const Mapped = S.Struct({ event: S.String, from: opt(Slot), ignore: opt(S.Literal(true)) }); // round 14 (OD28): Flow.ignore
  const Op = S.Struct({
    id: S.String,
    contract: S.String,
    kind: S.Literals(["write", "read"]),
    concurrency: S.Literals(["reject", "latest", "cancel", "serialize"]),
    timeoutMs: opt(S.Finite),
    fragment: opt(S.String),
    commit: Slot,
    keyFields: S.Array(S.String), // round 12 (D215): the one source of the key, so no `key` Slot
    keyVersion: S.optionalKey(S.Array(S.String)), // U17 B: each key field with its Schema's version, the lane's stamp
    inputFields: S.Array(S.String),
    services: S.Array(S.String), // D213
    inputNotCarried: opt(S.Array(S.String)),
    outcomes: S.Struct({
      success: opt(Mapped),
      failure: S.Record(S.String, Mapped),
      unknown: opt(S.Union([Mapped, S.Struct({ byReason: S.Record(S.String, Mapped) })])),
    }),
  });
  return S.Struct({
    id: S.String,
    nodes: S.Record(S.String, Node),
    root: S.String,
    default: S.String,
    memory: Memory,
    ops: S.Record(S.String, Op),
    persisted: S.Boolean,
    uses: S.Array(S.String),
    domain: opt(S.Unknown), // round 11: typed by the entity step, not here (HANDOFF step 4)
    fragments: opt(S.Record(S.String, Fragment)),
    local: opt(S.Literal(true)),
    identityFields: opt(S.Array(S.String)), // round 14 (rule 74): a value ref's identity fields
    identityVersion: opt(S.Array(S.String)), // OD30 Q3: and their Schemas
    streams: opt(S.Unknown), // the same: the sessions module's data, typed with streams
    events: Events, // round 12 (D216): required; round 13 (M3): with payloads
  });
};
// The contract on the data form, read by tools with no closure in it.
export const CompiledData = build(slotOr(SlotRefS));
// The contract on loaded `Compiled`: a Slot is a function and its place.
const SlotS = S.Struct({ run: S.declare((u): u is (...a: never[]) => unknown => typeof u === "function"), at: AtS });
export const CompiledLoaded = build(SlotS);
// The codec: `$slot` decoded into a Slot by the table, encoded back to its place.
export const decodeWith = (table: Table) =>
  build(
    SlotRefS.pipe(
      S.decodeTo(
        SlotS,
        SchemaTransformation.transform({
          decode: (r: { readonly $slot: At }) => {
            const run = table.get(keyOf(r.$slot));
            if (!run) throw new Error(`SlotMissing: ${r.$slot.definition} ${r.$slot.path}`);
            return { run, at: r.$slot };
          },
          encode: (s: { readonly run: unknown; readonly at: At }) => ({ $slot: s.at }),
        }) as never,
      ),
    ),
  );
