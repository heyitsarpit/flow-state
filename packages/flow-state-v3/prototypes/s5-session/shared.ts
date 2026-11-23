// S5 shared harness: contract data, scripted source, virtual clock, the turn (world step), runner. Not counted per form.
import { Scheduler } from "effect"

export type Item = { id: string; cursor: number }
export type Frame =
  | { t: "live"; head?: number; proof?: string; restartAt?: number }
  | { t: "value"; v: Item } | { t: "ping" } | { t: "down"; r: string } | { t: "fail"; e: string } | { t: "end" }
export type Page =
  | { t: "more"; items: Item[]; next: number; through?: number }
  | { t: "done"; items: Item[]; proof: string; through?: number }
  | { t: "gone"; reason: string; items?: Item[]; next?: number; through?: number }
// Compiled contract data (2.11.3): what a definition layer would hand over.
export type Cfg = { catchUp: boolean; reconnect: boolean; idleMs: number; healthyMs: number; flapMax: number; closeMs: number; fills?: boolean; backoff: (n: number) => number }
export type Bk = { at: number | undefined; filled: boolean }
export type Delivery = { k: "value" | "item"; v: Item } | { k: "settle"; p: number | undefined } | { k: "missed"; why: string } | { k: "failure"; f: string }
export type Kind = "placed" | "releasing" | "unplaced"
export type World = { messages: Item[]; b?: Bk; log: string[]; discarded: string[] }
export type Ext = "release" | "clear" | "clearRelease"
export type Handle = { ext(x: Ext): void; world(): World; row(): string | undefined; dispose(): void; drain(): void; reads: Record<string, number>; pendingReads: number }
export type Form = (env: Env, cfg: Cfg, w: World) => Handle

export const defaultCfg: Cfg = { catchUp: true, reconnect: true, idleMs: 1000, healthyMs: 500, flapMax: 3, closeMs: 3, backoff: (n) => Math.min(800, 100 * 2 ** n) }

export const upsert = (m: Item[], it: Item) => (m.some((x) => x.id === it.id) ? m.map((x) => (x.id === it.id ? it : x)) : [...m, it])

// The turn: one admitted delivery (or a user clear). Memory, the bookmark's move (Streams T3) and the end-of-turn `filled` rule.
export function applyTurn(w: World, d: Delivery | { k: "clear" }, kind: Kind): World {
  let n: World = w
  const nonEmpty = () => n.messages.length > 0
  const log = (s: string) => { n.log.push(s) }                // the log is an evidence sink, not state: appended in place
  if (d.k === "settle") {
    if (d.p !== undefined) n = { ...n, b: { at: d.p, filled: n.b?.filled ?? nonEmpty() } }
    else if (!n.b) n = { ...n, b: { at: undefined, filled: nonEmpty() } }
    return n                                            // a settle is bookkeeping, not a turn
  }
  if (d.k === "value" || d.k === "item") {
    n = { ...n, messages: upsert(n.messages, d.v) }
    if (d.k === "value") n = { ...n, b: { at: d.v.cursor, filled: n.b?.filled ?? true } }
    log(`${d.k}:${d.v.id}`)
  } else if (d.k === "missed") log(`missed:${d.why}`)
  else if (d.k === "failure") log(`failure:${d.f}`)
  else { n = { ...n, messages: [] }; log("clear") }
  if (n.b && kind === "placed" && n.b.filled !== nonEmpty()) n = { ...n, b: { ...n.b, filled: nonEmpty() } }
  if (n.b && kind === "releasing" && !n.b.filled && nonEmpty()) n = { ...n, b: { ...n.b, filled: true } }   // may raise, never lower
  return n
}
export const discard = (w: World, d: Delivery): World => { w.discarded.push(`${d.k}:${d.k === "value" || d.k === "item" ? d.v.id : d.k === "settle" ? d.p : d.k === "missed" ? d.why : d.f}`); return { ...w } }

// Virtual clock: a binary heap ordered by (time, insertion).
export class Sim {
  now = 0; seq = 0; h: { t: number; s: number; fn: () => void; dead: boolean }[] = []
  private lt(a: number, b: number) { return this.h[a].t < this.h[b].t || (this.h[a].t === this.h[b].t && this.h[a].s < this.h[b].s) }
  at(ms: number, fn: () => void) {
    const e = { t: this.now + ms, s: this.seq++, fn, dead: false }; this.h.push(e)
    let i = this.h.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (!this.lt(i, p)) break; [this.h[i], this.h[p]] = [this.h[p], this.h[i]]; i = p }
    return () => { e.dead = true }
  }
  peek(): number { while (this.h.length && this.h[0].dead) this.pop(); return this.h.length ? this.h[0].t : Infinity }
  private pop() {
    const top = this.h[0], last = this.h.pop()!
    if (this.h.length) { this.h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.h.length && this.lt(l, m)) m = l; if (r < this.h.length && this.lt(r, m)) m = r; if (m === i) break; [this.h[i], this.h[m]] = [this.h[m], this.h[i]]; i = m } }
    return top
  }
  step(): boolean { if (this.peek() === Infinity) return false; const e = this.pop(); this.now = e.t; e.fn(); return true }
}

// The scripted outside world: connection k plays `conns[k]` (frames at dt after open; beyond the script: silent), reads answer by `read`.
export type Scn = { name: string; extFirst?: boolean; cfg: Cfg; conns: { dt: number; f: Frame }[][]; read: (from: number | undefined, next: number | undefined, no: number) => Page; phases: { until: number; ext: { t: number; x: Ext }[] }[]; init?: { messages?: Item[]; b?: Bk } }
export class Env {
  sim = new Sim(); opens: (number | undefined)[] = []; emitted: { c: number; id: string; t: number; afterRelease: boolean }[] = []; reads = 0
  closers: (() => void)[] = []; released = false; scn!: Scn
  open(from: number | undefined, onFrame: (f: Frame) => void) {
    const idx = this.opens.length; this.opens.push(from)
    let closed = false; const close = () => { closed = true }; this.closers.push(close)
    for (const { dt, f } of this.scn.conns[idx] ?? []) this.sim.at(dt, () => { if (closed) return; if (f.t === "value") this.emitted.push({ c: idx, id: f.v.id, t: this.sim.now, afterRelease: this.released }); onFrame(f) })
    return { close }
  }
  read(from: number | undefined, next: number | undefined, cb: (p: Page) => void) { const p = this.scn.read(from, next, this.reads++); return this.sim.at(5, () => cb(p)) }
  sleep(ms: number, cb: () => void) { return this.sim.at(ms, cb) }
  killAll() { for (const c of this.closers) c() }
}

// Stepping scheduler for Effect fibers (as S2): a queue the harness drains, FIFO or seeded random order.
export class Step implements Scheduler.Scheduler {
  readonly executionMode = "async" as const
  q: (() => void)[] = []; s: number
  constructor(public seed?: number) { this.s = (seed ?? 0) >>> 0 || 1 }
  rnd() { this.s ^= this.s << 13; this.s >>>= 0; this.s ^= this.s >>> 17; this.s ^= this.s << 5; this.s >>>= 0; return this.s / 4294967296 }
  shouldYield() { return false }
  disp = { scheduleTask: (t: () => void) => { this.q.push(t) }, flush: () => {} }
  makeDispatcher() { return this.disp }
  flush() { let n = 0; while (this.q.length) { if (++n > 100000) throw new Error("scheduler livelock"); const i = this.seed === undefined ? 0 : Math.floor(this.rnd() * this.q.length); const [t] = this.q.splice(i, 1); t() } }
}

export type Obs = { log: string[]; discarded: string[]; opens: (number | undefined)[]; bAt?: number | "none"; bFilled?: boolean | "none"; row?: string; messages: string[]; emitted: Env["emitted"]; reads: Record<string, number>; pendingReads: number }
export function run(form: Form, scn: Scn): Obs {
  const env = new Env(); env.scn = scn
  let w: World = { messages: scn.init?.messages ?? [], b: scn.init?.b, log: [], discarded: [] }
  let h!: Handle; const reads: Record<string, number> = {}; let pendingReads = 0
  for (const ph of scn.phases) {
    const start = env.sim.now; env.released = false
    const sched = () => { for (const e of ph.ext) env.sim.at(e.t - start > 0 ? e.t - start : 0, () => { if (e.x !== "clear") env.released = true; h.ext(e.x); h.drain() }) }
    if (scn.extFirst) sched()
    h = form(env, scn.cfg, w)
    if (!scn.extFirst) sched()
    h.drain()
    while (env.sim.peek() <= ph.until) { env.sim.step(); h.drain() }
    env.sim.now = ph.until
    w = h.world()
    for (const [k, v] of Object.entries(h.reads)) reads[k] = (reads[k] ?? 0) + v
    pendingReads += h.pendingReads
    if (ph !== scn.phases[scn.phases.length - 1]) { h.dispose(); env.killAll() }   // reload: the process dies, only the world's saved parts survive
  }
  return { log: w.log, discarded: w.discarded, opens: env.opens, bAt: w.b ? (w.b.at ?? "none") : "none", bFilled: w.b ? w.b.filled : "none", row: h.row(), messages: w.messages.map((m) => m.id), emitted: env.emitted, reads, pendingReads }
}
export const key = (o: Obs) => JSON.stringify([o.log, o.discarded, o.opens, o.bAt, o.bFilled, o.row, o.messages])
