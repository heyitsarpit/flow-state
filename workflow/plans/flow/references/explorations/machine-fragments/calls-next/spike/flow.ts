// flow.ts: the library half of the spike. Outcome (unchanged), the Attempt, transactions, named calls with
// derived ending events, the call record, and a small turn runtime that implements the proposal's rules
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
export type ServicesOf<C extends Calls> = { [N in keyof C]: C[N] extends Transaction<any, any, any, any, infer R> ? R : never }[keyof C]

// ── 5. Derived ending events: one per channel, the failure channel split by tag ──────────────────────────────────
type Base<T> = { readonly input: In<T>; readonly attempt: Attempt<In<T>, Key<T>>; readonly superseded: boolean }
export type CallEvent<N extends string, T> =
  | ({ readonly _tag: `${N}.success`; readonly value: Val<T> } & Base<T>)
  | { [X in TagOf<Failures<T>>]: { readonly _tag: `${N}.${X}`; readonly error: Extract<Failures<T>, { readonly _tag: X }> } & Base<T> }[TagOf<Failures<T>>]
  | ({ readonly _tag: `${N}.unknown`; readonly reason: Unknowns<T> } & Base<T>)
export type Calls = Record<string, AnyTransaction>
export type CallEvents<C extends Calls> = { [N in keyof C & string]: CallEvent<N, C[N]> }[keyof C & string]

// ── 6. The call record, readable by guards, schedules and views (rule 9) ──────────────────────────────────────────
export interface CallView<T> {
  readonly pending: boolean                         // from start until its ending's turn is admitted
  readonly attempt: Attempt<In<T>, Key<T>> | undefined
  readonly sends: number
  readonly last: { readonly channel: "success" | "failure" | "unknown"; readonly tag: string } | undefined
}
type Keyless<K> = keyof K extends never ? true : false
export type CallsView<C extends Calls> = {
  readonly [N in keyof C]: Keyless<Key<C[N]>> extends true ? CallView<C[N]> : { readonly at: (key: Key<C[N]>) => CallView<C[N]> }
}

// ── 7. Machine spec (a minimal stand-in for v4's machine API: states are dotted paths, "" is the root) ─────────────
export type Denial = { readonly _tag: "Denial"; readonly code: string }
export const deny = (code: string): Denial => ({ _tag: "Denial", code })
export interface G<E, M, C extends Calls> { readonly event: E; readonly memory: M; readonly state: string; readonly calls: CallsView<C> }
export type Guard<E, M, C extends Calls> = (g: G<E, M, C>) => true | Denial
export interface Action<E> { readonly kind: "start" | "resend" | "cancel"; readonly call: string; readonly select?: (g: { memory: any; event: E }) => unknown }
export interface Alt<E, M, C extends Calls> {
  readonly target?: string
  readonly guard?: Guard<E, M, C> | ReadonlyArray<Guard<E, M, C>>
  readonly update?: (g: G<E, M, C>) => Partial<M>
  readonly actions?: ReadonlyArray<Action<E>>
}
export type Handler<E, M, C extends Calls> = Alt<E, M, C> | ReadonlyArray<Alt<E, M, C>>
export interface StateSpec<Ev extends Tagged, M, C extends Calls> {
  readonly initial?: string
  readonly after?: Record<string, { readonly delay: (g: { memory: M; calls: CallsView<C> }) => number; readonly send: Ev }>
  readonly on?: { readonly [K in Ev["_tag"]]?: Handler<Extract<Ev, { readonly _tag: K }>, M, C> }
}
export type Handles<C extends Calls, M, Ev> = {
  readonly [N in keyof C]: {
    readonly start: <E extends Ev = Ev>(select: (g: { readonly memory: M; readonly event: E }) => In<C[N]>) => Action<E>
    readonly resend: Keyless<Key<C[N]>> extends true ? () => Action<any> : <E extends Ev = Ev>(key: (g: { readonly memory: M; readonly event: E }) => Key<C[N]>) => Action<E>
    readonly cancel: Keyless<Key<C[N]>> extends true ? () => Action<any> : <E extends Ev = Ev>(key: (g: { readonly memory: M; readonly event: E }) => Key<C[N]>) => Action<E>
  }
}
export interface Machine<UserEv extends Tagged, C extends Calls, M> {
  readonly calls: C
  readonly memory: M
  readonly initial: string
  readonly states: Record<string, StateSpec<UserEv | CallEvents<C>, M, C>>
}
/**
 * `machine<UserEv>()({ calls, memory })` returns the typed call handles `C` and `define(body)`.
 * The body is a plain object, not a callback: a context-sensitive callback (v4's `machine(def, (h) => body)`) loses
 * TypeScript's excess-property check, so a handler for an event that does not exist would not be a type error.
 */
export const machine = <UserEv extends Tagged>() =>
  <C extends Calls, M>(def: { readonly calls: C; readonly memory: M }) => {
    const C: any = {}   // runtime-internal: the typed handles are views over these three constructors
    for (const name of Object.keys(def.calls)) {
      C[name] = {
        start: (select: any) => ({ kind: "start", call: name, select }),
        resend: (select?: any) => ({ kind: "resend", call: name, select: select && ((g: any) => ({ __key: select(g) })) }),
        cancel: (select?: any) => ({ kind: "cancel", call: name, select: select && ((g: any) => ({ __key: select(g) })) }),
      }
    }
    return {
      C: C as Handles<C, M, UserEv | CallEvents<C>>,
      define: (body: { readonly initial: string; readonly states: Record<string, StateSpec<UserEv | CallEvents<C>, M, C>> }): Machine<UserEv, C, M> => ({ ...def, ...body }),
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
  readonly call: string; readonly key: unknown
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

const prefixes = (p: string): string[] => { const out = [""]; if (p === "") return out; const parts = p.split("."); for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join(".")); return out }
const parentOf = (p: string) => (p === "" ? undefined : p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : "")
const arr = <X>(x: X | ReadonlyArray<X> | undefined): ReadonlyArray<X> => (x === undefined ? [] : Array.isArray(x) ? x : [x as X])

export const makeActor = <UserEv extends Tagged, C extends Calls, M>(spec: Machine<UserEv, C, M>, opts: { legacy?: Legacy; ackDelayMs?: number } = {}) => {
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
  const recOf = (call: string, key: unknown): Rec => {
    const id = `${call}|${JSON.stringify(key)}`
    let r = records.get(id)
    if (!r) { r = { call, key, generation: 0, mayHaveApplied: false, outstanding: new Map() }; records.set(id, r) }
    return r
  }
  const pendingOf = (r: Rec | undefined) =>
    !!r && (legacy.pendingUntilSettlement ? [...r.outstanding.values()].some((o) => !o.settled) || !!r.queued : r.outstanding.size > 0 || !!r.queued)
  const viewOf = (call: string, key: unknown) => {
    const r = records.get(`${call}|${JSON.stringify(key)}`)
    return { pending: pendingOf(r), attempt: r?.attempt, sends: r?.attempt?.sends ?? 0, last: r?.last }
  }
  const callsView = (): any => {
    const v: any = {}
    for (const name of Object.keys(spec.calls)) v[name] = { ...viewOf(name, {}), at: (k: unknown) => viewOf(name, k) }
    return v
  }
  const label = (e: any) => e._tag + (e.attempt ? `(${e.attempt.id}#${e.attempt.sends}${e.superseded ? ",superseded" : ""})` : "")
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
    const op: AnyTransaction = sp.calls[rec.call]
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
  const admitEnding = (it: Extract<Item, { kind: "ending" }>) => {
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
    const payload = final.channel === "success" ? { value: final.value } : final.channel === "unknown" ? { reason: final.reason } : { error: final.reason }
    const event: Tagged & Record<string, unknown> = { _tag: `${rec.call}.${tag}`, ...payload, input: a.input, attempt: a, superseded }
    return event
  }

  // ── implicit guards of an alternative's call actions (rule 4) ──
  const keyOf = (action: Action<any>, g: { memory: any; event: any }) => {
    const op: AnyTransaction = sp.calls[action.call]
    if (action.kind === "start") return op.key(action.select!(g))
    return action.select ? (action.select(g) as any).__key : {}
  }
  const implicit = (alt: any, event: any, finalMemory: any): true | Denial => {
    for (const action of arr<Action<any>>(alt.actions)) {
      const r = records.get(`${action.call}|${JSON.stringify(keyOf(action, { memory: finalMemory, event }))}`)
      const op: AnyTransaction = sp.calls[action.call]
      if (action.kind === "start" && op.concurrency === "reject" && pendingOf(r) && !legacy.silentReject) return deny("InFlight")
      if (action.kind === "resend" && !r?.attempt) return deny("NothingToResend")
      if (action.kind === "resend" && pendingOf(r)) return deny("InFlight")
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
      const op: AnyTransaction = sp.calls[action.call]
      const g = { memory, event }
      if (action.kind === "start") {
        const input = action.select!(g)
        const key = op.key(input)
        const rec = recOf(action.call, key)
        if (op.concurrency === "reject" && pendingOf(rec)) { log(`  ${action.call}.start declined silently (legacy)`); continue }
        const attempt: Attempt<any, any> = { id: `a${++n}`, operation: op.id, key, input, sends: 1, idempotencyKey: `a${n}`, mayHaveApplied: false }
        rec.attempt = attempt; rec.generation = 0; rec.mayHaveApplied = false; rec.last = undefined
        const o: Outstanding = { attempt, owner, invoked: false, cancelled: false, settled: false }
        rec.outstanding.set(attempt.id, o)
        if (op.concurrency === "latest" && [...rec.outstanding.values()].some((x) => x !== o && !x.settled)) {
          if (rec.queued) { rec.queued.settled = true; mailbox.push({ kind: "ending", rec, out: rec.queued, send: { channel: "failure", reason: { _tag: "NotSent", why: "Superseded" } as Tagged } }) }
          rec.queued = o
        } else yield* invoke(rec, o)
      } else if (action.kind === "resend") {
        const rec = recOf(action.call, keyOf(action, g))
        const prev = rec.attempt!  // guaranteed by the implicit NothingToResend guard
        const attempt = { ...prev, sends: prev.sends + 1, idempotencyKey: legacy.sameWireKey || rec.generation === 0 ? prev.id : `${prev.id}~${rec.generation}`, mayHaveApplied: rec.mayHaveApplied }
        rec.attempt = attempt
        const o: Outstanding = { attempt, owner, invoked: false, cancelled: false, settled: false }
        rec.outstanding.set(attempt.id, o)
        yield* invoke(rec, o)
      } else {
        const rec = records.get(`${action.call}|${JSON.stringify(keyOf(action, g))}`)
        const live = rec && [...rec.outstanding.values()].find((x) => !x.settled)
        if (!live) { log(`  ${action.call}.cancel: nothing unsettled (no-op, evidence)`); continue }
        live.cancelled = true
        yield* Effect.forkDetach(Fiber.interrupt(live.fiber!))   // the ending is delivered when the fiber has exited
      }
    }
  })

  const turn = (it: Item) => Effect.gen(function* () {
    if (it.kind === "timer" && activations.get(it.path) !== it.activation) { log(`${it.event._tag} discarded (its state was left)`); return }
    const event: any = it.kind === "ending" ? admitEnding(it) : it.event
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
        const g = { event, memory, state: leaf, calls: callsView() }
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
          const delay = s.delay({ memory, calls: callsView() })  // committed memory of the arming turn (rule 11)
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
      yield* Effect.forkDetach(Effect.sleep(`${s.delay({ memory, calls: callsView() })} millis`).pipe(Effect.andThen(Effect.sync(() => mailbox.push({ kind: "timer", event: s.send, path: x, activation })))))
    }
  })

  return {
    boot,
    trace,
    get state() { return leaf },
    get memory(): M { return memory },
    get calls(): CallsView<C> { return callsView() },
    send: (e: UserEv) => Effect.gen(function* () { mailbox.push({ kind: "event", event: e }); yield* process }),
    /** Advance the controlled clock in 10 ms steps, taking turns as things arrive. */
    advance: (ms: number) => Effect.gen(function* () { for (let t = 0; t < ms; t += 10) { yield* tick(10); yield* process } }),
    /** Advance without taking turns (the main thread was busy): arrivals queue in the mailbox, then run FIFO. */
    advanceHeld: (ms: number) => Effect.gen(function* () { for (let t = 0; t < ms; t += 10) yield* tick(10) }),
    process,
    /** check(snapshot, event): the same selection, implicit guards included, without committing (Machines O4). */
    check: (e: UserEv): string => {
      for (const p of prefixes(leaf).reverse()) {
        const h = sp.states[p]?.on?.[e._tag]
        if (!h) continue
        const reasons: string[] = []
        for (const alt of arr<any>(h)) {
          const g = { event: e, memory, state: leaf, calls: callsView() }
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
