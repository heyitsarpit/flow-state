// A stand-in for "flow-state": the operator set, recording proxies, a few domain entries and the one
// evaluator the runtime would use. It is not the library: no Schema, no store, no join, no input rule.
import { Order } from "effect";

// ───────────────────────────────────────────────────────────── the description (plain data)

export type Scalar = string | number | boolean | null;
export type Value = Scalar | Date; // a decoded field value a condition may compare

export type IR =
  | { readonly ref: readonly string[] } // root first: input, record, result, prior
  | { readonly val: Scalar | { readonly date: number } } // a Date constant is kept as its time
  | { readonly arr: readonly IR[] }
  | { readonly obj: { readonly [k: string]: IR } }
  | { readonly op: string; readonly args: readonly IR[] }
  | { readonly opaque: readonly IR[] }; // a runtime function's declared dependencies

export class RecordingError extends Error {}

const IRK: unique symbol = Symbol("flow.ir");
declare const phantom: unique symbol;
declare const pathBrand: unique symbol;

// An expression of value type V, with three facts the types check:
//   O  it may appear only directly under `and` (or as the whole condition): it reads an optional input,
//      or it is serverMatches;
//   A  it uses a value-only operator (arithmetic, opaque), so it is never in a condition or a key;
//   N  it orders a nullable value, so it may not be negated (`not`, `when`'s condition): coalesce first.
export interface Expr<V, O extends boolean = false, A extends boolean = false, N extends boolean = false> {
  readonly [phantom]?: { v: V; o: O; a: A; n: N };
}
export type Cond<O extends boolean = false, N extends boolean = false> = Expr<boolean, O, false, N>;
type AnyCond = Expr<boolean, boolean, false, boolean>;

// A constant is not an expression (a primitive or a Date would otherwise match the all-optional Expr shape).
type ValOf<E> = E extends Value ? E : E extends Expr<infer V, any, any, any> ? V : E;
type OptOf<E> = E extends Value ? false : E extends Expr<any, infer O, any, any> ? O : false;
type ArithOf<E> = E extends Value ? false : E extends Expr<any, any, infer A, any> ? A : false;
type NegOf<E> = E extends Value ? false : E extends Expr<any, any, any, infer N> ? N : false;
type Nullable<E> = null extends ValOf<E> ? true : false;

// A recorded parameter read. Only these carry the path brand, so a key cannot be a computed expression.
type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;
export type Fields<T, O extends boolean = false> = {
  readonly [K in keyof T]-?: Ref<Exclude<T[K], undefined>, O extends true ? true : IsOptional<T, K>>;
};
export type Ref<V, O extends boolean> = Expr<V, O, false, false> & { readonly [pathBrand]: true } &
  (NonNullable<V> extends Value ? unknown : NonNullable<V> extends readonly unknown[] ? unknown : Fields<NonNullable<V>, O>);
type PathRef<V> = Expr<V, false, false, false> & { readonly [pathBrand]: true };

// ───────────────────────────────────────────────────────────── recording

export function refProxy(path: readonly string[]): any {
  return new Proxy(Object.create(null), {
    get(_t, p) {
      if (p === IRK) return { ref: path };
      if (p === Symbol.toPrimitive)
        return () => {
          throw new RecordingError(
            `${path.join(".")} was converted to a primitive: arithmetic, templates and < > are not recorded; write add, sub, lt, gt`,
          );
        };
      if (typeof p === "symbol" || p === "then" || p === "toJSON") return undefined;
      return refProxy([...path, p]);
    },
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

// Records a free-standing expression (the conformance table uses it).
export const record = (f: (c: { input: any; record: any; prior: any }) => unknown): IR =>
  toIR(f({ input: refProxy(["input"]), record: refProxy(["record"]), prior: refProxy(["prior"]) }), "expression");

// ───────────────────────────────────────────────────────────── operators

type Arg<V> = V | Expr<V, boolean, false, false>; // a condition argument: a constant or a recorded value
type Ordered = number | Date | null;

// Conditions: each evaluates on the client exactly as the conformance table says, two-valued.
export function eq<L extends Expr<Value, boolean, false>, R extends Arg<ValOf<L>>>(a: L, b: R): Cond<OptOf<L> | OptOf<R>> {
  return node("eq", a, b);
}
export function oneOf<L extends Expr<Value, boolean, false>, R extends Arg<readonly ValOf<L>[]>>(a: L, values: R): Cond<OptOf<L> | OptOf<R>> {
  return node("oneOf", a, values);
}
export function contains<L extends Expr<readonly Value[], boolean, false>, R extends Arg<ValOf<L>[number]>>(a: L, v: R): Cond<OptOf<L> | OptOf<R>> {
  return node("contains", a, v);
}
export function between<L extends Expr<Ordered, boolean, false>, F extends Arg<NonNullable<ValOf<L>>>, T extends Arg<NonNullable<ValOf<L>>>>(
  a: L,
  from: F,
  to: T,
): Cond<OptOf<L> | OptOf<F> | OptOf<T>, Nullable<L>> {
  return node("between", a, from, to);
}
export function overlaps<
  S extends Expr<Ordered, boolean, false>,
  E extends Expr<NonNullable<ValOf<S>> | null, boolean, false>,
  F extends Arg<NonNullable<ValOf<S>>>,
  T extends Arg<NonNullable<ValOf<S>>>,
>(start: S, end: E, from: F, to: T): Cond<OptOf<S> | OptOf<E> | OptOf<F> | OptOf<T>, Nullable<S> | Nullable<E>> {
  return node("overlaps", start, end, from, to);
}
type Compare = <L extends Expr<Ordered, boolean, false>, R extends Arg<NonNullable<ValOf<L>>> | Expr<ValOf<L>, boolean, false>>(
  a: L,
  b: R,
) => Cond<OptOf<L> | OptOf<R>, Nullable<L> | Nullable<R>>;
export const gt: Compare = (a, b) => node("gt", a, b);
export const gte: Compare = (a, b) => node("gte", a, b);
export const lt: Compare = (a, b) => node("lt", a, b);
export const lte: Compare = (a, b) => node("lte", a, b);
export function isNull<L extends Expr<Value, false, false>>(a: null extends ValOf<L> ? L : "isNull needs a nullable field"): Cond {
  return node("isNull", a);
}
// An absent optional input drops its constraint only directly under `and`, or as the whole condition.
export function and<C extends readonly AnyCond[]>(...cs: C): Cond<OptOf<C[number]>, NegOf<C[number]>> {
  return node("and", ...cs);
}
export function or<C extends readonly Expr<boolean, false, false, boolean>[]>(...cs: C): Cond<false, NegOf<C[number]>> {
  return node("or", ...cs);
}
export function not(c: Expr<boolean, false, false, false>): Cond {
  return node("not", c);
}
// It may hold for any record, so it is a constraint only directly under `and` (O = true).
export function serverMatches(input: Expr<unknown, boolean, false>, ...fields: readonly Expr<unknown, false, false>[]): Cond<true> {
  return node("serverMatches", input, ...fields);
}

// Allowed in conditions and values. `when` is lazy: only the chosen branch is evaluated.
export function when<V, A1 extends boolean = false, A2 extends boolean = false, N1 extends boolean = false, N2 extends boolean = false>(
  c: Expr<boolean, false, false, false>,
  a: V | Expr<V, false, A1, N1>,
  b: V | Expr<V, false, A2, N2>,
): Expr<V, false, A1 | A2, N1 | N2> {
  return node("when", c, a, b);
}
// `null` and absent both take the default.
export function coalesce<L extends Expr<unknown, boolean, boolean>, A2 extends boolean = false>(
  a: L,
  b: NonNullable<ValOf<L>> | Expr<NonNullable<ValOf<L>>, false, A2>,
): Expr<NonNullable<ValOf<L>>, false, ArithOf<L> | A2> {
  return node("coalesce", a, b);
}

// Values only (predicted field values): arithmetic and opaque functions.
type NumArg = number | Expr<number, false, boolean>;
export function add(a: NumArg, b: NumArg): Expr<number, false, true> {
  return node("add", a, b);
}
export function sub(a: NumArg, b: NumArg): Expr<number, false, true> {
  return node("sub", a, b);
}
// The runtime keeps the function beside its description node; the Model (plain data) holds only the
// dependency list (Inspection O1 holds no closures).
const opaqueFns = new WeakMap<object, (...values: never[]) => unknown>();
export function opaque<const D extends readonly Expr<any, false, boolean>[], R>(
  deps: D,
  fn: (...values: { -readonly [I in keyof D]: ValOf<D[I]> }) => R,
): Expr<R, false, true> {
  const ir = { opaque: deps.map((d) => toIR(d, "opaque")) };
  opaqueFns.set(ir, fn as never);
  return { [IRK]: ir } as any;
}

// Sort keys.
export type Sort = { readonly __sort: true };
export const asc = (k: Expr<Value, false, false>): Sort => node("asc", k);
export const desc = (k: Expr<Value, false, false>): Sort => node("desc", k);

// ───────────────────────────────────────────────────────────── entities and changes

declare const changeBrand: unique symbol;
export interface Change {
  readonly [changeBrand]: true;
}
// A key is parameter reads and constants only: never `when`, arithmetic or opaque. An array of keys
// (a bulk write) predicts each record; it is evaluated at start and never takes merge 4 rule 34's default.
type KeyArg<Key> = PathRef<Key> | PathRef<readonly Key[]> | { readonly [F in keyof Key]: Key[F] | PathRef<Key[F]> };
type Slot<T, Row> = T | Expr<T, false, boolean, boolean> | ((prior: Fields<Row>) => T | Expr<T, false, boolean, boolean>);

export interface Entity<Row, K extends keyof Row, Ver extends keyof Row> {
  readonly id: string;
  patch(key: KeyArg<Pick<Row, K>>, fields: { readonly [F in Exclude<keyof Row, K | Ver>]?: Slot<Row[F], Row> }): Change;
  delete(key: KeyArg<Pick<Row, K>>, options?: { version: unknown }): Change;
  save(row: Row): Change; // runtime only (`.as`)
}
export type RowOf<E> = E extends Entity<infer Row, any, any> ? Row : never;

export const entity =
  <Row>() =>
  <const K extends keyof Row, Ver extends keyof Row = never>(d: { id: string; primaryKey: readonly K[]; version?: Ver }): Entity<Row, K, Ver> => ({
    id: d.id,
    patch: (key, fields) => {
      const out: Record<string, IR> = {};
      for (const [f, v] of Object.entries(fields as object)) {
        if (f === d.version) throw new RecordingError(`${d.id}.patch: the version field cannot be patched`);
        out[f] = toIR(typeof v === "function" ? v(refProxy(["prior"])) : v, `${d.id}.patch ${f}`);
      }
      return { [IRK]: { change: "patch", entity: d.id, key: toIR(key, "key"), fields: out } } as any;
    },
    delete: (key) => ({ [IRK]: { change: "delete", entity: d.id, key: toIR(key, "key") } }) as any,
    save: (row) => ({ change: "save", entity: d.id, row }) as any,
  });

// ───────────────────────────────────────────────────────────── operations and entries (stand-ins)

declare const opTypes: unique symbol;
export interface Op<I, R> {
  readonly id: string;
  readonly [opTypes]?: [I, R];
}
export const op =
  <I, R>() =>
  (id: string): Op<I, R> => ({ id });

export type ChangeIR = { change: "patch" | "delete"; entity: string; key: IR; fields?: { [k: string]: IR } };
export type EntryDescription = {
  kind: "read" | "write" | "listen";
  op: string;
  places?: { mode: "one" | "list"; entity: string; at: IR | null }[];
  byKey?: IR;
  where?: IR;
  orderBy?: IR[];
  pagedBy?: { input: IR; next: IR };
  derivedFrom?: { entity: string; fields: IR | null };
  predicts?: ChangeIR[];
  as?: { entities: string[]; mapping: "opaque" };
};

const proxies = () => ({ input: refProxy(["input"]), record: refProxy(["record"]), result: refProxy(["result"]) });
const cond = (x: unknown, where: string): IR => {
  if (!irOf(x)) throw new RecordingError(`${where} received ${typeof x}. Write eq(record.x, input.x), and, or, not`);
  return toIR(x, where);
};

export class ReadEntry<I, R, Row> {
  constructor(readonly d: EntryDescription) {}
  private add(patch: Partial<EntryDescription>): any {
    return new ReadEntry({ ...this.d, ...patch });
  }
  one<E extends Entity<any, any, any>>(e: E, at?: (c: { result: Fields<R> }) => Expr<unknown, false, false>): ReadEntry<I, R, RowOf<E>> {
    return this.add({ places: [...(this.d.places ?? []), { mode: "one", entity: e.id, at: at ? toIR(at(proxies() as any), "at") : null }] });
  }
  list<E extends Entity<any, any, any>>(e: E, at: (c: { result: Fields<R> }) => Expr<unknown, false, false>): ReadEntry<I, R, RowOf<E>> {
    return this.add({ places: [...(this.d.places ?? []), { mode: "list", entity: e.id, at: toIR(at(proxies() as any), "at") }] });
  }
  derivedFrom<E extends Entity<any, any, any>>(e: E, fields?: (c: { record: Fields<RowOf<E>> }) => readonly Expr<unknown, false, false>[]): ReadEntry<I, R, RowOf<E>> {
    return this.add({ derivedFrom: { entity: e.id, fields: fields ? toIR(fields(proxies() as any), "derivedFrom") : null } });
  }
  byKey(f: (c: { input: Fields<I> }) => unknown): ReadEntry<I, R, Row> {
    return this.add({ byKey: toIR(f(proxies() as any), "byKey") });
  }
  // Several `.where` calls are combined with `and` (ED:387-388), in call order.
  where(f: (c: { input: Fields<I>; record: Fields<Row> }) => AnyCond): ReadEntry<I, R, Row> {
    const c = cond(f(proxies() as any), ".where");
    return this.add({ where: this.d.where ? { op: "and", args: [this.d.where, c] } : c });
  }
  orderBy(f: (c: { record: Fields<Row> }) => readonly Sort[]): ReadEntry<I, R, Row> {
    return this.add({ orderBy: f(proxies() as any).map((s) => toIR(s, ".orderBy")) });
  }
  pagedBy(input: (c: { input: Fields<I> }) => Expr<unknown, boolean, false>, next: (c: { result: Fields<R> }) => Expr<unknown, boolean, false>): ReadEntry<I, R, Row> {
    return this.add({ pagedBy: { input: toIR(input(proxies() as any), "pagedBy"), next: toIR(next(proxies() as any), "pagedBy") } });
  }
}

export class WriteEntry<I, R> {
  constructor(readonly d: EntryDescription) {}
  one(e: Entity<any, any, any>, at?: (c: { result: Fields<R> }) => Expr<unknown, false, false>): WriteEntry<I, R> {
    return new WriteEntry({ ...this.d, places: [...(this.d.places ?? []), { mode: "one", entity: e.id, at: at ? toIR(at(proxies() as any), "at") : null }] });
  }
  // Recorded once. The changes, their entities, keys and field names are structure; `when` and
  // arithmetic may appear only inside a field's value, never around a change or in a key.
  predicts(f: (c: { input: Fields<I> }) => Change | readonly Change[]): WriteEntry<I, R> {
    const out = f(proxies() as any);
    const changes = (Array.isArray(out) ? out : [out]).map((c) => {
      const ir = irOf(c) as unknown as ChangeIR | undefined;
      if (!ir || !("change" in ir)) throw new RecordingError(".predicts must return Entity.patch or Entity.delete");
      return ir;
    });
    return new WriteEntry({ ...this.d, predicts: changes });
  }
}

export class ListenEntry<I, Ev> {
  constructor(readonly d: EntryDescription, readonly mapping?: (event: Ev) => unknown) {}
  as(entities: readonly Entity<any, any, any>[], mapping: (event: Ev) => Change): ListenEntry<I, Ev> {
    return new ListenEntry({ ...this.d, as: { entities: entities.map((e) => e.id), mapping: "opaque" } }, mapping);
  }
}

export const read = <I, R>(o: Op<I, R>) => new ReadEntry<I, R, never>({ kind: "read", op: o.id });
export const write = <I, R>(o: Op<I, R>) => new WriteEntry<I, R>({ kind: "write", op: o.id });
export const listen = <I, Ev>(o: Op<I, Ev>) => new ListenEntry<I, Ev>({ kind: "listen", op: o.id });

export type Domain = { id: string; entries: Record<string, { d: EntryDescription }> };
export const domain = <E extends Record<string, { d: EntryDescription }>>(id: string, entries: E) => ({ id, entries });
export const describe = (dm: Domain): Record<string, EntryDescription> =>
  Object.fromEntries(Object.entries(dm.entries).map(([k, e]) => [k, e.d]));

// ───────────────────────────────────────────────────────────── the one evaluator

export type Env = { input?: unknown; record?: unknown; prior?: unknown; result?: unknown };
// A condition or value could not be evaluated: a bad value, or an operator outside its position.
export class EvaluationError extends Error {}
// A condition read a record field the record (the delta) does not carry.
export class NotCarried extends Error {}

function readRef(path: readonly string[], env: Env): unknown {
  let v: any = (env as any)[path[0]!];
  for (const p of path.slice(1)) {
    if (v === null || v === undefined) break;
    v = v[p];
  }
  if (v === undefined && path[0] === "record") throw new NotCarried(path.join("."));
  if (v === undefined && path[0] === "prior") throw new EvaluationError(`${path.join(".")} is not held`);
  return v; // an absent input reads as undefined
}

// Every value an operator compares is checked first: a non-finite number or an invalid Date is a failure.
function checked(x: unknown, op: string): unknown {
  if (x === undefined) throw new EvaluationError(`${op} read an absent input outside \`and\``);
  if (typeof x === "number" && !Number.isFinite(x)) throw new EvaluationError(`${op}: ${x} is not a finite number`);
  if (x instanceof Date && Number.isNaN(x.getTime())) throw new EvaluationError(`${op}: an invalid Date`);
  return x;
}
const asDate = (x: unknown) => (x !== null && typeof x === "object" && "date" in (x as object) ? new Date((x as any).date) : x);

// Equality: scalars by ===; Dates by time; a Date never equals a non-Date.
function equal(a: unknown, b: unknown, op: string): boolean {
  a = checked(a, op);
  b = checked(b, op);
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  return a === b;
}
// Order: Effect's Order.Number and Order.Date (M5-D2), after the finiteness and validity checks.
// `null` is not ordered: any comparison with it is false.
function compare(a: unknown, b: unknown, op: string): -1 | 0 | 1 | null {
  a = checked(a, op);
  b = checked(b, op);
  if (a === null || b === null) return null;
  if (typeof a === "number" && typeof b === "number") return Order.Number(a, b);
  if (a instanceof Date && b instanceof Date) return Order.Date(a, b);
  throw new EvaluationError(`${op}: cannot order ${typeof a} against ${typeof b}`);
}
const ordered = (a: unknown, b: unknown, op: string, test: (c: -1 | 0 | 1) => boolean) => {
  const c = compare(a, b, op);
  return c === null ? false : test(c);
};

export type Match = { matches: boolean; why: "evaluated" | "notCarried" | "failed"; detail?: string };

// A condition, as the join and the response check use it. A record field the delta does not carry, or a
// failure to evaluate, counts as meeting the condition (ED:523): conservative, so the answer repairs.
export function matches(ir: IR, env: Env): Match {
  try {
    return { matches: holds(ir, env, true), why: "evaluated" };
  } catch (e) {
    if (e instanceof NotCarried) return { matches: true, why: "notCarried", detail: e.message };
    if (e instanceof EvaluationError) return { matches: true, why: "failed", detail: e.message };
    throw e;
  }
}

const isAbsentInput = (a: IR, env: Env) => "ref" in a && a.ref[0] === "input" && readRef(a.ref, env) === undefined;

function holds(ir: IR, env: Env, underAnd: boolean): boolean {
  if ("op" in ir) {
    if (ir.op === "and") return ir.args.every((a) => holds(a, env, true));
    if (underAnd) {
      const absent = ir.args.map((a) => isAbsentInput(a, env));
      const v = (i: number) => value(ir.args[i]!, env);
      switch (ir.op) {
        case "serverMatches":
          return true; // the client cannot evaluate it: it may hold for any record
        case "between": // an absent bound is no bound; the other bound stays
          if (absent[0]) return true;
          return (absent[1] || ordered(v(0), v(1), "between", (c) => c >= 0)) && (absent[2] || ordered(v(0), v(2), "between", (c) => c < 0));
        case "overlaps": // [start, end) overlaps [from, to); an absent bound is no bound
          if (absent[0] || absent[1]) return true;
          if (v(0) === null || v(1) === null) return false;
          return (absent[3] || ordered(v(0), v(3), "overlaps", (c) => c < 0)) && (absent[2] || ordered(v(1), v(2), "overlaps", (c) => c > 0));
        case "eq":
        case "oneOf":
        case "contains":
        case "gt":
        case "gte":
        case "lt":
        case "lte":
          if (absent.some(Boolean)) return true; // a comparison leaf: an absent input drops the leaf
      }
    }
  }
  const v = value(ir, env);
  if (typeof v !== "boolean") throw new EvaluationError("a condition evaluated to a non-boolean");
  return v;
}

export function value(ir: IR, env: Env): unknown {
  if ("ref" in ir) return readRef(ir.ref, env);
  if ("val" in ir) return asDate(ir.val);
  if ("arr" in ir) return ir.arr.map((x) => value(x, env));
  if ("obj" in ir) return Object.fromEntries(Object.entries(ir.obj).map(([k, x]) => [k, value(x, env)]));
  if ("opaque" in ir) {
    const fn = opaqueFns.get(ir);
    if (!fn) throw new EvaluationError("opaque function missing");
    const deps = ir.opaque.map((d) => value(d, env));
    try {
      return (fn as any)(...deps);
    } catch (e) {
      throw new EvaluationError(`opaque function threw: ${(e as Error).message}`);
    }
  }
  const v = (i: number) => value(ir.args[i]!, env);
  const bool = (x: unknown) => {
    if (typeof x !== "boolean") throw new EvaluationError(`${ir.op} needs a boolean, got ${String(x)}`);
    return x;
  };
  const num = (x: unknown) => {
    if (typeof x !== "number" || !Number.isFinite(x)) throw new EvaluationError(`${ir.op} needs a finite number, got ${String(x)}`);
    return x;
  };
  switch (ir.op) {
    case "eq":
      return equal(v(0), v(1), "eq");
    case "oneOf": {
      const list = checked(v(1), "oneOf");
      if (!Array.isArray(list)) throw new EvaluationError("oneOf needs an array");
      const a = v(0);
      return list.some((x) => equal(a, x, "oneOf"));
    }
    case "contains": {
      const list = checked(v(0), "contains");
      if (!Array.isArray(list)) throw new EvaluationError("contains needs an array field");
      const x = v(1);
      return list.some((e) => equal(e, x, "contains"));
    }
    case "gt":
      return ordered(v(0), v(1), "gt", (c) => c > 0);
    case "gte":
      return ordered(v(0), v(1), "gte", (c) => c >= 0);
    case "lt":
      return ordered(v(0), v(1), "lt", (c) => c < 0);
    case "lte":
      return ordered(v(0), v(1), "lte", (c) => c <= 0);
    case "between":
      return ordered(v(0), v(1), "between", (c) => c >= 0) && ordered(v(0), v(2), "between", (c) => c < 0);
    case "overlaps":
      return v(0) !== null && v(1) !== null && ordered(v(0), v(3), "overlaps", (c) => c < 0) && ordered(v(1), v(2), "overlaps", (c) => c > 0);
    case "isNull":
      return v(0) === null;
    case "and":
      return ir.args.every((_, i) => bool(v(i)));
    case "or":
      return ir.args.some((_, i) => bool(v(i)));
    case "not":
      return !bool(v(0));
    case "serverMatches":
      throw new EvaluationError("serverMatches outside `and`");
    case "when":
      return bool(v(0)) ? v(1) : v(2); // lazy: the other branch is never evaluated
    case "coalesce": {
      const a = v(0);
      return a === null || a === undefined ? v(1) : a;
    }
    case "add":
      return num(num(v(0)) + num(v(1)));
    case "sub":
      return num(num(v(0)) - num(v(1)));
    default:
      throw new EvaluationError(`unknown operator ${ir.op}`);
  }
}

// ───────────────────────────────────────────────────────────── predictions: start, replay, settle

const keyText = (k: unknown) => JSON.stringify(k);

export type Live = { attempt: string; kind: "patch" | "delete"; entity: string; keys: unknown[]; many: boolean; fields: { [k: string]: IR }; input: unknown };

// At write start: each key is evaluated once from the real input. An array key predicts each record it
// lists (duplicates are one record). A write's patches are kept in their written order.
export function start(changes: readonly ChangeIR[], input: unknown, attempt: string): Live[] {
  return changes.map((c) => {
    const k = value(c.key, { input });
    const keys = Array.isArray(k) ? [...new Map(k.map((x) => [keyText(x), x])).values()] : [k];
    return { attempt, kind: c.change, entity: c.entity, keys, many: Array.isArray(k), fields: c.fields ?? {}, input };
  });
}

// The records whose queues a start joins: each once, however many patches name it.
export const queueKeys = (lives: readonly Live[]) => [...new Set(lives.flatMap((l) => l.keys.map((k) => `${l.entity}:${keyText(k)}`)))];

// Merge 4 rule 34's default lane key: only for a write that predicts exactly one record by a single key.
// (Statically this is decided from the operation's input Schema; the spike checks the start-time half.)
export const laneKey = (lives: readonly Live[]) => {
  const keys = queueKeys(lives);
  return keys.length === 1 && lives.every((l) => !l.many) ? lives[0]!.keys[0] : undefined;
};

export type Replayed<Row> = {
  visible: Row | "deleted" | undefined;
  predicted: string[]; // every field a live prediction names: shown or skipped (rule A7)
  skipped: { attempt: string; field: string; reason: string }[];
};

// Replay: the base with this record's live predictions applied in start order (and, within one write,
// written order). Every field of one patch reads the same record beneath it (simultaneous assignment).
// A value that cannot be evaluated is skipped: the field keeps the value beneath, still counts as predicted
// (so it reads pending and needs a confirming read), and the other fields are unaffected.
export function replay<Row extends object>(base: Row | undefined, lives: readonly Live[], entity: string, key: unknown): Replayed<Row> {
  let cur: Row | "deleted" | undefined = base;
  const predicted = new Set<string>();
  const skipped: Replayed<Row>["skipped"] = [];
  for (const l of lives) {
    if (l.entity !== entity || !l.keys.some((k) => keyText(k) === keyText(key))) continue;
    if (l.kind === "delete") {
      cur = "deleted";
      continue;
    }
    const beneath: Row | undefined = cur === "deleted" ? undefined : cur;
    const next = { ...(beneath ?? {}) } as Record<string, unknown>;
    for (const [f, ir] of Object.entries(l.fields)) {
      predicted.add(f);
      try {
        if (beneath === undefined) throw new EvaluationError("the record is not held");
        next[f] = value(ir, { input: l.input, prior: beneath });
      } catch (e) {
        if (!(e instanceof EvaluationError)) throw e;
        skipped.push({ attempt: l.attempt, field: f, reason: e.message });
      }
    }
    cur = beneath === undefined ? cur : (next as Row);
  }
  return { visible: cur, predicted: [...predicted], skipped };
}

// Settlement on success: the response's fields join the base; the write's predictions end; a field it
// predicted (shown or skipped) that the response omits is unconfirmed and needs a confirming read; a
// confirmed field retires older live predictions of that field on the record (ED:511-513).
export function settle(lives: readonly Live[], attempt: string, response: Record<string, unknown>) {
  const mine = lives.filter((l) => l.attempt === attempt);
  const older = lives.slice(0, lives.findIndex((l) => l.attempt === attempt));
  const confirmed = Object.keys(response);
  const unconfirmed = [...new Set(mine.flatMap((l) => Object.keys(l.fields)))].filter((f) => !confirmed.includes(f));
  const remaining = lives
    .filter((l) => l.attempt !== attempt)
    .map((l) => (older.includes(l) ? { ...l, fields: Object.fromEntries(Object.entries(l.fields).filter(([f]) => !confirmed.includes(f))) } : l));
  return { remaining, unconfirmed };
}

// ───────────────────────────────────────────────────────────── the response's order check (ED 4.4)

// Each adjacent pair of a response is compared key by key, on the response's own values. Numbers, Dates
// and booleans are compared with Effect's Order (after the finiteness and validity checks); strings are
// never ordered, so an unequal string key ends the pair undecided. A pair with a `null`, non-finite or
// invalid checked key is skipped (M5-D4): the server's null placement is unknown, so it is no evidence.
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
      if (bad(a) || bad(b)) {
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
