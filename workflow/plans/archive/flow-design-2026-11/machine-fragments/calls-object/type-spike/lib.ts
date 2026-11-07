// lib.ts: a minimal stand-in for Flow State's machine API, only enough to ask where `calls` live.
// Types are the spike. The runtime half (proxies, plain objects) exists so lint.ts can run the
// "declared but unused" and "used but not declared" checks that a type cannot do (casts to any are internal).

export type Tagged = { readonly _tag: string }

// ── events and mappings ────────────────────────────────────────────────────────────────────────────
declare const UncertainMark: unique symbol
export type Uncertain<T> = T & { readonly [UncertainMark]: true }
type UncertainOf<Ev> = Extract<Ev, { readonly [UncertainMark]: true }>
type PayloadOf<Ev, K> = Omit<Extract<Ev, { readonly _tag: K }>, "_tag" | typeof UncertainMark>
export interface Bare<K extends string> { readonly _tag: K; readonly __bare: true }
export interface Mapper<V, T> { readonly __mapper: (value: V) => T }
type Mapping<V, T extends Tagged> = Bare<T["_tag"]> | Mapper<V, T>
export type Events<Ev extends Tagged> = {
  readonly [K in Ev["_tag"]]: (keyof PayloadOf<Ev, K> extends never ? Bare<K> : unknown) & {
    readonly from: <V>(f: (value: V) => PayloadOf<Ev, K>) => Mapper<V, Extract<Ev, { readonly _tag: K }>>
  }
}

// ── operations (outside the machine) ───────────────────────────────────────────────────────────────
export interface Schema<I> { readonly __schema: I }
export const schema = <I>(): Schema<I> => ({}) as Schema<I>
/** input I, success A, failure F (tagged). */
export interface Operation<I, A, F extends Tagged> { readonly id: string; readonly __op: { readonly i: I; readonly a: A; readonly f: F } }
export const operation = <I, A, F extends Tagged = never>(id: string, _input: Schema<I>): Operation<I, A, F> => ({ id }) as Operation<I, A, F>
type OpTree = Record<string, Record<string, Operation<any, any, any>>>
type UnknownReason = { readonly _tag: "NoResponse" } | { readonly _tag: "Cancelled" } | { readonly _tag: "StillUnknown" }
type Outcomes<A, F extends Tagged, Ev extends Tagged> = {
  readonly success: Mapping<A, Ev>
  readonly unknown: Mapping<UnknownReason, UncertainOf<Ev>>
} & ([F] extends [never]
  ? {}
  : { readonly failure: { readonly [X in F["_tag"]]: Mapping<Extract<F, { readonly _tag: X }>, Ev> } })

// ── the call (the commit value) ────────────────────────────────────────────────────────────────────
export interface Denial { readonly _tag: "Denial"; readonly code: string }
export const deny = (code: string): Denial => ({ _tag: "Denial", code })
export type Guard<E, M> = (g: { readonly memory: M; readonly event: E }) => true | Denial
/** Property syntax (not method syntax) keeps this contravariant under strictFunctionTypes: Action<E> accepts a
 *  call whose select needs `Need` only when the handler's event E is assignable to Need. */
export interface Action<E> { readonly __needs: (event: E) => void }
export interface Call<Need, M, A = unknown, F = unknown> extends Action<Need> {
  readonly idle: Guard<unknown, M>        // guard: no attempt outstanding
  readonly retry: Action<unknown>         // action: re-send the lane's attempt (does not run the select again)
  readonly cancel: Action<unknown>
  readonly __call: { readonly a: A; readonly f: F }
}
export type AnyCall = Call<any, any, any, any>
export type CallRecord = Record<string, AnyCall>
type Sel<M, Need, I> = (g: { readonly memory: M; readonly event: Need }) => I
export type OpHandles<Ops extends OpTree, M, Ev extends Tagged> = {
  readonly [G in keyof Ops]: {
    readonly [N in keyof Ops[G]]: Ops[G][N] extends Operation<infer I, infer A, infer F>
      ? { readonly commit: <Need = unknown>(select: Sel<M, Need, I>, o: { readonly outcomes: Outcomes<A, F, Ev> }) => Call<Need, M, A, F> }
      : never
  }
}

// ── states and handlers ────────────────────────────────────────────────────────────────────────────
export interface Alt<E, M> {
  readonly target?: string
  readonly guard?: Guard<E, M> | ReadonlyArray<Guard<E, M>>
  readonly updateMemory?: (g: { readonly memory: M; readonly event: E }) => Partial<M>
  readonly actions?: ReadonlyArray<Action<E>>
}
export type Handler<E, M> = Alt<E, M> | ReadonlyArray<Alt<E, M>>
export interface StateSpec<Ev extends Tagged, M> {
  readonly on?: { readonly [K in Ev["_tag"]]?: Handler<Extract<Ev, { readonly _tag: K }>, M> }
}
export type States<Ev extends Tagged, M> = { readonly [name: string]: StateSpec<Ev, M> }
// Excess-property check that survives a callback return: `S` is inferred, then every key outside the known shape becomes `never`.
// (A returned object literal loses TypeScript's own excess-property check when it comes back from a callback.)
type StrictAlt<A> = { readonly [K in keyof A]: K extends keyof Alt<any, any> ? A[K] : never }
type StrictHandler<H> = H extends readonly unknown[] ? { readonly [I in keyof H]: StrictAlt<H[I]> } : StrictAlt<H>
type Strict<S, Ev extends Tagged> = {
  readonly [N in keyof S]: {
    readonly [P in keyof S[N]]: P extends "on"
      ? { readonly [T in keyof S[N][P]]: T extends Ev["_tag"] ? StrictHandler<S[N][P][T]> : never }
      : P extends keyof StateSpec<Ev, any> ? S[N][P] : never
  }
}
export type Checked<S, Ev extends Tagged, M = any> = S & Strict<S, Ev> & States<Ev, M>

// ── definitions and traits ─────────────────────────────────────────────────────────────────────────
/** Shape 5 only: a call declared on the definition, optionally with the event fields its select will read. */
export interface Decl<Op, Need> { readonly __decl: { readonly op: Op; readonly need: Need } }
export const decl = <Need = unknown>() => <Op extends Operation<any, any, any>>(op: Op): Decl<Op, Need> => ({ op }) as unknown as Decl<Op, Need>
type DeclParts<X> = X extends Decl<infer Op, infer N> ? { op: Op; need: N } : X extends Operation<any, any, any> ? { op: X; need: unknown } : never

export interface Definition<Ev extends Tagged, M, Ops, T, DC> {
  readonly __def: { readonly ev: Ev; readonly m: M; readonly ops: Ops; readonly traits: T; readonly dc: DC }
  readonly id: string
}
export const definition = <Ev extends Tagged>() =>
  <M, Ops extends OpTree = {}, T extends Record<string, Each<any>> = {}, DC extends Record<string, Operation<any, any, any> | Decl<any, any>> = {}>(
    d: { readonly id: string; readonly memory: M; readonly operations?: Ops; readonly traits?: T; readonly calls?: DC },
  ): Definition<Ev, M, Ops, T, DC> => d as any

export interface Trait<Ev extends Tagged, M, C> { readonly __trait: { readonly ev: Ev; readonly m: M; readonly c: C }; readonly body: unknown }
export interface Each<Tr> { readonly __each: Tr }
export const each = <Tr extends Trait<any, any, any>>(t: Tr): Each<Tr> => ({ t }) as any

export interface CallState { readonly pending: boolean; readonly retryCount: number }
export type CallsSnap<C> = { readonly [K in keyof C]: CallState }
export interface Row<Tr> { readonly key: string; readonly memory: Tr extends Trait<any, infer M, any> ? M : never; readonly calls: Tr extends Trait<any, any, infer C> ? CallsSnap<C> : never }

export interface Machine<Ev extends Tagged, M, C, T> { readonly __machine: { readonly ev: Ev; readonly m: M; readonly c: C; readonly t: T }; readonly body: unknown }
export type Snapshot<X> = X extends Machine<any, infer M, infer C, infer T>
  ? { readonly memory: M; readonly calls: CallsSnap<C>; readonly traits: { readonly [K in keyof T]: T[K] extends Each<infer Tr> ? ReadonlyArray<Row<Tr>> : never } }
  : never

export interface Helpers<Ev extends Tagged, M, Ops extends OpTree> { readonly O: OpHandles<Ops, M, Ev>; readonly E: Events<Ev> }

// ── runtime (proxies and plain objects; just enough for lint.ts) ──────────────────────────────────────
const mkCall = (op: string, select: unknown, outcomes: unknown): any => {
  const call: any = { kind: "call", op, select, outcomes }
  call.idle = Object.assign(() => true, { call })
  call.retry = { kind: "retry", call }
  call.cancel = { kind: "cancel", call }
  return call
}
const mkO = (): any => new Proxy({}, { get: (_, g) => new Proxy({}, { get: (_, n) => ({ commit: (select: unknown, o: any) => mkCall(`${String(g)}.${String(n)}`, select, o.outcomes) }) }) })
const mkE = (): any => new Proxy({}, { get: (_, tag) => Object.assign({ _tag: tag }, { from: (f: unknown) => ({ _tag: tag, mapper: f }) }) })
const helpers = (): any => ({ O: mkO(), E: mkE() })

// ── shapes 1, 2, 3: `machine(def, (h) => body)` ───────────────────────────────────────────────────────
// `calls` is a property of the returned object. `states` may be a plain object (shapes 1, 2) or a function of
// `{ calls }` (shape 3a). `Inferred<C>` turns a failed inference (C collapsing to the index-signature constraint)
// into a type error instead of a silent loss of every call's type.
type Inferred<C> = string extends keyof C ? { readonly "calls could not be inferred (C collapsed to Record<string, Call>)": never } : unknown
export type Body<Ev extends Tagged, M, C, S> = {
  readonly calls: C & Inferred<C>
  readonly initial: string
  readonly states: Checked<S, Ev, M> | ((s: { readonly calls: C }) => Checked<S, Ev, M>)
}
export function machine<Ev extends Tagged, M, Ops extends OpTree, T, DC, C extends CallRecord, S>(
  def: Definition<Ev, M, Ops, T, DC>,
  body: (h: Helpers<Ev, M, Ops>) => Body<Ev, M, C, S>,
): Machine<Ev, M, C, T> {
  return { def, body: body(helpers()) } as any
}
export function trait<Ev extends Tagged, M, Ops extends OpTree, T, DC, C extends CallRecord, S>(
  def: Definition<Ev, M, Ops, T, DC>,
  body: (h: Helpers<Ev, M, Ops>) => Body<Ev, M, C, S>,
): Trait<Ev, M, C> {
  return { def, body: body(helpers()) } as any
}

// ── shape 2c: `named("pay", call)` makes "used but not in `calls`" a type error ───────────────────────────
type Named<N extends string> = {
  readonly __name: N
  readonly idle: { readonly __name: N }
  readonly retry: { readonly __name: N }
  readonly cancel: { readonly __name: N }
}
export const named = <N extends string, X extends AnyCall>(_name: N, call: X): X & Named<N> => call as any
type NamesIn<S> = S extends { readonly __name: infer N extends string } ? N
  : S extends (...a: any[]) => any ? never
  : S extends readonly (infer U)[] ? NamesIn<U>
  : S extends object ? { [K in keyof S]: NamesIn<S[K]> }[keyof S]
  : never
type DeclaredNames<C> = { [K in keyof C]: C[K] extends { readonly __name: infer N extends string } ? N : never }[keyof C]
type Forgotten<C, S> = { readonly [N in Exclude<NamesIn<S>, DeclaredNames<C>>]: "used in states but not in `calls`" }
export type BodyN<Ev extends Tagged, M, C, S> = {
  readonly calls: C & Inferred<C> & Forgotten<C, S>
  readonly initial: string
  readonly states: Checked<S, Ev, M>
}
export function machineN<Ev extends Tagged, M, Ops extends OpTree, T, DC, C extends CallRecord, S>(
  def: Definition<Ev, M, Ops, T, DC>,
  body: (h: Helpers<Ev, M, Ops>) => BodyN<Ev, M, C, S>,
): Machine<Ev, M, C, T> {
  return { def, body: body(helpers()) } as any
}

// ── shape 3b: the body is an object of two functions; `states` reads what `calls` returned ───────────────
// TS 4.7 infers left to right across context-sensitive function properties of one object literal.
export interface BodyO<Ev extends Tagged, M, Ops extends OpTree, C, S> {
  readonly calls: (h: Helpers<Ev, M, Ops>) => C & Inferred<C>
  readonly initial: string
  readonly states: (h: { readonly calls: C; readonly E: Events<Ev> }) => Checked<S, Ev, M>
}
export function machineO<Ev extends Tagged, M, Ops extends OpTree, T, DC, C extends CallRecord, S>(def: Definition<Ev, M, Ops, T, DC>, body: BodyO<Ev, M, Ops, C, S>): Machine<Ev, M, C, T> {
  const h = helpers()
  const calls = body.calls(h)
  return { def, body: { calls, initial: body.initial, states: body.states({ calls, E: h.E }) } } as any
}
export function traitO<Ev extends Tagged, M, Ops extends OpTree, T, DC, C extends CallRecord, S>(def: Definition<Ev, M, Ops, T, DC>, body: BodyO<Ev, M, Ops, C, S>): Trait<Ev, M, C> {
  return machineO(def, body) as any
}

// ── shape 3c / 2b: the callback gets `define`, an identity function that takes the body as a direct argument ──
export type BodyF<Ev extends Tagged, M, C, S> = { readonly calls: C & Inferred<C>; readonly initial: string; readonly states: (s: { readonly calls: C }) => Checked<S, Ev, M> }
export type BodyP<Ev extends Tagged, M, C, S> = { readonly calls: C & Inferred<C>; readonly initial: string; readonly states: Checked<S, Ev, M> }
export interface HelpersD<Ev extends Tagged, M, Ops extends OpTree> extends Helpers<Ev, M, Ops> {
  readonly define: <C extends CallRecord, S>(b: BodyF<Ev, M, C, S>) => Body<Ev, M, C, S>
  readonly definePlain: <C extends CallRecord, S>(b: BodyP<Ev, M, C, S>) => Body<Ev, M, C, S>
}
export function machineD<Ev extends Tagged, M, Ops extends OpTree, T, DC, C extends CallRecord, S>(
  def: Definition<Ev, M, Ops, T, DC>,
  body: (h: HelpersD<Ev, M, Ops>) => Body<Ev, M, C, S>,
): Machine<Ev, M, C, T> {
  return { def, body: body({ ...helpers(), define: (b: unknown) => b, definePlain: (b: unknown) => b }) } as any
}
export function traitD<Ev extends Tagged, M, Ops extends OpTree, T, DC, C extends CallRecord, S>(
  def: Definition<Ev, M, Ops, T, DC>,
  body: (h: HelpersD<Ev, M, Ops>) => Body<Ev, M, C, S>,
): Trait<Ev, M, C> {
  return machineD(def, body) as any
}

// ── shape 4: a two-step builder ───────────────────────────────────────────────────────────────────────
export interface Step2<Ev extends Tagged, M, T, C> {
  body<S>(f: (h: { readonly calls: C; readonly E: Events<Ev> }) => { readonly initial: string; readonly states: Checked<S, Ev, M> }): Machine<Ev, M, C, T>
}
export interface Step1<Ev extends Tagged, M, Ops extends OpTree, T> {
  calls<C extends CallRecord>(f: (h: Helpers<Ev, M, Ops>) => C): Step2<Ev, M, T, C>
}
export function machineB<Ev extends Tagged, M, Ops extends OpTree, T, DC>(def: Definition<Ev, M, Ops, T, DC>): Step1<Ev, M, Ops, T> {
  return {
    calls: (f: any) => {
      const h = helpers()
      const calls = f(h)
      return { body: (g: any) => ({ def, body: { calls, ...g({ calls, E: h.E }) } }) }
    },
  } as any
}
export interface TStep2<Ev extends Tagged, M, C> {
  body<S>(f: (h: { readonly calls: C; readonly E: Events<Ev> }) => { readonly initial: string; readonly states: Checked<S, Ev, M> }): Trait<Ev, M, C>
}
export interface TStep1<Ev extends Tagged, M, Ops extends OpTree> {
  calls<C extends CallRecord>(f: (h: Helpers<Ev, M, Ops>) => C): TStep2<Ev, M, C>
}
export function traitB<Ev extends Tagged, M, Ops extends OpTree, T, DC>(def: Definition<Ev, M, Ops, T, DC>): TStep1<Ev, M, Ops> {
  return machineB(def) as any
}

// ── shape 5: calls declared on the definition; select and outcomes bound later in the body ─────────────
type HandleOf<X, M> = DeclParts<X> extends { op: Operation<infer _I, infer A, infer F>; need: infer N } ? Call<N, M, A, F> : never
type Handles<DC, M> = { readonly [K in keyof DC]: HandleOf<DC[K], M> }
type BindOf<X, M, Ev extends Tagged> = DeclParts<X> extends { op: Operation<infer I, infer A, infer F>; need: infer N }
  ? { readonly select: Sel<M, N, I>; readonly outcomes: Outcomes<A, F, Ev> }
  : never
export interface Helpers5<Ev extends Tagged, M, DC> { readonly calls: Handles<DC, M>; readonly E: Events<Ev> }
export type Body5<Ev extends Tagged, M, DC, S> = {
  readonly bind: { readonly [K in keyof DC]: BindOf<DC[K], M, Ev> }
  readonly initial: string
  readonly states: Checked<S, Ev, M>
}
export function machine5<Ev extends Tagged, M, Ops, T, DC, S>(def: Definition<Ev, M, Ops, T, DC>, body: (h: Helpers5<Ev, M, DC>) => Body5<Ev, M, DC, S>): Machine<Ev, M, Handles<DC, M>, T> {
  const handles: any = {}
  for (const k of Object.keys((def as any).calls ?? {})) handles[k] = mkCall(k, undefined, undefined)
  const b = body({ calls: handles, E: mkE() })
  for (const k of Object.keys(handles)) Object.assign(handles[k], { select: (b.bind as any)[k].select, outcomes: (b.bind as any)[k].outcomes })
  return { def, body: { calls: handles, ...b } } as any
}
export function trait5<Ev extends Tagged, M, Ops, T, DC, S>(def: Definition<Ev, M, Ops, T, DC>, body: (h: Helpers5<Ev, M, DC>) => Body5<Ev, M, DC, S>): Trait<Ev, M, Handles<DC, M>> {
  return machine5(def, body) as any
}

// ── runtime lint (flow check stand-in) ───────────────────────────────────────────────────────────────
export function lintCalls(m: { readonly body: any }): { unused: string[]; undeclared: number } {
  const calls: Record<string, any> = m.body.calls
  const states = typeof m.body.states === "function" ? m.body.states({ calls }) : m.body.states
  const used = new Set<any>()
  const note = (x: any) => { if (x?.kind === "call") used.add(x); else if (x?.call) used.add(x.call) }
  for (const s of Object.values<any>(states)) for (const h of Object.values<any>(s.on ?? {})) for (const a of [h].flat()) {
    for (const x of a.actions ?? []) note(x.kind === "call" ? x : x.call)
    for (const g of [a.guard ?? []].flat()) note(g)
  }
  const declared = new Set(Object.values(calls))
  return {
    unused: Object.entries(calls).filter(([, c]) => !used.has(c)).map(([k]) => k),
    undeclared: [...used].filter((c) => !declared.has(c)).length,
  }
}
