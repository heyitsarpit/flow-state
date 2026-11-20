// D57: a value from outside may not name, shape or stop the core. D65: enforced at the boundary. `seal` is the only way compiled data
// reaches the core: its tables have no prototype and each closure's result is checked by what kind of closure it is, so a new call
// site cannot forget. A failure has one effect per place: in a turn it refuses; a list repairs; a stored record quarantines; outside
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
export const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => {
    if (typeof x === "function" || x instanceof Map || x instanceof Set)
      throw new Error("a value with no text");
    if (typeof x === "number" && !Number.isFinite(x)) return `$${String(x)}`;
    return isObject(x) && Object.getPrototypeOf(x) === Object.prototype
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x;
  }) ?? "undefined";
// Never throws: undefined means it cannot be stored.
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
// In a turn: what core must encode refuses the turn if it cannot.
export const encoded = (v: unknown, origin: string): string => {
  const t = text(v);
  if (t === undefined) throw new Refused(origin, "a value that cannot be encoded");
  return t;
};
export const admit = <A>(v: A, origin: string): A => (encoded(v, origin), v);
// L10: past 2^31 - 1 a browser's setTimeout fires at once.
export const finiteMs = (v: unknown, origin: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 2_147_483_647)
    throw new Refused(origin, `a schedule of ${String(v)}`);
  return v;
};
export const stringKey = (v: unknown, origin: string): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  throw new Refused(origin, "a key that is not a string");
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
const sealMapped = (m: Mapped): Mapped => (m.from ? { ...m, from: gated(m.from, plain) } : m);
const sealAlt = (a: Alternative): Alternative => ({
  ...a,
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
const encodableKey: Check = (v, origin) => {
  if (text(v) === undefined) throw new Refused(origin, "a key that cannot be encoded");
  return v;
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
const sealStream = (id: string, op: string, x: StreamSpec): SealedStream => {
  known(x, STREAM_CLOSURES, `${id} streams.${op}`);
  const at = (n: string) => `streams.${op}.${n}`;
  const g = <F extends (...a: any[]) => any>(f: F, n: string, check: Check) =>
    gated(slotted(f, id, at(n)), check);
  return {
    ...x,
    key: g(x.key, "key", encodableKey),
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
    writes: table(d.writes, (w) => {
      known(w, WRITE_CLOSURES, `${id} domain.writes`); // L4
      return {
        ...w,
        ...(w.confirms ? { confirms: slotted(w.confirms, id, "domain.confirms") } : {}),
      };
    }),
    reads: table(d.reads, (f) => slotted(f, id, "domain.read")),
    ...(d.listens ? { listens: table(d.listens, (f) => slotted(f, id, "domain.listen")) } : {}),
    repair: slotted(d.repair, id, "domain.repair"),
    ...(d.version ? { version: slotted(d.version, id, "domain.version") } : {}),
    ...(typeof vo === "function" ? { versionOrder: slotted(vo, id, "domain.versionOrder") } : {}),
  } as SealedDomain;
};
const sealedAlready = new WeakSet<object>();
export const seal = (c: Compiled): Compiled => {
  if (sealedAlready.has(c)) return c;
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
