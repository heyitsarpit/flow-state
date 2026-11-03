// D57: a value from outside may not name, shape or stop the core. D65: enforced at the boundary. `seal` is the only way compiled data
// reaches the core: its tables have no prototype and each closure's result is checked by what kind of closure it is, so a new call
// site cannot forget. A failure has one effect per place: in a turn a closure that throws refuses, and a value that cannot encode never does (D89, D108); a list repairs; a stored record quarantines; outside
// a turn the caller gives a default. No file parses meaning out of a string it built from a user's value.
import type {
  Alternative,
  Carried,
  Compiled,
  DomainSpec,
  Fragment,
  Mapped,
  Node,
  Op,
  Placement,
  Slot,
  StreamSpec,
} from "../conformance/fixtures/compiled.ts";

export class Refused extends Error {
  constructor(
    readonly origin: string,
    cause: unknown,
  ) {
    super(String(cause));
  }
}
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
// A world table keyed by an outside name. Copy-on-write makes these plain objects, so they read through here.
export const own = <V>(t: Readonly<Record<string, V>>, k: string): V | undefined =>
  Object.prototype.hasOwnProperty.call(t, k) ? t[k] : undefined;
// One text for one value: an object's keys sorted, so a guard and a contract that write a key in other orders name one lane. L3: what
// it could not tell apart it says apart, or refuses: NaN is not null, a Map is not {}.
// Round 9: a walk of its own. As a JSON replacer, sorting made a copy per object, which defeated JSON's own cycle check: a cycle overflowed the stack on every look at it, 1.8 s a step (why `odd` reached depth 1).
const normal = (v: unknown, within: Set<unknown>, bigint: (x: bigint) => string, nonFinite: (x: number) => string = (x) => `$${String(x)}`): unknown => {
  const x = v !== null && typeof v === "object" && !(v instanceof Map || v instanceof Set) && typeof (v as { toJSON?: unknown }).toJSON === "function" ? (v as { toJSON(): unknown }).toJSON() : v;
  if (typeof x === "function" || typeof x === "symbol" || x instanceof Map || x instanceof Set) throw new Error("a value with no text"); // D139: a Symbol joins them
  if (typeof x === "bigint") return bigint(x);
  if (typeof x === "number" && !Number.isFinite(x)) return nonFinite(x);
  if (x === null || typeof x !== "object") return x;
  if (within.has(x)) throw new Error("a value with no text: a cycle");
  within.add(x);
  const out = Array.isArray(x)
    ? x.map((y) => normal(y, within, bigint, nonFinite))
    : Object.fromEntries(
        (Object.getPrototypeOf(x) === Object.prototype ? Object.keys(x).sort() : Object.keys(x)).map((k) => [k, normal((x as Record<string, unknown>)[k], within, bigint, nonFinite)]),
      );
  within.delete(x);
  return out;
};
const written = (v: unknown, bigint: (x: bigint) => string, nonFinite?: (x: number) => string): string => JSON.stringify(normal(v, new Set(), bigint, nonFinite)) ?? "undefined";
// D119: two texts, one for each job. A name must be stable and need not come back: `1n` is `$1n`, as NaN is `$NaN`. A carried value must come back, and JSON cannot bring back a bigint.
export const canon = (v: unknown): string => written(v, (x) => `$${x}n`);
export const carry = (v: unknown): string =>
  written(
    v,
    () => {
      throw new Error("a bigint has no carried form");
    },
    (x) => {
      throw new Error(`${x} has no carried form`); // D139: it came back as a string, with no issue. Like a bigint, it has a name and no carried form
    },
  );
export const carried = (v: unknown): boolean => {
  try {
    carry(v);
    return true;
  } catch {
    return false;
  }
};
// D114: what can be carried of a value: only the parts that cannot be are replaced, so a mapper reading `input.id` still reads it after a reload.
export const standIn = (v: unknown): unknown => {
  if (carried(v)) return v;
  if (Array.isArray(v)) return v.map(standIn);
  if (isObject(v) && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, standIn(x)]));
  return { unencodable: true };
};
// Never throws: undefined means it has no name.
export const text = (v: unknown): string | undefined => {
  try {
    return canon(v);
  } catch {
    return undefined;
  }
};
export const same = (a: unknown, b: unknown) => {
  if (a === b) return true;
  const t = text(a);
  return t !== undefined && t === text(b);
};
// D108: the one door. A Slot whose result becomes a key, an input or a module value is gated by `encodable` at seal, so a new call site cannot forget. `entered` says whether it came in.
// D114: it keeps the value, since what the author asked to send is still theirs to read.
export class Unencodable extends Refused {
  constructor(
    origin: string,
    cause: unknown,
    readonly value: unknown,
  ) {
    super(origin, cause);
  }
}
export const encodable = (v: unknown, origin: string): unknown => {
  if (!carried(v)) throw new Unencodable(origin, "a value that cannot be carried", v);
  return v;
};
export const nameable = (v: unknown, origin: string): unknown => {
  if (text(v) === undefined) throw new Unencodable(origin, "a value with no name", v);
  return v;
};
export const entered = <A>(f: () => A): { readonly ok: true; readonly v: A } | { readonly ok: false; readonly value: unknown } => {
  try {
    return { ok: true, v: f() };
  } catch (e) {
    if (e instanceof Unencodable) return { ok: false, value: e.value };
    throw e;
  }
};
// L10: past 2^31 - 1 a browser's setTimeout fires at once.
export const finiteMs = (v: unknown, origin: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 2_147_483_647)
    throw new Refused(origin, `a schedule of ${String(v)}`);
  return v;
};
export const stringKey = (v: unknown, origin: string): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  throw new Unencodable(origin, "a key that is not a string", v); // D118: a raise with no name reaches nobody
};
// A list field (rule 9): repaired, never refused. Keys are strings; a finite number reads as one.
export const listOf = (v: unknown): { list: readonly unknown[]; bad: boolean } =>
  Array.isArray(v) ? { list: v, bad: false } : { list: [], bad: v !== undefined };
export const listKey = (item: unknown, by: string | undefined): string | undefined => {
  const k = by === undefined ? item : isObject(item) ? item[by] : undefined;
  return typeof k === "string"
    ? k
    : typeof k === "number" && Number.isFinite(k)
      ? String(k)
      : undefined;
};

// ── D65: what a real compile step would do. One walk, one table of slot kinds.
type Check = (v: unknown, origin: string) => unknown;
// M11: copied here, so a lazy getter throws where a throw means a refusal. A Proxy becomes a plain value.
const plain: Check = (v, origin) => {
  if (!isObject(v)) throw new Refused(origin, `a closure returned ${typeof v}, not an object`);
  try {
    return { ...v }; // M11: a class instance too: a throwing own getter is this closure's refusal, not the Runtime's
  } catch (e) {
    throw new Refused(origin, e);
  }
};
const verdict: Check = (v, origin) => {
  if (v === true || (isObject(v) && typeof v["deny"] === "string")) return v;
  throw new Refused(origin, `a guard returned ${typeof v}, not true or a denial`);
};
const anEvent: Check = (v, origin) => {
  if (isObject(v) && typeof v["tag"] === "string") return v;
  throw new Refused(origin, "a follow-up of no shape");
};
const gated = <F extends (...a: any[]) => any>(s: Slot<F>, check: Check): Slot<F> => ({
  ...s,
  run: ((...a: unknown[]) => check(s.run(...a), `${s.at.definition} ${s.at.path}`)) as F,
});
const maybe = <F extends (...a: any[]) => any>(s: Slot<F> | undefined, check: Check) =>
  s ? gated(s, check) : s;
const table = <A, B>(o: Readonly<Record<string, A>> | undefined, f: (a: A) => B) => {
  const out: Record<string, B> = Object.create(null);
  for (const k of Object.keys(o ?? {})) out[k] = f(o![k]!);
  return out;
};
const same_ = <A>(a: A) => a;
const tableK = <A, B>(o: Readonly<Record<string, A>> | undefined, f: (k: string, a: A) => B) => {
  const out: Record<string, B> = Object.create(null);
  for (const k of Object.keys(o ?? {})) out[k] = f(k, o![k]!);
  return out;
};
const sealMapped = (m: Mapped): Mapped => (m.from ? { ...m, from: gated(m.from, plain) } : m);
const sealMember = (m: Alternative["members"][number]): Alternative["members"][number] => {
  const x = m as { input?: Slot<(a: any) => unknown>; key?: Slot<(a: any) => unknown>; value?: Slot<(a: any) => unknown> };
  return {
    ...m,
    ...(x.input ? { input: gated(x.input, encodable) } : {}),
    ...(x.key ? { key: gated(x.key, nameable) } : {}),
    ...(x.value ? { value: gated(x.value, encodable) } : {}),
  } as Alternative["members"][number];
};
const sealToken = (t: Alternative["tokens"][number]): Alternative["tokens"][number] =>
  "key" in t && t.key ? ({ ...t, key: gated(t.key as Slot<(a: any) => unknown>, nameable) } as typeof t) : t;
const sealAlt = (a: Alternative): Alternative => ({
  ...a,
  tokens: a.tokens.map(sealToken),
  members: a.members.map(sealMember),
  guards: a.guards.map((g) => gated(g, verdict)),
  ...(a.patch ? { patch: gated(a.patch, plain) } : {}),
  ...(a.followUps ? { followUps: a.followUps.map((f) => gated(f, anEvent)) } : {}),
  ...(a.raises
    ? {
        raises: a.raises.map((r) => ({
          ...r,
          ...(r.from ? { from: maybe(r.from, plain)! } : {}),
          ...(r.key ? { key: gated(r.key, stringKey) } : {}),
        })),
      }
    : {}),
  ...(a.notify
    ? { notify: a.notify.map((n) => (n.from ? { ...n, from: gated(n.from, plain) } : n)) }
    : {}),
  ...(a.exit?.from ? { exit: { ...a.exit, from: gated(a.exit.from, plain) } } : {}),
});
const sealAlts = (o: Readonly<Record<string, readonly Alternative[]>> | undefined) =>
  table(o, (l) => l.map(sealAlt));
const sealPlacement = (p: Placement): Placement => ({
  ...p,
  ...(p.resetOn ? { resetOn: gated(p.resetOn, nameable) } : {}),
  ...(p.guards ? { guards: table(p.guards, (g) => gated(g, verdict)) } : {}),
  ...(p.callbacks ? { callbacks: sealAlts(p.callbacks) } : {}),
  ...(p.exits ? { exits: sealAlts(p.exits) } : {}),
});
const sealNode = (n: Node): Node => ({
  ...n,
  on: sealAlts(n.on),
  schedules: n.schedules.map((x) =>
    "ms" in x.schedule ? x : { ...x, schedule: gated(x.schedule, finiteMs) },
  ),
  ...(n.placements ? { placements: n.placements.map(sealPlacement) } : {}),
  ...(n.subroutine ? { subroutine: sealPlacement(n.subroutine) } : {}),
});
const sealOp = (o: Op, definition: string): Op => {
  known(o, OP_CLOSURES, `${definition} ops.${o.id}`); // L4
  const u = o.outcomes.unknown;
  return {
    ...o,
    key: gated(o.key, nameable),
    commit: typeof o.commit === "function" ? slotted(o.commit, definition, `operations.${o.id}.commit`) : o.commit, // D91
    outcomes: {
      ...(o.outcomes.success ? { success: sealMapped(o.outcomes.success) } : {}),
      failure: table(o.outcomes.failure, sealMapped),
      ...(u
        ? { unknown: "byReason" in u ? { byReason: table(u.byReason, sealMapped) } : sealMapped(u) }
        : {}),
    },
  };
};
const sealFrag = (f: Fragment): Fragment => ({
  ...f,
  nodes: table(f.nodes, sealNode),
  memory: {
    initial: gated(f.memory.initial, plain),
    ...(f.memory.restore ? { restore: gated(f.memory.restore, plain) } : {}),
    ...(f.memory.encode ? { encode: f.memory.encode } : {}),
  },
  ...(f.whenAbandoned?.notify
    ? {
        whenAbandoned: {
          ...f.whenAbandoned,
          notify: f.whenAbandoned.notify.map((n) =>
            n.from ? { ...n, from: gated(n.from, plain) } : n,
          ),
        },
      }
    : {}),
});
// D77: every closure in `Compiled` is a Slot once sealed. A bare function stays legal on input until the typed front end; here it gets
// its origin. A function under a name this list does not know is an error, so the next new closure cannot slip past the seal.
const slotted = <F extends (...a: any[]) => any>(
  f: F,
  definition: string,
  path: string,
): Slot<F> => ({ run: f, at: { definition, path } });
const STREAM_CLOSURES = new Set([
  "key",
  "backoff",
  "subscribe",
  "reconnectWhile",
  "pageRetryWhile",
  "catchUp",
]);
const DOMAIN_CLOSURES = new Set(["repair", "version", "versionOrder"]);
const OP_CLOSURES = new Set(["commit"]);
const WRITE_CLOSURES = new Set(["confirms"]);
const known = (o: object, names: ReadonlySet<string>, where: string) => {
  for (const [k, v] of Object.entries(o))
    if (typeof v === "function" && !names.has(k))
      throw new Error(`SealUnknownClosure: ${where}.${k}`);
};
const truthy: Check = (v) => v === true || (v !== false && v !== undefined && v !== null);
const anEffect: Check = (v) => v; // what an Effect is cannot be told here; a throw building one is the caller's defect
export type SealedStream = Omit<
  StreamSpec,
  "key" | "backoff" | "subscribe" | "reconnectWhile" | "pageRetryWhile" | "catchUp"
> & {
  readonly key: Slot<StreamSpec["key"]>;
  readonly backoff: Slot<StreamSpec["backoff"]>;
  readonly subscribe: Slot<StreamSpec["subscribe"]>;
  readonly reconnectWhile?: Slot<NonNullable<StreamSpec["reconnectWhile"]>>;
  readonly pageRetryWhile?: Slot<NonNullable<StreamSpec["pageRetryWhile"]>>;
  readonly catchUp?: Slot<NonNullable<StreamSpec["catchUp"]>>;
};
// Round 11 (D207): a stream's and a domain's closures come from the front end as Slots, with their own paths. A bare function is the hand fixtures' spelling, slotted
// here under a path of its own place (before, `domain.read` for every read: the duplicate paths of round 7's review).
const asSlot = <F extends (...a: any[]) => any>(f: F | Slot<F>, id: string, path: string): Slot<F> =>
  typeof f === "function" ? slotted(f, id, path) : f;
const sealStream = (id: string, op: string, x: StreamSpec): SealedStream => {
  known(x, STREAM_CLOSURES, `${id} streams.${op}`);
  const at = (n: string) => `streams.${op}.${n}`;
  const g = <F extends (...a: any[]) => any>(f: F, n: string, check: Check) =>
    gated(asSlot(f, id, at(n)), check);
  return {
    ...x,
    key: g(x.key, "key", nameable),
    backoff: g(x.backoff, "backoff", finiteMs),
    subscribe: g(x.subscribe, "subscribe", anEffect),
    ...(x.reconnectWhile ? { reconnectWhile: g(x.reconnectWhile, "reconnect.while", truthy) } : {}),
    ...(x.pageRetryWhile ? { pageRetryWhile: g(x.pageRetryWhile, "page.while", truthy) } : {}),
    ...(x.catchUp ? { catchUp: g(x.catchUp, "catchUp", anEffect) } : {}),
    value: sealMapped(x.value),
    missed: sealMapped(x.missed),
    failure: sealMapped(x.failure),
    ...(x.pages ? { pages: sealMapped(x.pages) } : {}),
    ...(x.failureBy ? { failureBy: table(x.failureBy, sealMapped) } : {}),
  };
};
export type SealedDomain = Pick<DomainSpec, "writes"> & {
  readonly writes: Readonly<
    Record<
      string,
      {
        readonly predicts: DomainSpec["writes"][string]["predicts"];
        readonly confirms?: Slot<(value: any, input: any) => readonly Carried[]>;
      }
    >
  >;
  readonly reads: Readonly<Record<string, Slot<(value: any, input: any) => readonly Carried[]>>>;
  readonly listens?: Readonly<Record<string, Slot<(value: any) => readonly Carried[]>>>;
  readonly repair: Slot<DomainSpec["repair"]>;
  readonly version?: Slot<NonNullable<DomainSpec["version"]>>;
  readonly versionOrder?: "lexical" | Slot<(a: unknown, b: unknown) => number>;
};
const sealDomain = (id: string, d: DomainSpec): SealedDomain => {
  known(d, DOMAIN_CLOSURES, `${id} domain`);
  const vo = d.versionOrder;
  return {
    ...d,
    writes: tableK(d.writes, (op, w) => {
      known(w, WRITE_CLOSURES, `${id} domain.writes`); // L4
      return { ...w, ...(w.confirms ? { confirms: asSlot(w.confirms, id, `domain.writes.${op}.confirms`) } : {}) };
    }),
    reads: tableK(d.reads, (op, f) => asSlot(f, id, `domain.reads.${op}`)),
    ...(d.listens ? { listens: tableK(d.listens, (op, f) => asSlot(f, id, `domain.listens.${op}`)) } : {}),
    repair: asSlot(d.repair, id, "domain.repair"),
    ...(d.version ? { version: asSlot(d.version, id, "domain.version") } : {}),
    ...(vo !== undefined && vo !== "lexical" ? { versionOrder: asSlot(vo as (a: unknown, b: unknown) => number, id, "domain.versionOrder") } : {}),
  } as SealedDomain;
};
const sealedAlready = new WeakSet<object>();
// D138: `self` is the data format's own word for "stay", and `__proto__` cannot come back from a record. A wiring error, like two machines under one id.
const RESERVED_STATES = new Set(["self", "__proto__"]);
const checkNames = (id: string, nodes: Readonly<Record<string, unknown>>) => {
  for (const k of Object.keys(nodes)) if (RESERVED_STATES.has(k)) throw new Error(`ReservedStateName: ${id} state ${k}`);
};
export const seal = (c: Compiled): Compiled => {
  if (sealedAlready.has(c)) return c;
  checkNames(c.id, c.nodes);
  for (const [k, f] of Object.entries(c.fragments ?? {})) checkNames(`${c.id} ${k}`, f.nodes);
  const out = {
    ...c,
    nodes: table(c.nodes, sealNode),
    memory: {
      initial: gated(c.memory.initial, plain),
      ...(c.memory.restore ? { restore: gated(c.memory.restore, plain) } : {}),
      ...(c.memory.encode ? { encode: c.memory.encode } : {}),
    },
    ops: table(c.ops, (o: Op) => sealOp(o, c.id)),
    ...(c.fragments ? { fragments: table(c.fragments, sealFrag) } : {}),
    ...(c.streams
      ? {
          streams: Object.fromEntries(
            Object.entries(c.streams).map(([k, x]) => [k, sealStream(c.id, k, x)]),
          ),
        }
      : {}),
    ...(c.domain ? { domain: sealDomain(c.id, c.domain) } : {}),
  } as unknown as Compiled;
  sealedAlready.add(out);
  return out;
};
export const sealAll = (list: readonly Compiled[]): Readonly<Record<string, Compiled>> => {
  // L4: two machines under one id is a wiring error, not a last-one-wins.
  const ids = list.map((c) => c.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup !== undefined) throw new Error(`DuplicateMachine: ${dup}`);
  return table(Object.fromEntries(list.map((c) => [c.id, c])), seal);
};

// ── Stored records, against the release that is running. Anything that fails is quarantined, per record (D46, D61).
const isStr = (v: unknown): v is string => typeof v === "string";
const strs = (v: unknown) => Array.isArray(v) && v.every(isStr);
const chainOf = (nodes: Readonly<Record<string, Node>>, leaf: string) => {
  const out: string[] = [];
  for (let n: string | undefined = leaf; n; n = nodes[n]?.parent) out.push(n);
  return out;
};
const validOwner = (o: unknown) =>
  isObject(o) &&
  isStr(o["inc"]) &&
  isStr(o["node"]) &&
  isStr(o["activation"]) &&
  Array.isArray(o["chain"]);
const validFrozenMail = (p: unknown) =>
  isObject(p) &&
  p["k"] === "ending" &&
  isStr(p["op"]) &&
  isStr(p["actor"]) &&
  validOwner(p["owner"]) &&
  isObject(p["ending"]) &&
  ["success", "failure", "unknown"].includes(p["ending"]["ch"] as string);
const validTimer = (t: unknown) =>
  isObject(t) &&
  t["kind"] === "schedule" &&
  ["key", "actor", "inc", "activation", "send", "id"].every((f) => isStr(t[f])) &&
  Number.isFinite(t["dueAt"]);
const placements = (f: Pick<Fragment, "nodes">, name: string) =>
  Object.values(f.nodes)
    .flatMap((n) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])])
    .find((p) => p.name === name);
export const validInc = (m: Compiled, i: unknown, frag: string | null): boolean => {
  const f = frag === null ? m : m.fragments?.[frag];
  if (!f || !isObject(i) || !isStr(i["id"]) || !isStr(i["leaf"]) || !f.nodes[i["leaf"]])
    return false;
  if (
    !isObject(i["memory"]) ||
    !isObject(i["activations"]) ||
    !isObject(i["history"]) ||
    !isObject(i["kids"])
  )
    return false;
  if (!strs(i["subject"]) || (i["key"] !== undefined && !isStr(i["key"]))) return false;
  const act = i["activations"];
  if (!chainOf(f.nodes, i["leaf"]).every((n) => isStr(act[n]))) return false;
  if (!Object.values(i["history"]).every((n) => isStr(n) && f.nodes[n])) return false;
  const fz = i["frozen"];
  if (
    fz !== undefined &&
    !(
      isObject(fz) &&
      Array.isArray(fz["parked"]) &&
      fz["parked"].every(validFrozenMail) &&
      Array.isArray(fz["timers"]) &&
      fz["timers"].every(validTimer)
    )
  )
    return false;
  return Object.values(i["kids"]).every((k) => {
    if (!isObject(k) || !isStr(k["name"])) return false;
    const p = placements(f, k["name"]);
    return p !== undefined && k["frag"] === p.fragment && validInc(m, k, p.fragment);
  });
};
export const validActor = (m: Compiled, v: Record<string, unknown>, k: string) =>
  isStr(v["key"]) &&
  k === `actor/${v["key"]}` && // L3: the body says who it is, and the record's key agrees
  isObject(v["root"]) &&
  (v["root"]["frag"] === null || v["root"]["frag"] === undefined) &&
  Array.isArray(v["timers"]) &&
  v["timers"].every(validTimer) &&
  validInc(m, v["root"], null);
const validAttempt = (a: unknown) =>
  isObject(a) &&
  isStr(a["id"]) &&
  Number.isFinite(a["mint"]) &&
  Number.isFinite(a["retryCount"]) &&
  typeof a["mayHaveApplied"] === "boolean" &&
  validOwner(a["owner"]);
const validParked = (p: unknown) =>
  isObject(p) &&
  validOwner(p["owner"]) &&
  isObject(p["ending"]) &&
  ["success", "failure", "unknown"].includes(p["ending"]["ch"] as string);
export const validLane = (v: Record<string, unknown>, k: string) =>
  isStr(v["id"]) &&
  k === `lane/${v["id"]}` &&
  isStr(v["actor"]) &&
  text(v["key"]) !== undefined &&
  v["id"] === `${v["actor"]}|${v["op"]}|${canon(v["key"])}` && // what `laneKey` wrote: a release must not make an idle guard miss a hold
  strs(v["subject"]) &&
  Array.isArray(v["w"]) &&
  v["w"].every(validAttempt) &&
  (v["head"] === undefined || validAttempt(v["head"])) &&
  (v["parked"] === undefined || (Array.isArray(v["parked"]) && v["parked"].every(validParked)));
