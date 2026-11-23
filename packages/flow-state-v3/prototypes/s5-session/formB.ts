// Form B: the same behaviour as one Effect fiber per session. The fiber owns T1's variables as locals. The world (shared `w`) holds
// what a rule makes observable: memory, bookmark, row, the log. `queued` mode makes the fiber's writes to the world go through the
// step queue (as a Runtime step would) instead of landing at once.
import { Effect, Fiber } from "effect"
import { applyTurn, discard, Step, type Cfg, type Delivery, type Env, type Form, type Frame, type Item, type Page, type Sess, type World } from "./shared.ts"

type Ev = { t: "frame"; c: number; f: Frame } | { t: "page"; r: number; p: Page } | { t: "want"; r: number; from?: number; next: number }
class Mbox {                                              // the fiber's inbox, with a deadline on the virtual clock
  q: Ev[] = []; w?: (e: Ev | undefined) => void
  constructor(readonly env: Env) {}
  push(e: Ev) { if (this.w) { const w = this.w; this.w = undefined; w(e) } else this.q.push(e) }
  take(ms: number) {
    return Effect.callback<Ev | undefined>((resume) => {
      if (this.q.length) return void resume(Effect.succeed(this.q.shift()))
      const cancel = this.env.sim.at(ms < 0 ? 0 : ms, () => { this.w = undefined; resume(Effect.succeed(undefined)) })
      this.w = (e) => { cancel(); resume(Effect.succeed(e)) }
      return Effect.sync(() => { cancel(); this.w = undefined })
    })
  }
}
type Sess2 = Sess | "gone"
export const formB = (opt: { queued?: number; seed?: number } = {}): Form => (env, cfg, w0) => {
  const sim = env.sim, sch = new Step(opt.seed), mb = new Mbox(env)
  let w = w0, sess: Sess2 = "placed", row: string | undefined = "Connecting", dead = false
  let Q: Delivery[] = [], inFlight = false, want: { r: number; from?: number; next: number } | undefined, connId = 0
  const reads: Record<string, number> = {}; let pendingReads = 0
  const rdw = <T,>(site: string, f: (w: World) => T): T => { reads[site] = (reads[site] ?? 0) + 1; if (inFlight || Q.length) { pendingReads++; reads[site + "!"] = (reads[site + "!"] ?? 0) + 1 }; return f(w) }   // fiber reads the world
  const wr = (f: (w: World) => World) => { if (opt.queued !== undefined) sim.at(opt.queued, () => { w = f(w) }); else w = f(w) }                              // fiber writes the world
  const put = (d: Delivery) => Q.push(d)
  const pump = () => {                                    // called by the fiber AND by the turn callback: shared mutable state
    while (!inFlight && Q.length) {
      const x = Q.shift()!
      if (x.k === "settle") { wr((w) => applyTurn(w, x, "placed")); continue }
      inFlight = true; sim.at(1, () => turn(x))
    }
    if (!inFlight && !Q.length && want) { const r = want; want = undefined; mb.push({ t: "want", ...r }) }
  }
  const turn = (x: Delivery) => {
    if (dead) return
    inFlight = false
    if (sess !== "placed") { w = discard(w, x); for (const d of Q) w = discard(w, d); Q = [] }   // world reads the fiber's state: `sess`
    else w = applyTurn(w, x, "placed")
    pump()
  }
  let n = 0, flaps = 0                                    // survive connections
  type Out = { lost: string; liveSince?: number } | { ended: true }
  const connection = (claim: number | undefined, wiped: boolean) => Effect.gen(function* () {
    const myc = ++connId
    let st: "Connecting" | "Live" | "Repairing" | "Dropped" = "Connecting"
    let regIn = false, noted = false, owed = false, greeted: number | undefined, liveSince: number | undefined
    let buf: Item[] = [], lastRead: number | undefined, rdFrom: number | undefined, prevNext: number | undefined, emptyRun = 0, rd = 0, cancelRead: (() => void) | undefined
    let idleAt = sim.now + cfg.idleMs, healthyAt = Infinity
    const link = env.open(claim, (f) => mb.push({ t: "frame", c: myc, f }))
    row = "Connecting"
    const notice = (why: string) => { if (!noted) { put({ k: "missed", why }); noted = true } }
    const abandon = () => { cancelRead?.(); cancelRead = undefined; rd++; buf = []; lastRead = undefined; want = undefined }
    const startRead = (from?: number) => { st = "Repairing"; row = "Live"; abandon(); prevNext = undefined; emptyRun = 0; rdFrom = from; const r = ++rd; cancelRead = env.read(from, undefined, (p) => mb.push({ t: "page", r, p })) }
    const live = () => { st = "Live"; row = "Live" }
    const complete = (through?: number) => { put({ k: "settle", p: through ?? lastRead ?? greeted }); for (const v of buf) put({ k: "value", v }); buf = []; live() }
    const register = (f: Extract<Frame, { t: "live" }>) => {
      const first = !regIn; regIn = true; noted = false; owed = false; liveSince = sim.now; idleAt = sim.now + cfg.idleMs; healthyAt = sim.now + cfg.healthyMs
      const b = rdw("b.exists", (w) => w.b), e = rdw("field.empty", (w) => w.messages.length === 0), C = cfg.catchUp
      const settleHead = () => { if (f.head !== undefined && b?.at === undefined) put({ k: "settle", p: f.head }) }
      if (f.restartAt !== undefined) {
        if (!b && e) wr((w) => ({ ...w, b: { at: f.restartAt, filled: false } })); else { notice("Reset"); put({ k: "settle", p: f.restartAt }) }
        if (C) startRead(f.restartAt); else live()
      } else if (!b && e) {
        if (C) { greeted = f.head; startRead(undefined) } else { wr((w) => ({ ...w, b: { at: f.head, filled: false } })); live() }
      } else if (f.proof !== undefined && (claim !== undefined || !first)) live()
      else if (wiped && first) {
        if (C) { greeted = f.head; startRead(undefined) } else { notice("Unproven"); settleHead(); live() }
      } else if (b && b.at !== undefined) { if (C) startRead(b.at); else { notice("Unproven"); live() } }
      else {
        if (!b) wr((w) => ({ ...w, b: { at: undefined, filled: !e } }))
        notice("Unproven"); if (C) { greeted = f.head; startRead(undefined) } else { settleHead(); live() }
      }
    }
    const onValue = (v: Item) => {
      if (st === "Connecting") { register({ t: "live" }) }
      idleAt = st === "Dropped" ? Infinity : sim.now + cfg.idleMs
      if (st === "Live") put({ k: "value", v })
      else if (st === "Repairing") buf.push(v)
      else if (st === "Dropped") {
        if (!rdw("b.exists", (w) => w.b) && rdw("field.empty", (w) => w.messages.length === 0)) wr((w) => ({ ...w, b: { at: undefined, filled: false } }))
        else if (!owed) { noted = false; notice("Unproven"); owed = true }
        put({ k: "value", v })
      }
    }
    const frame = (f: Frame): string | undefined => {
      switch (f.t) {
        case "live":
          if (st === "Repairing") {
            if (f.proof !== undefined && f.restartAt === undefined) break
            abandon(); if (f.restartAt === undefined) { startRead(rdw("b.at", (w) => w.b?.at)); break }
          }
          register(f); break
        case "ping": if (st === "Live" || st === "Repairing") idleAt = sim.now + cfg.idleMs; break
        case "value": onValue(f.v); break
        case "down": if (st === "Dropped") { owed = false; break } if (st === "Repairing") abandon(); st = "Dropped"; liveSince = undefined; idleAt = Infinity; break
        case "fail": return f.e
        case "end": return "Closed"
      }
    }
    return yield* Effect.gen(function* () {
      for (;;) {
        const dl = Math.min(idleAt, healthyAt)
        const ev = yield* mb.take(dl - sim.now)
        if (!ev) {
          if (sim.now >= healthyAt) { n = 0; flaps = 0; healthyAt = Infinity }
          if (sim.now >= idleAt) return { lost: "Silent", liveSince } as Out
          continue
        }
        if (ev.t === "frame") { if (ev.c !== myc) continue; const r = frame(ev.f); if (r) return { lost: r, liveSince } as Out }
        else if (ev.t === "page") {
          if (ev.r !== rd || st !== "Repairing") continue
          const p = ev.p, items = p.items ?? []
          if (p.t === "gone") notice("Lost")
          for (const it of items) put({ k: "item", v: it })
          if (items.length) lastRead = items[items.length - 1].cursor
          if (p.t === "more") {
            if (p.through !== undefined) put({ k: "settle", p: p.through })
            if (p.next === prevNext || (!items.length && emptyRun >= 1)) { abandon(); return { lost: "PageStalled!" } as Out }
            prevNext = p.next; emptyRun = items.length ? 0 : emptyRun + 1; want = { r: rd, from: rdFrom, next: p.next }
          } else if (p.t === "done" || !p.next) complete(p.through)
          else { if (p.through !== undefined) put({ k: "settle", p: p.through }); want = { r: rd, from: rdFrom, next: p.next } }
        } else if (ev.r === rd && st === "Repairing") { cancelRead = env.read(ev.from, ev.next, (p) => mb.push({ t: "page", r: ev.r, p })) }
        pump()
      }
    }).pipe(Effect.ensuring(Effect.sync(() => { link.close(); abandon() })))
  })
  const body = Effect.gen(function* () {
    for (;;) {
      const b = rdw("b.filled", (w) => w.b), wiped = cfg.fills !== false && !!b && b.filled && rdw("field.empty", (w) => w.messages.length === 0)
      if (wiped) wr((w) => ({ ...w, b: { at: undefined, filled: false } }))
      const claim = wiped ? undefined : rdw("b.at", (w) => w.b?.at)
      const out = yield* connection(claim, wiped)
      if ("ended" in out) return
      const e = out.lost.replace("!", "")
      const end = (f: string) => { put({ k: "failure", f }); row = "Ended"; pump() }
      if (!cfg.reconnect || out.lost.endsWith("!")) return end(e)
      if (e !== "Silent" && out.liveSince !== undefined && sim.now - out.liveSince < cfg.healthyMs) flaps++
      if (flaps >= cfg.flapMax) return end("Flapping")
      row = "Connecting"
      yield* Effect.callback<void>((resume) => { const c = sim.at(cfg.backoff(n++), () => resume(Effect.void)); return Effect.sync(c) })
    }
  })
  const fiber = Effect.runFork(body, { scheduler: sch })
  return {
    ext(x) {
      if (dead) return
      if (x === "clear") w = applyTurn(w, { k: "clear" }, sess === "placed" ? "placed" : "unplaced")
      else {
        if (x === "clearRelease") w = applyTurn(w, { k: "clear" }, "releasing")
        if (sess !== "placed") return
        sess = "releasing"; row = undefined; for (const d of Q) w = discard(w, d); Q = []
        fiber.interruptUnsafe(); sim.at(cfg.closeMs, () => { sess = "gone" })
      }
    },
    world: () => w, row: () => row, drain: () => sch.flush(), reads, get pendingReads() { return pendingReads },
    dispose() { dead = true; fiber.interruptUnsafe(); sch.flush() },
  }
}
void Fiber
