// Executable model of proposal-v2.md revision 7.1 (f055417c), section 3: 3.1 session, 3.2 pump, 3.3 Feed.callback queue, 3.4 Feed.reconnect,
// 3.5 write progress, 3.6 listen coverage.
// Types: `tsc -p .`   Run: bun main.ts
// Ghost fields (mfDiff, gpos, needM, dv, em, opens, ts, gls, gsig, impl, exp, nv, age0) belong to the checks, never to the behaviour.

declare const process: any;

// ---- rules that the mutants revert (spec value is `true` everywhere; mutations.py flips one line) ---------------
export const CONFIG = {
  missedBeforeDroppedFact: true, // 3.1 value/Dropped facts: unless owed, deliver missed Unproven first
  openingValueUnproven: true, //    3.1 value/Opening: the plain-Stream case is start(unproven)
  startOwnMissed: true, //          3.1 start(): every unproven start delivers its own missed (principle 1)
  secondDownResetsOwed: true, //    3.1 down/Dropped: a second drop is a second interruption
  keepStatusWhenFull: true, //      3.3: signals are never evicted
  groupOrderAware: true, //         3.3: group is (down1, live, down2)
  mergeWeakest: true, //            3.3: a merge keeps the weaker answer
  admitNeedsLive: true, //          3.2: state admission needs st = Live and slotConn = conn
  droppedValueNotCurrent: true, //  3.1 value/Dropped state: not current, nothing delivered
  droppedValueNotOwn: true, //      3.1 value/Dropped state: own = false
  noEqualityOnFacts: true, //       SR2
  catchUpAfterLive: true, //        3.4: the repair starts at the live signal, not at connect
  completeOnlyOnLastPage: true, //  3.4: only a meet, next = none, or CannotRepair leaves CatchingUp
  meetAtFirstCommon: true, //       3.4 pageValue(): the pages stop at the first position the buffer holds (principle 2)
  emptyRunGE: true, //              3.4 page ok: emptyRun >= 2 (not exactly 2)
  emptyKeepsBudget: true, //        3.4 page ok: pageSched is refreshed only by a page with values
  pageRetryKeepsSocket: true, //    3.4: a retryable page failure keeps the socket while pageSched has steps
  successorAfterClosed: true, //    3.1: a successor starts only after scope closed
  lastIsEmitted: true, //           3.4: last = position of the last value emitted downstream
  proofNeedsOwn: true, //           3.1: a proof confirms only an own last
  discardBufferOnAbandon: true, //  3.4 abandon(): nothing buffered is emitted
  cancelPageOnEnd: true, //         3.4 abandon(): the page read is interrupted
  signalledSetByImplicit: true, //  3.4 register(): signalled = true for the implicit start
  reconcileAfterProof: true, //     3.1: a re-confirm goes through reconcile
  clearSlotWhenEqual: true, //      3.1 reconcile: a newer value equal to heard clears the slot
  listenChecksState: true, //       3.6: a covering session that is not Live makes r stale (an end is not cleared by a read)
  listenChecksPending: true, //     3.6: a pending answer makes r stale
  setterOnlyAddr: true, //          3.5: only the addressable, un-ended Attempt writes the row
  liveSinceCleared: true, //        3.4: liveSince = none at a drop and at connect
  resetOnlyAtFail: true, //         3.4: the budget resets only in dropConn after resetAfter registered
  pendingAnnounced: true, //        3.4 startRepair(): emit pending (C1), not a proof
  cannotRepairExits: true, //       3.4: CannotRepair leaves the repair (C2)
  overflowFails: true, //           3.3: an overflowing queue fails with Overflow (C6)
  valueAtDropAt: true, //           3.1 value/Dropped: at = dropAt (a cached value keeps the drop's time)
  ageRebased: true, //              3.1 initial: at is rebased from the transferred age
  registeredPerSlice: true, //      3.1 (S10): registered belongs to the memory slice and survives release, re-entry, thaw and reload
  valueSetsRegistered: true, //     3.1 (rev 7.1): a delivered value sets registered, as a start does
  settleCarriesInitial: true, //    3.1 settle(lost r): the missed carries pendingInitial (RV5 M2)
  ignoreOnlyUnproven: true, //      S10: the handler ignores only an initial Unproven missed on an empty memory
  handlerIgnoresOnlyInitial: true, // S9: a missed handler may ignore only an initial missed on an empty memory (RV4 H1 b)
  waitAnyPath: true, //             2.5: a new session waits for a releasing session of the same (actor, operation, key) at any path (S9, RV4 M1)
  freshNeedsDeclared: true, //      3.4 register(): fresh only when the options declare from (S8, RV3 H1)
  identityHasPath: true, //         3.1: a session is identified by its placement path too (S8, RV3 H2)
  pagesOldestFirst: true, //        3.7 P0: pages return values oldest first, after the cursor (S8, RV3 H3)
};
const C = CONFIG;

export type Kind = "facts" | "state";
export type St = "Opening" | "Dropped" | "Live" | "Ended" | "Releasing" | "Released";
export type Answer = "none" | "proven" | "fresh" | "pending" | "unproven" | "lost" | "reset" | "abandoned";
export const STATES: St[] = ["Opening", "Dropped", "Live", "Ended", "Releasing", "Released"];
export const INPUTS = ["proof", "live", "lost", "reset", "fresh", "pending", "settleP", "settleL", "value", "down", "fail", "complete", "defect", "release", "closed", "bound"];
export const CLOCK = 2; // the session clock saturates here
export interface Item { t: "missed" | "value" | "failure"; k?: string; v?: number; ra?: number; e?: string; initial?: boolean }
export interface Sess {
  kind: Kind; st: St; drop: number; owed: boolean; answer: Answer;
  lastV: number | null; lastOwn: boolean; lastCur: boolean; reconfCur: boolean; confirmed: boolean;
  now: number; dropAt: number | null; endAt: number | null; startAt: number | null; lastAt: number | null; lastDrop: boolean; lastRest: boolean; age0: number; // 3.1 time (state only)
  Q: Item[]; inFlight: Item | null; adm: boolean; // 3.2 facts
  slot: number | null; slotCur: boolean; box: Item[]; heard: number | null; // 3.2 state (queued = box holds a value delivery)
  mfDiff: number; gpos: number | null; needM: boolean; dv: boolean; track: boolean; // ghosts
  conn: number; registered: boolean; gReg: boolean; pInit: boolean; pGInit: boolean; pCov: number | null; mem: boolean; cov: number | null; chk: boolean; // 3.1 conn (capped at 1) and the ghosts of I23: memory holds facts, covered position, a hole check is due
}
export interface SIn { k: string; v?: number; ra?: number; e?: string }
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

export function initSess(kind: Kind, lastV: number | null, heard: number | null, track = false, age = 0): Sess {
  const st = kind === "state" && lastV !== null;
  return { kind, st: "Opening", drop: 0, owed: false, answer: "none", lastV: kind === "state" ? lastV : null, lastOwn: false, lastCur: false, reconfCur: false, confirmed: false,
    now: 1, dropAt: null, endAt: null, startAt: null, lastAt: st ? (C.ageRebased ? 1 - age : age) : null, lastDrop: false, lastRest: st, age0: age,
    Q: [], inFlight: null, adm: false, slot: null, slotCur: false, box: [], heard: kind === "state" ? heard : null, mfDiff: 0, gpos: null, needM: false, dv: false, track, conn: 0, registered: false, gReg: false, pInit: false, pGInit: false, pCov: null, mem: false, cov: null, chk: false };
}
export const pendingMF = (s: Sess) =>
  s.Q.filter((i) => i.t !== "value").length + (s.inFlight && !s.adm && s.inFlight.t !== "value" ? 1 : 0) + s.box.filter((i) => i.t !== "value").length;
export const pendingAny = (s: Sess) => s.Q.length + (s.inFlight && !s.adm ? 1 : 0) + s.box.length;
const hasValueDelivery = (s: Sess) => s.box.some((i) => i.t === "value");
export function tick(s0: Sess): Sess | null { if (s0.now >= CLOCK || s0.kind !== "state") return null; const s = clone(s0); s.now++; return s; }

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
  const state = s.kind === "state";
  let putV = 0;
  const deliver = (it: Item) => {
    if (it.t !== "value") s.mfDiff++;
    if (s.kind === "facts") { s.Q.push(it); if (s.inFlight === null) { s.inFlight = s.Q.shift()!; s.adm = false; } if (s.Q.length > 3) viol.push("I7-Q"); }
    else s.box.push(it);
  };
  let initial = !s.registered, gInitial = !s.gReg;
  const deliverMissed = (kk: string, ini: boolean = initial, gIni: boolean = gInitial) => {
    deliver({ t: "missed", k: kk, ra: inp.ra, initial: ini }); s.needM = false;
    if (ini !== gIni) viol.push("I27"); // every delivered missed carries initial = not registered, as it was before its start
    const why = kk === "U", guard = C.ignoreOnlyUnproven ? why : true;
    const ignored = guard && (C.handlerIgnoresOnlyInitial ? ini && !s.mem : !s.mem); // the machine's handler (S9, S10): it ignores only an initial Unproven missed on an empty memory
    if (ignored) { s.chk = true; s.cov = inp.ra ?? (kk === "L" ? s.pCov : null) ?? s.cov; } else { s.gpos = null; s.chk = false; s.cov = null; }
  };
  const deliverValue = (v: number) => {
    if (s.needM) viol.push("I1");
    if (s.track) {
      if (s.gpos !== null && v !== s.gpos + 1) viol.push("I23");
      if (s.chk && s.cov !== null && v > s.cov + 1) viol.push("I23"); // a start that owed nothing (fresh, proven) or a missed the machine ignored covers no hole
      s.chk = false; s.gpos = v; s.cov = v; s.mem = true;
    }
    putV++; deliver({ t: "value", v }); s.lastV = v;
  };
  const discard = () => ev.push("evidence:discard");
  const start = (a: Answer) => {
    s.lastCur = false; s.slotCur = false; s.reconfCur = false; s.st = "Live"; s.drop = 0; s.answer = a; s.dv = false; s.lastDrop = false; s.startAt = state ? s.now : null; initial = !s.registered; gInitial = !s.gReg;
    if (a === "fresh" && s.gReg) viol.push("I27"); // fresh is answered only while the slice was never registered
    if (a === "pending" && s.kind === "facts") { s.pInit = initial; s.pGInit = gInitial; s.pCov = inp.ra ?? null; }
    s.registered = true; s.gReg = true;
    if (a === "fresh") { s.chk = true; s.cov = s.cov ?? inp.ra ?? s.gpos; } else if (a === "proven") { s.chk = true; s.cov = inp.ra ?? s.gpos; }
    if (s.kind === "facts") {
      if (a === "unproven" || a === "lost" || a === "reset") {
        s.needM = true;
        if (a === "unproven" && s.owed && !C.startOwnMissed) s.needM = false; else deliverMissed(a === "unproven" ? "U" : a === "lost" ? "L" : "R");
      }
      s.owed = false;
    } else s.confirmed = false;
    lev.push(a === "proven" ? "P" : a === "pending" ? "D" : "G");
    reconcile(s);
  };
  const setLast = (v: number, own: boolean, at: number, fromDrop: boolean) => { s.lastV = v; s.lastOwn = own; s.lastAt = at; s.lastDrop = fromDrop; s.lastRest = false; };
  const end = (f: string) => {
    if (st === "Live" && s.confirmed && state) { s.lastAt = s.now; s.lastRest = false; }
    s.st = "Ended"; s.endAt = state ? s.now : null; deliver({ t: "failure", e: f }); if (s.answer === "pending") s.answer = "abandoned"; lev.push("E"); reconcile(s);
  };
  if (k === "proof") {
    if (st === "Releasing") discard();
    else if (st === "Opening") start("proven");
    else if (st === "Dropped") {
      start("proven");
      if (state && (s.lastOwn || !C.proofNeedsOwn)) { s.confirmed = true; s.reconfCur = true; s.lastAt = s.now; }
      if (C.reconcileAfterProof) reconcile(s);
    } else { // Live: no start
      s.answer = "proven";
      if (state && !s.confirmed && (s.lastOwn || !C.proofNeedsOwn)) { s.confirmed = true; s.reconfCur = true; }
      if (C.reconcileAfterProof) reconcile(s);
    }
  } else if (k === "live" || k === "lost" || k === "reset" || k === "fresh" || k === "pending") {
    if (st === "Releasing") discard();
    else if (k === "fresh" && !s.registered && (st === "Opening" || st === "Dropped")) start("fresh"); // a first connection, also one that failed before registering (RV3 M1)
    else if (k === "fresh") { ev.push("evidence:fresh"); start("unproven"); } // the slice is registered: read as live()
    else start(k === "live" ? "unproven" : (k as Answer));
  } else if (k === "settleP" || k === "settleL") {
    if (st === "Releasing") discard();
    else if (s.answer === "pending") {
      if (k === "settleP") { s.answer = "proven"; lev.push("P"); s.chk = true; s.cov = s.gpos ?? s.cov; }
      else { s.answer = "lost"; if (s.kind === "facts") { s.needM = true; deliverMissed("L", C.settleCarriesInitial ? s.pInit : false, s.pGInit); } lev.push("G"); }
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
        else { setLast(v, true, s.now, false); s.lastCur = true; s.confirmed = true; reconcile(s); }
      } else { // Dropped: not current
        if (state) {
          setLast(v, !C.droppedValueNotOwn, C.valueAtDropAt ? s.dropAt ?? s.now : s.now, true);
          if (!C.droppedValueNotCurrent) { s.confirmed = true; s.lastOwn = true; s.lastCur = true; if (v !== s.heard) { s.slot = v; s.slotCur = true; if (!hasValueDelivery(s)) s.box.push({ t: "value" }); } }
        } else {
          if (!s.dv) { s.needM = true; s.dv = true; }
          if (!s.owed) { if (C.missedBeforeDroppedFact) { deliverMissed("U"); s.owed = true; } }
          deliverValue(v);
        }
        ev.push("evidence:UnprovenValues");
        if (C.valueSetsRegistered) s.registered = true;
        reconcile(s);
      }
    }
  } else if (k === "down") {
    if (st === "Releasing") discard();
    else {
      if (st === "Opening") { s.st = "Dropped"; s.drop = inp.v ?? 1; s.dv = false; s.dropAt = state ? s.now : null; }
      else if (st === "Dropped") { s.drop = inp.v ?? 1; if (C.secondDownResetsOwed) { s.owed = false; s.dv = false; } }
      else { s.st = "Dropped"; s.drop = inp.v ?? 1; s.owed = false; s.dv = false; s.dropAt = state ? s.now : null; if (s.answer === "pending") s.answer = "abandoned"; if (state) { if (s.confirmed) { s.lastAt = s.now; s.lastRest = false; } s.confirmed = false; } }
      lev.push("D"); reconcile(s);
    }
  } else if (k === "fail" || k === "complete" || k === "defect") {
    if (st === "Releasing") discard(); else end(k === "complete" ? "Closed" : k === "defect" ? "Defect" : inp.e ?? "e");
  } else if (k === "release") { if (st !== "Releasing") { s.st = "Releasing"; lev.push("E"); } }
  else if (k === "closed" || k === "bound") s.st = "Released";
  if (k === "value" && st !== "Releasing") { s.gReg = true; if (!s.registered) viol.push("I27"); } // I27: every delivered value sets registered
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
    if (s.st === "Live" && s.confirmed && s.lastV !== null && s.slot !== s.lastV) viol.push("I24"); // the admitted event must carry the row's current value
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
  if (s.kind === "state") { // I26: time
    if (s.lastAt !== null && s.lastAt > s.now) v.push("I26");
    if (s.startAt !== null && s.startAt > s.now) v.push("I26");
    if (s.lastAt !== null && s.st === "Dropped" && s.dropAt !== null && s.lastAt > s.dropAt) v.push("I26");
    if (s.lastAt !== null && s.st === "Dropped" && s.lastDrop && s.dropAt !== null && s.lastAt !== s.dropAt) v.push("I26");
    if (s.lastAt !== null && s.st === "Ended" && s.endAt !== null && s.lastAt > s.endAt) v.push("I26");
    if (s.lastRest && s.lastAt !== null && s.lastAt !== 1 - s.age0) v.push("I26"); // a restored, untouched last keeps its age, also after a drop or an end
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
  if (!C.groupOrderAware) { if (k === "down") g.d1 = true; else { g.live = g.live === undefined || (C.mergeWeakest ? rank[k] < rank[g.live] : rank[k] > rank[g.live]) ? k : g.live; } }
  else if (k === "down") { if (g.live) g.d2 = true; else g.d1 = true; }
  else {
    if (g.d2) { g.d1 = true; g.d2 = false; }
    g.live = g.live === undefined || (C.mergeWeakest ? rank[k] < rank[g.live] : rank[k] > rank[g.live]) ? k : g.live;
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
    if ("v" in h) { c.q.shift(); resolve(); return { c, inp: { k: "value", v: h.v } }; }
    const g = h.g; g.pulled = true;
    if (g.d1) { g.d1 = false; if (!g.live && !g.d2) c.q.shift(); return { c, inp: { k: "down", v: 1 } }; }
    if (g.live) { const l = g.live; g.live = undefined; if (!g.d2) c.q.shift(); return { c, inp: { k: l, ra: g.ra } }; }
    g.d2 = false; c.q.shift(); return { c, inp: { k: "down", v: 1 } };
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
export const RCFG = { catchUp: true, from: 0 as number | null, fromDeclared: true, nopos: false, sched: 2, psched: 2, buf: 2, hmax: 3, tick: true };
export type Ph = "Connecting" | "Live" | "CatchingUp" | "Waiting" | "Done";
export type Emit = { t: "sig"; k: "proof" | "live" | "lost" | "reset" | "fresh" | "pending" | "settleP" | "settleL" | "down" | "fail"; ra?: number } | { t: "value"; v: number };
interface BV { v: number; p: number | null }
export interface Rc {
  ph: Ph; rel: boolean; sig: boolean; any: boolean; last: number | null; n: number; ls: number | null; tail: number[]; seen: number[]; cursor: number | null; buf: BV[];
  ec: number; ps: number; pw: "none" | "req" | "wait"; pstale: boolean; settled: boolean; head: number; sock: number | null; ret: number; reg: number | null; now: number;
  exp: number | null; em: number[]; opens: number; ts: boolean; gls: number | null; gsig: boolean; impl: number; nv: number; fv: boolean; ann: boolean;
}
export interface RR { r: Rc; out: Emit[]; viol: string[]; ev: string[] }
const posOf = (v: number) => (RCFG.nopos ? null : v);
export function rInit(from: number | null = RCFG.from, server?: { head: number; ret: number }): RR {
  const viol: string[] = [], out: Emit[] = [];
  const r: Rc = { ph: "Connecting", rel: false, sig: false, any: false, last: from, n: 0, ls: null, tail: [], seen: [], cursor: null, buf: [], ec: 0, ps: 0, pw: "none", pstale: false, settled: false,
    head: server?.head ?? 0, sock: (server?.head ?? 0) + 1, ret: server?.ret ?? 1, reg: (server?.head ?? 0) + 1, now: 0, exp: from, em: [], opens: 1, ts: false, gls: null, gsig: false, impl: 0, nv: 0, fv: false, ann: false };
  if (!C.catchUpAfterLive && RCFG.catchUp && r.last !== null) { startRepair(r, out, viol, true); r.sock = null; r.reg = null; }
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
function emitSig(r: Rc, out: Emit[], k: any, ra?: number) { if (START.includes(k)) { r.gsig = true; r.ann = true; } out.push({ t: "sig", k, ra }); }
function emitReal(r: Rc, out: Emit[], viol: string[], v: number) {
  if (r.em.includes(v)) viol.push("I13");
  r.em = [...r.em.slice(-5), v]; out.push({ t: "value", v });
}
function setLast(r: Rc, b: BV) {
  if (C.lastIsEmitted) { if (b.p !== null) { r.last = b.p; r.exp = b.p; } } else if (b.p !== null) { r.last = Math.max(r.last ?? 0, b.p); r.exp = b.p; }
  r.any = true;
}
function emitValue(r: Rc, out: Emit[], viol: string[], b: BV) { // a socket value
  if (r.tail.length) { if (b.p !== null && r.tail.includes(b.p)) return; r.tail = []; }
  emitReal(r, out, viol, b.v); setLast(r, b);
}
function startRepair(r: Rc, out: Emit[], viol: string[], withPending: boolean) {
  if (r.last !== r.exp) viol.push("I4");
  if (withPending) emitSig(r, out, C.pendingAnnounced ? "pending" : "proof", r.last ?? undefined);
  r.ph = "CatchingUp"; r.cursor = r.last; r.buf = []; r.seen = []; r.tail = []; r.ec = 0; r.settled = false; r.ps = 0; r.pw = "req"; r.nv = 0;
}
function abandon(r: Rc, out: Emit[], viol: string[]) {
  if (C.cancelPageOnEnd) r.pw = "none"; else if (r.pw !== "none") r.pstale = true;
  if (!C.discardBufferOnAbandon) for (const b of r.buf) { emitReal(r, out, viol, b.v); viol.push("I21"); }
  r.buf = []; r.seen = []; r.tail = [];
}
function setSock(r: Rc, v: number) { r.sock = v; r.reg = v; }
function register(r: Rc, out: Emit[], viol: string[], k: "live" | "lost", implicit = false) {
  if (implicit && (r.gsig || r.impl >= 1)) viol.push("I20");
  if (implicit) r.impl++;
  r.sig = implicit ? C.signalledSetByImplicit : true; r.ls = r.now; r.gls = r.now;
  if (RCFG.catchUp && r.last !== null) startRepair(r, out, viol, true);
  else {
    const rp = (r.reg ?? r.head + 1) - 1; // the registration point: everything up to it is covered
    if (k === "live" && r.last === null && (RCFG.fromDeclared || !C.freshNeedsDeclared)) emitSig(r, out, "fresh", rp); else emitSig(r, out, k, rp);
    r.ph = "Live";
  }
  if (!implicit) setSock(r, r.head + 1);
}
function complete(r: Rc, out: Emit[], viol: string[], how: string) {
  r.pw = "none";
  if (!r.settled) emitSig(r, out, C.pendingAnnounced ? "settleP" : "live");
  r.ph = "Live";
  const b = C.meetAtFirstCommon ? r.buf : r.buf.filter((x) => !(x.p !== null && r.seen.includes(x.p))); // mutant: dedupe by the newest page positions
  r.tail = r.buf.length === 0 ? r.seen : [];
  for (const x of b) { emitReal(r, out, viol, x.v); setLast(r, x); }
  r.buf = []; r.seen = [];
  if (how !== "last" && how !== "cannot" && how !== "meet") viol.push("I18");
}
function dropConn(r: Rc, out: Emit[], viol: string[], ev: string[]) {
  if (r.ph === "CatchingUp") abandon(r, out, viol);
  emitSig(r, out, "down");
  if (r.gls !== null && r.now - r.gls >= 1) r.ts = true; // ghost: this connection stayed registered for resetAfter
  if (r.ls !== null && r.now - r.ls >= 1) r.n = 0;
  if (C.liveSinceCleared) r.ls = null;
  r.gls = null; r.sock = null;
  if (r.n < RCFG.sched) { r.n++; r.ph = "Waiting"; } else { out.push({ t: "sig", k: "fail" }); r.ph = "Done"; ev.push("exhausted"); }
}
function pageRequest(r: Rc, viol: string[], first: boolean) { if (first && r.cursor !== r.exp) viol.push("I4"); r.pw = "req"; }
function retry(r: Rc, out: Emit[], viol: string[], ev: string[]) {
  r.nv = Math.min(r.nv + 1, 9); if (r.nv > 2 * (RCFG.psched + 1)) viol.push("I22a");
  if (r.ps < RCFG.psched && C.pageRetryKeepsSocket) { r.ps++; r.pw = "wait"; ev.push("pageRetry"); return; }
  if (r.ps < RCFG.psched) viol.push("I19");
  dropConn(r, out, viol, ev);
}
export interface RMove { label: string; row: string; fn: (r: Rc) => RR }
export function rMoves(r: Rc): RMove[] {
  const mv: RMove[] = [];
  const mk = (label: string, row: string, body: (r: Rc, out: Emit[], viol: string[], ev: string[]) => void) =>
    mv.push({ label, row, fn: (r0) => { const r = clone(r0), out: Emit[] = [], viol: string[] = [], ev: string[] = [`R|${r0.ph}|${row}`]; body(r, out, viol, ev); if (r.ls !== null && r.ls > r.now) viol.push("I26"); return { r, out, viol, ev }; } });
  // P3: the socket's lag behind the log head stays within bufferSize
  if (r.head < RCFG.hmax && (r.sock === null || r.head + 1 - (r.sock - 1) <= RCFG.buf)) mk("server append", "env", (r) => { r.head++; });
  // P1: retention drops a prefix; it never passes the registration point
  if (r.ret <= r.head && (r.reg === null || r.ret < r.reg)) mk("server drops a prefix", "env", (r) => { r.ret++; });
  if (RCFG.tick && r.now < 3) mk("tick (resetAfter passes)", "env", (r) => { r.now++; });
  if (r.rel) return mv;
  const connected = r.ph === "Connecting" || r.ph === "Live" || r.ph === "CatchingUp";
  if (connected) {
    if (r.last !== null && !RCFG.nopos) mk("inner proof(b)", "proof", (r, out) => {
      if (r.ph === "CatchingUp") return; // evidence
      setSock(r, r.last! + 1);
      if (r.ph === "Connecting") { emitSig(r, out, "proof", r.last!); r.sig = true; r.ls = r.now; r.gls = r.now; r.ph = "Live"; } else emitSig(r, out, "proof", r.last!); // a second start with its own answer
    });
    for (const p of ["live", "lost"] as const) mk(`inner ${p === "live" ? "live()" : "lost(r)"}`, "live", (r, out, viol) => {
      setSock(r, r.head + 1);
      if (r.ph === "CatchingUp") { abandon(r, out, viol); startRepair(r, out, viol, false); return; }
      register(r, out, viol, p);
    });
    mk("inner reset(r, at)", "reset", (r, out, viol) => {
      const at = r.head; setSock(r, r.head + 1);
      if (r.ph === "CatchingUp") abandon(r, out, viol);
      r.last = at; r.exp = at; r.tail = []; emitSig(r, out, "reset", at);
      if (r.ph !== "CatchingUp") { r.sig = true; r.ls = r.now; r.gls = r.now; }
      r.ph = "Live"; r.em = [];
    });
    mk("inner down(r)", "down", (r, out, viol) => {
      r.sock = r.head + 1;
      if (r.ph === "CatchingUp") abandon(r, out, viol);
      emitSig(r, out, "down");
      if (r.ph === "Connecting") r.sig = true; else { if (r.ph === "Live") r.sig = true; r.ph = "Connecting"; }
      r.ls = null; r.gls = null;
    });
    if ((r.sock !== null && r.sock <= r.head) || (r.sock === null && r.head >= 1)) mk("inner value", "value", (r, out, viol, ev) => {
      const pos = r.sock ?? r.head; r.sock = pos + 1; if (r.reg === null) r.reg = pos;
      const b: BV = { v: pos, p: posOf(pos) };
      if (!C.resetOnlyAtFail && !r.fv) r.n = 0;
      r.fv = true;
      if (r.ph === "CatchingUp") {
        if (!C.lastIsEmitted && b.p !== null) r.last = Math.max(r.last ?? 0, b.p);
        if (b.p !== null && r.seen.includes(b.p)) { ev.push("evidence:late socket value"); return; } // rev 4.1: the pages already delivered it
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
      if (r.ph === "CatchingUp" && !C.completeOnlyOnLastPage) { abandon(r, out, viol); r.ph = "Live"; viol.push("I18"); return; }
      dropConn(r, out, viol, ev);
    });
    mk("inner fails (not while)", "failT", (r, out, viol) => {
      if (r.ph === "CatchingUp") abandon(r, out, viol);
      out.push({ t: "sig", k: "fail" }); r.ph = "Done"; r.sock = null;
    });
    if (r.ph === "CatchingUp" && (r.pw === "req" || r.pstale)) {
      const reachable = (r.cursor ?? 0) + 1 >= r.ret; // P1: the log still reaches the cursor
      const page = (kind: "more" | "emptyMore" | "last") => (r: Rc, out: Emit[], viol: string[], ev: string[]) => {
        if (r.pstale) viol.push("I21");
        let vals: number[] = [], nextSome = false;
        const c = r.cursor ?? 0;
        if (kind === "more") { if (c < r.head) { vals = [c + 1]; nextSome = c + 1 < r.head; } }
        else if (kind === "emptyMore") nextSome = true;
        else for (let p = c + 1; p <= r.head; p++) vals.push(p);
        if (!C.pagesOldestFirst) vals.reverse(); // mutant: a newest-first source paged as it comes (P0 broken)
        for (const p of vals) {
          const b: BV = { v: p, p: posOf(p) };
          if (C.meetAtFirstCommon && b.p !== null && r.buf.some((x) => x.p === b.p)) { complete(r, out, viol, "meet"); return; } // pageValue(): the meet
          emitReal(r, out, viol, p); setLast(r, b);
          if (b.p !== null) r.seen = [...r.seen, b.p].slice(-RCFG.buf);
        }
        if (r.pstale) { r.pw = "none"; r.pstale = false; return; }
        if (vals.length) r.nv = 0; else r.nv = Math.min(r.nv + 1, 9);
        if (r.nv > 2 * (RCFG.psched + 1)) viol.push("I22a");
        if (vals.length === 0 && nextSome) r.ec = Math.min(r.ec + 1, 3); else { r.ec = 0; r.ps = 0; }
        if (vals.length === 0 && !C.emptyKeepsBudget) r.ps = 0;
        if (C.emptyRunGE ? r.ec >= 2 : r.ec === 2) { const nv0 = r.nv; retry(r, out, viol, ev); r.nv = nv0; return; }
        if (nextSome && !(kind === "emptyMore" && !C.completeOnlyOnLastPage)) { r.cursor = vals.length ? vals[vals.length - 1]! : c; pageRequest(r, viol, false); return; }
        if (nextSome) viol.push("I18");
        complete(r, out, viol, "last");
      };
      if (reachable) { mk("page ok (more)", "pageOk", page("more")); mk("page ok (empty, more)", "pageOk", page("emptyMore")); mk("page ok (last)", "pageOk", page("last")); }
      else {
        mk("page CannotRepair", "cannotRepair", (r, out, viol, ev) => {
          if (!C.cannotRepairExits) { retry(r, out, viol, ev); return; }
          emitSig(r, out, "settleL"); r.settled = true; r.nv = 0; complete(r, out, viol, "cannot");
        });
        mk("page CannotRepair(continueAt)", "cannotRepair", (r, out, viol, ev) => {
          if (!C.cannotRepairExits) { retry(r, out, viol, ev); return; }
          emitSig(r, out, "settleL"); r.settled = true; r.nv = 0; r.cursor = r.ret - 1; pageRequest(r, viol, false);
        });
      }
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
      r.ph = "Connecting"; r.sig = false; r.gsig = false; r.impl = 0; r.fv = false; r.sock = r.head + 1; r.reg = r.sock; r.ls = C.liveSinceCleared ? null : r.ls; r.gls = null;
      if (!C.catchUpAfterLive && RCFG.catchUp && r.last !== null) { startRepair(r, out, viol, true); r.sock = null; r.reg = null; }
    });
  }
  mk("release", "release", (r) => { r.rel = true; r.pw = "none"; r.buf = []; r.sock = null; r.ph = "Done"; });
  return mv;
}
export function rInv(r: Rc): string[] {
  const v: string[] = [];
  if (r.buf.length > RCFG.buf || r.seen.length > RCFG.buf || r.tail.length > RCFG.buf) v.push("I7-buf");
  if (r.ph !== "CatchingUp" && r.buf.length) v.push("I7-buf");
  if (r.ls !== null && r.ls > r.now) v.push("I26");
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


// ---- 3.6 listen coverage: freshness is a function ----------------------------------------------------------------------
// fresh(r) = landed ∧ (every covering s is Live with a settled answer) ∧ (no gap, end or release after readStart[r]).
// `gapAfter` is "lastGap >= readStart" and `old` counts reads in flight that a refetch left behind (EDP: one in flight, one trailing).
export interface Ls { landed: boolean; gapAfter: boolean; old: number; sub: boolean }
export const lInit = (): Ls => ({ landed: false, gapAfter: false, old: 0, sub: true });
export const lNorm = (l: Ls): Ls => l;
function lStartRead(l: Ls) { if (!l.landed) l.old = Math.min(l.old + 1, 1); l.landed = false; l.gapAfter = false; }
export function lEvent(l0: Ls, e: string): Ls {
  const l = clone(l0);
  if (e === "G" || e === "E") { l.gapAfter = true; if (l.sub) lStartRead(l); } // gap events: unproven/lost/reset/fresh starts, settle(lost), end, release
  return l; // down, pending and proven starts are not gap events: they change only the present state
}
export function lReadStart(l0: Ls): Ls { const l = clone(l0); lStartRead(l); return l; }
export function lReadLand(l0: Ls): Ls[] {
  const out: Ls[] = [];
  if (!l0.landed) { const l = clone(l0); l.landed = true; out.push(l); }
  if (l0.old > 0) { const l = clone(l0); l.old--; out.push(l); }
  return out;
}
export function lFresh(l: Ls, s: Sess, checksState: boolean, checksPending: boolean): boolean {
  const covers = s.st !== "Released";
  const present = !covers || ((!checksState || s.st === "Live") && (!checksPending || s.answer !== "pending"));
  return l.landed && !l.gapAfter && present;
}
// I15: the table's freshness equals the function
export function lInv(l: Ls, s: Sess): string[] {
  return lFresh(l, s, C.listenChecksState, C.listenChecksPending) !== lFresh(l, s, true, true) ? ["I15"] : [];
}
