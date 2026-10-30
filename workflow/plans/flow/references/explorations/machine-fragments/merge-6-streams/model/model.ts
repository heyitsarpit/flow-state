// Executable model of proposal-v2.md revision 3 (ac493bd1), section 3: 3.1 session, 3.2 pump, 3.3 Feed.callback queue, 3.4 Feed.reconnect,
// 3.5 write progress, 3.6 listen coverage.
// Types: `tsc -p .`   Run: bun main.ts
// Ghost fields (cov, mfDiff, gpos, needM, dv, em, opens, ts, greg, starts, gsig, exp) belong to the checks, never to the behaviour.

declare const process: any;

// ---- rules that the mutants revert (spec value is `true` everywhere; mutations.py flips one line) ---------------
export const CONFIG = {
  missedBeforeDroppedFact: true, // 3.1 value/Dropped facts: unless owed, deliver missed Unproven first
  openingValueUnproven: true, //    3.1 value/Opening: the plain-Stream case is start(unproven)
  keepStatusWhenFull: true, //      3.3: signals are never evicted
  groupOrderAware: true, //         3.3: group is (down1, live, down2); a pulled group ends in the last signal's state
  admitNeedsLive: true, //          3.2: state admission needs st = Live and slotConn = conn
  droppedValueNotCurrent: true, //  3.1 value/Dropped state: not current, nothing delivered
  droppedValueNotOwn: true, //      3.1 value/Dropped state: own = false (C3)
  noEqualityOnFacts: true, //       SR2
  catchUpAfterLive: true, //        3.4: the repair starts at the live signal, not at connect
  completeOnlyOnLastPage: true, //  3.4: only next = none (or CannotRepair, or a reset) leaves CatchingUp
  pageRetryKeepsSocket: true, //    3.4: a retryable page failure keeps the socket while pageSched has steps
  successorAfterClosed: true, //    3.1: a successor starts only after scope closed
  lastIsEmitted: true, //           3.4: last = position of the last value emitted downstream
  proofNeedsOwn: true, //           3.1: a proof confirms only an own last
  discardBufferOnAbandon: true, //  3.4 abandon(): nothing buffered is emitted
  cancelPageOnEnd: true, //         3.4 abandon(): the page read is interrupted
  signalledSetByImplicit: true, //  3.4 register(): signalled = true for the implicit start
  ringKeptAfterComplete: true, //   3.4 complete(): the ring stays and filters the connection's next values
  reconcileAfterProof: true, //     3.1: a re-confirm goes through reconcile
  clearSlotWhenEqual: true, //      3.1 reconcile: a newer value equal to heard clears the slot
  listenGapStale: true, //          3.6: an unproven start or settle(lost) adds feedGap
  listenPendingDown: true, //       3.6: a pending start adds feedDown
  setterOnlyAddr: true, //          3.5: only the addressable, un-ended Attempt writes the row
  freshOnlyFirst: true, //          3.4 register(): fresh only when last is undefined and nothing was emitted
  liveSinceCleared: true, //        3.4: liveSince = none at a drop and at connect
  resetOnlyAtFail: true, //         3.4: the budget resets only in dropConn after resetAfter registered
  pendingAnnounced: true, //        3.4 startRepair(): emit pending (C1), not a proof
  cannotRepairExits: true, //       3.4: CannotRepair leaves the repair (C2)
  overflowFails: true, //           3.3: an overflowing queue fails with Overflow (C6)
};
const C = CONFIG;
// Isolation switch for mutations.py only (REPAIR=1): lets the ring cover the whole overlap and lets 3.6 ignore ended sessions, so that the two baseline
// findings (RESULTS N2, N1) do not mask the mutants that the same checks must kill.
export const READ = { repair: typeof process !== "undefined" && !!process.env.REPAIR };

export type Kind = "facts" | "state";
export type St = "Opening" | "Dropped" | "Live" | "Ended" | "Releasing" | "Released";
export type Answer = "none" | "proven" | "fresh" | "pending" | "unproven" | "lost" | "reset" | "abandoned";
export const STATES: St[] = ["Opening", "Dropped", "Live", "Ended", "Releasing", "Released"];
export const INPUTS = ["proof", "live", "lost", "reset", "fresh", "pending", "settleP", "settleL", "value", "down", "fail", "complete", "defect", "release", "closed", "bound"];
export interface Item { t: "missed" | "value" | "failure"; k?: string; v?: number; ep?: number; ra?: number; e?: string }
export interface Sess {
  kind: Kind; st: St; drop: number; owed: boolean; answer: Answer;
  lastV: number | null; lastOwn: boolean; lastCur: boolean; reconfCur: boolean; confirmed: boolean;
  Q: Item[]; inFlight: Item | null; adm: boolean; // 3.2 facts
  slot: number | null; slotCur: boolean; box: Item[]; heard: number | null; // 3.2 state (queued = box holds a value delivery)
  cov: number; mfDiff: number; gpos: number | null; needM: boolean; dv: boolean; track: boolean; // ghosts
}
export interface SIn { k: string; v?: number; ep?: number; need?: boolean; ra?: number; e?: string }
export interface SR { s: Sess; viol: string[]; ev: string[]; lev: string[]; cannot?: boolean }
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function cellKind(st: St, k: string): "defined" | "cannot" {
  const adapter = !["release", "closed", "bound"].includes(k);
  const settle = k === "settleP" || k === "settleL";
  if (st === "Released") return "cannot"; // footnote 2
  if (st === "Ended") return k === "release" ? "defined" : "cannot"; // footnotes 1 and 4
  if (st === "Releasing") return "defined";
  if (k === "closed" || k === "bound") return "cannot"; // footnote 4
  if (settle && st !== "Live") return "cannot"; // footnote 3
  return adapter || k === "release" ? "defined" : "cannot";
}

export function initSess(kind: Kind, lastV: number | null, heard: number | null, track = false): Sess {
  return { kind, st: "Opening", drop: 0, owed: false, answer: "none", lastV: kind === "state" ? lastV : null, lastOwn: false, lastCur: false, reconfCur: false, confirmed: false,
    Q: [], inFlight: null, adm: false, slot: null, slotCur: false, box: [], heard: kind === "state" ? heard : null, cov: 0, mfDiff: 0, gpos: null, needM: false, dv: false, track };
}
export const pendingMF = (s: Sess) =>
  s.Q.filter((i) => i.t !== "value").length + (s.inFlight && !s.adm && s.inFlight.t !== "value" ? 1 : 0) + s.box.filter((i) => i.t !== "value").length;
export const pendingAny = (s: Sess) => s.Q.length + (s.inFlight && !s.adm ? 1 : 0) + s.box.length;
const hasValueDelivery = (s: Sess) => s.box.some((i) => i.t === "value");

// 3.1 reconcile (state): one point that makes a value current
function reconcile(s: Sess) {
  if (s.kind !== "state") return;
  const cur = s.st === "Live" && s.confirmed ? s.lastV : null;
  if (cur === null) return;
  if (cur !== s.heard) { s.slot = cur; s.slotCur = true; if (!hasValueDelivery(s)) s.box.push({ t: "value" }); }
  else if (C.clearSlotWhenEqual) s.slot = null;
}

// ---- 3.1 + 3.2: one input applied to a session ------------------------------------------------------------------
export function sIn(s0: Sess, inp: SIn): SR {
  const s = clone(s0), viol: string[] = [], ev: string[] = [], lev: string[] = [];
  const k = inp.k, st = s.st, cell = `${s.kind}|${st}|${k}`;
  if (cellKind(st, k) === "cannot") return { s, viol: ["I2-cannot-fired"], ev: [cell], lev, cannot: true };
  ev.push(cell);
  const ep = inp.ep ?? 1;
  let putV = 0;
  const deliver = (it: Item) => {
    if (it.t !== "value") s.mfDiff++;
    if (s.kind === "facts") { s.Q.push(it); if (s.inFlight === null) { s.inFlight = s.Q.shift()!; s.adm = false; } if (s.Q.length > 3) viol.push("I7-Q"); }
    else s.box.push(it);
  };
  const deliverMissed = (kk: string) => { deliver({ t: "missed", k: kk, ep, ra: inp.ra }); s.cov = Math.max(s.cov, ep); s.needM = false; s.gpos = null; };
  const deliverValue = (v: number) => {
    if (s.needM) viol.push("I1");
    if (inp.need && ep > s.cov) viol.push("I1a");
    if (s.track) { if (s.gpos !== null && v !== s.gpos + 1) viol.push("I23"); s.gpos = v; }
    putV++; deliver({ t: "value", v, ep }); s.lastV = v;
  };
  const discard = () => ev.push("evidence:discard");
  const start = (a: Answer) => {
    s.lastCur = false; s.slotCur = false; s.reconfCur = false; s.st = "Live"; s.drop = 0; s.answer = a; s.dv = false;
    if (s.kind === "facts") {
      if (a === "unproven" || a === "lost" || a === "reset") {
        s.needM = true;
        if (a === "unproven" && s.owed) { s.needM = false; s.cov = Math.max(s.cov, ep); } else deliverMissed(a === "unproven" ? "U" : a === "lost" ? "L" : "R");
      }
      s.owed = false;
    } else s.confirmed = false;
    lev.push(a === "proven" ? "P" : a === "pending" ? "D" : "G");
    reconcile(s);
  };
  const end = (f: string) => { s.st = "Ended"; deliver({ t: "failure", e: f }); if (s.answer === "pending") s.answer = "abandoned"; lev.push("E"); reconcile(s); };
  if (k === "proof") {
    if (st === "Releasing") discard();
    else if (st === "Opening") start("proven");
    else if (st === "Dropped") {
      start("proven");
      if (s.kind === "state" && (s.lastOwn || !C.proofNeedsOwn)) { s.confirmed = true; s.reconfCur = true; }
      if (C.reconcileAfterProof) reconcile(s);
    } else { // Live: no start
      s.answer = "proven";
      if (s.kind === "state" && !s.confirmed && (s.lastOwn || !C.proofNeedsOwn)) { s.confirmed = true; s.reconfCur = true; }
      if (C.reconcileAfterProof) reconcile(s);
    }
  } else if (k === "live" || k === "lost" || k === "reset" || k === "fresh" || k === "pending") {
    if (st === "Releasing") discard();
    else if (k === "fresh" && st === "Opening") start("fresh");
    else if (k === "fresh") { ev.push("evidence:fresh"); start("unproven"); }
    else start(k === "live" ? "unproven" : (k as Answer));
  } else if (k === "settleP" || k === "settleL") {
    if (st === "Releasing") discard();
    else if (s.answer === "pending") {
      if (k === "settleP") { s.answer = "proven"; lev.push("P"); }
      else { s.answer = "lost"; if (s.kind === "facts") { s.needM = true; deliverMissed("L"); } lev.push("G"); }
      reconcile(s);
    } else ev.push("evidence:settle");
  } else if (k === "value") {
    const v = inp.v ?? 0;
    if (st === "Releasing") discard();
    else {
      let cur = st;
      if (st === "Opening") { if (s.kind === "facts") s.needM = true; /* ghost: the first value of a plain Stream is an unproven start */ if (C.openingValueUnproven) start("unproven"); else start("proven"); cur = "Live"; }
      if (cur === "Live") {
        if (s.kind === "facts") { if (!C.noEqualityOnFacts && v === s.lastV) { /* mutant: dropped */ } else deliverValue(v); }
        else { s.lastV = v; s.lastOwn = true; s.lastCur = true; s.confirmed = true; reconcile(s); }
      } else { // Dropped: not current
        if (s.kind === "state") {
          s.lastV = v; s.lastOwn = !C.droppedValueNotOwn; s.lastCur = false;
          if (!C.droppedValueNotCurrent) { s.confirmed = true; s.lastOwn = true; s.lastCur = true; if (v !== s.heard) { s.slot = v; s.slotCur = true; if (!hasValueDelivery(s)) s.box.push({ t: "value" }); } }
        } else {
          if (!s.dv) { s.needM = true; s.dv = true; }
          if (!s.owed) { if (C.missedBeforeDroppedFact) { deliverMissed("U"); s.owed = true; } }
          else { s.needM = false; s.cov = Math.max(s.cov, ep); }
          deliverValue(v);
        }
        ev.push("evidence:UnprovenValues");
        reconcile(s);
      }
    }
  } else if (k === "down") {
    if (st === "Releasing") discard();
    else {
      if (st === "Opening") { s.st = "Dropped"; s.drop = inp.v ?? 1; s.dv = false; }
      else if (st === "Dropped") { s.drop = inp.v ?? 1; if (READ.repair) { s.owed = false; s.dv = false; } }
      else { s.st = "Dropped"; s.drop = inp.v ?? 1; s.owed = false; s.dv = false; if (s.answer === "pending") s.answer = "abandoned"; if (s.kind === "state") s.confirmed = false; }
      lev.push("D"); reconcile(s);
    }
  } else if (k === "fail" || k === "complete" || k === "defect") {
    if (st === "Releasing") discard(); else end(k === "complete" ? "Closed" : k === "defect" ? "Defect" : inp.e ?? "e");
  } else if (k === "release") { if (st !== "Releasing") { s.st = "Releasing"; lev.push("E"); } }
  else if (k === "closed" || k === "bound") s.st = "Released";
  // post-step properties
  const facts = s.kind === "facts", live3 = st === "Opening" || st === "Dropped" || st === "Live";
  if (facts && k === "value" && live3 && putV !== 1) viol.push("I3");
  if (!facts && k === "value" && st === "Dropped") {
    if ((s.confirmed && !s0.confirmed) || s.lastOwn || s.slot !== s0.slot || s.box.length !== s0.box.length) viol.push("I16");
  }
  if (!facts && (k === "proof") && s.confirmed && !s0.confirmed && !s0.lastOwn) viol.push("I17");
  return { s, viol, ev, lev };
}

// Pump events: admission and the end of a turn.
export function admit(s0: Sess, admitReleased = false): SR | null {
  const s = clone(s0), viol: string[] = [], ev: string[] = [];
  const rel = s.st === "Releasing" || s.st === "Released";
  if (s.kind === "facts") {
    if (!s.inFlight || s.adm) return null;
    if (rel && !admitReleased) { ev.push("Discarded{Released}"); s.inFlight = null; s.Q = []; s.mfDiff = 0; return { s, viol, ev, lev: [] }; }
    if (rel) viol.push("I11");
    s.adm = true; if (s.inFlight.t !== "value") s.mfDiff--;
    return { s, viol, ev: ["admit:" + s.inFlight.t], lev: [] };
  }
  const it = s.box.shift(); if (!it) return null;
  if (rel && !admitReleased) { ev.push("Discarded{Released}"); if (it.t === "value") s.slot = null; else s.mfDiff = 0; return { s, viol, ev, lev: [] }; }
  if (rel) viol.push("I11");
  if (it.t === "failure") { s.mfDiff--; return { s, viol, ev: ["admit:failure"], lev: [] }; }
  const ok = s.slot !== null && s.st === "Live" && s.slotCur;
  if (ok || (!C.admitNeedsLive && s.slot !== null)) {
    if (!(s.st === "Live" && s.slotCur)) viol.push("I9");
    if (s.st === "Live" && s.confirmed && s.lastV !== null && s.slot !== s.lastV) viol.push("I24x"); // the delivered slot is stale
    s.heard = s.slot; ev.push("admit:value");
  } else ev.push("Discarded{NotLive}");
  s.slot = null; s.slotCur = false;
  reconcile(s);
  return { s, viol, ev, lev: [] };
}
export function turnEnd(s0: Sess): SR | null {
  if (s0.kind !== "facts" || !s0.inFlight || !s0.adm) return null;
  const s = clone(s0); s.inFlight = null; s.adm = false; if (s.Q.length) s.inFlight = s.Q.shift()!;
  return { s, viol: [], ev: ["turnEnd"], lev: [] };
}
export function canPull(s: Sess): boolean {
  if (s.st !== "Opening" && s.st !== "Dropped" && s.st !== "Live") return false;
  return s.kind === "state" || (s.Q.length === 0 && s.inFlight === null);
}
export function sessInv(s: Sess): string[] {
  const v: string[] = [];
  if (s.kind === "state" && s.st === "Live" && s.confirmed) {
    if (s.lastV === null || !(s.lastCur || s.reconfCur)) v.push("I8");
    if (s.lastV !== null && s.lastV !== s.heard && !(hasValueDelivery(s) && s.slot === s.lastV)) v.push("I24");
  }
  if (s.Q.length > 3 || (s.kind === "facts" && s.Q.length && !s.inFlight)) v.push("I7");
  if (s.box.filter((i) => i.t === "value").length > 1 || s.box.filter((i) => i.t === "failure").length > 1 || s.box.length > 2) v.push("I7");
  if (s.st !== "Releasing" && s.st !== "Released") {
    if (s.mfDiff !== pendingMF(s)) v.push("I6");
    let t: Sess = s; // liveness half: draining admits every queued missed and failure
    for (let i = 0; i < 8; i++) { const a = admit(t); if (a) { t = a.s; continue; } const e = turnEnd(t); if (e) { t = e.s; continue; } break; }
    if (t.mfDiff !== 0 || pendingAny(t) !== 0) v.push("I6");
  }
  return v;
}

// ---- 3.3 Feed.callback ----------------------------------------------------------------------------------------
export const BUFFER = 2;
export type Sig = "down" | "proof" | "live" | "lost" | "reset";
export interface Grp { d1: boolean; live?: "proof" | "live" | "lost" | "reset"; ra?: number; d2: boolean; ep: number; src: string; pulled: boolean }
export type CEnt = { v: number; ep: number; need: boolean } | { g: Grp };
export interface Cb { q: CEnt[]; closing: "open" | "fail" | "end"; fe: string; released: boolean; wt: number; ovf: boolean }
export const cbInit = (): Cb => ({ q: [], closing: "open", fe: "e", released: false, wt: 0, ovf: false });
const rank = { reset: 0, lost: 1, live: 2, proof: 3 } as const;
const nvals = (c: Cb) => c.q.filter((e) => "v" in e).length;
export function cbEmitValue(c0: Cb, v: number, ep: number, need: boolean): { c: Cb; ev: string } {
  const c = clone(c0);
  if (c.closing !== "open" || c.released) return { c, ev: "evidence:noop" };
  if (nvals(c) < BUFFER) { c.q.push({ v, ep, need }); if (nvals(c) === BUFFER) c.wt++; return { c, ev: "value:append" }; }
  c.closing = C.overflowFails ? "fail" : "end"; c.fe = "Overflow"; c.ovf = true; return { c, ev: "value:overflow" };
}
export function cbEmitSignal(c0: Cb, k: Sig, ep: number, ra?: number): { c: Cb; ev: string; viol: string[] } {
  const c = clone(c0), viol: string[] = [];
  if (c.closing !== "open" || c.released) return { c, ev: "evidence:noop", viol };
  const full = nvals(c) >= BUFFER;
  if (full && !C.keepStatusWhenFull) return { c, ev: "signal:evicted", viol };
  let tail = c.q[c.q.length - 1];
  if (!tail || "v" in tail) { tail = { g: { d1: false, d2: false, ep, src: "", pulled: false } }; c.q.push(tail); }
  const g = (tail as { g: Grp }).g;
  g.src += ({ down: "d", proof: "p", live: "u", lost: "o", reset: "r" } as const)[k]; g.ep = Math.max(g.ep, ep);
  if (!C.groupOrderAware) { if (k === "down") g.d1 = true; else { g.live = g.live === undefined || rank[k] < rank[g.live] ? k : g.live; } }
  else if (k === "down") { if (g.live) g.d2 = true; else g.d1 = true; }
  else {
    if (g.d2) { g.d1 = true; g.d2 = false; }
    g.live = g.live === undefined || rank[k] < rank[g.live] ? k : g.live;
    if (k === "reset") g.ra = ra;
  }
  // 3.3: no merge upgrades an answer, hides a drop, or loses the order of the last signal
  if (!g.pulled) {
    const rk: Record<string, number> = { p: 3, u: 2, o: 1, r: 0 };
    const lives = [...g.src].filter((x) => x !== "d").map((x) => rk[x]!);
    if (g.src.includes("d") && !(g.d1 || g.d2)) viol.push("CB-down-lost");
    const last = g.src[g.src.length - 1]!;
    if (last === "d" ? !(g.d2 || (!g.live && g.d1)) : g.d2) viol.push("CB-order");
    if (g.live && lives.length && rank[g.live] > Math.min(...lives)) viol.push("CB-upgrade");
  }
  return { c, ev: full ? "signal:merge-full" : "signal:merge", viol };
}
export function cbClose(c0: Cb, how: "fail" | "end"): { c: Cb; ev: string } {
  const c = clone(c0);
  if (c.closing !== "open" || c.released) return { c, ev: "evidence:noop" };
  c.closing = how; return { c, ev: how };
}
export function cbRelease(c0: Cb): Cb { const c = clone(c0); c.released = true; return c; }
export function cbPull(c0: Cb): { c: Cb; inp: SIn } | null {
  const c = clone(c0);
  const resolve = () => { if (c.wt > 0 && nvals(c) < BUFFER && c.closing === "open" && !c.released) c.wt--; };
  const h = c.q[0];
  if (h) {
    if ("v" in h) { c.q.shift(); resolve(); return { c, inp: { k: "value", v: h.v, ep: h.ep, need: h.need } }; }
    const g = h.g; g.pulled = true;
    if (g.d1) { g.d1 = false; if (!g.live && !g.d2) c.q.shift(); return { c, inp: { k: "down", v: 1, ep: g.ep } }; }
    if (g.live) { const l = g.live; g.live = undefined; if (!g.d2) c.q.shift(); return { c, inp: { k: l === "live" ? "live" : l, ep: g.ep, ra: g.ra } }; }
    g.d2 = false; c.q.shift(); return { c, inp: { k: "down", v: 1, ep: g.ep } };
  }
  if (c.closing === "fail") return { c, inp: { k: "fail", e: c.fe } };
  if (c.closing === "end" || c.released) return { c, inp: { k: "complete" } };
  return null;
}
export function cbInv(c: Cb): string[] {
  const v: string[] = [];
  if (nvals(c) > BUFFER) v.push("I7-cb");
  for (let i = 1; i < c.q.length; i++) if ("g" in c.q[i]! && "g" in c.q[i - 1]!) v.push("I7-cb");
  if (c.wt > 1 || (c.wt > 0 && nvals(c) < BUFFER && !c.released && c.closing === "open")) v.push("CB-waiter");
  return v;
}

// ---- 3.4 Feed.reconnect ----------------------------------------------------------------------------------------
export const RCFG = { catchUp: true, from: 0 as number | null, nopos: false, sched: 2, psched: 2, buf: 2, hmax: 3, tick: true };
export type Ph = "Connecting" | "Live" | "CatchingUp" | "Waiting" | "Done";
export type Emit = { t: "sig"; k: "proof" | "live" | "lost" | "reset" | "fresh" | "pending" | "settleP" | "settleL" | "down" | "fail"; ra?: number } | { t: "value"; v: number };
interface BV { v: number; p: number | null }
export interface Rc {
  ph: Ph; rel: boolean; sig: boolean; any: boolean; last: number | null; n: number; ls: number; ring: number[]; cursor: number | null; buf: BV[];
  ec: number; ps: number; pw: "none" | "req" | "wait"; pstale: boolean; settled: boolean; head: number; sock: number | null;
  exp: number | null; em: number[]; opens: number; ts: boolean; greg: boolean; starts: number; gsig: boolean; seenV: boolean;
}
export interface RR { r: Rc; out: Emit[]; viol: string[]; ev: string[] }
const posOf = (v: number) => (RCFG.nopos ? null : v);
export function rInit(): RR {
  const viol: string[] = [], out: Emit[] = [];
  const r: Rc = { ph: "Connecting", rel: false, sig: false, any: false, last: RCFG.from, n: 0, ls: 0, ring: [], cursor: null, buf: [], ec: 0, ps: 0, pw: "none", pstale: false, settled: false,
    head: 0, sock: 1, exp: RCFG.from, em: [], opens: 1, ts: false, greg: false, starts: 0, gsig: false, seenV: false };
  if (!C.catchUpAfterLive && RCFG.catchUp && r.last !== null) { startRepair(r, out, viol, true, true); r.sock = null; }
  return { r, out, viol, ev: [] };
}
export function rCell(ph: Ph, row: string): "defined" | "cannot" {
  const page = ["pageOk", "cannotRepair", "pageFailW", "pageFailT", "pageDelay"].includes(row);
  if (ph === "Done") return row === "release" ? "defined" : "cannot";
  if (ph === "Waiting") return row === "delay" || row === "release" ? "defined" : "cannot";
  if (row === "delay") return "cannot";
  if (page) return ph === "CatchingUp" ? "defined" : "cannot";
  return "defined";
}
const START = ["proof", "live", "lost", "reset", "fresh", "pending"];
function emitSig(r: Rc, out: Emit[], viol: string[], k: any, ra?: number) {
  if (START.includes(k)) { if (r.starts >= 1 && !r.seenV) viol.push("I20b"); r.starts = Math.min(r.starts + 1, 2); r.gsig = true; }
  if (k === "down") { r.starts = 0; r.seenV = false; }
  out.push({ t: "sig", k, ra });
}
function emitDown(r: Rc, out: Emit[], viol: string[]) { emitSig(r, out, viol, "down"); }
function emitReal(r: Rc, out: Emit[], viol: string[], v: number) {
  if (r.em.includes(v)) viol.push("I13");
  r.em = [...r.em.slice(-5), v]; r.seenV = true; out.push({ t: "value", v });
}
function emitValue(r: Rc, out: Emit[], viol: string[], b: BV) {
  if (r.ring.length) { if (b.p !== null && r.ring.includes(b.p)) return; r.ring = []; }
  emitReal(r, out, viol, b.v);
  if (C.lastIsEmitted) { if (b.p !== null) r.last = b.p; r.exp = b.p ?? r.exp; } else if (b.p !== null) r.last = Math.max(r.last ?? 0, b.p);
  if (b.p !== null) r.exp = b.p;
  r.any = true;
}
function startRepair(r: Rc, out: Emit[], viol: string[], withPending: boolean, atConnect = false) {
  if (r.last !== r.exp) viol.push("I4");
  if (withPending) { r.starts = atConnect ? 0 : r.starts; if (C.pendingAnnounced) emitSig(r, out, viol, "pending"); else emitSig(r, out, viol, "proof"); }
  r.ph = "CatchingUp"; r.cursor = r.last; r.buf = []; r.ring = []; r.ec = 0; r.settled = false; r.ps = 0; r.pw = "req";
}
function abandon(r: Rc, out: Emit[], viol: string[]) {
  if (C.cancelPageOnEnd) r.pw = "none"; else if (r.pw !== "none") r.pstale = true;
  if (!C.discardBufferOnAbandon) for (const b of r.buf) { if (r.pstale || true) { emitReal(r, out, viol, b.v); viol.push("I21"); } }
  r.buf = []; r.ring = [];
}
function register(r: Rc, out: Emit[], viol: string[], k: "live" | "lost", implicit = false) {
  if (!implicit && r.gsig === false) { /* first start of the connection */ }
  if (implicit && r.gsig) viol.push("I20");
  r.sig = implicit ? C.signalledSetByImplicit : true; r.ls = 1; r.greg = true;
  if (RCFG.catchUp && r.last !== null) startRepair(r, out, viol, true);
  else {
    if (k === "live" && r.last === null && (!C.freshOnlyFirst || !r.any)) emitSig(r, out, viol, "fresh");
    else emitSig(r, out, viol, k);
    r.ph = "Live";
  }
  if (!implicit) r.sock = r.head + 1;
}
function complete(r: Rc, out: Emit[], viol: string[], how: string) {
  if (!r.settled) emitSig(r, out, viol, C.pendingAnnounced ? "settleP" : "live");
  r.ph = "Live"; r.pw = "none";
  const b = r.buf; r.buf = [];
  for (const x of b) emitValue(r, out, viol, x);
  if (!C.ringKeptAfterComplete) r.ring = [];
  if (how !== "last" && how !== "cannot") viol.push("I18");
}
function dropConn(r: Rc, out: Emit[], viol: string[], ev: string[]) {
  if (r.ph === "CatchingUp") abandon(r, out, viol);
  emitDown(r, out, viol);
  if (r.ls === 2) r.n = 0;
  if (C.liveSinceCleared) { r.ls = 0; r.greg = false; }
  r.sock = null;
  if (r.n < RCFG.sched) { r.n++; r.ph = "Waiting"; } else { out.push({ t: "sig", k: "fail" }); r.ph = "Done"; ev.push("exhausted"); }
}
function pageRequest(r: Rc, viol: string[], first: boolean) { if (first && r.cursor !== r.exp) viol.push("I4"); r.pw = "req"; }
export interface RMove { label: string; row: string; fn: (r: Rc) => RR }
export function rMoves(r: Rc): RMove[] {
  const mv: RMove[] = [];
  const mk = (label: string, row: string, body: (r: Rc, out: Emit[], viol: string[], ev: string[]) => void) =>
    mv.push({ label, row, fn: (r0) => { const r = clone(r0), out: Emit[] = [], viol: string[] = [], ev: string[] = [`R|${r0.ph}|${row}`]; body(r, out, viol, ev); return { r, out, viol, ev }; } });
  if (r.head < RCFG.hmax) mk("server append", "env", (r) => { r.head++; });
  if (RCFG.tick) mk("tick (resetAfter passes)", "env", (r) => { if (r.ls === 1) r.ls = 2; if (r.greg && r.ph !== "Waiting") r.ts = true; });
  if (r.rel) return mv;
  const connected = r.ph === "Connecting" || r.ph === "Live" || r.ph === "CatchingUp";
  if (connected) {
    const rep = r.ph === "CatchingUp";
    if (r.last !== null && !RCFG.nopos) mk("inner proof(b)", "proof", (r, out, viol) => {
      if (r.ph === "CatchingUp") return; // evidence
      r.sock = r.last! + 1;
      if (r.ph === "Connecting") { emitSig(r, out, viol, "proof"); r.sig = true; r.ls = 1; r.greg = true; r.ph = "Live"; } else out.push({ t: "sig", k: "proof" }); // a repeat proof starts nothing
    });
    for (const p of ["live", "lost"] as const) mk(`inner ${p === "live" ? "live()" : "lost(r)"}`, "live", (r, out, viol) => {
      r.sock = r.head + 1;
      if (r.ph === "CatchingUp") { abandon(r, out, viol); startRepair(r, out, viol, false); return; }
      if (r.ph === "Live") { r.starts = 0; r.seenV = false; r.gsig = false; }
      register(r, out, viol, p);
    });
    mk("inner reset(r, at)", "reset", (r, out, viol) => {
      const at = r.head; r.sock = r.head + 1;
      if (r.ph === "CatchingUp") abandon(r, out, viol);
      r.last = at; r.exp = at; emitSig(r, out, viol, "reset", at);
      if (r.ph !== "CatchingUp") { r.sig = true; r.ls = 1; r.greg = true; }
      r.ph = "Live"; r.em = [];
    });
    mk("inner down(r)", "down", (r, out, viol) => {
      r.sock = r.head + 1;
      if (r.ph === "CatchingUp") abandon(r, out, viol);
      emitDown(r, out, viol);
      if (r.ph === "Connecting") r.sig = true; else { if (r.ph === "Live") r.sig = true; r.ph = "Connecting"; }
      r.ls = 0; r.greg = false;
    });
    if ((r.sock !== null && r.sock <= r.head) || (r.sock === null && r.head >= 1)) mk("inner value", "value", (r, out, viol, ev) => {
      const pos = r.sock ?? r.head; r.sock = pos + 1;
      const b: BV = { v: pos, p: posOf(pos) };
      if (!C.resetOnlyAtFail && !r.seenV && !rep) r.n = 0;
      if (r.ph === "CatchingUp") {
        if (!C.lastIsEmitted && b.p !== null) r.last = Math.max(r.last ?? 0, b.p);
        r.buf.push(b); if (r.buf.length > RCFG.buf) dropConn(r, out, viol, ev);
        return;
      }
      if (r.ph === "Connecting" && !r.sig) {
        register(r, out, viol, "live", true);
        if ((r.ph as Ph) === "CatchingUp") { r.buf = [b]; return; }
      }
      emitValue(r, out, viol, b);
    });
    mk("inner fails (while) / Overflow", "failW", (r, out, viol, ev) => dropConn(r, out, viol, ev));
    mk("inner completes (Closed)", "failW", (r, out, viol, ev) => {
      if (r.ph === "CatchingUp" && !C.completeOnlyOnLastPage) { abandon(r, out, viol); r.buf = []; r.ph = "Live"; viol.push("I18"); return; }
      dropConn(r, out, viol, ev);
    });
    mk("inner fails (not while)", "failT", (r, out, viol) => {
      if (r.ph === "CatchingUp") abandon(r, out, viol);
      out.push({ t: "sig", k: "fail" }); r.ph = "Done"; r.sock = null;
    });
    if (r.ph === "CatchingUp" && (r.pw === "req" || r.pstale)) {
      const page = (kind: "more" | "emptyMore" | "last") => (r: Rc, out: Emit[], viol: string[], ev: string[]) => {
        if (r.pstale) viol.push("I21");
        let vals: number[] = [], nextSome = false;
        const c = r.cursor ?? 0;
        if (kind === "more") { if (c < r.head) { vals = [c + 1]; nextSome = c + 1 < r.head; } }
        else if (kind === "emptyMore") nextSome = true;
        else for (let p = c + 1; p <= r.head; p++) vals.push(p);
        for (const p of vals) {
          emitReal(r, out, viol, p);
          if (!RCFG.nopos) { r.last = p; r.exp = p; r.ring = [...r.ring, p].slice(-(READ.repair ? 8 : RCFG.buf)); }
          r.any = true;
        }
        if (r.pstale) { r.pw = "none"; r.pstale = false; return; }
        r.ec = vals.length === 0 && nextSome ? Math.min(r.ec + 1, 3) : 0; r.ps = 0;
        if (r.ec === 2) { retry(r, out, viol, ev); return; }
        if (nextSome && !(kind === "emptyMore" && !C.completeOnlyOnLastPage)) { r.cursor = vals.length ? vals[vals.length - 1]! : c; pageRequest(r, viol, false); return; }
        if (nextSome) viol.push("I18");
        complete(r, out, viol, "last");
      };
      const retry = (r: Rc, out: Emit[], viol: string[], ev: string[]) => {
        if (r.ps < RCFG.psched && C.pageRetryKeepsSocket) { r.ps++; r.pw = "wait"; ev.push("pageRetry"); return; }
        if (r.ps < RCFG.psched) viol.push("I19");
        dropConn(r, out, viol, ev);
      };
      mk("page ok (more)", "pageOk", page("more")); mk("page ok (empty, more)", "pageOk", page("emptyMore")); mk("page ok (last)", "pageOk", page("last"));
      mk("page CannotRepair", "cannotRepair", (r, out, viol, ev) => {
        if (!C.cannotRepairExits) { retry(r, out, viol, ev); return; }
        emitSig(r, out, viol, "settleL"); r.settled = true; complete(r, out, viol, "cannot");
      });
      if (!READ.repair) mk("page CannotRepair(continueAt)", "cannotRepair", (r, out, viol, ev) => {
        if (!C.cannotRepairExits) { retry(r, out, viol, ev); return; }
        emitSig(r, out, viol, "settleL"); r.settled = true; r.cursor = r.head; pageRequest(r, viol, false);
      });
      mk("page fails (while)", "pageFailW", retry);
      mk("page fails (not while)", "pageFailT", (r, out, viol) => { abandon(r, out, viol); out.push({ t: "sig", k: "fail" }); r.ph = "Done"; r.sock = null; });
    }
    if (r.pstale && r.ph !== "CatchingUp") mk("stale page ok (last)", "pageOk", (r, out, viol) => {
      viol.push("I21"); for (let p = (r.cursor ?? 0) + 1; p <= r.head; p++) emitReal(r, out, viol, p); r.pw = "none"; r.pstale = false;
    });
    if (r.ph === "CatchingUp" && r.pw === "wait") mk("page delay elapsed", "pageDelay", (r, _o, viol) => pageRequest(r, viol, false));
  } else if (r.ph === "Waiting") {
    mk("reconnect delay elapsed", "delay", (r, out, viol) => {
      if (r.last !== r.exp) viol.push("I4");
      if (r.ts) r.opens = 1; else r.opens++; r.ts = false;
      if (r.opens > RCFG.sched + 1) viol.push("I12");
      r.opens = Math.min(r.opens, RCFG.sched + 2);
      r.ph = "Connecting"; r.sig = false; r.seenV = false; r.gsig = false; r.starts = 0; r.sock = r.head + 1; r.ls = C.liveSinceCleared ? 0 : r.ls; r.greg = false;
      if (!C.catchUpAfterLive && RCFG.catchUp && r.last !== null) { startRepair(r, out, viol, true, true); r.sock = null; }
    });
  }
  mk("release", "release", (r) => { r.rel = true; r.pw = "none"; r.buf = []; r.sock = null; r.ph = "Done"; });
  return mv;
}
export function rInv(r: Rc): string[] {
  const v: string[] = [];
  if (r.buf.length > RCFG.buf || r.ring.length > (READ.repair ? 8 : RCFG.buf)) v.push("I7-buf");
  if (r.ph !== "CatchingUp" && r.buf.length) v.push("I7-buf");
  return v;
}

// ---- 3.5 write progress -----------------------------------------------------------------------------------------
export interface Pg { nA: number; addr: number; ended: boolean[]; prog: (number | null)[]; seen: number | null }
export const pgInit = (): Pg => ({ nA: 1, addr: 1, ended: [false, false, false], prog: [null, null, null], seen: null });
export const pgRow = (p: Pg) => (p.addr ? p.prog[p.addr - 1]! : null);
export function pgMoves(p: Pg): { label: string; next: Pg; viol: string[]; ev: string[] }[] {
  const out: { label: string; next: Pg; viol: string[]; ev: string[] }[] = [];
  const row0 = pgRow(p);
  const add = (label: string, ev: string, f: (q: Pg) => void, allowed: boolean) => {
    const q = clone(p); f(q); const viol: string[] = [];
    if (pgRow(q) !== row0 && !allowed) viol.push("I14");
    out.push({ label, next: q, viol, ev: [ev] });
  };
  for (let a = 1; a <= p.nA; a++) for (const v of [1, 2]) {
    const first = a === p.addr && !p.ended[a - 1];
    add(`setter progress(${v}) by Attempt ${a}`, `P|${first ? "addr" : "other"}|setter`, (q) => {
      if (first || !C.setterOnlyAddr) q.prog[(C.setterOnlyAddr ? a : q.addr) - 1] = v;
    }, first);
  }
  for (let a = 1; a <= p.nA; a++) {
    const first = a === p.addr && !p.ended[a - 1];
    const q = clone(p); q.seen = q.prog[a - 1]!; if (first) q.ended[a - 1] = true;
    out.push({ label: `ending of Attempt ${a} admitted`, next: q, viol: [], ev: [`P|${first ? "addr" : "other"}|ending`] });
  }
  if (p.nA < 3) { const q = clone(p); q.nA++; out.push({ label: "new Attempt", next: q, viol: [], ev: [] }); }
  if (p.addr < p.nA) add("promotion", "P|addr|promotion", (q) => { q.addr++; q.prog[q.addr - 1] = null; }, true);
  add("restore", "P|addr|restore", (q) => { q.prog = [null, null, null]; }, true);
  return out;
}

// ---- 3.6 listen coverage ------------------------------------------------------------------------------------------
export interface Ls { D: boolean; evs: number[]; reads: { s: number; U: boolean }[]; landed: { U: boolean } | null; t: number; sub: boolean }
export const lInit = (): Ls => ({ D: true, evs: [], reads: [{ s: 0, U: false }], landed: null, t: 1, sub: true });
export function lNorm(l: Ls): Ls {
  const ticks = [...l.evs, ...l.reads.map((r) => r.s), l.t].sort((a, b) => a - b), rk = (x: number) => ticks.indexOf(x);
  return { ...l, evs: l.evs.map(rk), reads: l.reads.map((r) => ({ ...r, s: rk(r.s) })), t: ticks.length - 1 + 0 * rk(l.t) };
}
export function lEvent(l0: Ls, e: string): Ls {
  const l = clone(l0);
  if (e === "D") { if (C.listenPendingDown) l.D = true; }
  else if (e === "P") l.D = false;
  else if (e === "E") l.evs.push(l.t++);
  else if (e === "G") {
    l.D = false;
    for (const r of l.reads) r.U = true; if (l.landed) l.landed.U = true; // ghost: an unproven start happened after those reads started
    if (C.listenGapStale) {
      l.evs.push(l.t++);
      if (l.sub && l.reads.length < 3) l.reads.push({ s: l.t++, U: false });
    }
  }
  return l;
}
export function lReadStart(l0: Ls): Ls { const l = clone(l0); if (l.reads.length < 3) l.reads.push({ s: l.t++, U: false }); return l; }
export function lReadLand(l0: Ls): Ls | null {
  if (!l0.reads.length) return null;
  const l = clone(l0), r = l.reads.shift()!;
  l.evs = l.evs.filter((e) => e > r.s); l.landed = { U: r.U };
  return l;
}
export function lFresh(l: Ls): boolean { return !l.D && l.evs.length === 0 && l.landed !== null; }
export function lInv(l: Ls, s: Sess): string[] {
  if (!lFresh(l)) return [];
  if (READ.repair && s.st !== "Live" && s.st !== "Opening" && s.st !== "Dropped") return [];
  const bad = s.st !== "Live" || s.answer === "pending" || l.landed!.U;
  return bad ? ["I15"] : [];
}
