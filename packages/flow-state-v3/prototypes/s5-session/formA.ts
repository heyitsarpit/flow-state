// Form A: Streams T1 as data. `stepA` is pure: (state, input, now) -> (state, commands). The driver only executes commands.
import { applyTurn, discard, type Cfg, type Delivery, type Ext, type Form, type Frame, type Item, type Page, type World, type Env } from "./shared.ts"

type St = "Connecting" | "Live" | "Repairing" | "Dropped" | "Waiting" | "Ended" | "Releasing" | "Released"
export type S = {
  w: World; st: St; conn: number; rd: number; claim?: number; wiped: boolean; greeted?: number; noted: boolean; regIn: boolean; owed: boolean
  n: number; flaps: number; liveSince?: number; Q: Delivery[]; inFlight: boolean
  buf: Item[]; lastRead?: number; rdFrom?: number; want?: number; prevNext?: number; emptyRun: number; ended?: string
}
type Cmd = { k: "open"; conn: number; from?: number } | { k: "close" } | { k: "arm"; id: string; ms: number } | { k: "disarm"; id: string } | { k: "read"; rd: number; from?: number; next?: number } | { k: "abort" } | { k: "mail"; d: Delivery }
export type In = { k: "start" } | { k: "frame"; conn: number; f: Frame } | { k: "timer"; id: string } | { k: "page"; rd: number; p: Page } | { k: "turn"; d: Delivery } | { k: "ext"; x: Ext }
type Probe = (site: string, pending: boolean) => void

export const init = (w: World): S => ({ w, st: "Waiting", conn: 0, rd: 0, wiped: false, noted: false, regIn: false, owed: false, n: 0, flaps: 0, Q: [], inFlight: false, buf: [], emptyRun: 0 })
export const rowOf = (s: S) => (s.st === "Connecting" || s.st === "Waiting" || s.st === "Dropped" ? "Connecting" : s.st === "Live" || s.st === "Repairing" ? "Live" : s.st === "Ended" ? "Ended" : undefined)

export function stepA(cfg: Cfg, s0: S, i: In, now: number, probe: Probe): [S, Cmd[]] {
  let s: S = { ...s0 }; const c: Cmd[] = []
  const rdb = (site: string) => probe(site, s.inFlight || s.Q.length > 0)   // a read of the bookmark or the field, noted with pending deliveries
  const E = () => { rdb("field.empty"); return s.w.messages.length === 0 }
  const q = (d: Delivery) => { s.Q = [...s.Q, d] }
  const notice = (why: string) => { if (!s.noted) { q({ k: "missed", why }); s.noted = true } }
  const kind = () => (s.st === "Releasing" || s.st === "Released" ? "unplaced" : "placed") as "placed" | "unplaced"
  const arm = (id: string, ms: number) => c.push({ k: "arm", id, ms })
  const idle = () => arm("idle", cfg.idleMs)
  const pump = () => {
    while (!s.inFlight && s.Q.length) {
      const [x, ...r] = s.Q; s.Q = r
      if (x.k === "settle") { s.w = applyTurn(s.w, x, "placed"); continue }
      s.inFlight = true; c.push({ k: "mail", d: x })
    }
    if (!s.inFlight && !s.Q.length && s.want !== undefined && s.st === "Repairing") { c.push({ k: "read", rd: s.rd, from: s.rdFrom, next: s.want }); s.want = undefined }
  }
  const abandon = () => { if (s.st === "Repairing") c.push({ k: "abort" }); s.rd++; s.buf = []; s.lastRead = undefined; s.want = undefined }
  const startRead = (from?: number) => { s.st = "Repairing"; s.buf = []; s.lastRead = undefined; s.prevNext = undefined; s.emptyRun = 0; s.rdFrom = from; s.rd++; c.push({ k: "read", rd: s.rd, from }) }
  const closeConn = () => { s.conn++; c.push({ k: "close" }) }
  const end = (f: string) => { for (const id of ["idle", "healthy", "backoff"]) c.push({ k: "disarm", id }); closeConn(); s.st = "Ended"; q({ k: "failure", f }); pump() }
  const connect = () => {
    s.wiped = false; s.greeted = undefined; s.noted = false
    rdb("b.filled"); const b = s.w.b
    if (cfg.fills !== false && b && b.filled && E()) { s.wiped = true; s.w = { ...s.w, b: { at: undefined, filled: false } } }   // at once
    rdb("b.at"); s.claim = s.w.b?.at
    s.conn++; s.st = "Connecting"; s.regIn = false; c.push({ k: "open", conn: s.conn, from: s.claim }); idle()
  }
  const lose = (e: string) => {
    abandon(); const ls = s.liveSince; s.liveSince = undefined
    c.push({ k: "disarm", id: "idle" }, { k: "disarm", id: "healthy" })
    if (!cfg.reconnect) return end(e)
    if (e !== "Silent" && ls !== undefined && now - ls < cfg.healthyMs) s.flaps++
    if (s.flaps >= cfg.flapMax) return end("Flapping")
    closeConn(); s.st = "Waiting"; s.regIn = false; arm("backoff", cfg.backoff(s.n++))
  }
  const complete = (through?: number) => {
    q({ k: "settle", p: through ?? s.lastRead ?? s.greeted })
    for (const v of s.buf) q({ k: "value", v })
    s.buf = []; s.st = "Live"
  }
  const register = (f: Extract<Frame, { t: "live" }>) => {
    const first = !s.regIn; s.regIn = true; s.noted = false; s.owed = false; s.liveSince = now
    idle(); arm("healthy", cfg.healthyMs)
    rdb("b.exists"); const b = s.w.b, e = E(), C = cfg.catchUp
    const settleHead = () => { if (f.head !== undefined && b?.at === undefined) q({ k: "settle", p: f.head }) }
    if (f.restartAt !== undefined) {                                                         // T2 rows 1, 2
      if (!b && e) { s.w = { ...s.w, b: { at: f.restartAt, filled: false } } } else { notice("Reset"); q({ k: "settle", p: f.restartAt }) }
      if (C) startRead(f.restartAt); else s.st = "Live"
    } else if (!b && e) {                                                                    // row 3: first open
      if (C) { s.greeted = f.head; startRead(undefined) } else { s.w = { ...s.w, b: { at: f.head, filled: false } }; s.st = "Live" }
    } else if (f.proof !== undefined && (s.claim !== undefined || !first)) s.st = "Live"      // row 4
    else if (s.wiped && first) {                                                             // row 5
      if (C) { s.greeted = f.head; startRead(undefined) } else { notice("Unproven"); settleHead(); s.st = "Live" }
    } else if (b && b.at !== undefined) {                                                    // row 6
      if (C) startRead(b.at); else { notice("Unproven"); s.st = "Live" }
    } else {                                                                                 // row 7
      if (!b) s.w = { ...s.w, b: { at: undefined, filled: !e } }
      notice("Unproven"); if (C) { s.greeted = f.head; startRead(undefined) } else { settleHead(); s.st = "Live" }
    }
  }
  const release = () => {
    if (s.st === "Releasing" || s.st === "Released") return
    abandon(); for (const id of ["idle", "healthy", "backoff"]) c.push({ k: "disarm", id })
    closeConn(); s.st = "Releasing"
    for (const d of s.Q) s.w = discard(s.w, d)
    s.Q = []; arm("close", cfg.closeMs)
  }
  const onValue = (v: Item) => {
    if (s.st === "Connecting") { register({ t: "live" }); onValue(v); return }
    if (s.st !== "Dropped") idle()
    if (s.st === "Live") q({ k: "value", v })
    else if (s.st === "Repairing") s.buf = [...s.buf, v]
    else if (s.st === "Dropped") {
      rdb("b.exists"); if (!s.w.b && E()) s.w = { ...s.w, b: { at: undefined, filled: false } }
      else if (!s.owed) { s.noted = false; notice("Unproven"); s.owed = true }
      q({ k: "value", v })
    }
  }
  const down = (r: string) => {
    if (s.st === "Repairing") abandon()
    if (s.st === "Dropped") { s.owed = false; return }
    s.st = "Dropped"; s.liveSince = undefined; c.push({ k: "disarm", id: "idle" })
  }
  const frame = (f: Frame) => {
    const st = s.st
    switch (f.t) {
      case "live":
        if (st === "Repairing") {
          if (f.proof !== undefined && f.restartAt === undefined) break                       // evidence; stay
          abandon(); if (f.restartAt === undefined) { rdb("b.at"); startRead(s.w.b?.at); break }           // restart from b.at, no second notice
        }
        register(f); break
      case "ping": if (st === "Live" || st === "Repairing") idle(); break          // not in Connecting
      case "value": onValue(f.v); break
      case "down": down(f.r); break
      case "fail": lose(f.e); break
      case "end": lose("Closed"); break
    }
  }
  switch (i.k) {
    case "start": connect(); break
    case "frame": if (i.conn === s.conn && ["Connecting", "Live", "Repairing", "Dropped"].includes(s.st)) frame(i.f); break
    case "timer":
      if (i.id === "idle" && ["Connecting", "Live", "Repairing"].includes(s.st)) lose("Silent")
      else if (i.id === "healthy" && (s.st === "Live" || s.st === "Repairing")) { s.n = 0; s.flaps = 0 }
      else if (i.id === "backoff" && s.st === "Waiting") connect()
      else if (i.id === "close" && s.st === "Releasing") s.st = "Released"
      break
    case "page": {
      if (i.rd !== s.rd || s.st !== "Repairing") break
      const p = i.p
      const items = p.items ?? []
      if (p.t === "gone") notice("Lost")
      for (const it of items) q({ k: "item", v: it })
      if (items.length) s.lastRead = items[items.length - 1].cursor
      if (p.t === "more") {
        if (p.through !== undefined) q({ k: "settle", p: p.through })
        if (p.next === s.prevNext || (!items.length && s.emptyRun >= 1)) { abandon(); end("PageStalled") }
        else { s.prevNext = p.next; s.emptyRun = items.length ? 0 : s.emptyRun + 1; s.want = p.next }
      } else if (p.t === "done" || !p.next) complete(p.through)
      else { if (p.through !== undefined) q({ k: "settle", p: p.through }); s.want = p.next }
      break
    }
    case "turn": {
      s.inFlight = false
      if (s.st === "Releasing" || s.st === "Released") { s.w = discard(s.w, i.d); for (const d of s.Q) s.w = discard(s.w, d); s.Q = [] }
      else s.w = applyTurn(s.w, i.d, "placed")
      break
    }
    case "ext":
      if (i.x === "clear") s.w = applyTurn(s.w, { k: "clear" }, kind())
      else { if (i.x === "clearRelease") s.w = applyTurn(s.w, { k: "clear" }, "releasing"); release() }
      break
  }
  pump()
  return [s, c]
}

// The driver: executes commands, feeds inputs back. No decisions.
export const formA: Form = (env: Env, cfg, w) => {
  let s = init(w), dead = false; const reads: Record<string, number> = {}; let pendingReads = 0
  const timers = new Map<string, () => void>(); let link: { close(): void } | undefined; let cancelRead: (() => void) | undefined
  const probe: Probe = (site, pending) => { reads[site] = (reads[site] ?? 0) + 1; if (pending) { pendingReads++; reads[site + "!"] = (reads[site + "!"] ?? 0) + 1 } }
  const feed = (i: In) => {
    if (dead) return
    const [n, cmds] = stepA(cfg, s, i, env.sim.now, probe); s = n
    for (const x of cmds) exec(x)
  }
  const exec = (x: Cmd) => {
    switch (x.k) {
      case "open": link = env.open(x.from, (f) => feed({ k: "frame", conn: x.conn, f })); break
      case "close": link?.close(); break
      case "arm": timers.get(x.id)?.(); timers.set(x.id, env.sim.at(x.ms, () => feed({ k: "timer", id: x.id }))); break
      case "disarm": timers.get(x.id)?.(); timers.delete(x.id); break
      case "read": { const rd = x.rd; cancelRead = env.read(x.from, x.next, (p) => feed({ k: "page", rd, p })); break }
      case "abort": cancelRead?.(); break
      case "mail": env.sim.at(1, () => feed({ k: "turn", d: x.d })); break
    }
  }
  const [s1, cmds] = stepA(cfg, s, { k: "start" }, env.sim.now, probe); s = s1; for (const x of cmds) exec(x)
  return {
    ext: (x) => feed({ k: "ext", x }), world: () => s.w, row: () => rowOf(s), drain() {}, reads, get pendingReads() { return pendingReads },
    dispose() { dead = true; for (const t of timers.values()) t(); link?.close() },
  }
}
