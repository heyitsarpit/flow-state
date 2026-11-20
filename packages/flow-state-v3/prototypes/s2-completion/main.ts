// S2 throwaway: exactly one completion input per started Attempt, under interruption. Run: bun main.ts
// Input: compiled commands { k: "invoke", attempt, commit } where commit is an Effect. No outside world.
// Shapes under one recipe: A forkIn+onExit, B runFork+addObserver, C forkIn+addObserver, D FiberMap.run+addObserver,
// E FiberSet.run+addObserver. Interrupts are injected at every tick of a seeded shuffling scheduler.
import { Cause, Effect, Exit, Fiber, FiberMap, FiberSet, Option, Scheduler, Scope } from "effect"

type Cls = "ok" | "failed" | "defect" | "cancelled" | "owner-closed" | "unknown"
type Fx = Effect.Effect<unknown, unknown>
interface Cmd { k: "invoke"; attempt: number; commit: Fx; timeout?: { mode: "inner" | "outer"; ms: number } }
interface Driver { start(c: Cmd): void; cancel(a: number): void; dispose(): Promise<void>; live(): number; fibers: Fiber.Fiber<unknown, unknown>[] }
type Complete = (a: number, c: Cls) => void
const TIMEOUT = Symbol("timeout")

// Stepping scheduler: every task goes to one queue; the harness pops one (random) task per tick.
class Step implements Scheduler.Scheduler {
  readonly executionMode = "async" as const
  q: (() => void)[] = []
  yieldy = false
  s: number
  constructor(seed: number) { this.s = seed >>> 0 || 1 }
  rnd() { this.s ^= this.s << 13; this.s >>>= 0; this.s ^= this.s >>> 17; this.s ^= this.s << 5; this.s >>>= 0; return this.s / 4294967296 }
  c = 0
  shouldYield() { return this.yieldy && this.c++ % 3 === 0 }   // yield often, but never on every op (that livelocks)
  disp = { scheduleTask: (t: () => void) => { this.q.push(t) }, flush: () => {} }   // no-op: runSync flushes, which would run every queued child inline
  makeDispatcher() { return this.disp }
  n = 0
  tick() { if (++this.n > 20000) throw new Error("scheduler livelock"); const [t] = this.q.splice(Math.floor(this.rnd() * this.q.length), 1); t() }
}

const wrap = (c: Cmd): Fx => c.timeout?.mode === "inner"
  ? Effect.timeoutOption(c.commit, c.timeout.ms).pipe(Effect.flatMap((o) => Option.isSome(o) ? Effect.succeed(o.value) : Effect.fail(TIMEOUT)))
  : c.commit

// ── Drivers. flags: what the driver itself did, read by the classifier (rule 25: classify outside the dying fiber).
type Flags = { cancel: boolean; timedOut: boolean }
function mk(shape: string, sch: Step | undefined, done: Complete): Driver {
  const scope = Scope.makeUnsafe()
  // The pump is plain JS: it runs a short setup fiber under our scheduler and takes its result synchronously. (Effect.runSync
  // installs its own sync scheduler, which flushes a forked child inline, so "interrupt before start" could never be seen.)
  const run = <A>(e: Effect.Effect<A, never, Scope.Scope> | Effect.Effect<A>): A => {
    const p = Effect.runFork(e as Effect.Effect<A>, sch ? { scheduler: sch } : undefined)
    const x = p.pollUnsafe()
    if (!x || !Exit.isSuccess(x)) throw new Error("setup fiber did not finish synchronously")
    return x.value
  }
  const flags = new Map<number, Flags>(), byAtt = new Map<number, Fiber.Fiber<unknown, unknown>>(), fibers: Fiber.Fiber<unknown, unknown>[] = []
  const latch = new Set<number>()
  const classify = (a: number, ex: Exit.Exit<unknown, unknown>): Cls => {
    const f = flags.get(a)!
    if (Exit.isSuccess(ex)) return "ok"
    if (f.timedOut || (Cause.hasFails(ex.cause) && Cause.squash(ex.cause) === TIMEOUT)) return "unknown"
    if (Cause.hasInterruptsOnly(ex.cause)) return f.cancel ? "cancelled" : "owner-closed"
    return Cause.hasDies(ex.cause) ? "defect" : "failed"
  }
  const complete = (a: number, ex: Exit.Exit<unknown, unknown>, outer: boolean) => {
    if (outer) { if (latch.has(a)) return; latch.add(a) }   // outer timeout already reported `unknown`: later exit is dropped
    byAtt.delete(a); done(a, classify(a, ex))
  }
  const reg = (c: Cmd, f: Fiber.Fiber<unknown, unknown>) => {
    byAtt.set(c.attempt, f); fibers.push(f)
    if (c.timeout?.mode === "outer") setTimeout(() => {
      flags.get(c.attempt)!.timedOut = true
      if (latch.has(c.attempt)) return
      latch.add(c.attempt); byAtt.delete(c.attempt); done(c.attempt, "unknown"); f.interruptUnsafe()
    }, c.timeout.ms)
    if (shape !== "A") f.addObserver((ex) => complete(c.attempt, ex, c.timeout?.mode === "outer"))
  }
  const map = shape === "D" ? run(Scope.provide(scope)(FiberMap.make<number>())) : undefined
  const set = shape === "E" ? run(Scope.provide(scope)(FiberSet.make())) : undefined
  return {
    fibers,
    start(c) {
      flags.set(c.attempt, { cancel: false, timedOut: false })
      const e = wrap(c)
      let f: Fiber.Fiber<unknown, unknown>
      if (shape === "A") f = run(Effect.forkIn(e.pipe(Effect.onExit((ex) => Effect.sync(() => complete(c.attempt, ex, c.timeout?.mode === "outer")))), scope))
      else if (shape === "B") f = Effect.runFork(e, sch ? { scheduler: sch } : undefined)
      else if (shape === "C") f = run(Effect.forkIn(e, scope))
      else if (shape === "D") f = run(FiberMap.run(map!, c.attempt, e))
      else f = run(FiberSet.run(set!, e))
      reg(c, f)
    },
    cancel(a) { const f = byAtt.get(a); if (f) { flags.get(a)!.cancel = true; f.interruptUnsafe() } },
    dispose: () => shape === "B" ? Effect.runPromise(Fiber.interruptAll(fibers)) : Effect.runPromise(Scope.close(scope, Exit.void)),
    live: () => byAtt.size
  }
}

// ── Scenarios
const ys = (n: number): Effect.Effect<void> => Effect.gen(function*() { for (let i = 0; i < n; i++) yield* Effect.yieldNow })
interface Sc { n: string; c: Fx; timeout?: Cmd["timeout"]; short?: boolean }
const SC: Sc[] = [
  { n: "success", c: ys(3).pipe(Effect.as(1)) },
  { n: "failure", c: ys(2).pipe(Effect.andThen(Effect.fail("boom"))) },
  { n: "defect", c: ys(2).pipe(Effect.andThen(Effect.die("bug"))) },
  { n: "sync-before-register", c: Effect.succeed(1) },
  { n: "finalizer-running", c: Effect.acquireUseRelease(ys(1), () => ys(3), () => ys(4)) },
  { n: "uninterruptible", c: Effect.uninterruptible(ys(4)).pipe(Effect.as(1)) },
  // Translated from references/checkout/features/Pay/pay.contracts.ts: `pay` (no signal), `placeOrder` (signal, OrderExists -> success), `authenticate` (3-D Secure, waits on a person)
  { n: "real:pay-no-signal", c: Effect.tryPromise({ try: () => new Promise((r) => setTimeout(() => r(1), 3)), catch: (e) => e }), short: true },
  { n: "real:placeOrder-signal", c: Effect.tryPromise({ try: (sig) => new Promise((r, j) => { const t = setTimeout(() => r(1), 3); sig.addEventListener("abort", () => { clearTimeout(t); j("aborted") }) }), catch: (e) => e }).pipe(Effect.catch((e) => e === "OrderExists" ? Effect.succeed(2) : Effect.fail(e))), short: true },
  { n: "real:3ds-waits-on-person", c: Effect.tryPromise({ try: () => new Promise(() => {}), catch: (e) => e }), timeout: { mode: "outer", ms: 5 }, short: true },
  { n: "hang+inner-timeout", c: Effect.never, timeout: { mode: "inner", ms: 5 }, short: true },
  { n: "hang+outer-timeout", c: Effect.never, timeout: { mode: "outer", ms: 5 }, short: true },
  { n: "uninterruptible-hang+inner", c: Effect.uninterruptible(Effect.never), timeout: { mode: "inner", ms: 5 }, short: true },
  { n: "uninterruptible-hang+outer", c: Effect.uninterruptible(Effect.never), timeout: { mode: "outer", ms: 5 }, short: true }
]
const tick1 = () => new Promise<void>((r) => setImmediate(r))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
let MUT = ""
interface Run { counts: [number, number]; cls: Cls | "-"; disposeHung: boolean; leaked: number; unfinished: number }

async function once(shape: string, sc: Sc, mode: "none" | "cancel" | "close", k: number, seed: number, K: number): Promise<Run> {
  const sch = new Step(seed * 7919 + k * 31 + 1), counts: [number, number] = [0, 0]
  let cls: Cls | "-" = "-"
  const done: Complete = (a, c) => {
    if (MUT === "drop" && a === 0) return
    counts[a]++; if (a === 0) cls = c
    if (MUT === "double" && a === 0) counts[0]++
  }
  const d = mk(shape, sch, done)
  sch.yieldy = false                                   // the pump: command starts run inline
  d.start({ k: "invoke", attempt: 0, commit: sc.c, timeout: sc.timeout })
  d.start({ k: "invoke", attempt: 1, commit: ys(3).pipe(Effect.as(1)) })   // bystander
  sch.yieldy = true
  let disp: Promise<void> | undefined, disposed = false
  const act = () => { if (mode === "cancel") d.cancel(0); else if (mode === "close") disp = d.dispose().then(() => { disposed = true }) }
  for (let t = 0; t <= K; t++) { if (t === k && mode !== "none") act(); if (sch.q.length) sch.tick() }
  const end = Date.now() + (sc.short ? 40 : 12)
  for (let idle = 0; Date.now() < end && idle < 3;) {
    const had = sch.q.length > 0
    while (sch.q.length) sch.tick()
    await tick1()
    idle = !had && counts[0] > 0 && counts[1] > 0 && (mode !== "close" || disposed) ? idle + 1 : 0
  }
  if (!disp) disp = d.dispose().then(() => { disposed = true })
  const end2 = Date.now() + (sc.short ? 30 : 10)
  while (!disposed && Date.now() < end2) { while (sch.q.length) sch.tick(); await tick1() }
  while (sch.q.length) sch.tick()
  await tick1()
  return { counts, cls, disposeHung: !disposed, leaked: d.live(), unfinished: d.fibers.filter((f) => !f.pollUnsafe()).length }
}

const SHAPES = ["A", "B", "C", "D", "E"], NAMES: Record<string, string> = { A: "forkIn+onExit", B: "runFork+addObserver", C: "forkIn+addObserver", D: "FiberMap.run+addObserver", E: "FiberSet.run+addObserver" }
const hist = (h: Map<string, number>) => [...h].sort().map(([k, v]) => `${k}:${v}`).join(" ")

async function sweep(shapes: string[], scs: Sc[], seeds: number, K: number, verbose: boolean) {
  const bad: Record<string, number> = {}, total: Record<string, number> = {}, hung: Record<string, number> = {}, leak: Record<string, number> = {}
  for (const sh of shapes) for (const sc of scs) {
    const h = new Map<string, number>(), cnt = new Map<string, number>()
    const KK = sc.short ? 6 : K
    for (const mode of ["none", "cancel", "close"] as const) for (let k = 0; k <= (mode === "none" ? 0 : KK); k++) for (let s = 1; s <= (sc.short ? 2 : seeds); s++) {
      const r = await once(sh, sc, mode, k, s, KK)
      total[sh] = (total[sh] ?? 0) + 1
      const c = r.counts[0]; const key = `${mode === "none" ? "none" : mode + (k === 0 ? "@0" : "")}`
      if (c !== 1 || r.counts[1] !== 1) { bad[sh] = (bad[sh] ?? 0) + 1; cnt.set(`${key}:a0=${c},a1=${r.counts[1]}`, (cnt.get(`${key}:a0=${c},a1=${r.counts[1]}`) ?? 0) + 1) }
      if (r.disposeHung) hung[sh] = (hung[sh] ?? 0) + 1
      if (r.leaked || r.unfinished) leak[sh] = (leak[sh] ?? 0) + 1
      h.set(r.cls, (h.get(r.cls) ?? 0) + 1)
    }
    if (verbose) console.log(`  ${sh} ${sc.n.padEnd(28)} classes{${hist(h)}} violations{${hist(cnt) || "none"}}`)
  }
  for (const sh of shapes) console.log(`SUM ${sh} ${NAMES[sh].padEnd(26)} runs=${total[sh]} wrongCount=${bad[sh] ?? 0} disposeHung=${hung[sh] ?? 0} leaked/unfinished=${leak[sh] ?? 0}`)
}

async function timing(shape: string, N: number) {
  const q: number[] = []
  let left = N
  const p = new Promise<void>((r) => { const d = mk(shape, undefined, (a) => { q.push(a); if (--left === 0) r() }); (timing as any).d = d })
  const d: Driver = (timing as any).d, ok = Effect.succeed(1)
  const h0 = process.memoryUsage().heapUsed, t0 = performance.now()
  for (let i = 0; i < N; i++) d.start({ k: "invoke", attempt: i, commit: ok })
  await Promise.race([p, sleep(2000)])
  const t1 = performance.now(), h1 = process.memoryUsage().heapUsed
  console.log(`TIME ${shape} ${NAMES[shape].padEnd(26)} ${(((t1 - t0) * 1000) / N).toFixed(2)} us/invoke  heap delta ${((h1 - h0) / N).toFixed(0)} B/invoke (Bun-only, N=${N}, unforced GC, completions=${N - left})`)
  await d.dispose()
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7)
const full = process.argv.includes("--full")
console.log(`runtime: ${"Bun" in globalThis ? "Bun " + (globalThis as any).Bun.version : "Node"}  effect 4.0.5  seeds=${full ? 8 : 4}`)
console.log("== sweep (A..E x scenarios x {none, cancel@k, close@k} x seeds; k = tick of injection, 0 = before the first tick)")
await sweep(only ? [only[0]] : SHAPES, only ? SC.filter((x) => x.n.startsWith(only.slice(2))) : SC, full ? 8 : 4, 14, true)
if (only) process.exit(0)
console.log("== mutation sanity (shape C, scenario success): the harness must flag these")
for (const m of ["", "drop", "double"]) { MUT = m; console.log(`mutation=${m || "none"}`); await sweep(["C"], [SC[0]], 2, 4, false) }
MUT = ""
console.log("== cost per invoke, success commit, default scheduler")
for (const sh of SHAPES) await timing(sh, 5000)
process.exit(0)
