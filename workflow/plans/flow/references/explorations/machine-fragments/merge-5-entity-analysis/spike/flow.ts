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
// A type error that reads as a sentence.
export type Msg<S extends string> = { readonly __flowError: S };

type ValOf<E> = E extends Value ? E : E extends Expr<infer V> ? V : E;

type Fields<T> = { readonly [K in keyof T]-?: Ref<Exclude<T[K], undefined>> };
export type Ref<V> = Expr<V> &
  (NonNullable<V> extends Value ? unknown : NonNullable<V> extends readonly unknown[] ? unknown : Fields<NonNullable<V>>);
export type { Fields };

// ───────────────────────────────────────────────────────────── recording

// A session ends when the recorded callback returns; a proxy read after that (a runtime function that
// closed over the recording `input`) throws a sentence naming the fix, instead of reading a proxy as truthy.
type Session = { open: boolean };
export function refProxy(path: readonly string[], session: Session = { open: true }): any {
  return new Proxy(Object.create(null), {
    get(_t, p) {
      if (!session.open)
        throw new RecordingError(
          `${path.join(".")} was read after construction: a predicted value's function receives the input as its second parameter, (beneath, input) => …`,
        );
      if (p === IRK) return { ref: path };
      if (p === Symbol.toPrimitive)
        return () => {
          throw new RecordingError(`${path.join(".")} was converted to a primitive: comparisons in a recorded position are operators (eq, lt, …)`);
        };
      if (typeof p === "symbol" || p === "then" || p === "toJSON") return undefined;
      return refProxy([...path, p], session);
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

// Records a free-standing condition (the conformance table and the join tests use it).
export const condition = (f: (c: { input: any; record: any }) => unknown): IR => toIR(f({ input: refProxy(["input"]), record: refProxy(["record"]) }), "condition");

// ───────────────────────────────────────────────────────────── condition operators (module "Condition")

type Arg<V> = V | Expr<V>;
type Ordered = number | Date | null;
type Orderable<L> = ValOf<L> extends Ordered ? L : Msg<"gt, gte, lt, lte, between and overlaps order numbers and Dates; a string's order is the server's collation: use serverMatches">;
type SameType<L, R> = R extends Arg<ValOf<L>> ? R : Msg<"eq compares two values of one type (a Date with a Date, a string with a string)">;

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
type Slot<T, Row, I> = T | Expr<T> | ((beneath: Row, input: I) => T);

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
  <const K extends keyof Row, Ver extends keyof Row = never>(d: { id: string; primaryKey: readonly K[]; version?: Ver }): Entity<Row, K, Ver> => ({
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

// ───────────────────────────────────────────────────────────── operations and entries (stand-ins)

declare const opTypes: unique symbol;
export interface Op<I, R> {
  readonly id: string;
  readonly arrayKeys?: readonly string[]; // stands in for the input Schema: which input paths are arrays
  readonly [opTypes]?: [I, R];
}
export const op =
  <I, R>() =>
  (id: string, arrayKeys?: readonly string[]): Op<I, R> => ({ id, ...(arrayKeys ? { arrayKeys } : {}) });

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
  as?: { entities: string[]; mapping: "runtime" };
};

// The recording context: the brand marks a recorded callback for the lint.
type Ctx<T> = T & { readonly __flowRecording?: true };
// Calls a recorded callback once and converts its result while the session is open.
const record = <T, U>(f: (c: any) => T, convert: (x: T) => U): U => {
  const session = { open: true };
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
    return this.add({ places: [...(this.d.places ?? []), { mode: "one", entity: e.id, at: at ? record(at, (x) => toIR(x, "at")) : null }] });
  }
  list<E extends Entity<any, any, any>>(e: E, at: (c: Ctx<{ result: Fields<R> }>) => Expr<unknown>): ReadEntry<I, R, RowOf<E>> {
    return this.add({ places: [...(this.d.places ?? []), { mode: "list", entity: e.id, at: record(at, (x) => toIR(x, "at")) }] });
  }
  derivedFrom<E extends Entity<any, any, any>>(e: E, fields?: (c: Ctx<{ record: Fields<RowOf<E>> }>) => readonly Expr<unknown>[]): ReadEntry<I, R, RowOf<E>> {
    return this.add({ derivedFrom: { entity: e.id, fields: fields ? record(fields, (x) => toIR(x, "derivedFrom")) : null } });
  }
  byKey(f: (c: Ctx<{ input: Fields<I> }>) => unknown): ReadEntry<I, R, Row> {
    return this.add({ byKey: record(f, (x) => toIR(x, "byKey")) });
  }
  // Several `.where` calls are combined with `and` (ED:387-388), in call order.
  where(f: (c: Ctx<{ input: Fields<I>; record: Fields<Row> }>) => Condition): ReadEntry<I, R, Row> {
    const c = record(f, (x) => cond(x, ".where"));
    return this.add({ where: this.d.where ? { op: "and", args: [this.d.where, c] } : c });
  }
  orderBy(f: (c: Ctx<{ record: Fields<Row> }>) => readonly Sort[]): ReadEntry<I, R, Row> {
    return this.add({ orderBy: record(f, (x) => x.map((s) => toIR(s, ".orderBy"))) });
  }
  pagedBy(input: (c: Ctx<{ input: Fields<I> }>) => Expr<unknown>, next: (c: Ctx<{ result: Fields<R> }>) => Expr<unknown>): ReadEntry<I, R, Row> {
    return this.add({ pagedBy: { input: record(input, (x) => toIR(x, "pagedBy")), next: record(next, (x) => toIR(x, "pagedBy")) } });
  }
}

export class WriteEntry<I, R> {
  constructor(readonly d: EntryDescription, readonly arrayKeys: readonly string[] = []) {}
  one(e: Entity<any, any, any>, at?: (c: Ctx<{ result: Fields<R> }>) => Expr<unknown>): WriteEntry<I, R> {
    return new WriteEntry({ ...this.d, places: [...(this.d.places ?? []), { mode: "one", entity: e.id, at: at ? record(at, (x) => toIR(x, "at")) : null }] }, this.arrayKeys);
  }
  // Recorded once, for structure: the changes, their entities, keys and field names. A field's runtime
  // function is called later, with the real input. Whether a key is an array is recorded from the input
  // Schema (`many`), so merge 4 rule 34's default lane key is decided statically.
  predicts(f: (c: Ctx<{ input: Fields<I> }>) => Change<I> | readonly Change<I>[]): WriteEntry<I, R> {
    const out = record(f, (o) => (Array.isArray(o) ? o : [o]).map((c) => irOf(c) as unknown as ChangeIR | undefined));
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

export const read = <I, R>(o: Op<I, R>) => new ReadEntry<I, R, never>({ kind: "read", op: o.id });
export const write = <I, R>(o: Op<I, R>) => new WriteEntry<I, R>({ kind: "write", op: o.id }, o.arrayKeys ?? []);
export const listen = <I, Ev>(o: Op<I, Ev>) => new ListenEntry<I, Ev>({ kind: "listen", op: o.id });

export type Domain = { id: string; entries: Record<string, { d: EntryDescription }> };
export const domain = <E extends Record<string, { d: EntryDescription }>>(id: string, entries: E) => ({ id, entries });
export const describe = (dm: Domain): Record<string, EntryDescription> =>
  Object.fromEntries(Object.entries(dm.entries).map(([k, e]) => [k, e.d]));

// ───────────────────────────────────────────────────────────── the three-valued evaluator

export type Env = { input?: unknown; record?: unknown; result?: unknown };
export type Why = "notCarried" | "failed" | "server";
// yes / no / maybe (Kleene). A maybe says why, and which record fields it came from ("*": every field).
export type Tri = { v: "yes" } | { v: "no" } | { v: "maybe"; why: Why; detail: string; fields: readonly string[] };
const YES: Tri = { v: "yes" };
const NO: Tri = { v: "no" };
const maybe = (why: Why, detail: string, fields: readonly string[] = []): Tri => ({ v: "maybe", why, detail, fields });
const tri = (b: boolean): Tri => (b ? YES : NO);

const ABSENT = Symbol("absent input");
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
    if (ir.ref[0] === "record") return v === undefined ? maybe("notCarried", `record.${name} is not carried`, [name]) : { value: v, field: name };
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
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime() ? maybe("server", "two Dates equal at millisecond precision", fields) : NO;
  return tri(a === b);
}
// Order: Effect's Order.Number and Order.Date (M5-D2), after the checks above. `null` is unordered and its
// place is the server's: maybe. A Date tie is maybe.
function compare(a: unknown, b: unknown, op: string, fields: string[], test: (c: -1 | 0 | 1) => boolean): Tri {
  if (a === null || b === null) return maybe("server", `${op}: null has no order the client knows`, fields);
  let c: -1 | 0 | 1;
  if (typeof a === "number" && typeof b === "number") c = Order.Number(a, b);
  else if (a instanceof Date && b instanceof Date) {
    c = Order.Date(a, b);
    if (c === 0) return maybe("server", `${op}: two Dates equal at millisecond precision`, fields);
  } else return maybe("failed", `${op}: cannot order ${typeof a} against ${typeof b}`, fields);
  return tri(test(c));
}

const andT = (ts: readonly Tri[]): Tri => (ts.some((t) => t.v === "no") ? NO : ts.find((t) => t.v === "maybe") ?? YES);
const orT = (ts: readonly Tri[]): Tri => (ts.some((t) => t.v === "yes") ? YES : ts.find((t) => t.v === "maybe") ?? NO);
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
    case "between": // from ≤ a < to; each bound is its own term
      return andT([term(0, 1, (c) => c >= 0), term(0, 2, (c) => c < 0)]);
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
      const list = v(1);
      if (!Array.isArray(list)) return maybe("failed", "oneOf needs an array", fields);
      if (list.length === 0) return maybe("server", "oneOf over an empty list means none to some APIs and any to others", fields);
      return orT(list.map((x) => equal(v(0), x, fields)));
    }
    case "contains": {
      const list = v(0);
      if (!Array.isArray(list)) return maybe("failed", "contains needs an array field", fields);
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
      return tri(v(0) === null);
    default:
      return maybe("failed", `unknown operator ${ir.op}`);
  }
}

// The record fields a condition reads ("*" when a fieldless serverMatches reads every field).
export function reads(ir: IR): string[] {
  if ("ref" in ir) return ir.ref[0] === "record" ? [ir.ref.slice(1).join(".")] : [];
  if ("arr" in ir) return ir.arr.flatMap(reads);
  if ("op" in ir) {
    if (ir.op === "serverMatches" && ir.args.length === 1) return ["*"];
    return [...new Set(ir.args.flatMap(reads))];
  }
  return [];
}

// ───────────────────────────────────────────────────────────── the join rule

// A delta (old record, new record, changed fields) against one answer's condition. Membership can change only
// if a field the condition reads changed. Then the answer repairs unless both sides are the same definite
// answer. The reason is repair evidence: a definite transition, or the maybe's cause.
export type Repair = { repair: false } | { repair: true; why: "entered" | "left" | Why; detail?: string };
export function joins(where: IR, input: unknown, old: object, next: object, changed: readonly string[]): Repair {
  const r = reads(where);
  if (!r.includes("*") && !changed.some((f) => r.includes(f))) return { repair: false };
  const a = evaluate(where, { input, record: old });
  const b = evaluate(where, { input, record: next });
  if (a.v !== "maybe" && b.v !== "maybe") return a.v === b.v ? { repair: false } : { repair: true, why: b.v === "yes" ? "entered" : "left" };
  const m = (a.v === "maybe" ? a : b) as Extract<Tri, { v: "maybe" }>;
  return { repair: true, why: m.why, detail: m.detail };
}

// The response check: a returned record contradicts the condition only when it definitely fails it.
export const contradicts = (where: IR, input: unknown, row: object) => evaluate(where, { input, record: row }).v === "no";

// ───────────────────────────────────────────────────────────── predictions: start, replay, settle

const keyText = (k: unknown) => JSON.stringify(k);

export type Live = {
  attempt: string;
  kind: "patch" | "delete";
  entity: string;
  keys: unknown[];
  many: boolean;
  fields: { [k: string]: FieldIR };
  fns: Record<string, (beneath: any, input: any) => unknown>;
  input: unknown;
};

const valueOf = (ir: IR, input: unknown): unknown => {
  if ("ref" in ir) return ir.ref.slice(1).reduce((v: any, p) => (v == null ? v : v[p]), input);
  if ("val" in ir) return typeof ir.val === "object" && ir.val !== null ? new Date(ir.val.date) : ir.val;
  if ("arr" in ir) return ir.arr.map((x) => valueOf(x, input));
  if ("obj" in ir) return Object.fromEntries(Object.entries(ir.obj).map(([k, x]) => [k, valueOf(x, input)]));
  throw new Error("a key or recorded field is a read or a constant");
};

// At write start: each key is read from the real input. An array key (`many`, from the input Schema)
// predicts each record it lists, once.
export function start(changes: readonly ChangeIR[], input: unknown, attempt: string): Live[] {
  return changes.map((c) => {
    const k = valueOf(c.key, input);
    const keys = c.many && Array.isArray(k) ? [...new Map(k.map((x) => [keyText(x), x])).values()] : [k];
    const fields = c.fields ?? {};
    return { attempt, kind: c.change, entity: c.entity, keys, many: c.many === true, fields, fns: runtimeFns.get(fields) ?? {}, input };
  });
}

// The records whose queues a start joins: each once, however many patches name it.
export const queueKeys = (lives: readonly Live[]) => [...new Set(lives.flatMap((l) => l.keys.map((k) => `${l.entity}:${keyText(k)}`)))];

// Merge 4 rule 34's default lane key: only for a write predicting one record by a single (non-array) key.
export const laneKey = (lives: readonly Live[]) => {
  const keys = queueKeys(lives);
  return keys.length === 1 && lives.every((l) => !l.many) ? lives[0]!.keys[0] : undefined;
};

export type Replayed<Row> = {
  visible: Row | "deleted" | undefined;
  predicted: string[]; // every field a live prediction names: shown or skipped
  skipped: { attempt: string; field: string; reason: string }[];
};

// A stand-in for the field's Schema check: a value must be defined, and a number finite.
const acceptable = (x: unknown) => x !== undefined && !(typeof x === "number" && !Number.isFinite(x));

// Replay: the base with this record's live predictions in start order (a write's patches in written order).
// Every field of one patch sees the same record beneath. A field whose function throws, or returns a value
// its Schema rejects, is skipped: it keeps the value beneath, still counts as predicted, and the rest go on.
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
        if (beneath === undefined) throw new Error("the record is not held");
        const v = "runtime" in ir ? l.fns[f]!(beneath, l.input) : valueOf(ir, l.input);
        if (!acceptable(v)) throw new Error(`the field's Schema rejects ${String(v)}`);
        next[f] = v;
      } catch (e) {
        skipped.push({ attempt: l.attempt, field: f, reason: (e as Error).message });
      }
    }
    cur = beneath === undefined ? cur : (next as Row);
  }
  return { visible: cur, predicted: [...predicted], skipped };
}

// Settlement on success: the write's predictions end; a field it predicted (shown or skipped) that the
// response omits is unconfirmed and needs a confirming read; a confirmed field retires older predictions
// of that field on the record (ED:511-513).
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
