// A stand-in for "flow-state": the operator set, recording proxies, a few domain entries and the one
// evaluator the runtime would use. It is not the library: no Schema, no store, no join, no input rule.

// ───────────────────────────────────────────────────────────── the description (plain data)

export type Scalar = string | number | boolean | null;

export type IR =
  | { readonly ref: readonly string[] } // root first: input, record, result, prior
  | { readonly val: Scalar }
  | { readonly arr: readonly IR[] }
  | { readonly obj: { readonly [k: string]: IR } }
  | { readonly op: string; readonly args: readonly IR[] }
  | { readonly opaque: readonly IR[] }; // a runtime function's declared dependencies

export class RecordingError extends Error {}

const IRK: unique symbol = Symbol("flow.ir");
declare const phantom: unique symbol;

// An expression of value type V. O: it reads an optional input. A: it uses a value-only operator
// (arithmetic or opaque), so it may not appear in a condition.
export interface Expr<V, O extends boolean = false, A extends boolean = false> {
  readonly [phantom]?: { v: V; o: O; a: A };
}
export type Cond<O extends boolean = false> = Expr<boolean, O, false>;

// A constant is not an expression (a primitive would otherwise match the all-optional Expr shape).
type ValOf<E> = E extends Scalar ? E : E extends Expr<infer V, any, any> ? V : E;
type OptOf<E> = E extends Scalar ? false : E extends Expr<any, infer O, any> ? O : false;
type ArithOf<E> = E extends Scalar ? false : E extends Expr<any, any, infer A> ? A : false;

// What a recorded parameter looks like: every property read is a recorded reference.
type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;
export type Fields<T, O extends boolean = false> = {
  readonly [K in keyof T]-?: Ref<Exclude<T[K], undefined>, O extends true ? true : IsOptional<T, K>>;
};
export type Ref<V, O extends boolean> = Expr<V, O, false> &
  (NonNullable<V> extends Scalar ? unknown : NonNullable<V> extends readonly unknown[] ? unknown : Fields<NonNullable<V>, O>);

// ───────────────────────────────────────────────────────────── recording

function refProxy(path: readonly string[]): any {
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
  x !== null && (typeof x === "object" || typeof x === "function") ? (x as any)[IRK] : undefined;

export function toIR(x: unknown, where: string): IR {
  const ir = irOf(x);
  if (ir) return ir;
  if (x === null || typeof x === "string" || typeof x === "boolean") return { val: x };
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new RecordingError(`${where}: a constant must be finite`);
    return { val: Object.is(x, -0) ? 0 : x };
  }
  if (Array.isArray(x)) return { arr: x.map((e) => toIR(e, where)) };
  if (typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype)
    return { obj: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toIR(v, where)])) };
  throw new RecordingError(`${where}: received ${typeof x}, which is not a recorded value`);
}

const node = (op: string, ...args: unknown[]): any => ({ [IRK]: { op, args: args.map((a) => toIR(a, op)) } });

// ───────────────────────────────────────────────────────────── operators

type Arg<V> = V | Expr<V, boolean, false>; // a condition argument: a constant or a recorded value
type Num = number | null;

// Conditions: every one evaluates on the client exactly as declared, two-valued, over decoded values.
export function eq<L extends Expr<Scalar, boolean, false>, R extends Arg<ValOf<L>>>(a: L, b: R): Cond<OptOf<L> | OptOf<R>> {
  return node("eq", a, b);
}
export function oneOf<L extends Expr<Scalar, boolean, false>, R extends Arg<readonly ValOf<L>[]>>(a: L, values: R): Cond<OptOf<L> | OptOf<R>> {
  return node("oneOf", a, values);
}
export function contains<L extends Expr<readonly Scalar[], boolean, false>, R extends Arg<ValOf<L>[number]>>(a: L, v: R): Cond<OptOf<L> | OptOf<R>> {
  return node("contains", a, v);
}
export function between<L extends Expr<Num, boolean, false>, F extends Arg<number>, T extends Arg<number>>(a: L, from: F, to: T): Cond<OptOf<L> | OptOf<F> | OptOf<T>> {
  return node("between", a, from, to);
}
export function overlaps<S extends Expr<Num, boolean, false>, E extends Expr<Num, boolean, false>, F extends Arg<number>, T extends Arg<number>>(start: S, end: E, from: F, to: T): Cond<OptOf<S> | OptOf<E> | OptOf<F> | OptOf<T>> {
  return node("overlaps", start, end, from, to);
}
type Compare = <L extends Expr<Num, boolean, false>, R extends Arg<number>>(a: L, b: R) => Cond<OptOf<L> | OptOf<R>>;
export const gt: Compare = (a, b) => node("gt", a, b);
export const gte: Compare = (a, b) => node("gte", a, b);
export const lt: Compare = (a, b) => node("lt", a, b);
export const lte: Compare = (a, b) => node("lte", a, b);
export function isNull<L extends Expr<Scalar, false, false>>(a: null extends ValOf<L> ? L : "isNull needs a nullable field"): Cond {
  return node("isNull", a);
}
// An absent optional input drops its constraint only directly under `and` (or at the top).
export function and<C extends readonly Cond<boolean>[]>(...cs: C): Cond<OptOf<C[number]>> {
  return node("and", ...cs);
}
export function or(...cs: readonly Cond<false>[]): Cond {
  return node("or", ...cs);
}
export function not(c: Cond<false>): Cond {
  return node("not", c);
}
export function serverMatches(input: Expr<unknown, boolean, false>, ...fields: readonly Expr<unknown, false, false>[]): Cond<boolean> {
  return node("serverMatches", input, ...fields);
}

// Allowed in conditions and values. `when` is lazy: only the chosen branch is evaluated.
export function when<V, A1 extends boolean = false, A2 extends boolean = false>(
  c: Cond<false>,
  a: V | Expr<V, false, A1>,
  b: V | Expr<V, false, A2>,
): Expr<V, false, A1 | A2> {
  return node("when", c, a, b);
}
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
export const asc = (k: Expr<Scalar, false, false>): Sort => node("asc", k);
export const desc = (k: Expr<Scalar, false, false>): Sort => node("desc", k);

// ───────────────────────────────────────────────────────────── entities and changes

declare const changeBrand: unique symbol;
export interface Change {
  readonly [changeBrand]: true;
}
type KeyArg<Key> = Expr<Key, false, false> | { readonly [F in keyof Key]: Key[F] | Expr<Key[F], false, false> };
type Slot<T, Row> = T | Expr<T, false, boolean> | ((prior: Fields<Row>) => T | Expr<T, false, boolean>);

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
  where(f: (c: { input: Fields<I>; record: Fields<Row> }) => Cond<boolean>): ReadEntry<I, R, Row> {
    return this.add({ where: cond(f(proxies() as any), ".where") });
  }
  orderBy(f: (c: { record: Fields<Row> }) => readonly Sort[]): ReadEntry<I, R, Row> {
    return this.add({ orderBy: f(proxies() as any).map((s) => toIR(s, ".orderBy")) });
  }
  pagedBy(input: (c: { input: Fields<I> }) => Expr<unknown, true | false, false>, next: (c: { result: Fields<R> }) => Expr<unknown, boolean, false>): ReadEntry<I, R, Row> {
    return this.add({ pagedBy: { input: toIR(input(proxies() as any), "pagedBy"), next: toIR(next(proxies() as any), "pagedBy") } });
  }
}

export class WriteEntry<I, R> {
  constructor(readonly d: EntryDescription) {}
  one(e: Entity<any, any, any>, at?: (c: { result: Fields<R> }) => Expr<unknown, false, false>): WriteEntry<I, R> {
    return new WriteEntry({ ...this.d, places: [...(this.d.places ?? []), { mode: "one", entity: e.id, at: at ? toIR(at(proxies() as any), "at") : null }] });
  }
  // Recorded once. The changes, their entities, keys and field names are structure; `when` and
  // arithmetic may appear only inside a field's value, never around a change.
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
export class EvaluationError extends Error {}

function readRef(path: readonly string[], env: Env): unknown {
  let v: any = (env as any)[path[0]!];
  for (const p of path.slice(1)) {
    if (v === null || v === undefined) return undefined;
    v = v[p];
  }
  return v;
}

const scalarEq = (a: unknown, b: unknown) => {
  if (a === undefined || b === undefined) throw new EvaluationError("eq read an absent value outside `and`");
  return a === b; // decoded JSON scalars: strings by code units, numbers by value, null equals null
};
const num = (x: unknown, op: string): number => {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new EvaluationError(`${op} needs a finite number, got ${String(x)}`);
  return x;
};
const ordered = (a: unknown, b: unknown, op: string, f: (x: number, y: number) => boolean) =>
  a === null || b === null ? false : f(num(a, op), num(b, op)); // null is not ordered: false

// A condition: an absent optional input turns the leaf that reads it into "holds", directly under `and`.
export function holds(ir: IR, env: Env): boolean {
  if ("op" in ir && ir.op === "and") return ir.args.every((a) => holds(a, env));
  if ("op" in ir && ir.args.some((a) => "ref" in a && a.ref[0] === "input" && readRef(a.ref, env) === undefined)) return true;
  const v = value(ir, env);
  if (typeof v !== "boolean") throw new EvaluationError("a condition evaluated to a non-boolean");
  return v;
}

export function value(ir: IR, env: Env): unknown {
  if ("ref" in ir) return readRef(ir.ref, env);
  if ("val" in ir) return ir.val;
  if ("arr" in ir) return ir.arr.map((x) => value(x, env));
  if ("obj" in ir) return Object.fromEntries(Object.entries(ir.obj).map(([k, x]) => [k, value(x, env)]));
  if ("opaque" in ir) {
    const fn = opaqueFns.get(ir);
    if (!fn) throw new EvaluationError("opaque function missing");
    return (fn as any)(...ir.opaque.map((d) => value(d, env)));
  }
  const v = (i: number) => value(ir.args[i]!, env);
  const bool = (x: unknown) => {
    if (typeof x !== "boolean") throw new EvaluationError(`${ir.op} needs a boolean, got ${String(x)}`);
    return x;
  };
  switch (ir.op) {
    case "eq":
      return scalarEq(v(0), v(1));
    case "oneOf":
      return (v(1) as unknown[]).some((x) => scalarEq(v(0), x));
    case "contains":
      return Array.isArray(v(0)) && (v(0) as unknown[]).some((x) => scalarEq(x, v(1)));
    case "between":
      return v(0) !== null && num(v(0), "between") >= num(v(1), "between") && num(v(0), "between") < num(v(2), "between");
    case "overlaps":
      return v(0) !== null && v(1) !== null && num(v(0), "overlaps") < num(v(3), "overlaps") && num(v(1), "overlaps") > num(v(2), "overlaps");
    case "gt":
      return ordered(v(0), v(1), "gt", (x, y) => x > y);
    case "gte":
      return ordered(v(0), v(1), "gte", (x, y) => x >= y);
    case "lt":
      return ordered(v(0), v(1), "lt", (x, y) => x < y);
    case "lte":
      return ordered(v(0), v(1), "lte", (x, y) => x <= y);
    case "isNull":
      return v(0) === null;
    case "and":
      return ir.args.every((_, i) => bool(v(i)));
    case "or":
      return ir.args.some((_, i) => bool(v(i)));
    case "not":
      return !bool(v(0));
    case "serverMatches":
      return true; // the client cannot evaluate it: it may hold for any record
    case "when":
      return bool(v(0)) ? v(1) : v(2); // lazy: the other branch is never evaluated
    case "coalesce": {
      const a = v(0);
      return a === null || a === undefined ? v(1) : a;
    }
    case "add": {
      const r = num(v(0), "add") + num(v(1), "add");
      return num(r, "add");
    }
    case "sub": {
      const r = num(v(0), "sub") - num(v(1), "sub");
      return num(r, "sub");
    }
    default:
      throw new EvaluationError(`unknown operator ${ir.op}`);
  }
}

// ───────────────────────────────────────────────────────────── predictions: start and replay

export type Live = { attempt: string; entity: string; key: unknown; fields: { [k: string]: IR }; input: unknown };

// At write start: the key is evaluated once from the real input (rule 34's lane key comes from here).
export function start(change: ChangeIR, input: unknown, attempt: string): Live {
  if (change.change !== "patch" || !change.fields) throw new EvaluationError("start: a patch expected");
  return { attempt, entity: change.entity, key: value(change.key, { input }), fields: change.fields, input };
}

// Replay: the visible record is the base with live predictions applied in start order. Every field of
// one patch reads the same record beneath it (simultaneous assignment).
export function visible<Row extends object>(base: Row, lives: readonly Live[]): Row {
  return lives.reduce<Row>((beneath, l) => {
    const next = { ...beneath } as Record<string, unknown>;
    for (const [f, ir] of Object.entries(l.fields)) next[f] = value(ir, { input: l.input, prior: beneath });
    return next as Row;
  }, base);
}
