// An executable model of entity-domain.md section 5, fuzzed against a fake server.
// One versioned entity, Note { id, folder, title, pinned, v }. Answers: list(folder) with
// .where(folder) .orderBy(pinned desc, title, id); count(pinned); loader get(id).
// The client follows the store rules; the checker compares with the server at quiet points.

const FOLDERS = ["A", "B"], IDS = ["n1", "n2", "n3", "n4"], TITLES = ["a", "b", "c", "d"]

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

export function run(seed, opts = {}) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], chance = (p) => r() < p
  const steps = opts.steps ?? 40, omitTitle = opts.omitTitle ?? true
  const log = [], fail = (msg) => { throw Object.assign(new Error(msg), { log, seed }) }
  // ---------------- server ----------------
  const server = new Map()
  for (const id of IDS.slice(0, 3)) server.set(id, { id, folder: pick(FOLDERS), title: pick(TITLES), pinned: chance(0.5), v: 1 })
  const sList = (f) => [...server.values()].filter((n) => n.folder === f)
    .sort((x, y) => (y.pinned - x.pinned) || x.title.localeCompare(y.title) || x.id.localeCompare(y.id)).map((n) => ({ ...n }))
  const sCount = () => [...server.values()].filter((n) => n.pinned).length
  // ---------------- client ----------------
  let seq = 0                       // the client's position counter
  const store = new Map()           // id -> { base, v, preds: [{ att, fields, hide, settledAt?, unconfirmed:Set }], uncertain }
  const answers = new Map()         // key -> answer
  const queues = new Map()          // id -> [write]
  const net = []                    // in-flight messages
  let attempts = 0, lookups = 0, lateApplied = new Set()
  const mkAnswer = (key, kind, arg) => ({ key, kind, arg, data: null, frontier: -1, lastMatch: -1, stale: "initial",
    inflight: null, trailing: null })
  for (const f of FOLDERS) answers.set("L:" + f, mkAnswer("L:" + f, "list", f))
  answers.set("C", mkAnswer("C", "count"))
  for (const id of IDS) answers.set("G:" + id, mkAnswer("G:" + id, "get", id))

  const visible = (id) => {
    const rec = store.get(id); if (!rec || !rec.base) return undefined
    let v = { ...rec.base }, hidden = false
    for (const p of rec.preds) { if (p.hide) hidden = true; Object.assign(v, p.fields) }
    return hidden ? undefined : v
  }
  const holds = (a, id) => a.kind === "list" ? !!a.data?.includes(id) : a.kind === "get" ? a.arg === id : false
  // ---- the join (section 2.3) ----
  const matches = (a, oldR, newR) => {
    if (a.kind === "list") {
      const i0 = !!oldR && oldR.folder === a.arg, i1 = !!newR && newR.folder === a.arg
      if (i0 !== i1) return true
      return i0 && i1 && (oldR.title !== newR.title || oldR.pinned !== newR.pinned)
    }
    if (a.kind === "count") return (!!oldR && oldR.pinned) !== (!!newR && newR.pinned)
    if (a.kind === "get") return a.arg === (oldR ?? newR)?.id && !newR // .one repairs only on delete
    return false
  }
  // ---- repair scheduling: one in flight, one waiting ----
  const repair = (a, cause) => {
    a.lastMatch = seq
    if (!a.stale) a.stale = cause
    if (a.inflight) { a.trailing = cause; return }
    startLookup(a, 1, cause)
  }
  const markObserved = (a) => { a.lastMatch = seq; if (!a.stale) a.stale = "observed" } // no lookup (C3)
  const startLookup = (a, depth, cause) => {
    lookups++; if (lookups > 4000) fail("lookup storm")
    const L = { a: a.key, depth, cause, start: seq, id: lookups }
    a.inflight = L
    net.push({ kind: "lookup", L, phase: "request" })
  }
  // a base change, from any source (section 5.1)
  const applyBase = (id, incoming, onDelta) => {
    let rec = store.get(id)
    if (!rec) { rec = { base: undefined, v: 0, preds: [], uncertain: false, tomb: 0 }; store.set(id, rec) }
    if (incoming === null) { // a delete
      if (!rec.base) return
      const old = rec.base; rec.base = undefined; rec.tomb = rec.v + 1e9; seq++; onDelta(old, null); return
    }
    if (incoming.v <= rec.v || incoming.v <= rec.tomb) return // ordering rule: strictly greater wins
    if (rec.vHist !== undefined && incoming.v < rec.vHist) fail("C4: a base version moved backwards")
    const old = rec.base; rec.base = { id, folder: incoming.folder, title: incoming.title, pinned: incoming.pinned }
    rec.v = incoming.v; rec.vHist = incoming.v; seq++
    if (!old || old.folder !== rec.base.folder || old.title !== rec.base.title || old.pinned !== rec.base.pinned) onDelta(old, rec.base)
  }
  const joinAll = (oldR, newR, act, except) => { for (const a of answers.values()) if (a !== except && matches(a, oldR, newR)) act(a) }

  // ---- confirmation (section 5.5) ----
  const confirm = (id, readStart, carried) => {
    const rec = store.get(id); if (!rec) return
    rec.preds = rec.preds.filter((p) => {
      if (p.settledAt === undefined || p.uncertain) return true
      if (readStart < p.settledAt) return true
      for (const f of [...p.unconfirmed]) if (carried.includes(f)) { p.unconfirmed.delete(f); delete p.fields[f] }
      return p.unconfirmed.size > 0
    })
  }
  const retireOlder = (id, w, fields) => { // a later confirmed field retires older predictions
    const rec = store.get(id); if (!rec) return
    for (const p of rec.preds) if (p.att < w.att) for (const f of fields) { delete p.fields[f]; p.unconfirmed?.delete(f) }
    rec.preds = rec.preds.filter((p) => p.hide || Object.keys(p.fields).length > 0 || p.settledAt === undefined)
  }

  // ---------------- writes ----------------
  const startWrite = (kind, id) => {
    const rec = store.get(id); if (!rec?.base && kind !== "create") return
    const w = { att: ++attempts, kind, id, title: pick(TITLES), folder: pick(FOLDERS), pinned: chance(0.5), state: "queued" }
    const p = { att: w.att, fields: {}, hide: false, unconfirmed: new Set() }
    if (kind === "rename") p.fields.title = w.title
    if (kind === "move") p.fields.folder = w.folder
    if (kind === "pin") p.fields.pinned = w.pinned
    if (kind === "delete") p.hide = true
    w.pred = p; rec.preds.push(p)
    w.baseAtStart = rec.base ? { ...rec.base } : undefined
    const q = queues.get(id) ?? []; queues.set(id, q); q.push(w)
    log.push(`write ${w.att} ${kind} ${id} ${JSON.stringify(p.fields)}`)
    pump(id)
  }
  const pump = (id) => {
    const q = queues.get(id); if (!q?.length) return
    const w = q[0]; if (w.state !== "queued") return
    w.state = "sent"; net.push({ kind: "write", w, phase: "request" })
  }
  const releaseQueue = (id) => { const q = queues.get(id); q.shift(); pump(id) }
  const settle = (w, outcome, resp) => {
    const rec = store.get(w.id)
    w.state = outcome; w.settledAt = seq
    log.push(`settle ${w.att} ${outcome}`)
    if (outcome === "success") {
      rec.uncertain = false
      const baseBefore = w.baseAtStart
      if (w.kind === "delete") {
        rec.preds = rec.preds.filter((p) => p !== w.pred)
        applyBase(w.id, null, (o, n) => joinAll(o, n, (a) => repair(a, "write")))
        joinAll(baseBefore, null, (a) => repair(a, "write"))
      } else {
        const carried = omitTitle && w.kind === "rename" ? ["folder", "pinned"] : ["folder", "title", "pinned"]
        const baseAtSettle = rec.base ? { ...rec.base } : undefined
        const incoming = { ...resp }
        if (!carried.includes("title")) incoming.title = rec.base?.title ?? resp.title // the response omits title
        if (carried.includes("title") || rec.base) applyBase(w.id, incoming, () => {})
        // affected answers from both bases (section 5.2)
        const now = rec.base ? { ...rec.base } : undefined
        const truthOfWrite = carried.includes("title") ? now : { ...now, title: resp.title }
        joinAll(baseBefore, truthOfWrite, (a) => repair(a, "write"))
        joinAll(baseAtSettle, truthOfWrite, (a) => repair(a, "write"))
        const confirmedFields = Object.keys(w.pred.fields).filter((f) => carried.includes(f))
        retireOlder(w.id, w, confirmedFields)
        for (const f of confirmedFields) delete w.pred.fields[f]
        for (const f of Object.keys(w.pred.fields)) w.pred.unconfirmed.add(f)
        w.pred.settledAt = seq
        if (w.pred.unconfirmed.size) repair(answers.get("G:" + w.id), "confirm")
        else rec.preds = rec.preds.filter((p) => p !== w.pred)
      }
      releaseQueue(w.id)
    } else if (outcome === "failure") {
      rec.preds = rec.preds.filter((p) => p !== w.pred)
      const vis = rec.base
      const predicted = { ...(w.baseAtStart ?? {}), ...w.pred.fields }
      joinAll(predicted, vis, (a) => repair(a, "write"))
      joinAll(vis, predicted, (a) => repair(a, "write"))
      releaseQueue(w.id)
    } else if (outcome === "uncertain") {
      rec.uncertain = true; w.pred.uncertain = true
      const forced = [...answers.values()].filter((a) => holds(a, w.id) || a.kind === "count" ||
        (a.kind === "list" && (a.arg === w.baseAtStart?.folder || a.arg === w.folder)))
      w.forced = new Set(forced.map((a) => a.key))
      for (const a of forced) repair(a, "uncertain")
    }
  }

  // ---------------- message delivery ----------------
  const deliver = (m, lose) => {
    if (m.kind === "lookup" && m.phase === "request") {
      const a = answers.get(m.L.a)
      const data = a.kind === "list" ? sList(a.arg) : a.kind === "count" ? sCount() : (server.get(a.arg) ? { ...server.get(a.arg) } : null)
      net.push({ kind: "lookup", L: m.L, phase: "response", data, fail: chance(0.05) })
      return
    }
    if (m.kind === "lookup" && m.phase === "response") {
      const a = answers.get(m.L.a), L = m.L
      if (a.inflight !== L) fail("lookup response for a lookup not in flight")
      a.inflight = null
      if (!m.fail) {
        const recs = a.kind === "list" ? m.data : a.kind === "get" ? (m.data ? [m.data] : []) : []
        for (const n of recs) {
          applyBase(n.id, n, (o, nw) => {
            if (L.depth === 0) joinAll(o, nw, (b) => repair(b, "observed-by-request"), a)
            else joinAll(o, nw, (b) => markObserved(b), a)
          })
          confirm(n.id, L.start, ["folder", "title", "pinned"])
        }
        if (a.kind === "get" && !m.data && store.get(a.arg)?.base) {
          applyBase(a.arg, null, (o, nw) => joinAll(o, nw, (b) => L.depth === 0 ? repair(b, "observed-by-request") : markObserved(b), a))
        }
        if (a.kind === "get" && !m.data) { const rec = store.get(a.arg); if (rec) rec.preds = rec.preds.filter((p) => !(p.hide && p.settledAt !== undefined && L.start >= p.settledAt)) }
        a.data = a.kind === "list" ? m.data.map((n) => n.id) : a.kind === "count" ? m.data : (m.data ? m.data.id : null)
        if (a.lastMatch > L.start) { a.stale = a.stale || "fenced" } else { a.stale = false; a.frontier = L.start }
      }
      // forced repairs of uncertain writes
      for (const q of queues.values()) for (const w of q) if (w.state === "uncertain" && w.forced?.has(a.key) && L.start >= w.settledAt) {
        w.forced.delete(a.key)
        if (w.forced.size === 0) {
          const rec = store.get(w.id); rec.preds = rec.preds.filter((p) => p !== w.pred)
          w.state = "resolved"; releaseQueue(w.id)
        }
      }
      if (a.trailing) { const c = a.trailing; a.trailing = null; startLookup(a, 1, c) }
      return
    }
    if (m.kind === "write" && m.phase === "request") {
      const w = m.w, cur = server.get(w.id)
      const rejected = chance(0.1) || !cur
      if (!rejected) {
        if (w.kind === "delete") server.delete(w.id)
        else {
          const n = { ...cur, v: cur.v + 1 }
          if (w.kind === "rename") n.title = w.title
          if (w.kind === "move") n.folder = w.folder
          if (w.kind === "pin") n.pinned = w.pinned
          server.set(w.id, n)
          if (chance(0.3)) push(n.id) // the server also pushes its own write sometimes
        }
      }
      if (lose) { if (!rejected) lateApplied.add(w.id); return }
      net.push({ kind: "write", w, phase: "response", ok: !rejected, data: server.get(w.id) ? { ...server.get(w.id) } : null })
      return
    }
    if (m.kind === "write" && m.phase === "response") {
      settle(m.w, m.ok ? "success" : "failure", m.data)
      return
    }
    if (m.kind === "push") {
      const n = m.data
      applyBase(m.id, n, (o, nw) => joinAll(o, nw, (a) => repair(a, "push")))
      if (n) confirm(m.id, m.at, ["folder", "title", "pinned"])
      return
    }
  }
  const push = (id) => { const n = server.get(id); net.push({ kind: "push", id, data: n ? { ...n } : null, at: seq }) }
  const external = () => {
    const id = pick([...server.keys()]); if (!id) return
    const n = { ...server.get(id), v: server.get(id).v + 1 }
    const what = pick(["title", "folder", "pinned", "delete"])
    if (what === "delete") { server.delete(id) } else { n[what] = what === "title" ? pick(TITLES) : what === "folder" ? pick(FOLDERS) : !n.pinned; server.set(id, n) }
    log.push(`external ${what} ${id}`); push(id)
  }

  // ---------------- initial loads (machine requests) ----------------
  for (const a of answers.values()) if (a.kind !== "get") startLookup(a, 0, "load")
  const drain = (allowLoss) => {
    let guard = 0
    while (net.length) {
      if (++guard > 20000) fail("did not quiesce")
      const i = Math.floor(r() * net.length), m = net.splice(i, 1)[0]
      const lose = allowLoss && m.kind === "write" && m.phase === "request" && chance(0.08)
      if (lose) { deliver(m, true); settle(m.w, "uncertain") } else deliver(m, false)
    }
  }
  // ---------------- random interleaving ----------------
  for (let s = 0; s < steps; s++) {
    const roll = r()
    if (roll < 0.35) { const id = pick(IDS); if (store.get(id)?.base) startWrite(pick(["rename", "move", "pin", "delete"]), id) }
    else if (roll < 0.5) external()
    else if (roll < 0.6) { const a = pick([...answers.values()].filter((x) => x.kind !== "get")); if (!a.inflight) startLookup(a, 0, "machine") }
    else if (net.length) {
      const i = Math.floor(r() * net.length), m = net.splice(i, 1)[0]
      const lose = m.kind === "write" && m.phase === "request" && chance(0.08)
      if (lose) { deliver(m, true); settle(m.w, "uncertain") } else deliver(m, false)
    }
  }
  drain(false)

  // ---------------- checks at quiet ----------------
  const report = { lookups, uncertainRecords: [...store.entries()].filter(([, x]) => x.uncertain).map(([k]) => k) }
  const check = (phase) => {
    for (const [id, rec] of store) for (const p of rec.preds) {
      if (!rec.uncertain) fail(`C5 (${phase}): a prediction outlived quiet on ${id}: ${JSON.stringify(p)}`)
    }
    for (const a of answers.values()) {
      if (a.kind === "get") continue
      const involvesUncertain = [...store.entries()].some(([id, x]) => x.uncertain && lateApplied.has(id))
      if (a.stale === "observed") continue
      if (involvesUncertain) continue
      if (a.kind === "count") { if (a.data !== sCount()) fail(`C2 (${phase}): count ${a.data} != server ${sCount()}`); continue }
      const shown = (a.data ?? []).map(visible).filter(Boolean).map((n) => `${n.id}:${n.title}:${n.pinned ? 1 : 0}:${n.folder}`)
      const truth = sList(a.arg).map((n) => `${n.id}:${n.title}:${n.pinned ? 1 : 0}:${n.folder}`)
      if (JSON.stringify(shown) !== JSON.stringify(truth)) fail(`C2 (${phase}) ${a.key}: shows ${JSON.stringify(shown)}, server ${JSON.stringify(truth)} (stale=${a.stale})`)
    }
  }
  check("quiet")
  // one machine request per stale answer, then the answer must agree
  for (const a of answers.values()) if (a.kind !== "get" && a.stale && !a.inflight) startLookup(a, 0, "machine")
  drain(false)
  for (const a of answers.values()) if (a.stale === "observed") fail(`C2: ${a.key} still observed-stale after a machine request`)
  check("after one machine request")
  return report
}

// ---------------- the fuzz loop ----------------
const N = Number(process.argv[2] ?? 3000)
let passed = 0, failures = new Map(), total = 0
for (let seed = 1; seed <= N; seed++) {
  for (const omitTitle of [false, true]) {
    try { const rep = run(seed, { omitTitle }); passed++; total += rep.lookups }
    catch (e) {
      const key = e.message.replace(/\d+/g, "#").slice(0, 90)
      if (!failures.has(key)) failures.set(key, { seed, omitTitle, message: e.message, log: e.log?.slice(-14) })
    }
  }
}
console.log(`${passed} of ${N * 2} runs passed; mean lookups per run ${(total / Math.max(passed, 1)).toFixed(1)}`)
for (const [k, f] of failures) console.log(`\nFAIL seed=${f.seed} omitTitle=${f.omitTitle}: ${f.message}\n  ${f.log?.join("\n  ")}`)
