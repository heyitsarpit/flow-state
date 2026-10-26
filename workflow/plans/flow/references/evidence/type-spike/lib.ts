import { Schema, Effect } from "effect"

type Fields = Schema.Struct.Fields

// ============ recorded values ============
// A Leaf is a recorded value of type T. U is the input field it came from (for the input rule);
// N is the record field it came from (for total orders).
declare const LeafT: unique symbol
export interface Leaf<T, U extends string = never, N extends string = never> { readonly [LeafT]: [T, U, N] }
type AnyLeaf = Leaf<any, any, any>
export type Value<T> = T | Leaf<T, any, any>

type NodeU<T, U extends string> = [T] extends [readonly any[]] ? Leaf<T, U>
  : [T] extends [object] ? { readonly [K in keyof T]-?: NodeU<T[K], U> } & Leaf<T, U>
  : Leaf<T, U>
/** `input` in a recorded position: each leaf remembers its top-level input field. */
export type InputNode<In> = { readonly [K in keyof In & string]-?: NodeU<In[K], K> }
type RecNode<T, N extends string> = [T] extends [readonly any[]] ? Leaf<T, never, N>
  : [T] extends [object] ? { readonly [K in keyof T]-?: RecNode<T[K], N> } & Leaf<T, never, N>
  : Leaf<T, never, N>
/** `record` in a recorded position: each leaf remembers its top-level record field. */
export type RecordNode<R> = { readonly [K in keyof R & string]-?: RecNode<R[K], K> }

declare const CondT: unique symbol
/** A recorded condition; U is the set of input fields it uses. */
export interface Cond<U extends string = string> { readonly [CondT]: U }
declare const SortT: unique symbol
export interface SortKey<N extends string = string> { readonly [SortT]: N }

// ============ places in a result ============
declare const PlaceT: unique symbol
export interface Place<T> { readonly [PlaceT]: T }
type Primitive = string | number | boolean | bigint | symbol | null | undefined
type LiftD<T> = T extends readonly (infer E)[] ? Lift<E>
  : T extends object ? { readonly [K in keyof T]-?: Lift<T[K]> } & Place<T> : Place<T>
/** The result as places: arrays mean each element; unions of structs stay unions; optional primitives stay one place. */
export type Lift<T> = [T] extends [Primitive] ? Place<T> : LiftD<T>
type PlaceOf<P> = P extends Place<infer X> ? X : never

// ============ entity ============
declare const EntityT: unique symbol
export interface EntityMarker<F extends Fields, K extends string> { readonly [EntityT]: { fields: F; key: K } }
type FieldC<S> = S extends EntityMarker<infer F2, infer K2> ? Shape<F2, K2> : S extends Schema.Top ? S["Type"] : never
export type Shape<F extends Fields, K extends string> =
  { readonly [P in K]: FieldC<F[P]> } & { readonly [P in Exclude<keyof F, K>]?: FieldC<F[P]> }
export type Rec<F extends Fields> = { readonly [P in keyof F]: FieldC<F[P]> }

declare const ChangeT: unique symbol
export interface Change<Id extends string, Op extends "patch" | "save" | "delete"> { readonly [ChangeT]: [Id, Op] }
declare const TargetT: unique symbol
export interface Target<Id extends string> { readonly [TargetT]: Id }
type AnyChange = Change<string, any>
type KeyArg<F extends Fields, K extends string> = { readonly [P in K]: Value<FieldC<F[P]>> }
/** A predicted field is an input reference, a constant, or a function of the record. */
type PatchFields<F extends Fields, K extends string, V extends string> =
  { readonly [P in Exclude<keyof F, K | V>]?: Value<FieldC<F[P]>> | ((r: Rec<F>) => FieldC<F[P]>) }
type NoVersion<F extends Fields, V extends string> = Omit<Rec<F>, V>

export interface EntityApi<Id extends string, F extends Fields, K extends string, V extends string> {
  readonly entityId: Id
  patch(key: KeyArg<F, K> | readonly KeyArg<F, K>[], fields: PatchFields<F, K, V>): Change<Id, "patch">
  save(rec: Shape<F, K>): Change<Id, "save">
  delete(key: KeyArg<F, K>, opts?: { version?: Value<number> }): Change<Id, "delete">
  readonly all: Target<Id>
  where(f: (c: { record: RecordNode<NoVersion<F, V>> }) => Cond<any>): Target<Id>
  fields(key: KeyArg<F, K>, f: (c: { record: RecordNode<NoVersion<F, V>> }) => readonly AnyLeaf[]): Target<Id>
  pick<const N extends readonly (Exclude<keyof F, K> & string)[]>(...names: N): Entity<Id, Pick<F, N[number] | K>, K, V>
}
export type Entity<Id extends string, F extends Fields, K extends string, V extends string = never> =
  Schema.Struct<F> & EntityMarker<F, K> & EntityApi<Id, F, K, V>
export type EntityAny = Entity<string, any, any, any>

// ============ operations ============
export interface Resource<In, R extends Schema.Top> { readonly _tag: "resource"; readonly id: string; readonly result: R; readonly _in?: (i: In) => void }
export function resource<In = {}, R extends Schema.Top = Schema.Top>(spec: {
  id: string; key: (input: In) => unknown; lookup: (input: In) => Effect.Effect<R["Type"], unknown, any>; result: R }): Resource<In, R> {
  return { _tag: "resource", id: spec.id, result: spec.result }
}
export interface Transaction<I extends Schema.Top, R extends Schema.Top> { readonly _tag: "transaction"; readonly id: string; readonly input: I; readonly result: R }
export function transaction<I extends Schema.Top, R extends Schema.Top>(spec: {
  id: string; input: I; result: R; commit: (input: I["Type"], ctx: { attempt: { id: string }; basedOn: unknown }) => Effect.Effect<R["Type"], unknown, any>
  concurrency?: "reject" | "allow" | "serialize" | "cancel" }): Transaction<I, R> {
  return { _tag: "transaction", id: spec.id, input: spec.input, result: spec.result }
}
export interface Stream<E extends Schema.Top> { readonly _tag: "stream"; readonly id: string; readonly event: E }
export function stream<K = {}, E extends Schema.Top = Schema.Top>(spec: { id: string; key: (i: K) => unknown; event: E }): Stream<E> {
  return { _tag: "stream", id: spec.id, event: spec.event }
}

// ============ operators ============
type U_<L> = L extends Leaf<any, infer U, any> ? U : never
type T_<L> = L extends Leaf<infer T, any, any> ? T : never
/** b must be a recorded value or a constant of a's type. */
type Like<A, B> = B & (Leaf<T_<A>, any, any> | T_<A>)
type LikeOpt<A, B> = B & (Leaf<T_<A> | undefined, any, any> | T_<A>)
export function eq<A extends AnyLeaf, B>(a: A, b: Like<A, B>): Cond<U_<A> | U_<B>> { return fn("eq", a, b) }
export function oneOf<A extends AnyLeaf, B>(a: A, values: B & (Leaf<readonly T_<A>[] | undefined, any, any> | readonly T_<A>[])): Cond<U_<A> | U_<B>> { return fn("oneOf", a, values) }
export function contains<A extends Leaf<readonly any[], any, any>, B>(arr: A, v: B & (Leaf<T_<A>[number], any, any> | T_<A>[number])): Cond<U_<A> | U_<B>> { return fn("contains", arr, v) }
export function between<A extends Leaf<number | string | Date, any, any>, B, C>(a: A, from: LikeOpt<A, B>, to: LikeOpt<A, C>): Cond<U_<A> | U_<B> | U_<C>> { return fn("between", a, from, to) }
export function overlaps<S extends Leaf<number | string | Date, any, any>, E, B, C>(start: S, end: Like<S, E>, from: LikeOpt<S, B>, to: LikeOpt<S, C>): Cond<U_<S> | U_<E> | U_<B> | U_<C>> { return fn("overlaps", start, end, from, to) }
export function and<const C extends readonly Cond<any>[]>(...c: C): Cond<C[number] extends Cond<infer U> ? U : never> { return fn("and", ...c) }
/** The server decides membership from these; the client cannot evaluate it. */
export function serverMatches<I extends Leaf<any, any, never>>(input: I, ...fields: Leaf<any, never, any>[]): Cond<U_<I>> { return fn("serverMatches", input, ...fields) }
export function principal(): Leaf<string, never, never> { return { [PRINCIPAL]: true } as any }
export function asc<N extends string>(a: Leaf<number | string | boolean | Date | undefined, never, N>): SortKey<N> { return { [SORT]: true, dir: "asc", ref: toIR(a) } as any }
export function desc<N extends string>(a: Leaf<number | string | boolean | Date | undefined, never, N>): SortKey<N> { return { [SORT]: true, dir: "desc", ref: toIR(a) } as any }

// ============ read chains ============
type Pick_<E, F extends Fields> = { readonly [P in keyof E & keyof F]: E[P] }
type Common<A, B> = { readonly [P in keyof A & keyof B]: A[P] | B[P] }
type Problems<E, F extends Fields, K extends string> =
  | (K extends keyof E ? never : `record needs key field "${K}"`)
  | { [P in keyof E & keyof F & string]: [E[P]] extends [FieldC<F[P]>] ? never : `field "${P}" does not have the entity's type` }[keyof E & keyof F & string]
export type Verify<E, F extends Fields, K extends string> =
  [Problems<E, F, K>] extends [never] ? unknown : { readonly [M in Problems<E, F, K>]: never }
type VerifyWhole<T, Id extends string, F extends Fields, K extends string> =
  [Problems<T, F, K>] extends [never] ? unknown : { readonly [M in `result is not a ${Id}: ${Problems<T, F, K>}`]: never }

type Mode = "none" | "ordered" | "unordered" | "ranked"
/** A method that is not available here: calling it shows the reason. */
type Err<Why extends string> = (because: Why) => never
declare const ReadT: unique symbol
/** What `domain()` checks on every read entry. */
export interface ReadEntry<In, Used extends string, Checked extends boolean, Paged extends boolean = false> {
  readonly kind: "read"; readonly [ReadT]: { in: In; used: Used; checked: Checked; paged: Paged }
}
type Ordered<K extends string> = readonly [...SortKey<string>[], SortKey<K>]

export interface List<In, Res, R, K extends string, V extends string, Used extends string, M extends Mode, Paged extends boolean>
  extends ReadEntry<In, Used, true, Paged> {
  list<Id extends string, F extends Fields, K2 extends string, V2 extends string, P extends Place<any>, const Mem extends Partial<PlaceOf<P>> = {}>(
    ent: Entity<Id, F, K2, V2> & Verify<Extract<PlaceOf<P>, Mem>, F, K2>, at: (c: { result: Lift<Res> }) => P, member?: Mem):
    List<In, Res, Common<R, Pick_<Extract<PlaceOf<P>, Mem>, Omit<F, V2>>>, K | K2, V | V2, Used, M, Paged>
  where<U extends string>(f: (c: { input: InputNode<In>; record: RecordNode<R> }) => Cond<U>): List<In, Res, R, K, V, Used | NoInfer<U>, M, Paged>
  orderBy: M extends "none" ? (f: (c: { record: RecordNode<R> }) => Ordered<K>) => List<In, Res, R, K, V, Used, "ordered", Paged>
    : Err<"a list has one order: .orderBy, .unordered() or a server ranking (.unaffectedBy); this list already has one">
  unordered: M extends "none" ? () => List<In, Res, R, K, V, Used, "unordered", Paged>
    : Err<"a list has one order: .orderBy, .unordered() or a server ranking (.unaffectedBy); this list already has one">
  unaffectedBy: M extends "none" | "ranked" ? (...fields: (Exclude<keyof R, K> & string)[]) => List<In, Res, R, K, V, Used, "ranked", Paged>
    : Err<".unaffectedBy is only for server-ranked lists; with .orderBy or .unordered() only condition and order fields repair">
  pagedBy<P extends keyof In & string>(f: (c: { input: InputNode<In> }) => Leaf<any, P, never>,
    next: (c: { result: Lift<Res> }) => Place<In[P] | undefined>): List<In, Res, R, K, V, Used | NoInfer<P>, M, true>
  ignoring<U extends string>(f: (c: { input: InputNode<In> }) => readonly Leaf<any, U, never>[]): List<In, Res, R, K, V, Used | NoInfer<U>, M, Paged>
}
export interface One<In, R, K extends string> extends ReadEntry<In, never, false> {
  byKey(f: (c: { input: InputNode<In> }) => { readonly [P in K]: Value<R[P & keyof R]> }): One<In, R, K>
}
export interface Derived<In, Used extends string, Single extends boolean, R> extends ReadEntry<In, Used, true> {
  derivedFrom<Id extends string, F extends Fields, K extends string, V extends string, U extends string = never>(
    ent: Entity<Id, F, K, V>, fields?: (c: { record: RecordNode<NoVersion<F, V>> }) => readonly AnyLeaf[],
    where?: (c: { input: InputNode<In>; record: RecordNode<NoVersion<F, V>> }) => Cond<U>): Derived<In, Used | NoInfer<U>, false, never>
  where: Single extends true ? <U extends string>(f: (c: { input: InputNode<In>; record: RecordNode<R> }) => Cond<U>) => Derived<In, Used | NoInfer<U>, true, R>
    : Err<"with several .derivedFrom, give each its own condition as the third argument">
}
export interface ReadStart<In, Res extends Schema.Top> {
  one<Id extends string, F extends Fields, K extends string, V extends string, E>(
    ent: Entity<Id, F, K, V>, at: (c: { result: Lift<Res["Type"]> }) => Place<E> & Verify<E, F, K>): One<In, Pick_<E, F>, K>
  one<Id extends string, F extends Fields, K extends string, V extends string>(
    ent: Entity<Id, F, K, V> & VerifyWhole<Res["Type"], Id, F, K>): One<In, Pick_<Res["Type"], F>, K>
  list<Id extends string, F extends Fields, K extends string, V extends string, P extends Place<any>, const Mem extends Partial<PlaceOf<P>> = {}>(
    ent: Entity<Id, F, K, V> & Verify<Extract<PlaceOf<P>, Mem>, F, K>, at: (c: { result: Lift<Res["Type"]> }) => P, member?: Mem):
    List<In, Res["Type"], Pick_<Extract<PlaceOf<P>, Mem>, Omit<F, V>>, K, V, never, "none", false>
  derivedFrom<Id extends string, F extends Fields, K extends string, V extends string>(
    ent: Entity<Id, F, K, V>, fields?: (c: { record: RecordNode<NoVersion<F, V>> }) => readonly AnyLeaf[]):
    Derived<In, never, true, NoVersion<F, V>>
  derivedFrom<Id extends string, F extends Fields, K extends string, V extends string, U extends string>(
    ent: Entity<Id, F, K, V>, fields: ((c: { record: RecordNode<NoVersion<F, V>> }) => readonly AnyLeaf[]) | undefined,
    where: (c: { input: InputNode<In>; record: RecordNode<NoVersion<F, V>> }) => Cond<U>): Derived<In, NoInfer<U>, false, never>
}

// ============ write chains ============
declare const WriteT: unique symbol
export interface WriteEntry<In, Named extends string, Patched extends string> {
  readonly kind: "write"; readonly [WriteT]: { in: In; named: Named; patched: Patched }
}
type PatchedIds<C> = C extends Change<infer Id, "patch"> ? Id : never
type Ids<C> = C extends Change<infer Id, any> ? Id : C extends Target<infer Id> ? Id : never
export interface Write<In, Res, Named extends string, Patched extends string> extends WriteEntry<In, Named, Patched> {
  one<Id extends string, F extends Fields, K extends string, V extends string, E>(
    ent: Entity<Id, F, K, V>, at: (c: { result: Lift<Res> }) => Place<E> & Verify<E, F, K>): Write<In, Res, Named | Id, Patched>
  one<Id extends string, F extends Fields, K extends string, V extends string>(
    ent: Entity<Id, F, K, V> & VerifyWhole<Res, Id, F, K>): Write<In, Res, Named | Id, Patched>
  list<Id extends string, F extends Fields, K extends string, V extends string, E>(
    ent: Entity<Id, F, K, V>, at: (c: { result: Lift<Res> }) => Place<E> & Verify<E, F, K>): Write<In, Res, Named | Id, Patched>
  /** Runs once recorded (entity, key, field names) and again for real when the write starts. */
  predicts<C extends AnyChange | readonly AnyChange[]>(f: (c: { input: In }) => C):
    Write<In, Res, Named, Patched | PatchedIds<C extends readonly any[] ? C[number] : C>>
  alsoChanges<T extends Target<string> | readonly Target<string>[]>(f: (c: { input: InputNode<In> }) => T):
    Write<In, Res, Named | Ids<T extends readonly any[] ? T[number] : T>, Patched>
}
export type WriteStart<I extends Schema.Top, R extends Schema.Top> = Write<I["Type"], R["Type"], never, never>

// ============ listen ============
export interface ListenEntry { readonly kind: "listen" }
export interface ListenStart<S extends Stream<any>> {
  as<const Es extends readonly EntityAny[]>(entities: Es,
    f: (event: S["event"]["Type"]) => Change<Es[number]["entityId"], any> | readonly Change<Es[number]["entityId"], any>[]): ListenEntry
}

// ============ domain ============
type AnyEntry = ReadEntry<any, any, any, any> | WriteEntry<any, any, any> | ListenEntry
export type EntryProblem<E> =
  E extends ReadEntry<infer In, infer Used, true, any>
    ? [Exclude<keyof In & string, Used>] extends [never] ? never
      : `input field "${Exclude<keyof In & string, Used>}" is not accounted for: use it in .where, .orderBy or .pagedBy, declare it with serverMatches, or list it in .ignoring if it does not filter`
  : E extends WriteEntry<any, infer Named, infer Patched>
    ? [Exclude<Patched, Named>] extends [never] ? never
      : `predicts a patch to "${Exclude<Patched, Named>}", which the entry does not name in a place or an .alsoChanges target`
  : never
type Validate<E> = { readonly [K in keyof E]: [EntryProblem<E[K]>] extends [never] ? unknown : { readonly [M in EntryProblem<E[K]>]: never } }
export interface Domain<Id extends string, E> { readonly _tag: "domain"; readonly id: Id; readonly entries: E; readonly ir: Record<string, any> }
export function domain<Id extends string, const E extends Record<string, AnyEntry>>(id: Id, entries: E & Validate<E>): Domain<Id, E> {
  return { _tag: "domain", id, entries, ir: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, (v as any).compile()])) }
}

// ============ machines (decision 6 on domain operations) ============
export interface Binding { readonly _b: true }
declare const InvT: unique symbol
export interface Invalidation { readonly [InvT]: true }
export function invalidate(t: Target<string>): Invalidation { return { type: "invalidate", target: t } as any }
type CommitOptions = { readonly writes?: readonly Invalidation[]; readonly optimistic?: "call-site optimistic writes are not allowed on a domain operation; declare .predicts in the domain" }
type Handle<E, M> =
  E extends ReadEntry<infer In, any, any, infer Paged>
    ? { subscribe(f: (c: { memory: M }) => In): Binding } & (Paged extends true ? { more(f: (c: { memory: M }) => In): Binding } : {})
  : E extends WriteEntry<infer In, any, any> ? { commit(f: (c: { memory: M }) => In, options?: CommitOptions): Binding }
  : E extends Resource<infer In, any> ? { subscribe(f: (c: { memory: M }) => In): Binding }
  : {}
type Handles<Ops, M> = { [K in keyof Ops]: Ops[K] extends Domain<any, infer E> ? { [Q in keyof E]: Handle<E[Q], M> } : Handle<Ops[K], M> }
export function definition<Mem extends Schema.Top, const Ops extends Record<string, Domain<any, any> | Resource<any, any>>>(
  spec: { id: string; memory: Mem; operations: Ops; setup: (O: Handles<Ops, Mem["Type"]>) => unknown }) { return spec }

// ============ runtime recording ============
const REF = Symbol("ref"), COND = Symbol("cond"), SORT = Symbol("sort"), PRINCIPAL = Symbol("principal")
const path_ = (root: string, path: string[]) => [root, ...path].join(".")
export function mkRef(root: string, path: string[] = [], forbid: string[] = []): any {
  const cache = new Map<string, any>()
  const bad = (what: string) => () => { throw new Error(`recorded value ${path_(root, path)}: ${what} is not allowed in a recorded position (use library operators)`) }
  return new Proxy(function () {}, {
    get(_, p) {
      if (p === REF) return { root, path }
      if (p === Symbol.toPrimitive) return bad("conversion to a primitive (arithmetic, template string, String())")
      if (typeof p === "symbol") return undefined
      if (path.length === 0 && forbid.includes(p)) throw new Error(`${root}.${p} is the entity's version field, which may not appear in a condition or an order`)
      let c = cache.get(p); if (!c) { c = mkRef(root, [...path, p]); cache.set(p, c) }; return c
    },
    apply: () => bad("calling a method")(),
    set: bad("assignment"),
  })
}
const isRef = (v: any): boolean => (typeof v === "function" || typeof v === "object") && v !== null && (() => { try { return !!v[REF] } catch { return false } })()
export function toIR(v: any): any {
  if (isRef(v)) { const r = v[REF]; return { type: "ref", root: r.root, path: r.path } }
  if (v && typeof v === "object" && v[PRINCIPAL]) return { type: "principal" }
  if (v && typeof v === "object" && (v[COND] || v[SORT])) return v.ir
  if (v && typeof v === "object" && v.type === "change") return v
  if (v && typeof v === "object" && v.type === "target") return v
  if (typeof v === "function") return { type: "runtime" }
  if (Array.isArray(v)) return { type: "array", items: v.map(toIR) }
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return { type: "object", fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toIR(x)])) }
  return { type: "val", value: v }
}
function fn(name: string, ...args: any[]): any { return { [COND]: true, ir: { type: "func", name, args: args.map(toIR) } } }
function cond(c: any, where: string) {
  if (typeof c === "boolean") throw new Error(`${where} received a boolean. Write eq(record.folderId, input.folderId) instead of ===.`)
  if (!c || !c[COND]) throw new Error(`${where} must return a condition built from the library operators`)
  return c.ir
}

export function entity<Id extends string, const F extends Fields, const K extends readonly (keyof F & string)[], const V extends keyof F & string = never>(
  spec: { id: Id; fields: F; primaryKey: K; version?: V }): Entity<Id, F, K[number], V> {
  const s: any = Schema.Struct(spec.fields)
  const version = spec.version ? [spec.version] : []
  const rec = () => mkRef("record", [], version)
  const mk = (op: string, extra: any = {}) => ({ type: "change", entity: spec.id, op, ...extra })
  const api = {
    entityId: spec.id, entityPrimaryKey: spec.primaryKey, entityVersion: spec.version, entityFields: Object.keys(spec.fields),
    patch: (key: any, fields: any) => Object.defineProperty(mk("patch", { key: toIR(key),
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toIR(v)])) }),
      "values", { value: fields, enumerable: false }), // real values, used when the write starts
    save: (_rec: any) => mk("save"),
    delete: (key: any, opts?: any) => mk("delete", { key: toIR(key), version: opts?.version === undefined ? undefined : toIR(opts.version) }),
    all: { type: "target", entity: spec.id, all: true },
    where: (f: any) => ({ type: "target", entity: spec.id, where: cond(f({ record: rec() }), `${spec.id}.where`) }),
    fields: (key: any, f: any) => ({ type: "target", entity: spec.id, key: toIR(key), fields: f({ record: rec() }).map(toIR) }),
    pick: (...names: string[]) => Object.assign(Object.create(Object.getPrototypeOf(s)), s, api, { entityPick: names }),
  }
  return Object.assign(s, api) as any
}

// schema-aware place proxy (unions, arrays, structs)
const unwrap = (s: any): any => (s && s.schema && !s.fields && !s.value && !s.members ? unwrap(s.schema) : s)
const isArr = (s: any) => !!s && s.value !== undefined && s.fields === undefined && s.members === undefined
function childOf(cur: any, p: string): any[] {
  if (cur?.members) return cur.members.flatMap((m: any) => childOf(unwrap(m), p))
  const c = cur?.fields?.[p]; return c ? [c] : []
}
function mkPlace(schemas: any[], path: string[]): any {
  return new Proxy({}, {
    get(_, p) {
      if (p === REF) return { schemas, path }
      if (typeof p === "symbol") return undefined
      let pth = path
      const curs = schemas.map(unwrap).map((c) => { if (isArr(c)) { return unwrap(c.value) } return c })
      if (schemas.map(unwrap).some(isArr)) pth = [...pth, "*"]
      const kids = curs.flatMap((c) => childOf(c, p))
      if (!kids.length) throw new Error(`no field "${p}" at result.${path.join(".")}`)
      return mkPlace(kids, [...pth, p])
    },
  })
}
function structsAt(schemas: any[]): any[] {
  return schemas.map(unwrap).flatMap((c) => isArr(c) ? structsAt([c.value]) : c.members ? structsAt(c.members) : [c])
}
function placeInfo(schemas: any[], ent: any, path: string[], member?: Record<string, unknown>) {
  let structs = structsAt(schemas)
  if (member) structs = structs.filter((st: any) => Object.entries(member).every(([k, v]) => unwrap(st.fields?.[k])?.literal === v || unwrap(st.fields?.[k])?.literals?.includes?.(v)))
  if (!structs.length) throw new Error(`result.${path.join(".")} has no member ${JSON.stringify(member)}`)
  const f = structs[0].fields; if (!f) throw new Error(`result.${path.join(".")} is not a struct`)
  const keys: string[] = ent.entityPrimaryKey
  const missing = keys.filter((k) => !(k in f)); if (missing.length) throw new Error(`place result.${path.join(".")} lacks key field(s) ${missing.join(", ")}`)
  const allowed: string[] = ent.entityPick ? [...ent.entityPick, ...keys] : ent.entityFields
  return { path, member, carries: Object.keys(f).filter((k) => allowed.includes(k)), context: Object.keys(f).filter((k) => !allowed.includes(k)) }
}
const placeOf = (schema: any, at: any) => { const r = (at ? at({ result: mkPlace([schema], []) }) : mkPlace([schema], []))[REF]; if (!r?.schemas) throw new Error("`at` must return a place in result"); return r }

class Chain {
  places: any[] = []; wheres: any[] = []; derived: any[] = []; order?: any; unordered_ = false; unaff: string[] = []
  paged?: any; ignored: any[] = []; keyFn?: any; predicts_: any[] = []; also: any[] = []
  constructor(public op: "read" | "write", public res: any) {}
  private versions() { return [...this.places.map((p) => p.ent.entityVersion), ...this.derived.map((d) => d.ent.entityVersion)].filter(Boolean) }
  one(ent: any, at?: any) { this.places.push({ shape: "one", ent, at }); return this }
  list(ent: any, at: any, member?: any) { this.places.push({ shape: "list", ent, at, member }); return this }
  derivedFrom(ent: any, fields?: any, where?: any) { this.derived.push({ ent, fields, where }); return this }
  where(f: any) { this.wheres.push(f); return this }
  orderBy(f: any) { this.order = f; return this }
  unordered() { this.unordered_ = true; return this }
  unaffectedBy(...f: string[]) { this.unaff.push(...f); return this }
  pagedBy(f: any, next: any) { this.paged = { f, next }; return this }
  ignoring(f: any) { this.ignored.push(f); return this }
  byKey(f: any) { this.keyFn = f; return this }
  predicts(f: any) { this.predicts_.push(f); return this }
  alsoChanges(f: any) { this.also.push(f); return this }
  compile() {
    const out: any = { op: this.op, operation: this.res.id }
    const schema = this.op === "read" ? this.res.result : this.res.result
    if (this.places.length) out.places = this.places.map((p) => {
      const r = placeOf(schema, p.at)
      return { shape: p.shape, entity: p.ent.entityId, ...placeInfo(r.schemas, p.ent, r.path, p.member) }
    })
    const input = mkRef("input"), record = mkRef("record", [], this.versions())
    if (this.derived.length) out.derivedFrom = this.derived.map((d) => {
      const rec = mkRef("record", [], d.ent.entityVersion ? [d.ent.entityVersion] : [])
      return { entity: d.ent.entityId, fields: d.fields ? d.fields({ record: rec }).map(toIR) : "any",
        where: d.where ? cond(d.where({ input, record: rec }), ".derivedFrom condition") : undefined }
    })
    const conds = this.wheres.map((f) => cond(f({ input, record }), ".where"))
    if (conds.length) out.where = conds.length === 1 ? conds[0] : { type: "func", name: "and", args: conds }
    if (this.order) {
      const keys = this.order({ record })
      if (!Array.isArray(keys) || !keys.every((k: any) => k?.[SORT])) throw new Error(".orderBy must return an array of asc(...) and desc(...)")
      out.orderBy = keys.map((k: any) => ({ dir: k.dir, ref: k.ref }))
    }
    if (this.unordered_) out.unordered = true
    if (this.unaff.length) out.unaffectedBy = this.unaff
    if (this.paged) {
      const r = placeOf(schema, this.paged.next)
      out.pagedBy = { input: toIR(this.paged.f({ input })), next: r.path }
    }
    if (this.ignored.length) out.ignoring = this.ignored.flatMap((f) => f({ input }).map(toIR))
    if (this.keyFn) out.byKey = toIR(this.keyFn({ input }))
    if (this.predicts_.length) out.predicts = this.predicts_.flatMap((f) => [f({ input })].flat())
    if (this.also.length) out.alsoChanges = this.also.flatMap((f) => [f({ input })].flat())
    return out
  }
}
class RtListen {
  constructor(public s: any, public ents: any[], public f: any) {}
  compile() { return { op: "listen", operation: this.s.id, changes: this.ents.map((e) => e.entityId), mapping: "runtime" } }
}
export function read<In, R extends Schema.Top>(res: Resource<In, R>): ReadStart<In, R> {
  return {
    one: (e: any, at?: any) => new Chain("read", res).one(e, at),
    list: (e: any, at: any, m?: any) => new Chain("read", res).list(e, at, m),
    derivedFrom: (e: any, f?: any, w?: any) => new Chain("read", res).derivedFrom(e, f, w),
  } as any
}
export function write<I extends Schema.Top, R extends Schema.Top>(tx: Transaction<I, R>): WriteStart<I, R> {
  return new Chain("write", tx) as any
}
export function listen<S extends Stream<any>>(s: S): ListenStart<S> { return { as: (ents: any, f: any) => new RtListen(s, ents, f) } as any }
