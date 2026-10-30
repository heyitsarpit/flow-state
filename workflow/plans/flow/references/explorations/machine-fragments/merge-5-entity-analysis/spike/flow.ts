// A stand-in for "flow-state": condition operators, recording proxies, a few domain entries, the one
// three-valued condition evaluator, the join rule, predictions as runtime functions, and the order check.
// It is not the library: no Schema, no store, no join over answers, no input rule.
import { Order } from "effect";

// ───────────────────────────────────────────────────────────── the description (plain data)

export type Scalar = string | number | boolean | null;
export type Value = Scalar | Date; // a decoded field value a condition may compare

export type IR =
  | { readonly ref: readonly string[] } // root first: input, record, result
  | { readonly val: Scalar | { readonly date: number } } // a Date constant is kept as its time
  | { readonly arr: readonly IR[] }
  | { readonly obj: { readonly [k: string]: IR } }
  | { readonly op: string; readonly args: readonly IR[] };

export class RecordingError extends Error {}

const IRK: unique symbol = Symbol("flow.ir");

// A recorded expression of value type V. The string-named brand lets a type-aware lint recognise any
// recorded value, wherever it flows (a callback, a helper, a factory).
export interface Expr<V> {
  readonly __flowRecorded?: { v: V };
}
export type Condition = Expr<boolean>;
// A type error that reads as a sentence: the compiler reports "Property '<sentence>' is missing".
export type Msg<S extends string> = { readonly [K in S]: never };

type ValOf<E> = E extends Value ? E : E extends Expr<infer V> ? V : E;

// A recorded root (`input`, `record`) carries the brand too, so spreading or serialising it is caught by type.
type Fields<T> = { readonly [K in keyof T]-?: Ref<Exclude<T[K], undefined>> } & { readonly __flowRecorded?: { v: T } };
export type Ref<V> = Expr<V> &
  (NonNullable<V> extends Value ? unknown : NonNullable<V> extends readonly unknown[] ? unknown : Fields<NonNullable<V>>);
export type { Fields };

// ───────────────────────────────────────────────────────────── recording

// A session ends when the recorded callback returns; a proxy read after that (a runtime function that
// closed over the recording `input`) throws a sentence naming the fix. Enumerating a recorded value (spread,
// `in`, Object.keys, JSON.stringify) throws too: it would record nothing and silently drop a constraint.
// Truthiness (`if (input.x)`, `?:`) cannot be trapped by a proxy; only the lint catches it.
type Session = { open: boolean; kind: string };
const enumerated = (path: readonly string[]) => () => {
  throw new RecordingError(`${path.join(".")} was enumerated (spread, \`in\`, Object.keys or JSON.stringify): a recorded value is read one property at a time`);
};
export function refProxy(path: readonly string[], session: Session = { open: true, kind: "recorded" }): any {
  return new Proxy(Object.create(null), {
    get(_t, p) {
      if (!session.open)
        throw new RecordingError(
          `${path.join(".")} was read after its ${session.kind} callback returned: a predicted field's function receives the input as its second parameter, (beneath, input) => …`,
        );
      if (p === IRK) return { ref: path };
      if (p === Symbol.toPrimitive)
        return () => {
          throw new RecordingError(`${path.join(".")} was converted to a primitive: comparisons in a recorded position are operators (eq, lt, …)`);
        };
      if (p === "toJSON") return enumerated(path);
      if (typeof p === "symbol" || p === "then") return undefined;
      return refProxy([...path, p], session);
    },
    has: enumerated(path),
    ownKeys: enumerated(path),
    getOwnPropertyDescriptor: enumerated(path),
  });
}

const irOf = (x: unknown): IR | undefined =>
  x !== null && (typeof x === "object" || typeof x === "function") && !(x instanceof Date) ? (x as any)[IRK] : undefined;

export function toIR(x: unknown, where: string): IR {
  const ir = irOf(x);
  if (ir) return ir;
  if (x === null || typeof x === "string" || typeof x === "boolean") return { val: x };
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new RecordingError(`${where}: a constant must be finite`);
    return { val: Object.is(x, -0) ? 0 : x };
  }
  if (x instanceof Date) {
    if (Number.isNaN(x.getTime())) throw new RecordingError(`${where}: an invalid Date constant`);
    return { val: { date: x.getTime() } };
  }
  if (Array.isArray(x)) return { arr: x.map((e) => toIR(e, where)) };
  if (typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype)
    return { obj: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toIR(v, where)])) };
  throw new RecordingError(`${where}: received ${typeof x}, which is not a recorded value`);
}

const node = (op: string, ...args: unknown[]): any => ({ [IRK]: { op, args: args.map((a) => toIR(a, op)) } });

// Records a free-standing condition (the conformance table and the join tests use it).
export const condition = (f: (c: { input: any; record: any }) => unknown): IR => toIR(f({ input: refProxy(["input"]), record: refProxy(["record"]) }), "condition");

// ───────────────────────────────────────────────────────────── condition operators (module "Condition")

type Arg<V> = V | Expr<V>;
type Ordered = number | Date | null;
type Orderable<L> = ValOf<L> extends Ordered ? L : Msg<"gt, gte, lt, lte, between and overlaps order numbers and Dates; a string's order is the server's collation: use serverMatches">;
type SameType<L, R> = R extends Arg<ValOf<L>> ? R : Msg<"eq compares two values of one type"> & { readonly left: ValOf<L>; readonly right: ValOf<R> };

export const eq = <L extends Expr<Value>, R>(a: L, b: SameType<L, R> & R): Condition => node("eq", a, b);
export const oneOf = <L extends Expr<Value>>(a: L, values: Arg<readonly ValOf<L>[]>): Condition => node("oneOf", a, values);
export const contains = <L extends Expr<readonly Value[]>>(a: L, v: Arg<ValOf<L>[number]>): Condition => node("contains", a, v);
type Bound<L> = NoInfer<Arg<NonNullable<ValOf<L>>>>;
type Compare = <L extends Expr<unknown>>(a: Orderable<L>, b: Bound<L>) => Condition;
export const gt: Compare = (a, b) => node("gt", a, b);
export const gte: Compare = (a, b) => node("gte", a, b);
export const lt: Compare = (a, b) => node("lt", a, b);
export const lte: Compare = (a, b) => node("lte", a, b);
export const between = <L extends Expr<unknown>>(a: Orderable<L>, from: Bound<L>, to: Bound<L>): Condition => node("between", a, from, to);
export const overlaps = <S extends Expr<unknown>>(start: Orderable<S>, end: NoInfer<Expr<ValOf<S> | null>>, from: Bound<S>, to: Bound<S>): Condition =>
  node("overlaps", start, end, from, to);
export const isNull = <L extends Expr<Value>>(a: null extends ValOf<L> ? L : Msg<"isNull needs a nullable field">): Condition => node("isNull", a);
export const and = (...cs: readonly Condition[]): Condition => node("and", ...cs);
export const or = (...cs: readonly Condition[]): Condition => node("or", ...cs);
export const not = (c: Condition): Condition => node("not", c);
export const serverMatches = (input: Expr<unknown>, ...fields: readonly Expr<unknown>[]): Condition => node("serverMatches", input, ...fields);

export type Sort = { readonly __sort: true };
export const asc = (k: Expr<Value>): Sort => node("asc", k);
export const desc = (k: Expr<Value>): Sort => node("desc", k);

// ───────────────────────────────────────────────────────────── entities and changes

declare const changeBrand: unique symbol;
// I: the write's input, inferred from where the change is returned, so a field's function is typed by it.
export interface Change<in I = any> {
  readonly [changeBrand]: (input: I) => void;
}
type KeyArg<Key> = Expr<Key> | Expr<readonly Key[]> | { readonly [F in keyof Key]: Key[F] | Expr<Key[F]> };
// A predicted field: a recorded read or constant, or a runtime function of the record beneath and the input.
type Slot<T, Row, I> = T | Expr<T> | ((beneath: DeepReadonly<Row>, input: I) => T);

export type FieldIR = IR | { readonly runtime: true };
export type ChangeIR = { change: "patch" | "delete"; entity: string; key: IR; many?: boolean; fields?: { [k: string]: FieldIR } };

// The runtime's live description keeps the functions; the Model (plain data) holds `{ runtime: true }`.
const runtimeFns = new WeakMap<object, Record<string, (beneath: any, input: any) => unknown>>();

export interface Entity<Row, K extends keyof Row, Ver extends keyof Row> {
  readonly id: string;
  patch<I>(key: KeyArg<Pick<Row, K>>, fields: { readonly [F in Exclude<keyof Row, K | Ver>]?: Slot<Row[F], Row, I> }): Change<I>;
  delete(key: KeyArg<Pick<Row, K>>, options?: { version: unknown }): Change;
  save(row: Row): Change; // runtime only (`.as`)
}
export type RowOf<E> = E extends Entity<infer Row, any, any> ? Row : never;

export const entity =
  <Row>() =>
  <const K extends keyof Row, Ver extends keyof Row = never>(d: {
    id: string;
    primaryKey: readonly K[];
    version?: Ver;
    keyTypes?: Partial<Record<K, "string" | "number" | "bigint">>; // stands in for the primary key's Schema
  }): Entity<Row, K, Ver> => {
    if (d.keyTypes) keyTypesOf.set(d.id, d.keyTypes as Record<string, string>);
    return ({
    id: d.id,
    patch: (key, fields) => {
      const out: Record<string, FieldIR> = {};
      const fns: Record<string, (b: any, i: any) => unknown> = {};
      for (const [f, v] of Object.entries(fields as object)) {
        if (f === d.version) throw new RecordingError(`${d.id}.patch: the version field cannot be patched`);
        if (typeof v === "function" && irOf(v) === undefined) {
          out[f] = { runtime: true };
          fns[f] = v;
        } else out[f] = toIR(v, `${d.id}.patch ${f}`);
      }
      runtimeFns.set(out, fns);
      return { [IRK]: { change: "patch", entity: d.id, key: toIR(key, "key"), fields: out } } as any;
    },
    delete: (key) => ({ [IRK]: { change: "delete", entity: d.id, key: toIR(key, "key") } }) as any,
    save: (row) => ({ change: "save", entity: d.id, row }) as any,
  });
  };
const keyTypesOf = new Map<string, Record<string, string>>();

// ───────────────────────────────────────────────────────────── operations and entries (stand-ins)

declare const opTypes: unique symbol;
export interface Op<I, R> {
  readonly id: string;
  readonly arrayKeys?: readonly string[]; // stands in for the input Schema: which input paths are arrays
  readonly defaults?: Readonly<Record<string, Scalar>>; // stands in for Schema.optional(…, { default }) on the input
  readonly [opTypes]?: [I, R];
}
export const op =
  <I, R>() =>
  (id: string, arrayKeys?: readonly string[], defaults?: Readonly<Record<string, Scalar>>): Op<I, R> => ({ id, ...(arrayKeys ? { arrayKeys } : {}), ...(defaults ? { defaults } : {}) });

export type EntryDescription = {
  kind: "read" | "write" | "listen";
  op: string;
  inputDefaults?: Readonly<Record<string, Scalar>>; // from the input Schema: an absent input with a default is that value
  places?: { mode: "one" | "list"; entity: string; at: IR | null }[];
  byKey?: IR;
  where?: IR;
  orderBy?: IR[];
  pagedBy?: { input: IR; next: IR };
  derivedFrom?: { entity: string; fields: IR | null };
  predicts?: ChangeIR[];
  as?: { entities: string[]; mapping: "runtime" };
};

// The recording context: the brand marks a recorded callback for the lint.
type Ctx<T> = T & { readonly __flowRecording?: true };
// Calls a recorded callback once and converts its result while the session is open.
const record = <T, U>(f: (c: any) => T, convert: (x: T) => U, kind = "recorded"): U => {
  const session = { open: true, kind };
  try {
    return convert(f({ input: refProxy(["input"], session), record: refProxy(["record"], session), result: refProxy(["result"], session) }));
  } finally {
    session.open = false;
  }
};
const cond = (x: unknown, where: string): IR => {
  if (!irOf(x)) throw new RecordingError(`${where} received ${typeof x}. Write eq(record.x, input.x), and, or, not`);
  return toIR(x, where);
};

export class ReadEntry<I, R, Row> {
  constructor(readonly d: EntryDescription) {}
  private add(patch: Partial<EntryDescription>): any {
    return new ReadEntry({ ...this.d, ...patch });
  }
  one<E extends Entity<any, any, any>>(e: E, at?: (c: Ctx<{ result: Fields<R> }>) => Expr<unknown>): ReadEntry<I, R, RowOf<E>> {
    return this.add({ places: [...(this.d.places ?? []), { mode: "one", entity: e.id, at: at ? record(at, (x) => toIR(x, "at"), "place") : null }] });
  }
  list<E extends Entity<any, any, any>>(e: E, at: (c: Ctx<{ result: Fields<R> }>) => Expr<unknown>): ReadEntry<I, R, RowOf<E>> {
    return this.add({ places: [...(this.d.places ?? []), { mode: "list", entity: e.id, at: record(at, (x) => toIR(x, "at"), "place") }] });
  }
  derivedFrom<E extends Entity<any, any, any>>(e: E, fields?: (c: Ctx<{ record: Fields<RowOf<E>> }>) => readonly Expr<unknown>[]): ReadEntry<I, R, RowOf<E>> {
    return this.add({ derivedFrom: { entity: e.id, fields: fields ? record(fields, (x) => toIR(x, "derivedFrom"), "`.derivedFrom`") : null } });
  }
  byKey(f: (c: Ctx<{ input: Fields<I> }>) => unknown): ReadEntry<I, R, Row> {
    return this.add({ byKey: record(f, (x) => toIR(x, "byKey"), "`.byKey`") });
  }
  // Several `.where` calls are combined with `and` (ED:387-388), in call order.
  where(f: (c: Ctx<{ input: Fields<I>; record: Fields<Row> }>) => Condition): ReadEntry<I, R, Row> {
    const c = record(f, (x) => cond(x, ".where"), "`.where`");
    return this.add({ where: this.d.where ? { op: "and", args: [this.d.where, c] } : c });
  }
  orderBy(f: (c: Ctx<{ record: Fields<Row> }>) => readonly Sort[]): ReadEntry<I, R, Row> {
    return this.add({ orderBy: record(f, (x) => x.map((s) => toIR(s, ".orderBy")), "`.orderBy`") });
  }
  pagedBy(input: (c: Ctx<{ input: Fields<I> }>) => Expr<unknown>, next: (c: Ctx<{ result: Fields<R> }>) => Expr<unknown>): ReadEntry<I, R, Row> {
    return this.add({ pagedBy: { input: record(input, (x) => toIR(x, "pagedBy"), "`.pagedBy`"), next: record(next, (x) => toIR(x, "pagedBy"), "`.pagedBy`") } });
  }
}

export class WriteEntry<I, R> {
  constructor(readonly d: EntryDescription, readonly arrayKeys: readonly string[] = []) {}
  one(e: Entity<any, any, any>, at?: (c: Ctx<{ result: Fields<R> }>) => Expr<unknown>): WriteEntry<I, R> {
    return new WriteEntry({ ...this.d, places: [...(this.d.places ?? []), { mode: "one", entity: e.id, at: at ? record(at, (x) => toIR(x, "at"), "place") : null }] }, this.arrayKeys);
  }
  // Recorded once, for structure: the changes, their entities, keys and field names. A field's runtime
  // function is called later, with the real input. Whether a key is an array is recorded from the input
  // Schema (`many`), so merge 4 rule 34's default lane key is decided statically.
  predicts(f: (c: Ctx<{ input: Fields<I> }>) => Change<I> | readonly Change<I>[]): WriteEntry<I, R> {
    const out = record(f, (o) => (Array.isArray(o) ? o : [o]).map((c) => irOf(c) as unknown as ChangeIR | undefined), "`.predicts`");
    const changes = out.map((ir) => {
      if (!ir || !("change" in ir)) throw new RecordingError(".predicts must return Entity.patch or Entity.delete");
      const path = "ref" in ir.key && ir.key.ref[0] === "input" ? ir.key.ref.slice(1).join(".") : undefined;
      return path !== undefined && this.arrayKeys.includes(path) ? { ...ir, many: true } : ir;
    });
    return new WriteEntry({ ...this.d, predicts: changes }, this.arrayKeys);
  }
}

export class ListenEntry<I, Ev> {
  constructor(readonly d: EntryDescription, readonly mapping?: (event: Ev) => unknown) {}
  as(entities: readonly Entity<any, any, any>[], mapping: (event: Ev) => Change): ListenEntry<I, Ev> {
    return new ListenEntry({ ...this.d, as: { entities: entities.map((e) => e.id), mapping: "runtime" } }, mapping);
  }
}

export const read = <I, R>(o: Op<I, R>) => new ReadEntry<I, R, never>({ kind: "read", op: o.id, ...(o.defaults ? { inputDefaults: o.defaults } : {}) });
// The evaluator sees the answer's input on the Type side, as the machine passed it, never decoded again. A field
// with a decoding default (`Schema.withDecodingDefaultKey(Effect.succeed(v))`) is required on the Type side, so it
// is never absent there; absence exists only for an optional field with no default. An input that arrives Encoded
// (hydration, a route parameter, a persisted actor's input) is decoded exactly once, at that boundary, where the
// default fills a missing key. A decode failure is not thrown: the answer is evaluated as maybe (server), with a
// diagnostic. `inputDefaults` stands in for the statically extracted literal defaults the Model records.
export const DECODE_FAILED: unique symbol = Symbol("input decode failed");
// At answer creation, a Type-side input must hold every key its Schema makes required (a defaulted key included), so
// a JavaScript caller that omits one is told so instead of the key silently dropping a constraint.
export function typeSideInput(d: EntryDescription, input: Record<string, unknown>): { ok: true } | { ok: false; diagnostic: string } {
  const missing = Object.keys(d.inputDefaults ?? {}).filter((p) => !p.includes("/") && input[p] === undefined);
  return missing.length ? { ok: false, diagnostic: `InputMissingRequiredKey: ${missing.join(", ")}` } : { ok: true };
}
// Defaults are keyed by path (the spike joins segments with "/"); an inner default applies only when its parent is
// present.
export function fromEncoded(d: EntryDescription, encoded: Record<string, unknown>, types: Record<string, "boolean" | "string" | "number"> = {}): { input: object } | { input: typeof DECODE_FAILED; diagnostic: string } {
  const out: Record<string, unknown> = structuredClone(encoded);
  for (const [path, value] of Object.entries(d.inputDefaults ?? {})) {
    const segs = path.split("/");
    let at: any = out;
    for (const seg of segs.slice(0, -1)) at = at && typeof at === "object" ? at[seg] : undefined;
    if (at && typeof at === "object" && at[segs[segs.length - 1]!] === undefined) at[segs[segs.length - 1]!] = value;
  }
  for (const [k, t] of Object.entries(types)) if (out[k] !== undefined && typeof out[k] !== t) return { input: DECODE_FAILED, diagnostic: `InputDecodeFailed: ${k} is not a ${t}` };
  return { input: out };
}
export const write = <I, R>(o: Op<I, R>) => new WriteEntry<I, R>({ kind: "write", op: o.id }, o.arrayKeys ?? []);
export const listen = <I, Ev>(o: Op<I, Ev>) => new ListenEntry<I, Ev>({ kind: "listen", op: o.id });

export type Domain = { id: string; entries: Record<string, { d: EntryDescription }> };
export const domain = <E extends Record<string, { d: EntryDescription }>>(id: string, entries: E) => ({ id, entries });
export const describe = (dm: Domain): Record<string, EntryDescription> =>
  Object.fromEntries(Object.entries(dm.entries).map(([k, e]) => [k, e.d]));

// ───────────────────────────────────────────────────────────── the three-valued evaluator

// `carried`: the paths the store holds whole for this record, as segment arrays (a string is one segment). A read is
// carried only if a held path is a prefix of it or equals it: holding `author` as `{ name }` is the path
// [author, name], so [author, userId] is not carried. A carried read whose value is absent is an absent optional
// field (a value).
export type Env = { input?: unknown; record?: unknown; result?: unknown; carried?: ReadonlySet<string> | readonly (string | readonly string[])[] };
const isCarried = (carried: Env["carried"], read: readonly string[]) => {
  for (const c of carried as Iterable<string | readonly string[]>) {
    const held = typeof c === "string" ? [c] : c;
    if (held.length <= read.length && held.every((seg, i) => seg === read[i])) return true;
  }
  return false;
};
export type Why = "notCarried" | "failed" | "server";
// yes / no / maybe (Kleene). A maybe says why, and which record fields it came from ("*": every field).
export type Tri = { v: "yes" } | { v: "no" } | { v: "maybe"; why: Why; detail: string; fields: readonly string[] };
const YES: Tri = { v: "yes" };
const NO: Tri = { v: "no" };
const maybe = (why: Why, detail: string, fields: readonly string[] = []): Tri => ({ v: "maybe", why, detail, fields });
const tri = (b: boolean): Tri => (b ? YES : NO);

const ABSENT = Symbol("absent input");
const ABSENT_FIELD = Symbol("absent optional field");
const NULL_INPUT = Symbol("present null input");
type Read = { value: unknown; field?: string } | Tri;
const isTri = (x: Read): x is Tri => "v" in x;

function readArg(ir: IR, env: Env): Read {
  if ("ref" in ir) {
    let v: any = (env as any)[ir.ref[0]!];
    for (const p of ir.ref.slice(1)) {
      if (v === null || v === undefined) break;
      v = v[p];
    }
    const name = ir.ref.slice(1).join(".");
    if (ir.ref[0] === "record") {
      const top = ir.ref[1]!;
      void top;
      if (env.carried && !isCarried(env.carried, ir.ref.slice(1))) return maybe("notCarried", `record.${name} is not carried`, [name]);
      if (v === undefined) return env.carried ? { value: ABSENT_FIELD, field: name } : maybe("notCarried", `record.${name} is not carried`, [name]);
      return { value: v, field: name };
    }
    if (ir.ref[0] === "input") return { value: v === undefined ? ABSENT : v === null ? NULL_INPUT : v };
    return { value: v };
  }
  if ("val" in ir) return { value: typeof ir.val === "object" && ir.val !== null ? new Date(ir.val.date) : ir.val };
  if ("arr" in ir) {
    const out: unknown[] = [];
    for (const x of ir.arr) {
      const r = readArg(x, env);
      if (isTri(r)) return r;
      out.push(r.value);
    }
    return { value: out };
  }
  throw new Error("a condition argument is a read, a constant or an array of them");
}

// A value a comparison can use, or why it cannot.
function usable(x: unknown, op: string, field?: string): Tri | undefined {
  const fields = field ? [field] : [];
  if (x === NULL_INPUT) return maybe("server", `${op}: a present null input means "any" to some APIs and "is null" to others`, fields);
  if (typeof x === "number" && !Number.isFinite(x)) return maybe("failed", `${op}: ${x} is not a finite number`, fields);
  if (x instanceof Date && Number.isNaN(x.getTime())) return maybe("failed", `${op}: an invalid Date`, fields);
  if (x !== null && typeof x === "object" && !(x instanceof Date) && !Array.isArray(x)) return maybe("failed", `${op}: not a value`, fields);
  return undefined;
}

// Equality: scalars by ===; Dates at millisecond precision, where a tie is maybe (the server may hold finer
// times); a Date never equals a non-Date.
function equal(a: unknown, b: unknown, fields: string[]): Tri {
  if (a === ABSENT_FIELD || b === ABSENT_FIELD) return tri(a === b); // an absent optional field equals nothing
  const kind = (x: unknown) => (x === null ? "null" : x instanceof Date ? "date" : typeof x);
  if (kind(a) !== "null" && kind(b) !== "null" && kind(a) !== kind(b)) return maybe("failed", `eq: a ${kind(a)} against a ${kind(b)}`, fields);
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime() ? maybe("server", "two Dates equal at millisecond precision", fields) : NO;
  return tri(a === b);
}
// Order: Effect's Order.Number and Order.Date (M5-D2), after the checks above. `null` is unordered and its
// place is the server's: maybe. A Date tie is maybe.
function compare(a: unknown, b: unknown, op: string, fields: string[], test: (c: -1 | 0 | 1) => boolean): Tri {
  if (a === ABSENT_FIELD || b === ABSENT_FIELD) return maybe("server", `${op}: an absent field has no order the client knows`, fields);
  if (a === null || b === null) return maybe("server", `${op}: null has no order the client knows`, fields);
  let c: -1 | 0 | 1;
  if (typeof a === "number" && typeof b === "number") c = Order.Number(a, b);
  else if (a instanceof Date && b instanceof Date) {
    c = Order.Date(a, b);
    if (c === 0) return maybe("server", `${op}: two Dates equal at millisecond precision`, fields);
  } else return maybe("failed", `${op}: cannot order ${typeof a} against ${typeof b}`, fields);
  return tri(test(c));
}

// When several arguments are maybe, the reported cause is chosen by a fixed precedence, so it does not depend
// on argument order: failed, then not carried, then server.
const RANK: Record<Why, number> = { failed: 0, notCarried: 1, server: 2 };
const firstMaybe = (ts: readonly Tri[]): Tri | undefined =>
  ts.filter((t): t is Extract<Tri, { v: "maybe" }> => t.v === "maybe").sort((a, b) => RANK[a.why] - RANK[b.why])[0];
const andT = (ts: readonly Tri[]): Tri => (ts.some((t) => t.v === "no") ? NO : firstMaybe(ts) ?? YES);
const orT = (ts: readonly Tri[]): Tri => (ts.some((t) => t.v === "yes") ? YES : firstMaybe(ts) ?? NO);
const notT = (t: Tri): Tri => (t.v === "yes" ? NO : t.v === "no" ? YES : t);

// A condition over one record. `top`: directly under `and` from the root (or the root itself), the only
// place an absent optional input means "no constraint"; elsewhere an absent input is maybe.
export function evaluate(ir: IR, env: Env, top = true): Tri {
  if (!("op" in ir)) {
    const r = readArg(ir, env);
    if (isTri(r)) return r;
    return typeof r.value === "boolean" ? tri(r.value) : maybe("failed", "a condition evaluated to a non-boolean");
  }
  switch (ir.op) {
    case "and":
      return andT(ir.args.map((a) => evaluate(a, env, top)));
    case "or":
      return orT(ir.args.map((a) => evaluate(a, env, false)));
    case "not":
      return notT(evaluate(ir.args[0]!, env, false));
    case "serverMatches": {
      const fields = ir.args.slice(1).flatMap((a) => ("ref" in a ? [a.ref.slice(1).join(".")] : []));
      return maybe("server", "serverMatches: the server decides", fields.length ? fields : ["*"]);
    }
  }
  const reads = ir.args.map((a) => readArg(a, env));
  const fields = reads.flatMap((r) => (!isTri(r) && r.field ? [r.field] : []));
  const absent = (i: number) => !isTri(reads[i]!) && (reads[i] as { value: unknown }).value === ABSENT;
  const dropped = (i: number): Tri => (top ? YES : maybe("server", `${ir.op}: an absent input outside \`and\` has no agreed meaning`, fields));
  // A bound term of between/overlaps: absent bound → no bound (top) or maybe; otherwise compare.
  const term = (i: number, j: number, test: (c: -1 | 0 | 1) => boolean): Tri => {
    if (absent(j)) return dropped(j);
    for (const k of [i, j]) {
      const r = reads[k]!;
      if (isTri(r)) return r;
      const bad = usable(r.value, ir.op, r.field);
      if (bad) return bad;
    }
    return compare((reads[i] as any).value, (reads[j] as any).value, ir.op, fields, test);
  };
  switch (ir.op) {
    case "between": {
      // from ≤ a < to; each bound is its own term. An inverted range is maybe, as for overlaps (APIs differ).
      const f = reads[1]!;
      const t = reads[2]!;
      const num = (x: unknown) => (typeof x === "number" ? x : x instanceof Date ? x.getTime() : Number.NaN);
      if (!isTri(f) && !isTri(t) && num(f.value) > num(t.value)) return maybe("server", "between: from is after to", fields);
      return andT([term(0, 1, (c) => c >= 0), term(0, 2, (c) => c < 0)]);
    }
    case "overlaps": {
      // [start, end) overlaps [from, to): start < to, and end > from. A null start or end affects only its
      // own term. An inverted range (from > to) is maybe: APIs differ (empty, or an error).
      const f = reads[2]!;
      const t = reads[3]!;
      const num = (x: unknown) => (typeof x === "number" ? x : x instanceof Date ? x.getTime() : Number.NaN);
      if (!isTri(f) && !isTri(t) && num(f.value) > num(t.value))
        return maybe("server", "overlaps: from is after to", fields);
      return andT([term(0, 3, (c) => c < 0), term(1, 2, (c) => c > 0)]);
    }
  }
  if (ir.op !== "isNull" && reads.some((_, i) => absent(i))) return dropped(0);
  for (const r of reads) {
    if (isTri(r)) return r;
    const bad = usable(r.value, ir.op, r.field);
    if (bad) return bad;
  }
  const v = (i: number) => (reads[i] as { value: unknown }).value;
  switch (ir.op) {
    case "eq":
      return equal(v(0), v(1), fields);
    case "oneOf": {
      const raw = v(1);
      if (!Array.isArray(raw)) return maybe("failed", "oneOf needs an array", fields);
      // Each element is checked like any argument: an absent input element drops (at the top) or makes it maybe; a
      // present null input element is maybe (server); NaN or an invalid Date fails.
      const list: unknown[] = [];
      for (const x of raw) {
        if (x === ABSENT) {
          if (top) continue;
          return maybe("server", "oneOf: an absent input element outside `and`", fields);
        }
        const bad = usable(x, "oneOf");
        if (bad) return bad.v === "maybe" ? maybe(bad.why, bad.detail, fields) : bad;
        list.push(x);
      }
      if (raw.length === 0) return maybe("server", "oneOf over an empty list means none to some APIs and any to others", fields);
      if (list.length === 0) return YES; // every element was an absent input: the leaf drops
      return orT(list.map((x) => equal(v(0), x, fields)));
    }
    case "contains": {
      const list = v(0);
      if (!Array.isArray(list)) return maybe("failed", "contains needs an array field", fields);
      for (const x of list) {
        const bad = usable(x, "contains");
        if (bad) return bad.v === "maybe" ? maybe(bad.why, bad.detail, fields) : bad;
      }
      return orT(list.map((x) => equal(x, v(1), fields)));
    }
    case "gt":
      return compare(v(0), v(1), "gt", fields, (c) => c > 0);
    case "gte":
      return compare(v(0), v(1), "gte", fields, (c) => c >= 0);
    case "lt":
      return compare(v(0), v(1), "lt", fields, (c) => c < 0);
    case "lte":
      return compare(v(0), v(1), "lte", fields, (c) => c <= 0);
    case "isNull":
      // An absent optional field the server may omit is not known to be null or not: maybe.
      return v(0) === ABSENT_FIELD ? maybe("server", "isNull: the field is absent, which the server may mean as null", fields) : tri(v(0) === null);
    default:
      return maybe("failed", `unknown operator ${ir.op}`);
  }
}

// The record paths a condition reads, as segment arrays (["*"] when a fieldless serverMatches reads every
// field). A path through an array index is cut at the array (`tags.0` reads `tags`): arrays are atomic.
export type Path = readonly string[];
const normalise = (p: Path): Path => {
  const i = p.findIndex((seg) => /^\d+$/.test(seg));
  return i < 0 ? p : p.slice(0, i);
};
export function reads(ir: IR): Path[] {
  if ("ref" in ir) return ir.ref[0] === "record" ? [normalise(ir.ref.slice(1))] : [];
  if ("arr" in ir) return ir.arr.flatMap(reads);
  if ("op" in ir) {
    if (ir.op === "serverMatches" && ir.args.length === 1) return [["*"]];
    return ir.args.flatMap(reads);
  }
  return [];
}

// ───────────────────────────────────────────────────────────── the join rule

// Paths are segment arrays and match when one is a prefix of the other: a condition reading [meta, owner] matches a
// change to [meta] (the object was replaced) and to [meta, owner, id]; [metadata] is not [meta]. A change inside an
// array is reported as the array's path. A plain string is one segment (a field name may contain a dot).
export type ChangedPath = string | Path;
const asPath = (p: ChangedPath): Path => normalise(typeof p === "string" ? [p] : p);
export const overlapsPath = (a: Path, b: Path) => {
  if (a[0] === "*" || b[0] === "*") return true;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
};
const touches = (readsOf: readonly Path[], changed: readonly ChangedPath[]) => readsOf.some((r) => changed.some((c) => overlapsPath(r, asPath(c))));

// One side of a delta: the record, `"none"` (it does not exist: before a create, after a delete), or
// `"unknown"` (a record the client sees for the first time; it may have existed on the server).
// A side is the store's merged base for the record (not the delta alone), with the fields it holds.
export type Side = object | "none" | "unknown" | { readonly record: object; readonly carried: readonly (string | readonly string[])[] };
export type Repair = { repair: false } | { repair: true; why: "entered" | "left" | Why; detail?: string };

// The membership half of the join: is the record in the answer's condition before and after? A side that
// does not exist is a definite no. A first sighting is no for a list (every record an active list holds is
// held, ED:523-524) and maybe for a derived answer (it may have counted). An existence change repairs whatever
// the condition reads; otherwise membership can change only through a field the condition reads. The answer
// then repairs unless both sides are the same definite answer.
export function membership(where: IR | undefined, input: unknown, before: Side, after: Side, changed: readonly ChangedPath[], derived = false) {
  const cond = where ?? { val: true };
  const side = (x: Side): Tri =>
    x === "none" ? NO
    : input === DECODE_FAILED ? maybe("server", "the answer's input could not be decoded")
    : x === "unknown" ? (derived ? maybe("notCarried", "a first sighting: the record's earlier state is unknown") : NO)
    : "carried" in x && "record" in x ? evaluate(cond, { input, record: x.record, carried: x.carried })
    : evaluate(cond, { input, record: x });
  const a = side(before);
  const b = side(after);
  const existence = typeof before !== "object" || typeof after !== "object";
  const touched = existence || touches(reads(cond), changed);
  return { a, b, touched };
}
export function joins(where: IR | undefined, input: unknown, before: Side, after: Side, changed: readonly ChangedPath[], derived = false): Repair {
  const { a, b, touched } = membership(where, input, before, after, changed, derived);
  if (!touched) return { repair: false };
  if (a.v !== "maybe" && b.v !== "maybe") return a.v === b.v ? { repair: false } : { repair: true, why: b.v === "yes" ? "entered" : "left" };
  const m = firstMaybe([a, b]) as Extract<Tri, { v: "maybe" }>;
  return { repair: true, why: m.why, detail: m.detail };
}

// ED 2.3's classifier: membership (above) or, for a record in the answer (yes or maybe on either side), a
// change to a field this kind of answer depends on. A derived answer's fields are its declared fields plus the
// fields its condition reads (ED:128-129: condition fields always repair), so the two lists cannot disagree.
export type Answer =
  | { kind: "one" }
  | { kind: "ordered"; where?: IR; orderBy: readonly Path[] }
  | { kind: "unordered"; where?: IR }
  | { kind: "ranked"; where?: IR; unaffectedBy?: readonly Path[] }
  | { kind: "derived"; where?: IR; fields?: readonly Path[] };
export function impact(answer: Answer, input: unknown, before: Side, after: Side, changed: readonly ChangedPath[]): Repair {
  if (answer.kind === "one") return after === "none" ? { repair: true, why: "left" } : { repair: false };
  const derived = answer.kind === "derived";
  const m = joins(answer.where, input, before, after, changed, derived);
  if (m.repair) return m;
  const { a, b } = membership(answer.where, input, before, after, changed, derived);
  if (a.v === "no" && b.v === "no") return { repair: false };
  const depends =
    answer.kind === "ordered" ? touches(answer.orderBy, changed)
    : answer.kind === "ranked" ? changed.some((c) => !(answer.unaffectedBy ?? []).some((u) => overlapsPath(u, asPath(c))))
    : answer.kind === "derived" ? answer.fields === undefined || touches([...answer.fields, ...(answer.where ? reads(answer.where) : [])], changed)
    : false;
  return depends ? { repair: true, why: "server" as Why, detail: `a ${answer.kind} answer depends on ${changed.map((c) => asPath(c).join(".")).join(", ")}` } : { repair: false };
}

// The static, field-level form `flow explain` uses, with no record and no input: an answer may repair from a write
// if any path the write can change touches what the answer depends on. The write can change its predicted fields,
// every field of the record shapes its response carries (a response can reveal any of them), and its .alsoChanges
// targets. "No" is printed only when none touches.
export function mayRepair(answer: Answer, writeChanges: readonly ChangedPath[]): boolean {
  if (answer.kind === "one") return false;
  const where = answer.where ? reads(answer.where) : [];
  const extra = answer.kind === "ordered" ? answer.orderBy : answer.kind === "derived" ? (answer.fields ?? [["*"]]) : answer.kind === "ranked" ? [["*"] as Path] : [];
  return touches([...where, ...extra], writeChanges);
}

// The response check: a returned record contradicts the condition only when it definitely fails it.
export const contradicts = (where: IR, input: unknown, row: object) => evaluate(where, { input, record: row }).v === "no";

// ───────────────────────────────────────────────────────────── predictions: start, replay, settle

// A total canonical text: sorted object keys, bigint, Map, Set, Date, NaN and ±Infinity spelt out, cycles cut. It
// never throws, so one odd key cannot crash a replay or a view.
export function canonical(x: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (typeof x === "bigint") return `${x}n`;
  if (typeof x === "number") return Number.isFinite(x) ? JSON.stringify(x) : String(x);
  if (typeof x === "undefined") return "undefined";
  if (typeof x === "function" || typeof x === "symbol") return `<${typeof x}>`;
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (seen.has(x)) return "<cycle>";
  seen.add(x);
  if (x instanceof Date) return `Date(${x.getTime()})`;
  if (Array.isArray(x)) return `[${x.map((e) => canonical(e, seen)).join(",")}]`;
  if (x instanceof Map) return `Map{${[...x.entries()].map(([k, v]) => `${canonical(k, seen)}=>${canonical(v, seen)}`).sort().join(",")}}`;
  if (x instanceof Set) return `Set{${[...x].map((e) => canonical(e, seen)).sort().join(",")}}`;
  const proto = Object.getPrototypeOf(x);
  const tag = proto && proto !== Object.prototype ? `${proto.constructor?.name ?? "?"}` : "";
  return `${tag}{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical((x as any)[k], seen)}`).join(",")}}`;
}
const keyText = canonical;
// A key decoded through the entity's primary-key Schema, so "12" and 12 are one record when the key is a number.
function decodeKey(entity: string, key: unknown): unknown {
  const types = keyTypesOf.get(entity);
  if (!types || key === null || typeof key !== "object") return key;
  const out: Record<string, unknown> = { ...(key as object) };
  for (const [f, t] of Object.entries(types)) {
    const v = out[f];
    if (t === "number" && typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) out[f] = Number(v);
    if (t === "bigint" && (typeof v === "string" || typeof v === "number")) out[f] = BigInt(v);
    if (t === "string" && typeof v === "number") out[f] = String(v);
  }
  return out;
}
// Predictions are kept per (entity, key, field): settlement, confirmation and retirement never cross records.
const slot = (entity: string, key: unknown, field: string) => `${entity}:${keyText(key)}:${field}`;

export type Live = {
  attempt: string;
  kind: "patch" | "delete";
  entity: string;
  keys: unknown[];
  many: boolean;
  fields: { [k: string]: FieldIR };
  fns: Record<string, (beneath: any, input: any) => unknown>;
  input: unknown;
  retired: ReadonlySet<string>; // slots a later confirmed write retired (ED:511-513), for this record only
};

const valueOf = (ir: IR, input: unknown): unknown => {
  if ("ref" in ir) return ir.ref.slice(1).reduce((v: any, p) => (v == null ? v : v[p]), input);
  if ("val" in ir) return typeof ir.val === "object" && ir.val !== null ? new Date(ir.val.date) : ir.val;
  if ("arr" in ir) return ir.arr.map((x) => valueOf(x, input));
  if ("obj" in ir) return Object.fromEntries(Object.entries(ir.obj).map(([k, x]) => [k, valueOf(x, input)]));
  throw new Error("a key or recorded field is a read or a constant");
};

// At write start: each key is read from the real (Type-side) input and decoded through the primary-key Schema.
// An array key (`many`) predicts each record it lists, once. The input is frozen: it is the request body.
export function start(changes: readonly ChangeIR[], input0: unknown, attempt: string): Live[] {
  const input = frozenCopy(input0); // the caller's objects are never frozen in place
  return changes.map((c) => {
    const k = valueOf(c.key, input);
    const raw = c.many && Array.isArray(k) ? k : [k];
    const keys = [...new Map(raw.map((x) => decodeKey(c.entity, x)).map((x) => [keyText(x), x])).values()];
    const fields = c.fields ?? {};
    return { attempt, kind: c.change, entity: c.entity, keys, many: c.many === true, fields, fns: runtimeFns.get(fields) ?? {}, input, retired: new Set() };
  });
}

// The records whose queues a start joins: each once, however many patches name it.
export const queueKeys = (lives: readonly Live[]) => [...new Set(lives.flatMap((l) => l.keys.map((k) => `${l.entity}:${keyText(k)}`)))];

// Merge 4 rule 34's default lane key: only for a write predicting one record by a single (non-array) key.
export const laneKey = (lives: readonly Live[]) => {
  const keys = queueKeys(lives);
  return keys.length === 1 && lives.every((l) => !l.many) ? lives[0]!.keys[0] : undefined;
};

// Each live prediction's key texts, computed once (a bulk write is not O(K²) across its replays).
const keyTextCache = new WeakMap<Live, ReadonlySet<string>>();
const keyTextsOf = (l: Live) => {
  let t = keyTextCache.get(l);
  if (!t) keyTextCache.set(l, (t = new Set(l.keys.map((k) => keyText(k)))));
  return t;
};

// A prediction fault: the author's mistake (a sealed read, a write to the frozen record or input, two results from
// one record and input, a harness that cannot copy the value). It behaves like an uncomputed value for display and
// settlement, and is also reported as a `predictionFault` diagnostic (a Story fails on it). It is never thrown out
// of a replay or a view.
export class PredictionFault extends Error {}

export type SlotState = { attempt: string; slot: string; field: string; state: "shown" | "uncomputed" | "fault"; reason?: string };
export type Replayed<Row> = {
  visible: Row | "deleted" | undefined;
  slots: SlotState[]; // every (entity, key, field) a live prediction names on this record, with its state
  faults: { attempt: string; field: string; reason: string }[];
};

// A stand-in for the field's Schema check: a value must be defined, and a number finite.
const acceptable = (x: unknown) => x !== undefined && !(typeof x === "number" && !Number.isFinite(x));
// A Date offers its getters only; Maps and Sets are ReadonlyMap and ReadonlySet.
export type ReadonlyDate = Omit<Date, `set${string}`>;
export type DeepReadonly<T> = T extends Date
  ? ReadonlyDate
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends Set<infer V>
      ? ReadonlySet<DeepReadonly<V>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

// Store records, snapshots and inputs are deeply frozen plain data in every environment (Machines O8). Freezing does
// not stop a Date's `set*` or a Map's or Set's mutators, so those get own methods that throw `FrozenWrite` before the
// object is frozen. ArrayBuffer views (Uint8Array) cannot be frozen and are left as they are. Freezing never throws.
export class FrozenWrite extends TypeError {}
const DATE_SETTERS = Object.getOwnPropertyNames(Date.prototype).filter((n) => n.startsWith("set"));
const seal = (x: object, names: readonly string[]) => {
  for (const n of names)
    Object.defineProperty(x, n, {
      value() {
        throw new FrozenWrite(`${n} on a frozen record or input`);
      },
    });
};
export function deepFreeze<T>(x: T, seen: WeakSet<object> = new WeakSet()): T {
  if (x === null || typeof x !== "object" || seen.has(x as object) || ArrayBuffer.isView(x)) return x;
  seen.add(x as object);
  try {
    if (x instanceof Date) seal(x, DATE_SETTERS);
    else if (x instanceof Map) {
      for (const [k, v] of x) (deepFreeze(k, seen), deepFreeze(v, seen));
      seal(x, ["set", "delete", "clear"]);
    } else if (x instanceof Set) {
      for (const v of x) deepFreeze(v, seen);
      seal(x, ["add", "delete", "clear"]);
    } else for (const k of Object.keys(x)) deepFreeze((x as any)[k], seen);
    return Object.freeze(x);
  } catch {
    return x; // an exotic object that cannot be frozen stays as it is; never thrown out of replay or start
  }
}
const frozenCopy = <T>(x: T): T => {
  try {
    return deepFreeze(copy(x));
  } catch {
    return x;
  }
};
// A copy that keeps prototypes (Schema.Class, Option, Data), Maps, Sets, Dates and bigints; it stands in for
// copying through the entity's and the input's Schemas. A value it cannot copy is a fault.
function copy<T>(x: T, seen: Map<object, unknown> = new Map()): T {
  if (x === null || typeof x !== "object") return x;
  if (seen.has(x as object)) return seen.get(x as object) as T;
  if (ArrayBuffer.isView(x)) return x;
  if (x instanceof Date) return new Date(x.getTime()) as T;
  if (x instanceof Map) {
    const m = new Map();
    seen.set(x as object, m);
    for (const [k, v] of x) m.set(copy(k, seen), copy(v, seen));
    return m as T;
  }
  if (x instanceof Set) {
    const st = new Set();
    seen.set(x as object, st);
    for (const v of x) st.add(copy(v, seen));
    return st as T;
  }
  const out = Array.isArray(x) ? [] : Object.create(Object.getPrototypeOf(x));
  seen.set(x as object, out);
  for (const k of Object.keys(x)) out[k] = copy((x as any)[k], seen);
  return out;
}
// A copy that records any write to it, even one that stores the value already there: plain objects and arrays are
// proxies with write traps, and Dates, Maps and Sets have their mutators wrapped. Used only to classify a TypeError.
function watched<T>(x: T, flag: { wrote: boolean }, seen: Map<object, unknown> = new Map()): T {
  if (x === null || typeof x !== "object") return x;
  if (seen.has(x as object)) return seen.get(x as object) as T;
  const c: any = copy(x);
  if (c instanceof Date || c instanceof Map || c instanceof Set || ArrayBuffer.isView(c)) {
    const names = c instanceof Date ? DATE_SETTERS : c instanceof Map ? ["set", "delete", "clear"] : c instanceof Set ? ["add", "delete", "clear"] : [];
    for (const n of names) {
      const orig = (c as any)[n];
      Object.defineProperty(c, n, { value: (...a: unknown[]) => ((flag.wrote = true), orig.apply(c, a)) });
    }
    if (c instanceof Map) for (const [k, v] of [...c]) c.set(k, watched(v, flag, seen));
    seen.set(x as object, c);
    return c as T;
  }
  for (const k of Object.keys(c)) c[k] = watched(c[k], flag, seen);
  const p = new Proxy(c, {
    set: (t, k, v) => ((flag.wrote = true), Reflect.set(t, k, v)),
    deleteProperty: (t, k) => ((flag.wrote = true), Reflect.deleteProperty(t, k)),
    defineProperty: (t, k, d) => ((flag.wrote = true), Reflect.defineProperty(t, k, d)),
  });
  seen.set(x as object, p);
  return p;
}

// Runtime options (like audit mode): `checkReplays` calls each field function twice per replay and compares the
// outcomes; it is on by default in Stories and propertyTest, off in production.
export type ReplayOptions = { checkReplays?: boolean };

type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown };
const attempt = (fn: (b: any, i: any) => unknown, b: unknown, i: unknown): Outcome => {
  try {
    return { ok: true, value: fn(b, i) };
  } catch (error) {
    return { ok: false, error };
  }
};
// Calls a field's function on the frozen record beneath and the frozen input. A FrozenWrite (a Date, Map or Set
// mutator) is a fault. Any other TypeError is classified by calling it again on watched copies: a write is a fault,
// otherwise it is an ordinary failure for this record (uncomputed). Under checkReplays each of the two calls has its
// own outcome; two different outcomes (a value and a throw, or two values) are a fault.
function callField(fn: (b: any, i: any) => unknown, beneath: object, input: unknown, options: ReplayOptions): unknown {
  const first = attempt(fn, beneath, input);
  if (!first.ok) {
    const e = first.error;
    if (e instanceof FrozenWrite) throw new PredictionFault(`the function wrote to the record or input (${e.message})`);
    if (e instanceof TypeError) {
      const flag = { wrote: false };
      let cb: object, ci: unknown;
      try {
        cb = watched(beneath, flag);
        ci = watched(input, flag);
      } catch {
        throw new PredictionFault("the record or input could not be copied to classify a TypeError");
      }
      attempt(fn, cb, ci);
      if (flag.wrote) throw new PredictionFault("the function wrote to the record beneath or the input; it must return a new value");
    }
  }
  if (options.checkReplays) {
    const second = attempt(fn, beneath, input);
    const same = first.ok && second.ok ? canonical(first.value) === canonical(second.value) : !first.ok && !second.ok && String(first.error) === String(second.error);
    if (!same) throw new PredictionFault("the function gave two different outcomes for one record and input; it must be pure and deterministic");
  }
  if (!first.ok) throw first.error;
  return first.value;
}

// Replay: the base with this record's live predictions in start order (a write's patches in written order). Every
// field of one patch sees the same frozen record beneath. A key that cannot be compared is a fault for that live
// prediction, never a crash.
export function replay<Row extends object>(base: Row | undefined, lives: readonly Live[], entity: string, key: unknown, options: ReplayOptions = { checkReplays: true }): Replayed<Row> {
  let cur: Row | "deleted" | undefined = base === undefined ? undefined : deepFreeze(base);
  const slots: SlotState[] = [];
  const faults: Replayed<Row>["faults"] = [];
  let me: string;
  try {
    me = keyText(decodeKey(entity, key));
  } catch (e) {
    return { visible: cur, slots, faults: [{ attempt: "-", field: "-", reason: `the key cannot be read: ${(e as Error).message}` }] };
  }
  for (const l of lives) {
    let mine = false;
    try {
      mine = l.entity === entity && keyTextsOf(l).has(me);
    } catch (e) {
      faults.push({ attempt: l.attempt, field: "-", reason: `a key cannot be compared: ${(e as Error).message}` });
    }
    if (!mine) continue;
    if (l.kind === "delete") {
      cur = "deleted";
      continue;
    }
    const beneath: Row | undefined = cur === "deleted" ? undefined : cur;
    const next = { ...(beneath ?? {}) } as Record<string, unknown>;
    for (const [f, ir] of Object.entries(l.fields)) {
      const sl = slot(entity, key, f);
      if (l.retired.has(sl)) continue;
      try {
        if (beneath === undefined) throw new Error("the record is not held");
        const v = "runtime" in ir ? callField(l.fns[f]!, beneath, l.input, options) : valueOf(ir, l.input);
        if (!acceptable(v)) throw new Error(`the field's Schema rejects ${String(v)}`);
        next[f] = frozenCopy(v); // a value the function returned is copied before it is frozen
        slots.push({ attempt: l.attempt, slot: sl, field: f, state: "shown" });
      } catch (e) {
        const reason = (e as Error).message;
        const fault = e instanceof RecordingError || e instanceof PredictionFault;
        slots.push({ attempt: l.attempt, slot: sl, field: f, state: fault ? "fault" : "uncomputed", reason });
        if (fault) faults.push({ attempt: l.attempt, field: f, reason });
      }
    }
    cur = beneath === undefined ? cur : deepFreeze(next as Row);
  }
  return { visible: cur, slots, faults };
}

// Settlement on success, per record, fed by the replay: every slot the attempt predicted on these records, shown,
// uncomputed or faulted. A response confirms a predicted field only on a record it carries, and only if it carries
// that field's whole value: the field itself or a prefix of it. A partial object (`meta.color` alone) confirms
// neither `meta` nor `meta.owner`. A confirmed slot retires older live predictions of that slot only.
export function settle(
  lives: readonly Live[],
  attempt: string,
  responses: readonly { entity: string; key: unknown; fields: readonly ChangedPath[] }[],
  replays: readonly Replayed<object>[],
  // The shapes that can confirm each entity's fields: the write's response places, read entries and loaders. When
  // given, a predicted field no shape holds whole ends at settlement instead of waiting (PredictionNotRetained).
  carriers?: readonly { entity: string; paths: readonly ChangedPath[] }[],
) {
  const carries = (entity: string, key: unknown, field: string) =>
    responses.some((r) => {
      try {
        return r.entity === entity && keyText(decodeKey(entity, r.key)) === keyText(key) && r.fields.some((p) => { const q = asPath(p); return q.length <= 1 && q[0] === field; });
      } catch {
        return false;
      }
    });
  const mine = replays.flatMap((r) => r.slots.filter((s) => s.attempt === attempt));
  const unconfirmed: string[] = [];
  const ended: string[] = []; // no carrier holds the whole field: the prediction ends, the field is dropped (EDP:99-100)
  const confirmed = new Set<string>();
  for (const l of lives.filter((x) => x.attempt === attempt))
    for (const k of l.keys)
      for (const f of Object.keys(l.fields)) {
        const sl = slot(l.entity, k, f);
        if (!mine.some((s) => s.slot === sl)) continue; // only what the replay says was predicted
        if (carries(l.entity, k, f)) confirmed.add(sl);
        else if (carriers && !carriers.some((c) => c.entity === l.entity && c.paths.some((p) => { const q = asPath(p); return q.length === 1 && q[0] === f; }))) {
          if (!ended.includes(sl)) ended.push(sl);
        } else if (!unconfirmed.includes(sl)) unconfirmed.push(sl);
      }
  const firstMine = lives.findIndex((l) => l.attempt === attempt);
  const remaining = lives
    .filter((l) => l.attempt !== attempt)
    .map((l) => (lives.indexOf(l) < firstMine ? { ...l, retired: new Set([...l.retired, ...confirmed]) } : l));
  return { remaining, unconfirmed, ended };
}

// ───────────────────────────────────────────────────────────── one App: identities are unique

// Errors at App construction or lazy adoption, for factories as for literal domains: a domain id, an entity id (two
// entity objects with one id) or an operation registered twice, in two domains or in two entries of one (EDP:21-25).
export function app(domains: readonly Domain[], entities: readonly { id: string }[] = []): void {
  const ids = new Set<string>();
  const ops = new Map<string, string>();
  for (const d of domains) {
    if (ids.has(d.id)) throw new RecordingError(`InvalidConfiguration: two domains named ${d.id}`);
    ids.add(d.id);
    for (const [name, e] of Object.entries(d.entries)) {
      const prev = ops.get(e.d.op);
      if (prev) throw new RecordingError(`InvalidConfiguration: operation ${e.d.op} is registered in ${prev} and ${d.id}.${name}`);
      ops.set(e.d.op, `${d.id}.${name}`);
    }
  }
  const seen = new Map<string, object>();
  for (const e of entities) {
    const prev = seen.get(e.id);
    if (prev && prev !== e) throw new RecordingError(`InvalidConfiguration: two entities with id ${e.id}`);
    seen.set(e.id, e);
  }
}

// ───────────────────────────────────────────────────────────── the response's order check (ED 4.4)

// Each adjacent pair is compared key by key with Effect's Order. A key the client cannot order (null,
// non-finite, an invalid Date, a Date tie at millisecond precision) makes the pair maybe: skipped, never
// HiddenOrder (M5-D4). Unequal strings leave the pair undecided (ED:408-410).
export type OrderFinding = { hiddenOrder: { index: number; key: string } } | { ok: true; skipped: number };
export function checkOrder(rows: readonly Record<string, unknown>[], sorts: readonly IR[]): OrderFinding {
  let skipped = 0;
  for (let i = 0; i + 1 < rows.length; i++) {
    for (const s of sorts) {
      if (!("op" in s)) continue;
      const k = s.args[0]!;
      const field = "ref" in k ? k.ref[k.ref.length - 1]! : "?";
      const a = rows[i]![field];
      const b = rows[i + 1]![field];
      const bad = (x: unknown) => x === null || x === undefined || (typeof x === "number" && !Number.isFinite(x)) || (x instanceof Date && Number.isNaN(x.getTime()));
      if (bad(a) || bad(b) || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime())) {
        skipped++;
        break;
      }
      let c: -1 | 0 | 1;
      if (typeof a === "number" && typeof b === "number") c = Order.Number(a, b);
      else if (a instanceof Date && b instanceof Date) c = Order.Date(a, b);
      else if (typeof a === "boolean" && typeof b === "boolean") c = Order.Boolean(a, b);
      else if (a === b) continue;
      else break; // unequal strings: undecided
      if (c === 0) continue;
      if ((s.op === "asc" ? c : -c) > 0) return { hiddenOrder: { index: i, key: field } };
      break;
    }
  }
  return { ok: true, skipped };
}
