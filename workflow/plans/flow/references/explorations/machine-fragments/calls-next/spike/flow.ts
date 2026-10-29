// flow.ts: the library half of the spike. Outcome (unchanged), the Attempt, transactions, commit values with
// `outcomes` mappings, the call record, and a small turn runtime that implements the proposal's rules
// (routing at admission, `.pending` until the ending's turn, implicit in-flight guards, Attempt-level
// classification, cancel that never rewrites a settled ending, entry-armed schedules on the controlled clock).
//
// Casts inside this file are runtime-internal erasure (records of many calls kept in one Map). The author-facing
// path (transaction → event payload → guard → memory) is typed by inference only; see types.ts.
import { Cause, Data, Effect, Exit, Fiber, Result, Schema } from "effect"
import * as TestClock from "effect/testing/TestClock"

// ── 1. Outcome: exactly as outcome-proposal.md ────────────────────────────────────────────────────────────
export class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
export class OutcomeUnknown<R> extends Data.TaggedError("Flow/Unknown")<{ readonly reason: R }> {}
export const Outcome = {
  success: <A>(value: A) => Effect.succeed(value),
  failure: <R>(reason: R) => new OutcomeFailure({ reason }),
  unknown: <R>(reason: R) => new OutcomeUnknown({ reason }),
}
export type Tagged = { readonly _tag: string }
export type FailureReasons<E> = E extends OutcomeFailure<infer R> ? R : E extends OutcomeUnknown<any> ? never : E
export type UnknownReasons<E> = E extends OutcomeUnknown<infer R> ? R : never

// ── 2. Flow's own reasons (the only values Flow itself puts in a channel) ─────────────────────────────────────
export type NotSent = { readonly _tag: "NotSent"; readonly why: "Cancelled" | "Superseded" | "Restored" }
export type FlowUnknown =
  | { readonly _tag: "Cancelled" }
  | { readonly _tag: "Restored" }
  | { readonly _tag: "Interrupted" }
  | { readonly _tag: "Defect"; readonly defect: unknown }
/** A send failed definitely, but an earlier send of the same Attempt may have applied (rule 6). */
export type StillUnknown<F> = { readonly _tag: "StillUnknown"; readonly failure: F }
type Reserved = "NotSent" | "Cancelled" | "Restored" | "Interrupted" | "Defect" | "StillUnknown" | "success" | "unknown"
type TagOf<T> = T extends { readonly _tag: infer X extends string } ? X : never

// ── 3. The Attempt: minted and counted by Flow, because Flow is what invokes the commit ─────────────────────────
export interface Attempt<I, K> {
  readonly id: string
  readonly operation: string
  readonly key: K
  readonly input: I
  readonly sends: number            // invocations of the commit for this Attempt, this one included
  readonly idempotencyKey: string   // what to put on the wire (rule 7): `id` once anything may have applied
  readonly mayHaveApplied: boolean  // an earlier send of this Attempt ended unknown
}

// ── 4. Transactions (outside the machine) ─────────────────────────────────────────────────────────────────────
export type Concurrency = "reject" | "latest"
export interface Transaction<I, K, A, E, R> {
  readonly id: string
  readonly input: Schema.Schema<I>
  readonly key: (input: I) => K
  readonly concurrency: Concurrency
  readonly commit: (input: I, ctx: { readonly attempt: Attempt<I, K> }) => Effect.Effect<A, E, R>
}
type NoReservedTags<E> = [Extract<TagOf<FailureReasons<E> | UnknownReasons<E>>, Reserved>] extends [never]
  ? unknown
  : { readonly "a commit error uses a reserved tag": Extract<TagOf<FailureReasons<E> | UnknownReasons<E>>, Reserved> }
export const transaction = <I, K extends object, A, E, R>(d: Transaction<I, K, A, E, R> & NoReservedTags<E>): Transaction<I, K, A, E, R> => d

export type AnyTransaction = Transaction<any, any, any, any, any>
type In<T> = T extends Transaction<infer I, any, any, any, any> ? I : never
type Key<T> = T extends Transaction<any, infer K, any, any, any> ? K : never
type Val<T> = T extends Transaction<any, any, infer A, any, any> ? A : never
type Err<T> = T extends Transaction<any, any, any, infer E, any> ? E : never
type Failures<T> = FailureReasons<Err<T>> | NotSent
type Unknowns<T> = UnknownReasons<Err<T>> | FlowUnknown | StillUnknown<FailureReasons<Err<T>>>

// ── 5. Outcome mappings on the commit value (the in-machine-calls syntax) ─────────────────────────────────────────
declare const UncertainMark: unique symbol
/** `Flow.uncertain`: the marker on author events that an `unknown:` mapping may target. */
export type Uncertain<T> = T & { readonly [UncertainMark]: true }
type UncertainOf<Ev> = Extract<Ev, { readonly [UncertainMark]: true }>
type PayloadOf<Ev, K> = Omit<Extract<Ev, { readonly _tag: K }>, "_tag" | typeof UncertainMark>
/** A payload-free event used as a mapping target (`E.Declined`). */
export interface Bare<K extends string> { readonly _tag: K; readonly __bare: true }
/** `E.X.from((value, { input, attempt, superseded }) => payload)` */
export interface Mapper<V, C, T> { readonly __mapper: (value: V, ctx: C) => T }
type Mapping<V, C, T extends Tagged> = Bare<T["_tag"]> | Mapper<V, C, T>
export type Events<Ev extends Tagged> = {
  readonly [K in Ev["_tag"]]: (keyof PayloadOf<Ev, K> extends never ? Bare<K> : unknown) & {
    readonly from: <V, C>(f: (value: V, ctx: C) => PayloadOf<Ev, K>) => Mapper<V, C, Extract<Ev, { readonly _tag: K }>>
  }
}
export type Ctx<T> = { readonly input: In<T>; readonly attempt: Attempt<In<T>, Key<T>>; readonly superseded: boolean }
type FTags<T> = TagOf<FailureReasons<Err<T>>>
type NotSentKey<T, Ev extends Tagged> = { readonly NotSent?: Mapping<NotSent, Ctx<T>, Ev> }   // optional in the type; flow check requires it where it can occur
export type Outcomes<T, Ev extends Tagged> = {
  readonly success: Mapping<Val<T>, Ctx<T>, Ev>
  readonly unknown: Mapping<Unknowns<T>, Ctx<T>, UncertainOf<Ev>>
} & ([FTags<T>] extends [never]
  ? { readonly failure?: NotSentKey<T, Ev> }
  : { readonly failure: { readonly [X in FTags<T>]: Mapping<Extract<FailureReasons<Err<T>>, { readonly _tag: X }>, Ctx<T>, Ev> } & NotSentKey<T, Ev> })

// ── 6. The call record, read through the commit value (rule 9) ───────────────────────────────────────────────────
export interface CallView<T> {
  readonly pending: boolean                         // from start until its ending's turn is admitted
  readonly attempt: Attempt<In<T>, Key<T>> | undefined
  readonly sends: number
  readonly last: { readonly channel: "success" | "failure" | "unknown"; readonly tag: string } | undefined
}
type Keyless<K> = keyof K extends never ? true : false
/** Opaque: the runtime's record reader, present on every guard and schedule input. Read it through `pay.at(g, key)`. */
export interface Records { readonly read: (commit: string, key: unknown) => CallView<any> }
type WithRecords = { readonly records: Records }

// ── 7. Machine spec (a minimal stand-in for v4's machine API: states are dotted paths, "" is the root) ─────────────
export type Denial = { readonly _tag: "Denial"; readonly code: string }
export const deny = (code: string): Denial => ({ _tag: "Denial", code })
export interface G<E, M> { readonly event: E; readonly memory: M; readonly state: string; readonly records: Records }
export type Guard<E, M> = (g: G<E, M>) => true | Denial
export interface Action<E> { readonly kind: "start" | "retry" | "cancel"; readonly commit: AnyCommit; readonly select?: (g: { memory: any; event: E }) => unknown }
export interface Alt<E, M> {
  readonly target?: string
  readonly guard?: Guard<E, M> | ReadonlyArray<Guard<E, M>>
  readonly update?: (g: G<E, M>) => Partial<M>
  readonly actions?: ReadonlyArray<Action<E>>
}
export type Handler<E, M> = Alt<E, M> | ReadonlyArray<Alt<E, M>>
export interface StateSpec<Ev extends Tagged, M> {
  readonly initial?: string
  readonly after?: Record<string, { readonly delay: (g: { memory: M; records: Records }) => number; readonly send: Ev }>
  readonly on?: { readonly [K in Ev["_tag"]]?: Handler<Extract<Ev, { readonly _tag: K }>, M> }
}
type KeySel<T, M, E> = (g: { readonly memory: M; readonly event: E }) => Key<T>
/** The commit value is the handle: listed in `actions` it starts a new Attempt. */
export interface Commit<T, M, Ev, E> extends Action<E> {
  readonly retry: Keyless<Key<T>> extends true ? () => Action<any> : <E2 extends Ev = Ev>(key: KeySel<T, M, E2>) => Action<E2>
  readonly cancel: Keyless<Key<T>> extends true ? () => Action<any> : <E2 extends Ev = Ev>(key: KeySel<T, M, E2>) => Action<E2>
  readonly at: Keyless<Key<T>> extends true ? (g: WithRecords) => CallView<T> : (g: WithRecords, key: Key<T>) => CallView<T>
  readonly pending: Keyless<Key<T>> extends true ? (g: WithRecords) => boolean : (g: WithRecords, key: Key<T>) => boolean
}
type AnyCommit = { readonly id: string; readonly op: AnyTransaction; readonly outcomes: any }
type Ops = Record<string, Record<string, AnyTransaction>>
export type OpHandles<O extends Ops, M, Ev extends Tagged> = {
  readonly [G in keyof O]: {
    readonly [N in keyof O[G]]: {
      readonly commit: <E extends Ev = Ev>(select: (g: { readonly memory: M; readonly event: E }) => In<O[G][N]>, options: { readonly outcomes: Outcomes<O[G][N], Ev> }) => Commit<O[G][N], M, Ev, E>
    }
  }
}
export interface Machine<Ev extends Tagged, M> { readonly memory: M; readonly initial: string; readonly states: Record<string, StateSpec<Ev, M>> }

/**
 * `machine<Ev>()({ memory, operations })` returns `E` (event constructors for mappings), `O` (commit factories) and
 * `define(body)`. The body is a plain object, not a callback: a context-sensitive callback (v4's
 * `machine(def, (h) => body)`) loses TypeScript's excess-property check, so a handler for an event that does not
 * exist would not be a type error.
 */
export const machine = <Ev extends Tagged>() =>
  <M, O extends Ops>(def: { readonly memory: M; readonly operations: O }) => {
    let n = 0
    const E: any = new Proxy({}, {   // runtime-internal: typed by Events<Ev>
      get: (_t, k: string) => ({ _tag: k, __bare: true, from: (f: any) => ({ __mapper: (v: any, c: any) => ({ _tag: k, ...f(v, c) }) }) }),
    })
    const O: any = {}
    for (const [group, ops] of Object.entries(def.operations)) {
      O[group] = {}
      for (const [name, op] of Object.entries(ops)) {
        O[group][name] = {
          commit: (select: any, options: any) => {
            const c: any = { id: `${group}.${name}#${++n}`, op, outcomes: options.outcomes, kind: "start", select }
            c.commit = c
            const keyed = (sel?: any) => sel && ((g: any) => ({ __key: sel(g) }))
            c.retry = (sel?: any) => ({ kind: "retry", commit: c, select: keyed(sel) })
            c.cancel = (sel?: any) => ({ kind: "cancel", commit: c, select: keyed(sel) })
            c.at = (g: WithRecords, key?: unknown) => g.records.read(c.id, key ?? {})
            c.pending = (g: WithRecords, key?: unknown) => g.records.read(c.id, key ?? {}).pending
            return c
          },
        }
      }
    }
    return {
      E: E as Events<Ev>,
      O: O as OpHandles<O, M, Ev>,
      define: (body: { readonly initial: string; readonly states: Record<string, StateSpec<Ev, M>> }): Machine<Ev, M> => ({ memory: def.memory, ...body }),
    }
  }

// ── 8. The runtime ─────────────────────────────────────────────────────────────────────────────────────────────
/** The old proposal's behaviours, switchable one at a time, so each Story can show the failure it fixes. */
export interface Legacy {
  readonly routeAtSettlement?: boolean   // P1: choose outcomes/abandoned when the commit settles
  readonly perSendFailure?: boolean      // P2: a failure on a re-send is definite
  readonly pendingUntilSettlement?: boolean // P3: .pending false at settlement
  readonly silentReject?: boolean        // P5: a declined start does nothing, the transition still happens
  readonly sameWireKey?: boolean         // P21: a re-send always reuses the Attempt id as the idempotency key
}
type SendEnding = { channel: "success"; value: unknown } | { channel: "failure" | "unknown"; reason: Tagged }
interface Owner { readonly path: string; readonly chain: ReadonlyArray<readonly [string, number]> }
interface Outstanding { attempt: Attempt<any, any>; owner: Owner; fiber?: Fiber.Fiber<unknown, unknown>; invoked: boolean; cancelled: boolean; settled: boolean; legacyRoute?: "current" | "late" }
interface Rec {
  readonly commit: AnyCommit; readonly key: unknown
  attempt?: Attempt<any, any>
  generation: number; mayHaveApplied: boolean
  last?: { channel: "success" | "failure" | "unknown"; tag: string }
  outstanding: Map<string, Outstanding>
  queued?: Outstanding
}
type Item =
  | { kind: "event"; event: Tagged }
  | { kind: "timer"; event: Tagged; path: string; activation: number }
  | { kind: "ending"; rec: Rec; out: Outstanding; send: SendEnding }
type Admitted = { event: Tagged | undefined; label: string }

const prefixes = (p: string): string[] => { const out = [""]; if (p === "") return out; const parts = p.split("."); for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join(".")); return out }
const parentOf = (p: string) => (p === "" ? undefined : p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : "")
const arr = <X>(x: X | ReadonlyArray<X> | undefined): ReadonlyArray<X> => (x === undefined ? [] : Array.isArray(x) ? x : [x as X])

export const makeActor = <Ev extends Tagged, M>(spec: Machine<Ev, M>, opts: { legacy?: Legacy; ackDelayMs?: number } = {}) => {
  const legacy = opts.legacy ?? {}
  const sp: any = spec // runtime-internal erasure
  let memory: any = { ...spec.memory }
  let leaf = ""
  let act = 0
  let n = 0
  const activations = new Map<string, number>()
  const records = new Map<string, Rec>()
  const mailbox: Item[] = []
  const trace: string[] = []
  let clock = 0

  const descend = (p: string): string => { const s = sp.states[p]; return s?.initial ? descend(s.initial) : p }
  const recOf = (commit: AnyCommit, key: unknown): Rec => {
    const id = `${commit.id}|${JSON.stringify(key)}`
    let r = records.get(id)
    if (!r) { r = { commit, key, generation: 0, mayHaveApplied: false, outstanding: new Map() }; records.set(id, r) }
    return r
  }
  // the `reject` lane is per descriptor and key (Operations O3), across every commit value of that descriptor
  const lanePending = (op: AnyTransaction, key: unknown) =>
    [...records.values()].some((r) => r.commit.op === op && JSON.stringify(r.key) === JSON.stringify(key) && pendingOf(r))
  const pendingOf = (r: Rec | undefined) =>
    !!r && (legacy.pendingUntilSettlement ? [...r.outstanding.values()].some((o) => !o.settled) || !!r.queued : r.outstanding.size > 0 || !!r.queued)
  const reader: Records = {
    read: (commit, key) => {
      const r = records.get(`${commit}|${JSON.stringify(key)}`)
      return { pending: pendingOf(r), attempt: r?.attempt, sends: r?.attempt?.sends ?? 0, last: r?.last }
    },
  }
  const log = (s: string) => trace.push(`t=${String(clock).padStart(5)} ${s}`)

  // ── classification of one send (outcome-proposal 4.3), outside the fiber it interrupts ──
  const classify = (exit: Exit.Exit<unknown, unknown>, o: Outstanding): SendEnding => {
    if (Exit.isSuccess(exit)) return { channel: "success", value: exit.value }
    const cause = exit.cause
    if (Cause.hasDies(cause)) return { channel: "unknown", reason: { _tag: "Defect", defect: cause } as Tagged }
    const found = Cause.findError(cause)
    if (Result.isSuccess(found)) {
      const e = found.success
      if (e instanceof OutcomeUnknown) return { channel: "unknown", reason: e.reason as Tagged }
      if (e instanceof OutcomeFailure) return { channel: "failure", reason: e.reason as Tagged }
      return { channel: "failure", reason: e as Tagged }
    }
    if (o.cancelled) return o.invoked ? { channel: "unknown", reason: { _tag: "Cancelled" } } : { channel: "failure", reason: { _tag: "NotSent", why: "Cancelled" } as Tagged }
    return { channel: "unknown", reason: { _tag: "Interrupted" } }
  }

  const ownerOf = (target: string): Owner => ({ path: target, chain: prefixes(target).reverse().map((p) => [p, activations.get(p)!] as const) })
  const alive = (o: Owner) => activations.get(o.path) === o.chain[0][1]

  const invoke = (rec: Rec, o: Outstanding): Effect.Effect<void> => Effect.gen(function* () {
    const op = rec.commit.op
    const run = Effect.sleep(`${opts.ackDelayMs ?? 0} millis`).pipe(
      Effect.andThen(Effect.sync(() => { o.invoked = true })),
      Effect.andThen(op.commit(o.attempt.input, { attempt: o.attempt })),
    ) as Effect.Effect<unknown, unknown> // runtime-internal erasure: services are provided by the Story's layer
    o.fiber = yield* Effect.forkDetach(run)
    yield* Effect.forkDetach(Fiber.await(o.fiber).pipe(Effect.flatMap((exit) => Effect.gen(function* () {
      o.settled = true
      if (legacy.routeAtSettlement) o.legacyRoute = alive(o.owner) ? "current" : "late"
      mailbox.push({ kind: "ending", rec, out: o, send: classify(exit, o) })
      const q = rec.queued
      if (q && ![...rec.outstanding.values()].some((x) => x !== q && !x.settled)) { rec.queued = undefined; yield* invoke(rec, q) }  // `latest`: the waiting start goes now
    }))))
  })

  // ── admission of an ending: Attempt-level classification and the record update, then an ordinary event ──
  const admitEnding = (it: Extract<Item, { kind: "ending" }>): Admitted => {
    const { rec, out, send } = it
    const a = out.attempt
    let final: SendEnding = send
    if (!legacy.perSendFailure && send.channel === "failure" && send.reason._tag !== "NotSent" && a.mayHaveApplied)
      final = { channel: "unknown", reason: { _tag: "StillUnknown", failure: send.reason } as Tagged }
    rec.outstanding.delete(a.id)
    const superseded = rec.attempt?.id !== a.id
    const tag = final.channel === "success" ? "success" : final.channel === "unknown" ? "unknown" : final.reason._tag
    if (!superseded) {
      rec.last = { channel: final.channel, tag: final.channel === "success" ? "success" : final.reason._tag }
      if (final.channel === "unknown") rec.mayHaveApplied = true
      if (final.channel === "failure" && !rec.mayHaveApplied && tag !== "NotSent") rec.generation++
      if (final.channel === "success") rec.attempt = undefined
    }
    // the commit value's own `outcomes` maps the ending to an author event (rule 1)
    const o = rec.commit.outcomes
    const mapping = final.channel === "success" ? o.success : final.channel === "unknown" ? o.unknown : o.failure?.[tag]
    const value = final.channel === "success" ? final.value : final.reason
    const event = mapping === undefined ? undefined : mapping.__mapper ? mapping.__mapper(value, { input: a.input, attempt: a, superseded }) : { _tag: mapping._tag }
    const what = final.channel === "success" ? "success" : final.channel === "unknown" ? `unknown:${final.reason._tag}` : tag
    return { event, label: `${event?._tag ?? "(unmapped)"}<${what}>(${a.id}#${a.sends}${superseded ? ",superseded" : ""})` }
  }

  // ── implicit guards of an alternative's call actions (rule 4) ──
  const keyOf = (action: Action<any>, g: { memory: any; event: any }) => {
    const op = action.commit.op
    if (action.kind === "start") return op.key(action.select!(g))
    return action.select ? (action.select(g) as any).__key : {}
  }
  const implicit = (alt: any, event: any, finalMemory: any): true | Denial => {
    for (const action of arr<Action<any>>(alt.actions)) {
      const key = keyOf(action, { memory: finalMemory, event })
      const r = records.get(`${action.commit.id}|${JSON.stringify(key)}`)
      const op = action.commit.op
      if (action.kind === "start" && op.concurrency === "reject" && lanePending(op, key) && !legacy.silentReject) return deny("InFlight")
      if (action.kind === "retry" && !r?.attempt) return deny("NothingToResend")
      if (action.kind === "retry" && pendingOf(r)) return deny("InFlight")
    }
    return true
  }

  const exitsFor = (target: string | undefined) => {
    if (target === undefined || target === "self") return { exits: [] as string[], entries: [] as string[], newLeaf: leaf }
    const newLeaf = descend(target)
    const oldP = prefixes(leaf), newP = prefixes(newLeaf)
    return { exits: oldP.filter((p) => !newP.includes(p)).reverse(), entries: newP.filter((p) => !oldP.includes(p)), newLeaf }
  }

  const runActions = (actions: ReadonlyArray<Action<any>>, event: any, owner: Owner) => Effect.gen(function* () {
    for (const action of actions) {
      const op = action.commit.op
      const g = { memory, event }
      if (action.kind === "start") {
        const input = action.select!(g)
        const key = op.key(input)
        const rec = recOf(action.commit, key)
        if (op.concurrency === "reject" && lanePending(op, key)) { log(`  ${op.id} start declined silently (legacy)`); continue }
        const attempt: Attempt<any, any> = { id: `a${++n}`, operation: op.id, key, input, sends: 1, idempotencyKey: `a${n}`, mayHaveApplied: false }
        rec.attempt = attempt; rec.generation = 0; rec.mayHaveApplied = false; rec.last = undefined
        const o: Outstanding = { attempt, owner, invoked: false, cancelled: false, settled: false }
        rec.outstanding.set(attempt.id, o)
        if (op.concurrency === "latest" && [...rec.outstanding.values()].some((x) => x !== o && !x.settled)) {
          if (rec.queued) { rec.queued.settled = true; mailbox.push({ kind: "ending", rec, out: rec.queued, send: { channel: "failure", reason: { _tag: "NotSent", why: "Superseded" } as Tagged } }) }
          rec.queued = o
        } else yield* invoke(rec, o)
      } else if (action.kind === "retry") {
        const rec = recOf(action.commit, keyOf(action, g))
        const prev = rec.attempt!  // guaranteed by the implicit NothingToResend guard
        const attempt = { ...prev, sends: prev.sends + 1, idempotencyKey: legacy.sameWireKey || rec.generation === 0 ? prev.id : `${prev.id}~${rec.generation}`, mayHaveApplied: rec.mayHaveApplied }
        rec.attempt = attempt
        const o: Outstanding = { attempt, owner, invoked: false, cancelled: false, settled: false }
        rec.outstanding.set(attempt.id, o)
        yield* invoke(rec, o)
      } else {
        const rec = records.get(`${action.commit.id}|${JSON.stringify(keyOf(action, g))}`)
        const live = rec && [...rec.outstanding.values()].find((x) => !x.settled)
        if (!live) { log(`  ${op.id} cancel: nothing unsettled (no-op, evidence)`); continue }
        live.cancelled = true
        yield* Effect.forkDetach(Fiber.interrupt(live.fiber!))   // the ending is delivered when the fiber has exited
      }
    }
  })

  const turn = (it: Item) => Effect.gen(function* () {
    if (it.kind === "timer" && activations.get(it.path) !== it.activation) { log(`${it.event._tag} discarded (its state was left)`); return }
    const admitted = it.kind === "ending" ? admitEnding(it) : { event: it.event, label: it.event._tag }
    const event: any = admitted.event
    const label = (_e: any) => admitted.label
    if (event === undefined) { log(`${admitted.label} no mapping: dropped with evidence (flow check requires NotSent only where it can occur)`); return }
    // where routing starts (rule 2)
    let from: string[] = prefixes(leaf).reverse()
    let late = false
    if (it.kind === "ending") {
      const o = it.out.owner
      const current = legacy.routeAtSettlement ? it.out.legacyRoute === "current" : alive(o)
      if (current && legacy.routeAtSettlement) from = from.filter((p) => o.path === "" || p === o.path || p.startsWith(o.path + "."))  // fenced handlers only
      else if (!current) {
        late = true
        const survivor = o.chain.slice(1).find(([p, a]) => activations.get(p) === a)![0]
        from = prefixes(survivor).reverse()
      }
    }
    const reasons: string[] = []
    for (const p of from) {
      const h = sp.states[p]?.on?.[event._tag]
      if (!h) continue
      for (const alt of arr<any>(h)) {
        const g = { event, memory, state: leaf, records: reader }
        const guards = arr<any>(alt.guard)
        const failed = guards.map((f) => f(g)).find((v) => v !== true)
        if (failed) { reasons.push(failed.code); continue }
        const finalMemory = { ...memory, ...(alt.update ? alt.update(g) : {}) }
        const imp = implicit(alt, event, finalMemory)
        if (imp !== true) { reasons.push(imp.code); continue }
        const target = alt.target === "self" ? undefined : alt.target
        const { exits, entries, newLeaf } = exitsFor(target)
        if (late && exits.some((x) => [...records.values()].some((r) => r !== (it as any).rec && [...r.outstanding.values()].some((o) => o.owner.path === x && alive(o.owner))))) { reasons.push("LateMayNotLeave"); continue }
        // commit
        const before = leaf
        memory = finalMemory
        for (const x of exits) activations.delete(x)
        for (const x of entries) activations.set(x, ++act)
        leaf = newLeaf
        log(`${label(event)}${late ? " [late]" : ""} ${before || "root"}${before === leaf ? "" : " → " + leaf}`)
        const owner = ownerOf(target ?? p)   // the owner is the state the transition names ("self": the handler's own state)
        yield* runActions(arr(alt.actions), event, owner)
        for (const x of entries) for (const [name, s] of Object.entries<any>(sp.states[x]?.after ?? {})) {
          const delay = s.delay({ memory, records: reader })  // committed memory of the arming turn (rule 11)
          const activation = activations.get(x)!
          yield* Effect.forkDetach(Effect.sleep(`${delay} millis`).pipe(Effect.andThen(Effect.sync(() => mailbox.push({ kind: "timer", event: s.send, path: x, activation })))))
          void name
        }
        return
      }
    }
    log(`${label(event)}${late ? " [late]" : ""} ${reasons.length ? "Denied " + JSON.stringify(reasons) : "Unhandled: LOST"}`)
  })

  const process = Effect.gen(function* () { while (mailbox.length) yield* turn(mailbox.shift()!) })
  const tick = (ms: number) => Effect.gen(function* () { yield* TestClock.adjust(`${ms} millis`); clock += ms; for (let i = 0; i < 5; i++) yield* Effect.yieldNow })

  // enter the initial state
  for (const p of prefixes(descend(spec.initial))) activations.set(p, ++act)
  leaf = descend(spec.initial)
  const boot = Effect.gen(function* () {
    for (const x of prefixes(leaf)) for (const s of Object.values<any>(sp.states[x]?.after ?? {})) {
      const activation = activations.get(x)!
      yield* Effect.forkDetach(Effect.sleep(`${s.delay({ memory, records: reader })} millis`).pipe(Effect.andThen(Effect.sync(() => mailbox.push({ kind: "timer", event: s.send, path: x, activation })))))
    }
  })

  return {
    boot,
    trace,
    get state() { return leaf },
    get memory(): M { return memory },
    /** what a view reads: `pay.at(actor.view, key)` */
    view: { records: reader } as WithRecords,
    send: (e: Ev) => Effect.gen(function* () { mailbox.push({ kind: "event", event: e }); yield* process }),
    /** Advance the controlled clock in 10 ms steps, taking turns as things arrive. */
    advance: (ms: number) => Effect.gen(function* () { for (let t = 0; t < ms; t += 10) { yield* tick(10); yield* process } }),
    /** Advance without taking turns (the main thread was busy): arrivals queue in the mailbox, then run FIFO. */
    advanceHeld: (ms: number) => Effect.gen(function* () { for (let t = 0; t < ms; t += 10) yield* tick(10) }),
    process,
    /** check(snapshot, event): the same selection, implicit guards included, without committing (Machines O4). */
    check: (e: Ev): string => {
      for (const p of prefixes(leaf).reverse()) {
        const h = sp.states[p]?.on?.[e._tag]
        if (!h) continue
        const reasons: string[] = []
        for (const alt of arr<any>(h)) {
          const g = { event: e, memory, state: leaf, records: reader }
          const failed = arr<any>(alt.guard).map((f) => f(g)).find((v) => v !== true)
          if (failed) { reasons.push(failed.code); continue }
          const imp = implicit(alt, e, { ...memory, ...(alt.update ? alt.update(g) : {}) })
          if (imp !== true) { reasons.push(imp.code); continue }
          return "Allowed"
        }
        return `Denied ${JSON.stringify(reasons)}`
      }
      return "Unhandled"
    },
  }
}
