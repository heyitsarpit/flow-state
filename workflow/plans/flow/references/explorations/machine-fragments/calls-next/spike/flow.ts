// flow.ts: the library half of the spike. Outcome (unchanged), the Attempt, transactions, commit values with
// `outcomes` mappings, the lane (per transaction and key), and a small turn runtime that implements the proposal's
// rules: routing at admission, `.pending` until the ending's turn, declines as endings, the Attempt's ending
// (StillUnknown), cancel that never rewrites a settled ending, lane eviction, and entry-armed schedules on the
// controlled clock. `checkLate` is a stand-in for the `flow check` rule that every late event is handled (D13).
//
// Casts inside this file are runtime-internal erasure (lanes of many transactions kept in one Map). The author-facing
// path (transaction → mapper → event payload → guard → memory) is typed by inference only; see types.ts.
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
export type NotSent = { readonly _tag: "NotSent"; readonly why: "Cancelled" | "Superseded" | "Restored" | "Rejected" | "NothingToResend" }
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
  readonly id: string               // random per write; the key the commit author puts on the wire (rule 7)
  readonly operation: string
  readonly key: K
  readonly input: I
  readonly retryCount: number       // times this write was sent again: 0 on its first send
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
/** A declined start has no Attempt; `NothingToResend` has no write at all (D17). */
export type NotSentCtx<T> = { readonly input?: In<T>; readonly attempt?: Attempt<In<T>, Key<T>>; readonly superseded: boolean }
type NotSentKey<T, Ev extends Tagged> = { readonly NotSent?: Mapping<NotSent, NotSentCtx<T>, Ev> }   // optional in the type; flow check requires it where it can occur
export type Outcomes<T, Ev extends Tagged> = {
  readonly success: Mapping<Val<T>, Ctx<T>, Ev>
  readonly unknown: Mapping<Unknowns<T>, Ctx<T>, UncertainOf<Ev>>
} & ([FTags<T>] extends [never]
  ? { readonly failure?: NotSentKey<T, Ev> }
  : { readonly failure: { readonly [X in FTags<T>]: Mapping<Extract<FailureReasons<Err<T>>, { readonly _tag: X }>, Ctx<T>, Ev> } & NotSentKey<T, Ev> })

// ── 6. The lane, read through the commit value: `pending` and `retryCount` only (rule 9, D6) ────────────────────
/** Opaque: the runtime's lane reader, present on every guard, schedule and view input. */
export interface Lanes { readonly read: (operation: string, key: unknown) => { readonly pending: boolean; readonly retryCount: number } }
type WithLanes = { readonly lanes: Lanes }
type Keyless<K> = keyof K extends never ? true : false

// ── 7. Machine spec (a minimal stand-in for v4's machine API: states are dotted paths, "" is the root) ─────────────
export type Denial = { readonly _tag: "Denial"; readonly code: string; readonly context?: unknown }
export const deny = (code: string, context?: unknown): Denial => ({ _tag: "Denial", code, context })
export interface G<E, M> { readonly event: E; readonly memory: M; readonly state: string; readonly lanes: Lanes }
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
  readonly after?: Record<string, { readonly delay: (g: { memory: M; lanes: Lanes }) => number; readonly send: Ev }>
  readonly on?: { readonly [K in Ev["_tag"]]?: Handler<Extract<Ev, { readonly _tag: K }>, M> }
}
type KeySel<T, M, E> = (g: { readonly memory: M; readonly event: E }) => Key<T>
/** The commit value is the handle (D4): listed in `actions` it starts a new write. */
export interface Commit<T, M, Ev, E> extends Action<E> {
  readonly retry: Keyless<Key<T>> extends true ? () => Action<any> : <E2 extends Ev = Ev>(key: KeySel<T, M, E2>) => Action<E2>
  readonly cancel: Keyless<Key<T>> extends true ? () => Action<any> : <E2 extends Ev = Ev>(key: KeySel<T, M, E2>) => Action<E2>
  /** The guard form of `!pending`: `deny("InFlight", { operation, key })`. */
  readonly idle: Keyless<Key<T>> extends true ? () => Guard<any, M> : <E2 extends Ev = Ev>(key: KeySel<T, M, E2>) => Guard<E2, M>
  readonly pending: Keyless<Key<T>> extends true ? (g: WithLanes) => boolean : (g: WithLanes, key: Key<T>) => boolean
  readonly retryCount: Keyless<Key<T>> extends true ? (g: WithLanes) => number : (g: WithLanes, key: Key<T>) => number
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
    const E: any = new Proxy({}, {   // runtime-internal: typed by Events<Ev>; mappers keep their tag for checkLate
      get: (_t, k: string) => ({ _tag: k, __bare: true, from: (f: any) => ({ _tag: k, __mapper: (v: any, c: any) => ({ _tag: k, ...f(v, c) }) }) }),
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
            c.pending = (g: WithLanes, key?: unknown) => g.lanes.read(op.id, key ?? {}).pending
            c.retryCount = (g: WithLanes, key?: unknown) => g.lanes.read(op.id, key ?? {}).retryCount
            c.idle = (sel?: any) => (g: G<any, any>) => {
              const key = sel ? sel(g) : {}
              return !g.lanes.read(op.id, key).pending || deny("InFlight", { operation: op.id, key })
            }
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

// ── 8. The `flow check` stand-in for D13: every late-routable event has a handler on a strict ancestor ──────────────
const prefixes = (p: string): string[] => { const out = [""]; if (p === "") return out; const parts = p.split("."); for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join(".")); return out }
const arr = <X>(x: X | ReadonlyArray<X> | undefined): ReadonlyArray<X> => (x === undefined ? [] : Array.isArray(x) ? x : [x as X])
const within = (p: string, o: string) => o === "" || p === o || p.startsWith(o + ".")
/**
 * For each commit value listed in a transition, its owner is the transition's target ("self": the handler's state).
 * If some transition can leave the owner, every event its `outcomes` maps to must be handled on a strict ancestor of
 * the owner. Returns one message per missing late handler.
 */
export const checkLate = (spec: Machine<any, any>): string[] => {
  const states: Record<string, any> = spec.states
  const alts: Array<{ at: string; alt: any }> = []
  for (const [at, s] of Object.entries(states)) for (const h of Object.values<any>(s.on ?? {})) for (const alt of arr<any>(h)) alts.push({ at, alt })
  const leavable = (o: string) => o !== "" && alts.some(({ at, alt }) => alt.target && alt.target !== "self" && (within(at, o) || within(o, at)) && !within(alt.target, o))
  const errors: string[] = []
  for (const { at, alt } of alts) for (const action of arr<any>(alt.actions)) {
    const owner = alt.target && alt.target !== "self" ? alt.target : at
    if (!leavable(owner)) continue
    const o = action.commit.outcomes
    const mapped = [o.success, o.unknown, ...Object.values(o.failure ?? {})].map((m: any) => m._tag as string)
    for (const tag of new Set(mapped)) {
      const handled = prefixes(owner).slice(0, -1).some((p) => states[p]?.on?.[tag] !== undefined)
      if (!handled) errors.push(`${tag}: no late handler above ${owner} (mapped by ${action.commit.id})`)
    }
  }
  return [...new Set(errors)]
}

// ── 9. The runtime ─────────────────────────────────────────────────────────────────────────────────────────────
/** The old proposal's behaviours, switchable one at a time, so each Story can show the failure it fixes. */
export interface Legacy {
  readonly routeAtSettlement?: boolean   // P1: choose outcomes/abandoned when the commit settles
  readonly perSendFailure?: boolean      // P2: a failure on a re-send is definite
  readonly pendingUntilSettlement?: boolean // P3: .pending false at settlement
  readonly silentReject?: boolean        // P5: a declined start does nothing at all: no ending
}
type SendEnding = { channel: "success"; value: unknown } | { channel: "failure" | "unknown"; reason: Tagged }
interface Owner { readonly path: string; readonly chain: ReadonlyArray<readonly [string, number]> }
interface Outstanding {
  attempt: Attempt<any, any>; owner: Owner; outcomes: any
  fiber?: Fiber.Fiber<unknown, unknown>; invoked: boolean; cancelled: boolean; settled: boolean
  declined?: boolean; legacyRoute?: "current" | "late"
  bare?: { readonly input?: unknown }   // a decline without an Attempt: the mapper gets no `attempt` (D17)
}
interface Lane {
  readonly op: AnyTransaction; readonly key: unknown
  attempt?: Attempt<any, any>
  starter?: AnyCommit                    // the commit value that started the current Attempt (D9)
  mayHaveApplied: boolean
  outstanding: Map<string, Outstanding>
  queued?: Outstanding
}
type Item =
  | { kind: "event"; event: Tagged }
  | { kind: "timer"; event: Tagged; path: string; activation: number }
  | { kind: "ending"; lane: Lane; out: Outstanding; send: SendEnding }
type Admitted = { event: Tagged | undefined; label: string }

export const makeActor = <Ev extends Tagged, M>(spec: Machine<Ev, M>, opts: { legacy?: Legacy; ackDelayMs?: number } = {}) => {
  const legacy = opts.legacy ?? {}
  const sp: any = spec // runtime-internal erasure
  let memory: any = { ...spec.memory }
  let leaf = ""
  let act = 0
  let n = 0
  const activations = new Map<string, number>()
  const lanes = new Map<string, Lane>()
  const mailbox: Item[] = []
  const trace: string[] = []
  let clock = 0

  const descend = (p: string): string => { const s = sp.states[p]; return s?.initial ? descend(s.initial) : p }
  const laneId = (op: AnyTransaction, key: unknown) => `${op.id}|${JSON.stringify(key)}`
  const laneOf = (op: AnyTransaction, key: unknown): Lane => {
    let l = lanes.get(laneId(op, key))
    if (!l) { l = { op, key, mayHaveApplied: false, outstanding: new Map() }; lanes.set(laneId(op, key), l) }
    return l
  }
  const pendingOf = (l: Lane | undefined) =>
    !!l && (legacy.pendingUntilSettlement ? [...l.outstanding.values()].some((o) => !o.settled) || !!l.queued : l.outstanding.size > 0 || !!l.queued)
  const evictIfSettled = (l: Lane) => { if (!pendingOf(l) && l.outstanding.size === 0 && !l.queued && !l.attempt) lanes.delete(laneId(l.op, l.key)) }   // D11
  const reader: Lanes = {
    read: (operation, key) => {
      const l = [...lanes.values()].find((x) => x.op.id === operation && JSON.stringify(x.key) === JSON.stringify(key))
      return { pending: pendingOf(l), retryCount: l?.attempt?.retryCount ?? 0 }
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
  const notSent = (why: NotSent["why"]): SendEnding => ({ channel: "failure", reason: { _tag: "NotSent", why } as Tagged })

  const ownerOf = (target: string): Owner => ({ path: target, chain: prefixes(target).reverse().map((p) => [p, activations.get(p)!] as const) })
  const alive = (o: Owner) => activations.get(o.path) === o.chain[0][1]

  const invoke = (lane: Lane, o: Outstanding): Effect.Effect<void> => Effect.gen(function* () {
    const run = Effect.sleep(`${opts.ackDelayMs ?? 0} millis`).pipe(
      Effect.andThen(Effect.sync(() => { o.invoked = true })),
      Effect.andThen(lane.op.commit(o.attempt.input, { attempt: o.attempt })),
    ) as Effect.Effect<unknown, unknown> // runtime-internal erasure: services are provided by the Story's layer
    o.fiber = yield* Effect.forkDetach(run)
    yield* Effect.forkDetach(Fiber.await(o.fiber).pipe(Effect.flatMap((exit) => Effect.gen(function* () {
      o.settled = true
      if (legacy.routeAtSettlement) o.legacyRoute = alive(o.owner) ? "current" : "late"
      mailbox.push({ kind: "ending", lane, out: o, send: classify(exit, o) })
      const q = lane.queued
      if (q && ![...lane.outstanding.values()].some((x) => x !== q && !x.settled)) { lane.queued = undefined; yield* invoke(lane, q) }  // `latest`: the waiting start goes now
    }))))
  })

  // ── admission of an ending: the Attempt's ending, the lane update, then the author's mapped event ──
  const admitEnding = (it: Extract<Item, { kind: "ending" }>): Admitted => {
    const { lane, out, send } = it
    const a = out.attempt
    let final: SendEnding = send
    if (!legacy.perSendFailure && send.channel === "failure" && send.reason._tag !== "NotSent" && a.mayHaveApplied)
      final = { channel: "unknown", reason: { _tag: "StillUnknown", failure: send.reason } as Tagged }
    const tag = final.channel === "success" ? "success" : final.channel === "unknown" ? "unknown" : final.reason._tag
    const superseded = !out.declined && lane.attempt?.id !== a.id
    if (!out.declined) {
      lane.outstanding.delete(a.id)
      if (!superseded) {
        if (final.channel === "unknown") lane.mayHaveApplied = true
        if (final.channel === "success") { lane.attempt = undefined; lane.starter = undefined }
      }
      evictIfSettled(lane)
    }
    const o = out.outcomes
    const mapping = final.channel === "success" ? o.success : final.channel === "unknown" ? o.unknown : o.failure?.[tag]
    const value = final.channel === "success" ? final.value : final.reason
    const event = mapping === undefined ? undefined : mapping.__mapper ? mapping.__mapper(value, out.bare ? { input: out.bare.input, attempt: undefined, superseded } : { input: a.input, attempt: a, superseded }) : { _tag: mapping._tag }
    const what = final.channel === "success" ? "success" : final.channel === "unknown" ? `unknown:${final.reason._tag}` : tag === "NotSent" ? `NotSent:${(final.reason as NotSent).why}` : tag
    return { event, label: `${event?._tag ?? "(unmapped)"}<${what}>(${a.id}${a.retryCount ? `+${a.retryCount}` : ""}${superseded ? ",superseded" : ""})` }
  }

  const keyOf = (action: Action<any>, g: { memory: any; event: any }) =>
    action.kind === "start" ? action.commit.op.key(action.select!(g)) : action.select ? (action.select(g) as any).__key : {}

  const exitsFor = (target: string | undefined) => {
    if (target === undefined || target === "self") return { exits: [] as string[], entries: [] as string[], newLeaf: leaf }
    const newLeaf = descend(target)
    const oldP = prefixes(leaf), newP = prefixes(newLeaf)
    return { exits: oldP.filter((p) => !newP.includes(p)).reverse(), entries: newP.filter((p) => !oldP.includes(p)), newLeaf }
  }

  const decline = (lane: Lane, commit: AnyCommit, attempt: Attempt<any, any>, owner: Owner, why: NotSent["why"], bare?: { readonly input?: unknown }) => {
    const o: Outstanding = { attempt, owner, outcomes: commit.outcomes, invoked: false, cancelled: false, settled: true, declined: true, bare }
    log(`  ${lane.op.id}: ${why} (the transition ran; the write ends NotSent)`)
    mailbox.push({ kind: "ending", lane, out: o, send: notSent(why) })
  }

  const runActions = (actions: ReadonlyArray<Action<any>>, event: any, owner: Owner) => Effect.gen(function* () {
    for (const action of actions) {
      const op = action.commit.op
      const g = { memory, event }
      if (action.kind === "start") {
        const input = action.select!(g)
        const key = op.key(input)
        const lane = laneOf(op, key)
        const attempt: Attempt<any, any> = { id: `a${++n}`, operation: op.id, key, input, retryCount: 0, mayHaveApplied: false }
        if (op.concurrency === "reject" && pendingOf(lane)) {                          // rule 4: refuse the write only
          if (legacy.silentReject) { log(`  ${op.id} start declined silently (legacy: no ending)`); continue }
          decline(lane, action.commit, attempt, owner, "Rejected", { input }); continue
        }
        lane.attempt = attempt; lane.starter = action.commit; lane.mayHaveApplied = false
        const o: Outstanding = { attempt, owner, outcomes: action.commit.outcomes, invoked: false, cancelled: false, settled: false }
        lane.outstanding.set(attempt.id, o)
        if (op.concurrency === "latest" && [...lane.outstanding.values()].some((x) => x !== o && !x.settled)) {
          if (lane.queued) { lane.queued.settled = true; mailbox.push({ kind: "ending", lane, out: lane.queued, send: notSent("Superseded") }) }
          lane.queued = o
        } else yield* invoke(lane, o)
      } else if (action.kind === "retry") {
        const lane = laneOf(op, keyOf(action, g))
        const prev = lane.attempt
        if (!prev) { decline(lane, action.commit, { id: "-", operation: op.id, key: lane.key, input: undefined, retryCount: 0, mayHaveApplied: false }, owner, "NothingToResend", {}); evictIfSettled(lane); continue }
        if (pendingOf(lane)) { decline(lane, lane.starter ?? action.commit, prev, owner, "Rejected"); continue }
        const attempt = { ...prev, retryCount: prev.retryCount + 1, mayHaveApplied: lane.mayHaveApplied }   // the same id on the wire (rule 7)
        lane.attempt = attempt
        const o: Outstanding = { attempt, owner, outcomes: (lane.starter ?? action.commit).outcomes, invoked: false, cancelled: false, settled: false }   // the starter's outcomes (D9)
        lane.outstanding.set(attempt.id, o)
        yield* invoke(lane, o)
      } else {
        const lane = lanes.get(laneId(op, keyOf(action, g)))
        const live = lane && [...lane.outstanding.values()].find((x) => !x.settled)
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
    if (event === undefined) { log(`${admitted.label} no mapping: dropped with evidence (flow check requires NotSent where it can occur)`); return }
    // where routing starts (rule 2)
    let from: string[] = prefixes(leaf).reverse()
    let late = false
    if (it.kind === "ending") {
      const o = it.out.owner
      const current = legacy.routeAtSettlement && !it.out.declined ? it.out.legacyRoute === "current" : alive(o)
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
        const g = { event, memory, state: leaf, lanes: reader }
        const failed = arr<any>(alt.guard).map((f) => f(g)).find((v) => v !== true)
        if (failed) { reasons.push(failed.code); continue }
        const finalMemory = { ...memory, ...(alt.update ? alt.update(g) : {}) }
        const target = alt.target === "self" ? undefined : alt.target
        const { exits, entries, newLeaf } = exitsFor(target)
        if (late && exits.some((x) => [...lanes.values()].some((l) => l !== (it as any).lane && [...l.outstanding.values()].some((o) => o.owner.path === x && alive(o.owner))))) { reasons.push("LateMayNotLeave"); continue }
        // commit
        const before = leaf
        memory = finalMemory
        for (const x of exits) activations.delete(x)
        for (const x of entries) activations.set(x, ++act)
        leaf = newLeaf
        log(`${admitted.label}${late ? " [late]" : ""} ${before || "root"}${before === leaf ? "" : " → " + leaf}`)
        const owner = ownerOf(target ?? p)   // the owner is the state the transition names ("self": the handler's own state)
        yield* runActions(arr(alt.actions), event, owner)
        for (const x of entries) for (const s of Object.values<any>(sp.states[x]?.after ?? {})) {
          const delay = s.delay({ memory, lanes: reader })  // committed memory of the arming turn (rule 11)
          const activation = activations.get(x)!
          yield* Effect.forkDetach(Effect.sleep(`${delay} millis`).pipe(Effect.andThen(Effect.sync(() => mailbox.push({ kind: "timer", event: s.send, path: x, activation })))))
        }
        return
      }
    }
    log(`${admitted.label}${late ? " [late]" : ""} ${reasons.length ? "Denied " + JSON.stringify(reasons) : "Unhandled: LOST"}`)
  })

  const process = Effect.gen(function* () { while (mailbox.length) yield* turn(mailbox.shift()!) })
  const tick = (ms: number) => Effect.gen(function* () { yield* TestClock.adjust(`${ms} millis`); clock += ms; for (let i = 0; i < 5; i++) yield* Effect.yieldNow })

  // enter the initial state
  for (const p of prefixes(descend(spec.initial))) activations.set(p, ++act)
  leaf = descend(spec.initial)
  const boot = Effect.gen(function* () {
    for (const x of prefixes(leaf)) for (const s of Object.values<any>(sp.states[x]?.after ?? {})) {
      const activation = activations.get(x)!
      yield* Effect.forkDetach(Effect.sleep(`${s.delay({ memory, lanes: reader })} millis`).pipe(Effect.andThen(Effect.sync(() => mailbox.push({ kind: "timer", event: s.send, path: x, activation })))))
    }
  })

  return {
    boot,
    trace,
    get state() { return leaf },
    get memory(): M { return memory },
    /** what a view reads: `pay.pending(actor.view, key)` */
    view: { lanes: reader } as WithLanes,
    /** lanes still held (for D11: a settled lane is evicted) */
    get laneCount() { return lanes.size },
    send: (e: Ev) => Effect.gen(function* () { mailbox.push({ kind: "event", event: e }); yield* process }),
    /** Advance the controlled clock in 10 ms steps, taking turns as things arrive. */
    advance: (ms: number) => Effect.gen(function* () { for (let t = 0; t < ms; t += 10) { yield* tick(10); yield* process } }),
    /** Advance without taking turns (the main thread was busy): arrivals queue in the mailbox, then run FIFO. */
    advanceHeld: (ms: number) => Effect.gen(function* () { for (let t = 0; t < ms; t += 10) yield* tick(10) }),
    process,
    /** check(snapshot, event): the same selection without committing (Machines O4). Flow adds no guard (rule 4). */
    check: (e: Ev): string => {
      for (const p of prefixes(leaf).reverse()) {
        const h = sp.states[p]?.on?.[e._tag]
        if (!h) continue
        const reasons: string[] = []
        for (const alt of arr<any>(h)) {
          const g = { event: e, memory, state: leaf, lanes: reader }
          const failed = arr<any>(alt.guard).map((f) => f(g)).find((v) => v !== true)
          if (failed) { reasons.push(failed.code); continue }
          return "Allowed"
        }
        return `Denied ${JSON.stringify(reasons)}`
      }
      return "Unhandled"
    },
  }
}
