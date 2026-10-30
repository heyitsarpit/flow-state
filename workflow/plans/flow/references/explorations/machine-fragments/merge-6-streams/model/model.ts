// Executable model of proposal-v2.md (revision 2), section 3: 3.1 session, 3.2 delivery, 3.3 Feed.callback queue, 3.4 Feed.reconnect.
// Types: `tsc -p .`   Run: bun main.ts
// Ghost fields (cov*, mfDiff, gpos, gmq, lastEm, claim, opens, ts, imp, exp) belong to the checks, never to the behaviour.

declare const process: any;

// ---- rules that the mutants revert (spec value is `true` everywhere; mutations.py flips one line) ---------------
export const CONFIG = {
  missedBeforeDroppedFact: true, // facts: a value in Dropped is preceded by missed Unproven (3.1 value/Dropped)
  openingValueUnproven: true, //    a plain Stream's first value is an unproven start (3.1 value/Opening)
  keepStatusWhenFull: true, //      3.3: signals never count against the bound and are never evicted
  resetOnlyAtFail: true, //         3.4: the budget resets only when a connection fails after resetAfter live
  admitNeedsLive: true, //          3.2: state admission needs st = Live and slotConn = conn
  droppedValueNotCurrent: true, //  3.1 value/Dropped state: not current, nothing delivered
  noEqualityOnFacts: true, //       SR2: facts are never compared
  catchUpAfterLive: true, //        3.4: the catch-up starts at the live signal, not at connect
  completeOnlyOnLastPage: true, //  3.4: CatchingUp leaves only on a page with next = none
  pageRetryKeepsSocket: true, //    3.4: a retryable page failure keeps the socket open
  successorAfterClosed: true, //    3.1: a successor starts only after scope closed
  lastIsEmitted: true, //           3.4: last = position of the last value emitted downstream
  proofNeedsOwn: true, //           3.1: a state proof confirms only an own last (FC53, I17)
  cancelPageOnEnd: true, //         3.4: ending a connection interrupts the page read
};
const C = CONFIG;
// Reading switches (not mutants): how an ambiguous cell is read.
export const READ = { cleanLiveSince: true, repairCb: typeof process !== "undefined" && !!process.env.REPAIR }; // repairCb: only for mutations.py, isolates the 3.3 order finding // true: liveSince is cleared at connect and at every drop (the intended reading)

export type Kind = "facts" | "state";
export type St = "Opening" | "Dropped" | "Live" | "Ended" | "Releasing" | "Released";
export const STATES: St[] = ["Opening", "Dropped", "Live", "Ended", "Releasing", "Released"];
export const INPUTS = ["proof", "live", "lost", "reset", "value", "down", "fail", "complete", "defect", "release", "closed", "bound"];
export interface Item { t: "missed" | "value" | "failure"; k?: "U" | "L" | "R"; v?: number; ep?: number; ra?: number }
export interface Sess {
  kind: Kind; st: St; drop: number; owed: boolean;
  lastV: number | null; lastOwn: boolean; lastCur: boolean; confirmed: boolean; reconfCur: boolean;
  inFlight: Item | null; adm: boolean; next: Item | null; // 3.2 facts
  slot: number | null; slotCur: boolean; box: Item[]; heard: number | null; // 3.2 state (queued = box holds a value item)
  cov1: number; cov2: number; mfDiff: number; gpos: number | null; gmq: boolean; gpend: boolean; track: boolean; // ghosts
}
export interface SIn { k: string; v?: number; ep?: number; need?: boolean; ra?: number }
export interface SR { s: Sess; viol: string[]; ev: string[]; putV: number; cannot?: boolean }
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function cellKind(st: St, inp: string): "defined" | "cannot" {
  const adapter = !["release", "closed", "bound"].includes(inp);
  if (st === "Released") return "cannot"; // footnote 2
  if (st === "Ended") return inp === "release" ? "defined" : "cannot"; // footnotes 1 and 3
  if (st === "Releasing") return "defined";
  return inp === "closed" || inp === "bound" ? "cannot" : "defined"; // footnote 3
}

export function initSess(kind: Kind, lastV: number | null, heard: number | null, track = false): Sess {
  return { kind, st: "Opening", drop: 0, owed: false, lastV: kind === "state" ? lastV : null, lastOwn: false, lastCur: false, confirmed: false, reconfCur: false,
    inFlight: null, adm: false, next: null, slot: null, slotCur: false, box: [], heard: kind === "state" ? heard : null, cov1: 0, cov2: 0, mfDiff: 0, gpos: null, gmq: false, gpend: false, track };
}
export const pendingMF = (s: Sess) =>
  (s.inFlight && !s.adm && s.inFlight.t !== "value" ? 1 : 0) + s.box.filter((i) => i.t !== "value").length;
export const pendingAny = (s: Sess) => (s.inFlight && !s.adm ? 1 : 0) + (s.next ? 1 : 0) + s.box.length;

// ---- 3.1 + 3.2: one input applied to a session ------------------------------------------------------------------
export function sIn(s0: Sess, inp: SIn): SR {
  const s = clone(s0), viol: string[] = [], ev: string[] = [];
  const cell = `${s.kind}|${s.st}|${inp.k}`;
  if (cellKind(s.st, inp.k) === "cannot") return { s, viol: ["I2-cannot-fired"], ev: [cell], putV: 0, cannot: true };
  ev.push(cell);
  const ep = inp.ep ?? 1;
  let putV = 0;
  const putItem = (it: Item) => {
    if (it.t !== "value") s.mfDiff++;
    if (s.kind === "facts") {
      if (s.inFlight === null) { s.inFlight = it; s.adm = false; }
      else if (it.t === "value" && s.next === null) s.next = it;
      else viol.push("I7-mailbox");
    } else s.box.push(it);
  };
  const putMissed = (k: "U" | "L" | "R") => {
    if (s.kind !== "facts") return;
    putItem({ t: "missed", k, ep, ra: inp.ra });
    s.cov1 = Math.max(s.cov1, ep); s.cov2 = Math.max(s.cov2, ep); s.gmq = true; s.gpend = false;
    if (k === "R") s.gpos = null;
  };
  const putValueFact = (v: number) => {
    if (inp.need && ep > s.cov1) viol.push("I1");
    if (inp.need && ep > s.cov2) viol.push("I1*");
    if (s.track) { if (s.gpend) viol.push("G1"); if (s.gpos !== null && !s.gmq) { if (v <= s.gpos) viol.push("I13"); else if (v > s.gpos + 1) s.gpend = true; } s.gpos = v; s.gmq = false; }
    putV++; putItem({ t: "value", v, ep }); s.lastV = v;
  };
  const putFailure = () => putItem({ t: "failure" });
  const liveStart = () => { s.lastCur = false; s.slotCur = false; s.reconfCur = false; s.drop = 0; s.st = "Live"; if (s.kind === "state") s.confirmed = false; };
  const stateLiveValue = (v: number) => {
    s.lastV = v; s.lastOwn = true; s.lastCur = true; s.confirmed = true;
    if (v !== s.heard) { s.slot = v; s.slotCur = true; if (!s.box.some((i) => i.t === "value")) s.box.push({ t: "value" }); }
  };
  const factLiveValue = (v: number) => { if (!C.noEqualityOnFacts && v === s.lastV) return; putValueFact(v); };
  const discard = () => ev.push("evidence:discard");
  const st = s.st, k = inp.k;
  const missedKind = (): "U" | "L" | "R" => (k === "live" ? "U" : k === "lost" ? "L" : "R");
  if (["proof", "live", "lost", "reset"].includes(k)) {
    if (st === "Releasing") discard();
    else if (k === "proof") {
      if (s.gpend) viol.push("G1"); // a proof claims continuity over a gap that no missed reported
      if (st !== "Live") {
        liveStart();
        if (st === "Dropped") {
          if (s.kind === "state" && (s.lastOwn || !C.proofNeedsOwn)) { s.confirmed = true; s.reconfCur = true; if (!s.lastOwn) viol.push("I17"); }
          s.owed = false;
        }
      }
    } else if (st === "Opening") { liveStart(); putMissed(missedKind()); }
    else if (st === "Dropped") {
      liveStart();
      if (k === "live" && s.owed && s.kind === "facts") s.cov2 = Math.max(s.cov2, ep); // owed suppresses the second missed
      else putMissed(missedKind());
      s.owed = false;
    } else { liveStart(); putMissed(missedKind()); } // Live: an unseen reconnect or a stronger answer
  } else if (k === "value") {
    const v = inp.v ?? 0;
    if (st === "Releasing") discard();
    else if (st === "Opening") {
      liveStart(); if (C.openingValueUnproven) putMissed("U");
      if (s.kind === "facts") factLiveValue(v); else stateLiveValue(v);
    } else if (st === "Live") { if (s.kind === "facts") factLiveValue(v); else stateLiveValue(v); }
    else { // Dropped: not current
      if (s.kind === "state") {
        s.lastV = v; s.lastOwn = true; s.lastCur = true;
        if (!C.droppedValueNotCurrent) { s.confirmed = true; if (v !== s.heard) { s.slot = v; s.slotCur = true; if (!s.box.some((i) => i.t === "value")) s.box.push({ t: "value" }); } }
      } else {
        if (!s.owed && C.missedBeforeDroppedFact) { putMissed("U"); s.owed = true; }
        putValueFact(v);
      }
      ev.push("evidence:UnprovenValues");
    }
  } else if (k === "down") {
    if (st === "Releasing") discard();
    else if (st === "Opening") { s.st = "Dropped"; s.drop = inp.v ?? 1; }
    else if (st === "Dropped") s.drop = inp.v ?? 1;
    else { s.st = "Dropped"; s.drop = inp.v ?? 1; s.owed = false; if (s.kind === "state") s.confirmed = false; }
  } else if (k === "fail" || k === "complete" || k === "defect") {
    if (st === "Releasing") discard(); else { s.st = "Ended"; putFailure(); }
  } else if (k === "release") { if (st !== "Releasing") s.st = "Releasing"; }
  else if (k === "closed" || k === "bound") s.st = "Released";
  // post-step properties
  const isVal = k === "value";
  if (s.kind === "facts" && isVal && (st === "Opening" || st === "Dropped" || st === "Live") && putV !== 1) viol.push("I3");
  if (s.kind === "state" && isVal && st === "Dropped") {
    if ((s.confirmed && !s0.confirmed) || s.slot !== s0.slot || s.box.length !== s0.box.length) viol.push("I16");
  }
  if (s.kind === "state" && k === "proof" && s.confirmed && !s0.confirmed && !s0.lastOwn) viol.push("I17");
  return { s, viol, ev, putV };
}

// Pump events: admission and the end of a turn.
export function admit(s0: Sess, admitReleased = false): SR | null {
  const s = clone(s0), viol: string[] = [], ev: string[] = [];
  const rel = s.st === "Releasing" || s.st === "Released";
  if (s.kind === "facts") {
    if (!s.inFlight || s.adm) return null;
    if (rel && !admitReleased) { ev.push("Discarded{Released}"); s.inFlight = null; s.next = null; s.mfDiff = 0; return { s, viol, ev, putV: 0 }; }
    if (rel) viol.push("I11");
    s.adm = true; if (s.inFlight.t !== "value") s.mfDiff--;
    return { s, viol, ev: ["admit:" + s.inFlight.t], putV: 0 };
  }
  const it = s.box.shift(); if (!it) return null;
  if (rel && !admitReleased) { ev.push("Discarded{Released}"); if (it.t === "value") { s.slot = null; } else s.mfDiff = 0; return { s, viol, ev, putV: 0 }; }
  if (rel) viol.push("I11");
  if (it.t === "failure") { s.mfDiff--; return { s, viol, ev: ["admit:failure"], putV: 0 }; }
  const ok = s.st === "Live" && s.slotCur;
  if (ok || !C.admitNeedsLive) {
    if (!ok) viol.push("I9");
    if (s.slot !== s.lastV) viol.push("X1");
    s.heard = s.slot; ev.push("admit:value");
  } else { ev.push("Discarded{NotLive}"); if (s.st === "Ended") viol.push("X4"); }
  s.slot = null; s.slotCur = false;
  return { s, viol, ev, putV: 0 };
}
export function turnEnd(s0: Sess): SR | null {
  if (s0.kind !== "facts" || !s0.inFlight || !s0.adm) return null;
  const s = clone(s0); s.inFlight = s.next; s.adm = false; s.next = null;
  return { s, viol: [], ev: ["turnEnd"], putV: 0 };
}
export function canPull(s: Sess): boolean {
  if (s.st !== "Opening" && s.st !== "Dropped" && s.st !== "Live") return false;
  return s.kind === "state" || s.inFlight === null;
}
export function sessInv(s: Sess): string[] {
  const v: string[] = [];
  if (s.kind === "state" && s.st === "Live" && s.confirmed && !(s.lastCur || s.reconfCur) ) v.push("I8");
  if (s.kind === "state" && s.st === "Live" && s.confirmed && s.lastV === null) v.push("I8");
  if (s.kind === "facts" && s.next && !s.inFlight) v.push("I7");
  if (s.box.filter((i) => i.t === "value").length > 1 || s.box.filter((i) => i.t === "failure").length > 1 || s.box.length > 2) v.push("I7");
  if (s.st !== "Releasing" && s.st !== "Released" && s.mfDiff !== pendingMF(s)) v.push("I6");
  if (s.kind === "state" && s.st === "Live" && s.confirmed && s.lastV !== s.heard && s.slot === null && !s.box.some((i) => i.t === "value")) v.push("X2");
  // I6, liveness half: draining delivers every queued missed and failure
  if (s.st !== "Releasing" && s.st !== "Released") {
    let t: Sess = s;
    for (let i = 0; i < 6; i++) { const a = admit(t); if (a) { t = a.s; continue; } const e = turnEnd(t); if (e) { t = e.s; continue; } break; }
    if (t.mfDiff !== 0 || pendingAny(t) !== 0) v.push("I6");
  }
  return v;
}

// ---- 3.3 Feed.callback ----------------------------------------------------------------------------------------
export const BUFFER = 2;
export type Sig = "down" | "proof" | "live" | "lost" | "reset";
export interface Grp { down: boolean; live?: "proof" | "live" | "lost" | "reset"; ra?: number; ep: number; src: string[] }
export type CEnt = { v: number; ep: number; need: boolean } | { g: Grp };
export interface Cb { q: CEnt[]; closing: "open" | "fail" | "end"; released: boolean }
export const cbInit = (): Cb => ({ q: [], closing: "open", released: false });
const rank = { lost: 0, reset: 0, live: 1, proof: 2 } as const;
const nvals = (c: Cb) => c.q.filter((e) => "v" in e).length;
export function cbEmitValue(c0: Cb, v: number, ep: number, need: boolean): { c: Cb; ev: string } {
  const c = clone(c0);
  if (c.closing !== "open" || c.released) return { c, ev: "evidence:noop" };
  if (nvals(c) < BUFFER) { c.q.push({ v, ep, need }); return { c, ev: "value:append" }; }
  c.closing = "fail"; return { c, ev: "value:overflow" };
}
export function cbEmitSignal(c0: Cb, k: Sig, ep: number, ra?: number): { c: Cb; ev: string } {
  const c = clone(c0);
  if (c.closing !== "open" || c.released) return { c, ev: "evidence:noop" };
  const full = nvals(c) >= BUFFER;
  if (full && !C.keepStatusWhenFull) return { c, ev: "signal:evicted" };
  let tail = c.q[c.q.length - 1];
  if (!tail || "v" in tail) { tail = { g: { down: false, ep, src: [] } }; c.q.push(tail); }
  const g = (tail as { g: Grp }).g;
  g.src.push(k[0]!); g.ep = Math.max(g.ep, ep);
  if (k === "down") g.down = true;
  else if (g.live === undefined || rank[k] < rank[g.live] || (rank[k] === rank[g.live] && k === "reset")) { g.live = k; g.ra = ra; }
  return { c, ev: full ? "signal:merge-full" : "signal:merge" };
}
export function cbClose(c0: Cb, how: "fail" | "end"): { c: Cb; ev: string } {
  const c = clone(c0);
  if (c.closing !== "open" || c.released) return { c, ev: "evidence:noop" };
  c.closing = how; return { c, ev: how };
}
export function cbRelease(c0: Cb): Cb { const c = clone(c0); c.released = true; return c; }
// pull: returns the next item for the session, or null when pull would block
export function cbPull(c0: Cb): { c: Cb; inp: SIn } | null {
  const c = clone(c0);
  const h = c.q[0];
  if (h) {
    if ("v" in h) { c.q.shift(); return { c, inp: { k: "value", v: h.v, ep: h.ep, need: h.need } }; }
    const g = h.g;
    if (READ.repairCb && g.down && g.live && g.src[g.src.length - 1] === "d") { const l = g.live; g.live = undefined; g.src = ["d"]; return { c, inp: { k: l === "proof" ? "proof" : l, ep: g.ep, ra: g.ra } }; }
    if (g.down) { g.down = false; g.src = g.src.filter((x) => x !== "d"); if (!g.live) c.q.shift(); return { c, inp: { k: "down", v: 1, ep: g.ep } }; }
    c.q.shift(); return { c, inp: { k: g.live === "proof" ? "proof" : g.live!, ep: g.ep, ra: g.ra } };
  }
  if (c.closing === "fail") return { c, inp: { k: "fail" } };
  if (c.closing === "end" || c.released) return { c, inp: { k: "complete" } };
  return null;
}
export function cbInv(c: Cb): string[] {
  const v: string[] = [];
  if (nvals(c) > BUFFER) v.push("I7-cb");
  for (let i = 1; i < c.q.length; i++) if ("g" in c.q[i]! && "g" in c.q[i - 1]!) v.push("I7-cb");
  for (const e of c.q) if ("g" in e) {
    const g = e.g, lives = g.src.filter((x) => x !== "d");
    if (g.down !== g.src.includes("d") && g.src.length) v.push("CB-down-lost");
    // a merged group never upgrades an answer
    const weakest = Math.min(...lives.map((x) => (x === "l" ? 1 : x === "p" ? 2 : 0)));
    if (lives.length && g.live && (rank[g.live] > weakest && !(rank[g.live] === 1 && weakest === 1))) v.push("CB-upgrade");
    // the group emits down, then live: the end state must match the last signal emitted
    if (g.down && g.live && g.src[g.src.length - 1] === "d" && !READ.repairCb) v.push("CB-order");
  }
  return v;
}

// ---- 3.4 Feed.reconnect ----------------------------------------------------------------------------------------
export const RCFG = { catchUp: true, from: 0 as number | null, sched: 2, psched: 2, buf: 2, hmax: 3, tick: true };
export type Ph = "Connecting" | "Live" | "CatchingUp" | "Waiting" | "Done";
export type Ent = { s: "proof" | "live" | "lost" | "reset"; ra?: number } | { v: number };
export type Emit = { t: "live"; p: "proof" | "live" | "lost" | "reset"; ra?: number; catchUp?: boolean } | { t: "down" } | { t: "value"; pos: number } | { t: "fail" };
export interface Rc {
  ph: Ph; rel: boolean; sig: boolean; last: number | null; n: number; ls: number; cursor: number | null; pageSet: number[]; buf: Ent[];
  ps: number; pw: "none" | "req" | "wait"; pstale: boolean; proof: string; head: number; sock: number | null;
  imp: boolean; exp: number | null; lastEm: number | null; claim: boolean; opens: number; ts: boolean; seen: boolean;
}
export interface RR { r: Rc; out: Emit[]; viol: string[]; ev: string[] }
export function rInit(): RR {
  const viol: string[] = [], out: Emit[] = [];
  const r: Rc = { ph: "Connecting", rel: false, sig: false, last: RCFG.from, n: 0, ls: 0, cursor: null, pageSet: [], buf: [], ps: 0, pw: "none", pstale: false, proof: "-",
    head: 0, sock: 1, imp: false, exp: RCFG.from, lastEm: RCFG.from, claim: false, opens: 1, ts: false, seen: false };
  if (!C.catchUpAfterLive && RCFG.catchUp && r.last !== null) startCatchUp(r, out, viol, true);
  return { r, out, viol, ev: [] };
}
export function rCell(ph: Ph, row: string): "defined" | "cannot" {
  if (ph === "Done") return "cannot";
  if (ph === "Waiting") return row === "delay" || row === "release" ? "defined" : "cannot";
  if (row === "pageOk" || row === "pageFailW" || row === "pageFailT") return ph === "CatchingUp" ? "defined" : "cannot";
  if (row === "delay") return "cannot";
  return "defined";
}
function emitVal(r: Rc, pos: number, out: Emit[], viol: string[]) {
  if (r.lastEm !== null && pos <= r.lastEm) viol.push("I13");
  r.lastEm = pos; if (C.lastIsEmitted) r.last = pos; else r.last = Math.max(r.last ?? 0, pos); r.exp = pos; out.push({ t: "value", pos });
}
const emitSig = (r: Rc, out: Emit[], p: "proof" | "live" | "lost" | "reset", ra?: number, catchUp = false) => { out.push({ t: "live", p, ra, catchUp }); r.claim = p === "proof"; };
function startCatchUp(r: Rc, out: Emit[], viol: string[], atConnect: boolean) {
  if (r.last !== r.exp) viol.push("I4");
  emitSig(r, out, "proof", undefined, true);
  r.ph = "CatchingUp"; r.cursor = r.last; r.pageSet = []; r.buf = []; r.ps = 0; r.pw = "req"; r.proof = "pending"; r.ls = 1; if (atConnect) r.sock = null;
}
function flush(r: Rc, out: Emit[], viol: string[], dropLeading: boolean, completion = false) {
  let dropping = dropLeading, covered = false;
  for (const e of r.buf) {
    if ("v" in e) { if (dropping && r.pageSet.includes(e.v)) continue; dropping = false; if (completion && !covered && r.lastEm !== null && e.v > r.lastEm + 1) viol.push("G1c"); emitVal(r, e.v, out, viol); }
    else { dropping = false; if (e.s !== "proof") covered = true; emitSig(r, out, e.s, e.ra); }
  }
  r.buf = [];
}
const bufVals = (r: Rc) => r.buf.filter((e) => "v" in e).length;
function endConn(r: Rc, out: Emit[], viol: string[], ev: string[], how: "retry" | "term") {
  if (r.ph === "CatchingUp") { r.proof = how === "retry" ? "abandoned" : r.proof; r.buf = []; if (C.cancelPageOnEnd) r.pw = "none"; else if (r.pw !== "none") r.pstale = true; }
  r.sock = null;
  if (how === "term") { out.push({ t: "fail" }); r.ph = "Done"; r.claim = false; return; }
  out.push({ t: "down" }); r.claim = false;
  if (r.ls === 2) r.n = 0;
  if (READ.cleanLiveSince) r.ls = 0;
  if (r.n < RCFG.sched) { r.n++; r.ph = "Waiting"; } else { out.push({ t: "fail" }); r.ph = "Done"; ev.push("exhausted"); }
}
function pageRequest(r: Rc, viol: string[]) { if (r.cursor !== r.exp) viol.push("I4"); r.pw = "req"; }
export interface RMove { label: string; row: string; fn: (r: Rc) => RR }
export function rMoves(r: Rc): RMove[] {
  const mv: RMove[] = [];
  const mk = (label: string, row: string, body: (r: Rc, out: Emit[], viol: string[], ev: string[]) => void) =>
    mv.push({ label, row, fn: (r0) => { const r = clone(r0), out: Emit[] = [], viol: string[] = [], ev: string[] = [`R|${r0.ph}|${row}`]; body(r, out, viol, ev); return { r, out, viol, ev }; } });
  if (r.head < RCFG.hmax) mk("server append", "env", (r) => { r.head++; });
  if (RCFG.tick) mk("tick (resetAfter passes)", "env", (r) => { if (r.ls === 1) r.ls = 2; if (r.ph === "Live" || r.ph === "CatchingUp") r.ts = true; });
  const connected = r.ph === "Connecting" || r.ph === "Live" || r.ph === "CatchingUp";
  if (r.rel) return mv;
  if (connected) {
    const liveRow = (p: "live" | "lost") => {
      const cu = RCFG.catchUp && r.last !== null;
      mk(`inner ${p === "live" ? "Feed.live()" : "Feed.live({ lost })"}`, cu ? "live+cu" : "live", (r, out, viol) => {
        r.sock = r.head + 1;
        if (r.ph === "CatchingUp") { r.buf.push({ s: p }); return; }
        r.sig = true;
        if (cu) { startCatchUp(r, out, viol, false); r.sock = r.head + 1; }
        else { emitSig(r, out, p); if (r.ph === "Connecting") r.ls = 1; r.ph = "Live"; }
      });
    };
    if (RCFG.catchUp === false || r.last !== null || true) {
      // proof: the server resumed from `last`
      if (r.last !== null) mk("inner Feed.live({ proof })", "proof", (r, out) => {
        if (r.ph === "CatchingUp") { r.buf.push({ s: "proof" }); return; }
        r.sock = r.last! + 1; emitSig(r, out, "proof"); r.sig = true;
        if (r.ph === "Connecting") { r.ph = "Live"; r.ls = 1; }
      });
    }
    liveRow("live"); liveRow("lost");
    mk("inner Feed.live({ lost, restartAt })", "reset", (r, out, viol) => {
      const ra = r.head; r.sock = r.head + 1;
      if (r.ph === "CatchingUp") { r.pw = "none"; r.last = ra; r.exp = ra; flush(r, out, viol, false); emitSig(r, out, "reset", ra); r.lastEm = ra; r.ph = "Live"; r.proof = "superseded"; r.ls = 1; return; }
      r.last = ra; r.exp = ra; emitSig(r, out, "reset", ra); r.lastEm = ra; r.ph = "Live"; r.ls = 1; r.sig = true;
    });
    mk("inner Feed.down(r)", "down", (r, out, viol) => {
      r.sock = r.head + 1;
      if (r.ph === "Connecting") { out.push({ t: "down" }); r.claim = false; r.sig = true; if (READ.cleanLiveSince) r.ls = 0; }
      else if (r.ph === "Live") { out.push({ t: "down" }); r.claim = false; r.ph = "Connecting"; r.ls = 0; }
      else { r.pw = "none"; r.proof = "abandoned"; flush(r, out, viol, false); out.push({ t: "down" }); r.claim = false; r.ph = "Connecting"; if (READ.cleanLiveSince) r.ls = 0; }
    });
    // sock = null: the socket has not registered yet (only after a catch-up started at connect); its first value then carries the newest position
    if ((r.sock !== null && r.sock <= r.head) || (r.sock === null && r.head >= 1)) mk("inner value", "value", (r, out, viol, ev) => {
      const pos = r.sock ?? r.head; r.sock = pos + 1;
      if (!C.resetOnlyAtFail && !r.seen) r.n = 0;
      r.seen = true;
      if (r.ph === "CatchingUp") {
        if (!C.lastIsEmitted) r.last = Math.max(r.last ?? 0, pos);
        r.buf.push({ v: pos });
        if (bufVals(r) > RCFG.buf) { r.buf.pop(); endConn(r, out, viol, ev, "retry"); }
        return;
      }
      if (r.ph === "Connecting" && !r.sig) {
        if (r.imp) viol.push("I20");
        emitSig(r, out, "live"); r.imp = true; r.ph = "Live"; r.ls = 1; r.claim = false;
      }
      if (r.claim && r.lastEm !== null && pos > r.lastEm + 1) viol.push("G2"); // a proof is standing and the socket value skips a position
      emitVal(r, pos, out, viol);
    });
    const failRow = (label: string, closed: boolean) => mk(label, "failW", (r, out, viol, ev) => endConnAll(r, out, viol, ev, closed));
    failRow("inner fails (while)", false); failRow("inner completes (Closed)", true);
    mk("inner fails (not while)", "failT", (r, out, viol, ev) => endConn(r, out, viol, ev, "term"));
    if (r.ph === "CatchingUp" && (r.pw === "req" || r.pstale)) {
      mk("page ok (more)", "pageOk", (r, out, viol) => pageOk(r, out, viol, "more"));
      mk("page ok (empty, more)", "pageOk", (r, out, viol) => pageOk(r, out, viol, "emptyMore"));
      mk("page ok (last)", "pageOk", (r, out, viol) => pageOk(r, out, viol, "last"));
      mk("page fails (while)", "pageFailW", (r, out, viol, ev) => {
        if (r.ps < RCFG.psched && C.pageRetryKeepsSocket) { r.ps++; r.pw = "wait"; ev.push("pageRetry"); return; }
        if (r.ps < RCFG.psched) viol.push("I19");
        endConnAll(r, out, viol, ev, false);
      });
      mk("page fails (not while)", "pageFailT", (r, out, viol, ev) => { r.pw = "none"; endConn(r, out, viol, ev, "term"); });
    }
    if (r.pstale && r.ph !== "CatchingUp") mk("stale page ok (last)", "pageOk", (r, out, viol) => pageOk(r, out, viol, "last"));
    if (r.ph === "CatchingUp" && r.pw === "wait") mk("page retry delay elapsed [invented input]", "pageDelay", (r, _o, viol) => pageRequest(r, viol));
  } else if (r.ph === "Waiting") {
    mk("reconnect delay elapsed", "delay", (r, out, viol) => {
      if (r.last !== r.exp) viol.push("I4");
      if (r.ts) r.opens = 1; else r.opens++; r.ts = false;
      if (r.opens > RCFG.sched + 1) viol.push("I12");
      r.opens = Math.min(r.opens, RCFG.sched + 2);
      r.ph = "Connecting"; r.sig = false; r.imp = false; r.seen = false; r.sock = r.head + 1; if (READ.cleanLiveSince) r.ls = 0;
      if (!C.catchUpAfterLive && RCFG.catchUp && r.last !== null) startCatchUp(r, out, viol, true);
    });
  }
  if (r.ph !== "Done") mk("release", "release", (r) => { r.rel = true; r.ph = "Done"; r.pw = "none"; r.buf = []; r.sock = null; });
  return mv;
}
function endConnAll(r: Rc, out: Emit[], viol: string[], ev: string[], closed: boolean) {
  if (closed && r.ph === "CatchingUp" && !C.completeOnlyOnLastPage) { r.pw = "none"; flush(r, out, viol, true); r.ph = "Live"; viol.push("I18"); return; }
  endConn(r, out, viol, ev, "retry");
}
function pageOk(r: Rc, out: Emit[], viol: string[], kind: "more" | "emptyMore" | "last") {
  if (r.pstale || r.ph !== "CatchingUp") viol.push("I21");
  let vals: number[] = [], nextSome = false;
  const c = r.cursor ?? 0;
  if (kind === "more") { if (c < r.head) { vals = [c + 1]; nextSome = c + 1 < r.head; } }
  else if (kind === "emptyMore") nextSome = true;
  else for (let p = c + 1; p <= r.head; p++) vals.push(p);
  for (const p of vals) { emitVal(r, p, out, viol); r.pageSet.push(p); }
  r.ps = 0;
  if (r.pstale) { r.pw = "none"; r.pstale = false; return; }
  const complete = !nextSome || (kind === "emptyMore" && !C.completeOnlyOnLastPage);
  if (!complete) { r.cursor = vals.length ? vals[vals.length - 1]! : c; pageRequest(r, viol); return; }
  if (nextSome) viol.push("I18");
  r.proof = "complete"; flush(r, out, viol, true, true); r.ph = "Live"; r.pw = "none"; r.claim = true;
}
export function rInv(r: Rc): string[] {
  const v: string[] = [];
  if (bufVals(r) > RCFG.buf) v.push("I7-buf");
  if (r.ph !== "CatchingUp" && r.buf.length) v.push("I7-buf");
  return v;
}
