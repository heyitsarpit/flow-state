// S5 throwaway: stream session T1 as data in a pure step (Form A) versus a fiber per session (Form B). Run: bun main.ts
import { defaultCfg, run, key, type Cfg, type Form, type Frame, type Item, type Obs, type Page, type Scn } from "./shared.ts"
import { formA } from "./formA.ts"
import { formB } from "./formB.ts"

const it = (c: number): Item => ({ id: `m${c}`, cursor: c })
const fr = (dt: number, f: Frame) => ({ dt, f })
const val = (dt: number, c: number) => fr(dt, { t: "value", v: it(c) })
const live = (dt: number, o: { head?: number; proof?: string; restartAt?: number } = {}) => fr(dt, { t: "live", ...o })
const noRead = (): Page => ({ t: "done", items: [], proof: "empty room" })
// A history server with L items; pages of 2, oldest first, `through` at the end.
const L = 6
const serverRead = (from: number | undefined, next: number | undefined): Page => {
  const idx = next ?? from ?? 0, items = [] as Item[]
  for (let c = idx + 1; c <= Math.min(L, idx + 2); c++) items.push(it(c))
  return idx + 2 >= L ? { t: "done", items, proof: "server said reached from", through: L } : { t: "more", items, next: idx + 2 }
}
const cfg = (o: Partial<Cfg> = {}): Cfg => ({ ...defaultCfg, ...o })
const one = (until: number, ext: Scn["phases"][0]["ext"] = []) => [{ until, ext }]

// ── Named scenarios. `want` is hand-derived from machine-design.md 2.11.11 (T1, T2, T3), not from either form.
interface Named { scn: Scn; want?: { log?: string[]; opens?: (number | undefined)[]; bAt?: number | "none"; bFilled?: boolean | "none" } }
const NAMED: Named[] = [
  { scn: { name: "connect-register-every (desk activity shape, no catchUp)", cfg: cfg({ catchUp: false }), phases: one(100),
      conns: [[live(5, { head: 0 }), val(10, 1), val(20, 2), val(30, 3)]], read: noRead },
    want: { log: ["value:m1", "value:m2", "value:m3"], opens: [undefined], bAt: 3, bFilled: true } },
  { scn: { name: "first-open-with-catchUp: value buffers during the read", cfg: cfg(), phases: one(200),
      conns: [[live(5, { head: 2 }), val(7, 3)]], read: (f, n): Page => n === undefined ? { t: "more", items: [it(1)], next: 1 } : { t: "done", items: [it(2)], proof: "reached", through: 2 } },
    want: { log: ["item:m1", "item:m2", "value:m3"], opens: [undefined], bAt: 3, bFilled: true } },
  { scn: { name: "drop, backoff, reconnect with proof: no notice", cfg: cfg({ catchUp: false }), phases: one(400),
      conns: [[live(5), val(10, 1), val(20, 2), fr(40, { t: "fail", e: "SocketDropped" })], [live(5, { proof: "replayed from 2" }), val(10, 3)]], read: noRead },
    want: { log: ["value:m1", "value:m2", "value:m3"], opens: [undefined, 2], bAt: 3, bFilled: true } },
  { scn: { name: "drop, reconnect without proof, no catchUp: one notice", cfg: cfg({ catchUp: false }), phases: one(400),
      conns: [[live(5), val(10, 1), val(20, 2), fr(40, { t: "fail", e: "SocketDropped" })], [live(5), val(10, 3)]], read: noRead },
    want: { log: ["value:m1", "value:m2", "missed:Unproven", "value:m3"], opens: [undefined, 2], bAt: 3, bFilled: true } },
  { scn: { name: "catch-up repair with buffering after a drop", cfg: cfg(), phases: one(600),
      conns: [[live(5, { head: 0 }), val(10, 1), val(20, 2), fr(40, { t: "fail", e: "SocketDropped" })], [live(5), val(7, 9)]],
      read: (f, n, no): Page => no === 0 ? { t: "done", items: [], proof: "first load", through: 0 } : n === undefined ? { t: "more", items: [it(3), it(4)], next: 4 } : { t: "done", items: [it(5), it(6)], proof: "reached 2", through: 6 } },
    want: { log: ["value:m1", "value:m2", "item:m3", "item:m4", "item:m5", "item:m6", "value:m9"], opens: [undefined, 2], bAt: 9, bFilled: true } },
  { scn: { name: "release while waiting (backoff running)", cfg: cfg({ catchUp: false }), phases: one(400, [{ t: 60, x: "release" }]),
      conns: [[live(5), val(10, 1), fr(40, { t: "fail", e: "SocketDropped" })], [live(5), val(10, 2)]], read: noRead },
    want: { log: ["value:m1"], opens: [undefined], bAt: 1 } },
  { scn: { name: "Feed.ping keeps a live connection; ping before register does not re-arm; silence ends Silent and reconnects", cfg: cfg({ catchUp: false, idleMs: 100 }), phases: one(710),
      conns: [[live(20), fr(80, { t: "ping" }), fr(140, { t: "ping" }), fr(200, { t: "ping" })], [fr(50, { t: "ping" })]], read: noRead },
    want: { opens: [undefined, undefined, undefined] } },
  { scn: { name: "reload restores the bookmark (two runtimes)", cfg: cfg({ catchUp: false }), phases: [{ until: 100, ext: [] }, { until: 300, ext: [] }],
      conns: [[live(5, { head: 0 }), val(10, 1), val(20, 2), val(30, 3)], [live(5, { proof: "replayed from 3" }), val(10, 4)]], read: noRead },
    want: { log: ["value:m1", "value:m2", "value:m3", "value:m4"], opens: [undefined, 3], bAt: 4, bFilled: true } },
  { scn: { name: "clear while placed stays cleared across a drop (fills cleared)", cfg: cfg({ catchUp: true }), phases: one(500, [{ t: 50, x: "clear" }]),
      conns: [[live(5), val(10, 1), val(20, 2), fr(70, { t: "fail", e: "SocketDropped" })], [live(5, { proof: "replayed" })]], read: noRead },
    want: { log: ["value:m1", "value:m2", "clear"], opens: [undefined, 2], bAt: 2, bFilled: false } },
  { scn: { name: "clear and release in one turn, then reload: wiped, catchUp re-reads", cfg: cfg({ catchUp: true }), phases: [{ until: 100, ext: [{ t: 50, x: "clearRelease" }] }, { until: 400, ext: [] }],
      conns: [[live(5, { head: 0 }), val(10, 1), val(20, 2)], [live(5, { head: 2 })]], read: (f, n, no): Page => no === 0 ? noRead() : { t: "done", items: [it(1), it(2)], proof: "from start", through: 2 } },
    want: { log: ["value:m1", "value:m2", "clear", "item:m1", "item:m2"], opens: [undefined, undefined], bAt: 2, bFilled: true } },
  { scn: { name: "same wipe without catchUp: one Unproven notice", cfg: cfg({ catchUp: false }), phases: [{ until: 100, ext: [{ t: 50, x: "clearRelease" }] }, { until: 400, ext: [] }],
      conns: [[live(5, { head: 0 }), val(10, 1), val(20, 2)], [live(5, { head: 2 })]], read: noRead },
    want: { log: ["value:m1", "value:m2", "clear", "missed:Unproven"], opens: [undefined, undefined], bAt: 2 } },
  { scn: { name: "clear while NOT placed (after release) is a wipe too", cfg: cfg({ catchUp: false }), phases: [{ until: 100, ext: [{ t: 40, x: "release" }, { t: 50, x: "clear" }] }, { until: 400, ext: [] }],
      conns: [[live(5, { head: 0 }), val(10, 1), val(20, 2)], [live(5, { head: 2 })]], read: noRead },
    want: { log: ["value:m1", "value:m2", "clear", "missed:Unproven"], opens: [undefined, undefined] } },
  { scn: { name: "desk activity: reset frame -> restartAt (T2 rows 1/2) then catchUp reads from it", cfg: cfg(), phases: one(400),
      conns: [[live(5, { head: 0 }), val(10, 1), live(20, { restartAt: 0 })]], read: (f, n): Page => ({ t: "done", items: [], proof: "from restart", through: f }) },
    want: { log: ["value:m1", "missed:Reset"] } },
  { scn: { name: "presence typing: SDK heals itself (down, no reconnect), every, no position", cfg: cfg({ catchUp: false, reconnect: false }), phases: one(300),
      conns: [[live(5), val(10, 1), fr(20, { t: "down", r: "offline" }), val(30, 2), val(40, 3), live(50, { proof: "p" }), val(60, 4), fr(80, { t: "fail", e: "ChannelFailed" })]], read: noRead },
    want: { log: ["value:m1", "missed:Unproven", "value:m2", "value:m3", "value:m4", "failure:ChannelFailed"] } },
  { scn: { name: "flapping: 3 registered flaps in a row end Flapping", cfg: cfg({ catchUp: false, flapMax: 3 }), phases: one(3000),
      conns: [[live(5), fr(6, { t: "fail", e: "SocketDropped" })], [live(5), fr(6, { t: "fail", e: "SocketDropped" })], [live(5), fr(6, { t: "fail", e: "SocketDropped" })]], read: noRead },
    want: { opens: [undefined, undefined, undefined] } },
]
// Fix the two hand-written `want`s that were sketched loosely above.
NAMED[12].want = { log: ["value:m1", "missed:Reset"] }
NAMED[14].want = { log: ["missed:Unproven", "missed:Unproven", "failure:Flapping"], opens: [undefined, undefined, undefined] }   // no head on the wire: one notice per reconnect (2.11.10)

const forms: Record<string, Form> = { A: formA, "B-sync": formB(), "B-queued0": formB({ queued: 0 }), "B-queued1": formB({ queued: 1 }), "B-queued3": formB({ queued: 3 }), "B-rand7": formB({ seed: 7 }) }
const show = (o: Obs) => `log=[${o.log.join(" ")}] disc=[${o.discarded.join(" ")}] opens=[${o.opens.map((x) => x ?? "-").join(",")}] b=(${o.bAt},${o.bFilled}) row=${o.row ?? "-"} msgs=[${o.messages.join(" ")}]`

console.log("== 1. named scenarios: each form against the hand-written expectation, and against form A ==")
for (const { scn, want } of NAMED) {
  const outs = Object.fromEntries(Object.entries(forms).map(([n, f]) => [n, run(f, scn)]))
  const bad = (o: Obs) => !want ? [] : [want.log && JSON.stringify(want.log) !== JSON.stringify(o.log) ? "log" : "", want.opens && JSON.stringify(want.opens) !== JSON.stringify(o.opens) ? "opens" : "", want.bAt !== undefined && want.bAt !== o.bAt ? "bAt" : "", want.bFilled !== undefined && want.bFilled !== o.bFilled ? "bFilled" : ""].filter(Boolean)
  console.log(`- ${scn.name}`)
  console.log(`    A       ${show(outs.A)}`)
  for (const [n, o] of Object.entries(outs)) { const d = key(o) !== key(outs.A) ? " DIFFERS-FROM-A" : "", w = bad(o); if (d || w.length) console.log(`    ${n.padEnd(8)}${d}${w.length ? " VS-EXPECTED:" + w.join(",") : ""}${d ? "  " + show(o) : ""}`) }
}

// ── 2. seeded interleavings: a drop against values against a release (and a clear, and sometimes a reload)
const rng = (seed: number) => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function gen(seed: number, C: boolean, reload: boolean): Scn {
  const r = rng(seed * 7 + (C ? 1 : 0)), int = (n: number) => Math.floor(r() * n), T = () => 6 + int(14)   // 6..19: ties are common
  let c = 0
  const shuffleTies = (xs: { dt: number; f: Frame }[]) => xs.map((x) => ({ x, k: r() })).sort((a, b) => a.x.dt - b.x.dt || a.k - b.k).map((z) => z.x)
  const conn0 = [live(5, r() < 0.5 ? { head: 0 } : {})]
  for (let i = 0, n = 1 + int(3); i < n; i++) conn0.push(val(T(), ++c))
  conn0.push(fr(T(), { t: "fail", e: "SocketDropped" }))
  const conn1 = [live(3 + int(5), r() < 0.5 ? { proof: "replayed" } : {})]
  for (let i = 0, n = int(3); i < n; i++) conn1.push(val(6 + int(9), ++c))
  const tr = [10 + int(20), 100 + int(30), 105 + int(25), 300, -1][int(5)]
  const ext: Scn["phases"][0]["ext"] = []
  if (tr > 0) ext.push({ t: tr, x: r() < 0.2 ? "clearRelease" : "release" })
  if (r() < 0.4) ext.push({ t: 8 + int(30), x: "clear" })
  const phases = reload ? [{ until: 40 + int(100), ext }, { until: 500, ext: [] }] : [{ until: 500, ext }]
  return { name: `seed${seed}${C ? "C" : ""}${reload ? "R" : ""}`, cfg: cfg({ catchUp: C }), extFirst: r() < 0.5, conns: [shuffleTies(conn0), shuffleTies(conn1), shuffleTies([live(4, { proof: "x" }), val(8, ++c)])], read: serverRead, phases }
}
const FIELDS = ["log", "discarded", "opens", "bAt", "bFilled", "row", "messages"] as const
const firstDiff = (a: Obs, b: Obs) => FIELDS.find((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]))
function invariants(o: Obs, C: boolean, multi: boolean): string[] {
  const bad: string[] = []
  const notices = o.log.filter((x) => x.startsWith("missed:")).length
  if (notices > o.opens.length) bad.push("I1:more-notices-than-connections")
  if (!C && !multi) { const seen = new Set(o.log.concat(o.discarded).map((x) => x.split(":")[1])); for (const e of o.emitted) if (!seen.has(e.id)) bad.push(`I2:value ${e.id} emitted and neither delivered nor discarded`) }
  return bad
}
const N = 600
console.log(`\n== 2. ${N} seeds x {catchUp off, on} x {no reload, reload}: forms against A (same inputs) ==`)
const stat: Record<string, { runs: number; diff: number; byField: Record<string, number>; example?: string }> = {}
const invFlags: Record<string, number> = {}
let runs = 0
for (let seed = 0; seed < N; seed++) for (const C of [false, true]) for (const reload of [false, true]) {
  const scn = gen(seed, C, reload), a = run(formA, scn); runs++
  for (const f of invariants(a, C, reload)) invFlags["A " + f.slice(0, 2)] = (invFlags["A " + f.slice(0, 2)] ?? 0) + 1
  for (const n of ["B-sync", "B-queued0", "B-queued1", "B-queued3", "B-rand7"]) {
    const o = run(forms[n], scn), s = (stat[n] ??= { runs: 0, diff: 0, byField: {} }); s.runs++
    for (const f of invariants(o, C, reload)) invFlags[n + " " + f.slice(0, 2)] = (invFlags[n + " " + f.slice(0, 2)] ?? 0) + 1
    if (key(o) !== key(a)) { s.diff++; const f = firstDiff(a, o)!; s.byField[f] = (s.byField[f] ?? 0) + 1; if (!s.example || scn.name.length < s.example.split("\n")[0].length) s.example = `${scn.name}\n      A: ${show(a)}\n      ${n}: ${show(o)}` }
  }
}
console.log(`runs per form: ${runs}`)
{ const cov = { missed: 0, discard: 0, reconnect: 0, release: 0, ended: 0, repair: 0 }
  for (let seed = 0; seed < N; seed++) for (const C of [false, true]) for (const reload of [false, true]) { const o = run(formA, gen(seed, C, reload)); if (o.log.some((x) => x.startsWith("missed"))) cov.missed++; if (o.discarded.length) cov.discard++; if (o.opens.length > 1) cov.reconnect++; if (!o.row) cov.release++; if (o.row === "Ended") cov.ended++; if (o.log.some((x) => x.startsWith("item"))) cov.repair++ }
  console.log("coverage of form A's runs (of", runs, "):", JSON.stringify(cov)) }
for (const [n, s] of Object.entries(stat)) console.log(`${n}: ${s.diff} of ${s.runs} differ from A; first differing field ${JSON.stringify(s.byField)}${s.example ? "\n    shortest example " + s.example : ""}`)
console.log("invariant flags on unmutated runs:", JSON.stringify(invFlags))

// ── 3. mutation sanity: a dropped delivery and a double notice, injected into form A's driver only
console.log("\n== 3. mutation sanity (injected into A's driver; checked by differential vs B-sync, by golden expectation, by invariants) ==")
import * as FA from "./formA.ts"
type Mut = "none" | "drop" | "double"
// The driver wraps `feed`; to inject cleanly we re-run stepA through a tiny copy of the driver loop.
const injected = (m: Mut): Form => (env, cfg, w) => {
  let s = FA.init(w), dead = false, seen = 0; const timers = new Map<string, () => void>(); let link: { close(): void } | undefined; let cancelRead: (() => void) | undefined
  const probe = () => {}
  const feed = (i0: FA.In) => {
    if (dead) return
    let i = i0
    if (m === "drop" && i.k === "turn" && i.d.k === "value" && ++seen === 2) i = { k: "turn", d: { k: "settle", p: undefined } }
    const reps = m === "double" && i.k === "turn" && i.d.k === "missed" ? 2 : 1
    for (let r = 0; r < reps; r++) { const [n, cmds] = FA.stepA(cfg, s, i, env.sim.now, probe); s = n; if (r === 0) for (const x of cmds) exec(x) }
  }
  const exec = (x: any) => {
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
  const [s1, c1] = FA.stepA(cfg, s, { k: "start" }, env.sim.now, probe); s = s1; for (const x of c1) exec(x)
  return { ext: (x) => feed({ k: "ext", x }), world: () => s.w, row: () => FA.rowOf(s), drain() {}, reads: {}, pendingReads: 0, dispose() { dead = true; for (const t of timers.values()) t(); link?.close() } }
}
const tally: Record<string, { runs: number; diff: number; golden: number; inv: number }> = {}
const probeScns: { scn: Scn; want?: Named["want"]; C: boolean; multi: boolean }[] = NAMED.map((n) => ({ scn: n.scn, want: n.want, C: n.scn.cfg.catchUp, multi: n.scn.phases.length > 1 }))
for (let seed = 0; seed < 150; seed++) for (const C of [false, true]) probeScns.push({ scn: gen(seed, C, false), C, multi: false })
for (const m of ["none", "drop", "double"] as Mut[]) {
  const t = (tally[m] = { runs: 0, diff: 0, golden: 0, inv: 0 })
  for (const { scn, want, C, multi } of probeScns) {
    const o = run(injected(m), scn), ref = run(formB(), scn); t.runs++
    if (key(o) !== key(ref)) t.diff++
    if (want && ((want.log && JSON.stringify(want.log) !== JSON.stringify(o.log)) || (want.opens && JSON.stringify(want.opens) !== JSON.stringify(o.opens)))) t.golden++
    if (invariants(o, C, multi).length) t.inv++
  }
}
for (const [m, t] of Object.entries(tally)) console.log(`${m.padEnd(7)} runs ${t.runs}: flagged by differential ${t.diff}, by golden ${t.golden} (of ${NAMED.length} named), by invariants ${t.inv}`)
// How many runs a mutation could even act on (a 2nd value delivered; a notice delivered), to read the rates above
let canDrop = 0, canDouble = 0
for (const { scn } of probeScns) { const o = run(formA, scn); if (o.log.filter((x) => x.startsWith("value:")).length >= 2) canDrop++; if (o.log.some((x) => x.startsWith("missed:"))) canDouble++ }
console.log(`runs where the mutation has something to act on: drop ${canDrop}, double ${canDouble}`)

// ── 4. which reads cross between the fiber and the world (dynamic counts over every run above) and how often one is taken with a delivery pending
console.log("\n== 4. reads across the A/B boundary: sites, counts, and reads taken while a delivery was queued or in flight ==")
{
  const agg = (f: Form) => { const r: Record<string, number> = {}; let pend = 0, total = 0
    const all: Scn[] = [...NAMED.map((n) => n.scn)]; for (let s = 0; s < 200; s++) for (const C of [false, true]) for (const rl of [false, true]) all.push(gen(s, C, rl))
    for (const scn of all) { const o = run(f, scn); for (const [k, v] of Object.entries(o.reads)) { r[k] = (r[k] ?? 0) + v; if (!k.endsWith("!")) total += v } pend += o.pendingReads }
    return { r, pend, total } }
  for (const [n, f] of [["A", formA], ["B-sync", formB()]] as const) { const x = agg(f); console.log(`${n}: ${x.total} reads, ${x.pend} with a delivery pending; by site (name! = taken with a delivery pending) ${JSON.stringify(x.r)}`) }
}

// ── 5. fills: the same wipe and clear scenarios with the wipe check switched off (what a trimmed bookmark would do)
console.log("\n== 5. fills on versus off (connect's wipe check removed), A and B-sync ==")
for (const { scn } of NAMED.filter((n) => /clear|wipe/i.test(n.scn.name))) {
  const off = { ...scn, cfg: { ...scn.cfg, fills: false } }
  const a1 = run(formA, scn), a0 = run(formA, off), b0 = run(formB(), off)
  console.log(`- ${scn.name}\n    on : ${show(a1)}\n    off: ${show(a0)}${key(a0) !== key(b0) ? "\n    B-off DIFFERS " + show(b0) : ""}`)
}

// ── 6. cost per delivery. Bun only, one process, unforced GC, wall clock; ids cycle over 100 so memory stays small
console.log("\n== 6. cost per delivery (Bun only) ==")
{
  const NV = 20000
  const big = (): Scn => ({ name: "perf", cfg: cfg({ catchUp: false, idleMs: 1e9, healthyMs: 1e9 }), read: noRead, phases: one(NV + 100), conns: [[live(1, { head: 0 }), ...Array.from({ length: NV }, (_, i) => fr(2 + i, { t: "value", v: { id: `m${i % 100}`, cursor: i + 1 } as Item }))]] })
  const floor: Form = (env) => { const l = env.open(undefined, () => env.sim.at(1, () => {})); return { ext() {}, world: () => ({ messages: [], log: [], discarded: [] }), row: () => "Live", drain() {}, reads: {}, pendingReads: 0, dispose: () => l.close() } }
  const med = (f: Form) => { const xs: number[] = []; for (let i = 0; i < 7; i++) { const sc = big(); const t0 = performance.now(); const o = run(f, sc); xs.push((performance.now() - t0) * 1000 / NV); if (i === 0 && f !== floor && o.log.length !== NV) console.log("   !! delivered", o.log.length) } return xs.sort((a, b) => a - b)[3] }
  console.log(`floor (harness: frame event + mailbox event, no session) ${med(floor).toFixed(2)} us/delivery`)
  console.log(`A ${med(formA).toFixed(2)} us/delivery   B-sync ${med(formB()).toFixed(2)} us/delivery   (N=${NV}, median of 7, Bun ${(globalThis as any).Bun?.version})`)
}

// ── 7. lines per form
console.log("\n== 7. lines (non-blank, non-comment-only) ==")
{
  const fs = await import("node:fs")
  const n = (f: string) => fs.readFileSync(new URL(f, import.meta.url), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length
  const kw = (f: string, re: RegExp) => fs.readFileSync(new URL(f, import.meta.url), "utf8").split("\n").filter((l) => re.test(l)).length
  console.log(`formA.ts ${n("./formA.ts")}  formB.ts ${n("./formB.ts")}  shared.ts ${n("./shared.ts")} (harness + the turn)  main.ts ${n("./main.ts")}`)
  console.log(`lines mentioning filled/fills/wiped/unplaced/releasing: A ${kw("./formA.ts", /filled|fills|wiped|unplaced|releasing/)}, B ${kw("./formB.ts", /filled|fills|wiped|unplaced|releasing/)}, shared turn ${kw("./shared.ts", /filled|unplaced|releasing/)}`)
}
