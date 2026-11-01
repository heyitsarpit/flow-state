// The world, owned by the suite so it survives runtime rewrites: virtual clock, stepping scheduler, fake server,
// fake storage. A runtime sees only `Host` and `ShopApi`. A "process" is a generation: when it dies, nothing from it
// reaches the next one, without any cooperation from the runtime.
import { Effect, Scheduler } from "effect"
import type { Answer, Request, StorageScript, World0 } from "./harness.ts"

export type Purpose = "acknowledge" | "capture" | "flush"
export type Write = { readonly key: string; readonly value: string | undefined } // undefined deletes
export type Host = {
  now(): number
  id(): string
  setTimer(at: number, f: () => void): () => void
  later(f: () => void): void
  scheduler: Scheduler.Scheduler
  storage: {
    load(): ReadonlyMap<string, string>
    // `then` makes the write awaited: the fake holds it until a `storage` step. Others land at once.
    write(writes: readonly Write[], purpose: Purpose, then?: (ok: boolean) => void): void
  }
}
export type ShopApi = {
  confirm(i: unknown, o: { idempotencyKey: string }): Effect.Effect<unknown, { readonly _tag: string }>
  placeOrder(i: unknown, o: { idempotencyKey: string }): Effect.Effect<unknown, { readonly _tag: string }>
  voidAuthorization(i: unknown, o: { idempotencyKey: string }): Effect.Effect<unknown, { readonly _tag: string }>
  intent(i: unknown): Effect.Effect<unknown, { readonly _tag: string }>
  orderFor(i: unknown): Effect.Effect<unknown, { readonly _tag: string }>
}

class StepScheduler implements Scheduler.Scheduler {
  readonly executionMode = "async" as const
  q: Array<() => void> = []
  shuffle: number | undefined
  yieldEvery = 0
  private ops = 0
  shouldYield() {
    return this.yieldEvery > 0 && ++this.ops % this.yieldEvery === 0
  }
  private d = { scheduleTask: (t: () => void) => void this.q.push(t), flush: () => {} }
  makeDispatcher() {
    return this.d
  }
  next() {
    if (this.shuffle === undefined) return this.q.shift()!
    this.shuffle = (Math.imul(this.shuffle, 48271) >>> 0) % 2147483647
    return this.q.splice(this.shuffle % this.q.length, 1)[0]!
  }
}

type Held = Request & {
  never?: boolean
  aborted?: boolean
  resume?: ((e: Effect.Effect<unknown, any>) => void) | undefined
  process: number
}
const WRITES: Record<string, string> = { confirm: "pay", placeOrder: "place", voidAuthorization: "void", intent: "intent", orderFor: "order" }
const capturable = (v: any) => v?.status === "requires_capture" || v?.status === "succeeded"

export class FakeWorld {
  now = 0
  process = 0
  private idSeq = 0
  private timers: Array<{ at: number; seq: number; f: () => void; process: number }> = []
  private timerSeq = 0
  readonly scheduler = new StepScheduler()
  private laters: Array<() => void> = []

  readonly requests: Held[] = []
  readonly charged = new Set<string>()
  readonly acked = new Set<string>()
  readonly placedKeys = new Set<string>()
  readonly voidedKeys = new Set<string>()
  uninterruptible = new Set<string>()
  syncAnswers = new Map<string, Answer>()
  yields = 0

  readonly kv = new Map<string, string>()
  private held: Array<{ writes: readonly Write[]; purpose: Purpose; then?: ((ok: boolean) => void) | undefined; hung?: boolean }> = []
  constructor(readonly seed: number, readonly script: StorageScript = {}) {}

  killProcess() {
    this.process++
    this.timers = []
    this.scheduler.q = []
    this.laters = []
    this.held = [] // an unconfirmed write dies with its process. `landNoAck` is how a landed one is modelled.
    for (const r of this.requests) r.resume = undefined
  }

  // ── Host
  host(): Host {
    const process = this.process
    return {
      now: () => this.now,
      id: () => `att-${this.seed}-${++this.idSeq}`,
      setTimer: (at, f) => {
        const t = { at, seq: ++this.timerSeq, f, process }
        this.timers.push(t)
        return () => {
          this.timers = this.timers.filter((x) => x !== t)
        }
      },
      later: (f) => void this.laters.push(f),
      scheduler: this.scheduler,
      storage: {
        load: () => new Map(this.kv),
        write: (writes, purpose, then) => {
          const mustHold = then !== undefined || this.script.holdCaptures === true
          const blocked = writes.some((w) => this.held.some((h) => h.writes.some((x) => x.key === w.key)))
          if (mustHold || blocked) this.held.push({ writes, purpose, then })
          else this.land(writes)
        },
      },
    }
  }
  private land(writes: readonly Write[]) {
    for (const w of writes) {
      if (w.value === undefined) this.kv.delete(w.key)
      else this.kv.set(w.key, w.value)
    }
  }

  storageStep(how: "ack" | "refuse" | "hang" | "landNoAck", match?: string) {
    const matches = (h: (typeof this.held)[number]) =>
      !h.hung && h.then !== undefined && (match === undefined || h.purpose === match || h.writes.some((w) => w.key.includes(match)))
    for (const h of this.held.filter(matches)) {
      if (how === "hang") {
        h.hung = true
      } else if (how === "landNoAck") {
        this.land(h.writes)
        h.hung = true
      } else {
        this.held.splice(this.held.indexOf(h), 1)
        if (how === "ack") {
          this.land(h.writes)
          this.noteAck(h.writes)
        }
        h.then?.(how === "ack")
      }
    }
    this.flushUnblocked()
  }
  private noteAck(writes: readonly Write[]) {
    for (const w of writes) if (w.value !== undefined) for (const id of JSON.parse(w.value).ackedIds ?? []) this.acked.add(id)
  }
  // Writes queued behind a settled one, in order, per key (a KeyValueStore's FIFO). A hung write keeps blocking its key.
  private flushUnblocked() {
    for (let i = 0; i < this.held.length; i++) {
      const h = this.held[i]!
      if (h.then !== undefined || this.script.holdCaptures) continue
      const blocked = this.held.slice(0, i).some((o) => o.writes.some((x) => h.writes.some((w) => w.key === x.key)))
      if (!blocked) {
        this.held.splice(i--, 1)
        this.land(h.writes)
      }
    }
  }
  heldStorage() {
    return this.held.filter((h) => h.then !== undefined && !h.hung).length
  }

  // ── Fake server
  readonly api: ShopApi = {
    confirm: (input, o) => this.call("confirm", input, o.idempotencyKey),
    placeOrder: (input, o) => this.call("placeOrder", input, o.idempotencyKey),
    voidAuthorization: (input, o) => this.call("voidAuthorization", input, o.idempotencyKey),
    intent: (input) => this.call("intent", input),
    orderFor: (input) => this.call("orderFor", input),
  }
  private call(name: string, input: unknown, key?: string): Effect.Effect<unknown, any> {
    const op = WRITES[name]!
    const isRead = key === undefined
    const r: Held = { op, input, at: this.now, answered: false, process: this.process, ...(key === undefined ? {} : { idempotencyKey: key }) }
    const sync = this.syncAnswers.get(op)
    let body: Effect.Effect<unknown, any> = Effect.suspend(() => {
      this.requests.push(r)
      if (sync) {
        r.answered = true
        return this.settle(r, sync)
      }
      return Effect.callback<unknown, any>((resume) => {
        r.resume = resume
        // A read carries a signal, so aborting it ends it at the server. A write has none (pay.contracts.ts): it stays.
        return isRead ? Effect.sync(() => void (r.aborted = true)) : undefined
      })
    })
    if (this.yields > 0) body = Effect.yieldNow.pipe(Effect.andThen(Effect.yieldNow), Effect.andThen(body))
    return this.uninterruptible.has(op) ? Effect.uninterruptible(body) : body
  }
  private settle(r: Held, a: Answer): Effect.Effect<unknown, any> {
    const apply = (v: unknown) => {
      if (r.op === "pay" && capturable(v)) this.charged.add(r.idempotencyKey!)
      if (r.op === "place") this.placedKeys.add(r.idempotencyKey!)
      if (r.op === "void") this.voidedKeys.add(r.idempotencyKey!)
    }
    if ("ok" in a) {
      apply(a.ok)
      return Effect.succeed(a.ok)
    }
    if ("fail" in a) {
      const { tag, ...rest } = a.fail
      return Effect.fail({ _tag: tag, ...rest })
    }
    if ("lost" in a) return Effect.fail({ _tag: "NoResponse" })
    if ("lostButLanded" in a) {
      apply(a.lostButLanded)
      return Effect.fail({ _tag: "NoResponse" })
    }
    if ("die" in a) return Effect.die(a.die)
    throw new Error("settle: not an answer")
  }
  private oldest(op: string) {
    return this.requests.find((r) => r.op === op && !r.answered && !r.never && !r.aborted)
  }
  hasOpen(op: string) {
    return this.oldest(op) !== undefined
  }
  answer(op: string, a: Answer) {
    const r = this.oldest(op)
    if (!r) throw new Error(`answer: no held request for ${op}`)
    if ("never" in a) {
      r.never = true
      return
    }
    if ("landLate" in a) throw new Error("landLate: not needed in round 1, lateAnswer covers it")
    r.answered = true
    const e = this.settle(r, a)
    r.resume?.(e)
    r.resume = undefined
  }
  // The server's answer finally arrives. If the fiber is gone, or the process, only the truth changes.
  lateAnswer(op: string, a: Answer) {
    const r = this.requests.find((x) => x.op === op && !x.answered && !x.aborted)
    if (!r) throw new Error(`lateAnswer: no open request for ${op}`)
    r.answered = true
    const e = this.settle(r, a)
    r.resume?.(e)
    r.resume = undefined
  }
  truth(): World0 {
    return {
      charges: this.charged.size,
      chargedKeys: [...this.charged],
      acked: [...this.acked],
      placed: this.placedKeys.size,
      voided: this.voidedKeys.size,
    }
  }
  publicRequests(): readonly Request[] {
    return this.requests.map(({ op, input, at, answered, idempotencyKey }) => ({
      op,
      input,
      at,
      answered,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    }))
  }

  // ── Settling and time
  settleAll() {
    for (let guard = 0; guard < 100_000; guard++) {
      if (this.scheduler.q.length) this.scheduler.next()()
      else if (this.laters.length) this.laters.shift()!()
      else return
    }
    throw new Error("settle: did not quiesce")
  }
  advance(ms: number) {
    const end = this.now + ms
    for (;;) {
      this.settleAll()
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!due) break
      this.timers = this.timers.filter((t) => t !== due)
      this.now = Math.max(this.now, due.at)
      due.f()
    }
    this.now = end
    this.settleAll()
  }
}
