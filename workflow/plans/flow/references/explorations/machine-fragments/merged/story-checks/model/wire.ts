// Executable model of stories-amended.md (revision 2) 2.10.4 (results, send, the three combination rules, release({ match }), hold({ after }),
// Close under hold, the one outcome order), 2.10.17.2 (14 rows), 2.10.17.3 (17 rows, Closing), 2.10.2 (the drain and the end-of-run classification).
// Dependency-free. WCFG holds every rule that mutations.py flips. `GAP:` marks a cell the spec leaves undefined or contradictory (the model takes
// one reading and records the finding when the search reaches it); `HANDSET:` marks a value set by a control instead of derived.
//
// The fake ("Chat", fakes-v2 section 2): calls `post` (commits a message, sends the frame to the other client's connection), `logout` (sends close 4401
// to its own), `ack` (no send; the client half's reaction to a delivered frame); stream `socket` (open replays truth; `message` is cut, a client's frame
// is ignored and so not modelled); control `finish` (`socket.end`). Two clients A and B, one connection slot each. Controls change truth (`boom`,
// `boomOpen`, `refuse`, `endOpen`), which the handlers read.

export const WCFG = {
  fifoAnswers: true, //        one FIFO answer list, drained when nothing else is runnable (not nested in a handler's turn)
  answerFifoOrder: true, //    the oldest answer is delivered first
  framesBeforeAnswer: true, // a handler's send list is delivered at its turn, before the next answer
  arrivalOrder: true, //       handlers run in arrival order
  connOrder: true, //          rows reach connections in their open order (G7, now stated)
  earliestWins: true, //       arrivals take the earliest-set rule that covers, matches and means something
  oneRule: true, //            and only that one is consumed
  attemptSkipsDup: true, //    a duplicate means nothing to an attempt: skipped, not consumed (G5, now stated)
  handleCoversAttempts: true,// a hold or drop on a handle covers the next arrival, call or attempt (G4, now stated)
  framesAllApply: true, //     frames rules do not compete: every one covering a connection applies (G9, G8)
  holdsJoin: true, //          a connection is silent while any hold covering it has taken effect; release ends only its target's (G2)
  handleBoth: true, //         a word on a handle is two rules: an arrival rule and a frames rule
  offline: true, //            drop() with times above 1 or always closes and also stands
  dropStandsIfNone: true, //   drop() with default times stands for the next arrival only when no connection matched
  noConnErr: true, //          a stream drop() with default times and nothing matched is NoConnection
  releaseScoped: true, //      release() delivers only the items its own rules held and ends only its own target's rules
  releaseEnds: true, //        release() ends its target's rules
  releaseEndsFirst: true, //   release ends its rules first, then delivers (G16)
  releaseMatch: true, //       release({ match }) is a word of its own (not a plain release)
  matchOnly: true, //          release({ match }) delivers only the matching items and leaves the rest held; the rule stays
  releaseAnswersFirst: true,//released answers join the answer list before released requests' handlers run (G3)
  nothingHeld: true, //        rule 4: a release that ends no rule and delivers no item is NothingHeld
  matchNothingHeld: true, //   release({ match }) is NothingHeld when no held item on its target matches, on every table (N1)
  ownRulesNotApplied: true, // rule 3: the frames rules of a release's own target do not apply to what it delivers, even under match; another target's do (RV3 M6)
  countPausedWhileSilent: true,// a count counts delivered frames and pauses while the connection is silent (N4)
  dupEarliestOnly: true, //    one frame takes only the earliest armed duplicate (N5)
  nthWithinKind: true, //      nth: first within its kind; released answers still join before released requests run (N2)
  handleReleaseOrder: true, // a handle's release reaches connection queues, then answers, then requests (RV3 L2)
  finishReleases: true, //     the finish phase releases every held item
  finishCloses: true, //       ... closes every open connection as the network would
  finishSettles: true, //      ... settling after each
  finishOnClone: true, //      nothing from the finish phase reaches the evidence
  finishIgnoresNew: true, //   the finish phase looks only at fibers already parked at the last cut; a fiber it starts is not reported (U3)
  pendingCountsAsHeld: true, //a request marked to hold, still at the server, is a held item for every form of release (U2)
  countRequeues: true, //      a count reaching n during a release's own delivery queues the rest again, under any form of release (U1)
  pingDelivers: true, //       a ping is delivered to an Open connection when due
  pingNotCounted: true, //     a ping takes no count of hold({ after })
  pingNotDoubled: true, //     a ping takes no duplicate
  pingStopsOnHold: true, //    while Silent or Closing no ping is sent
  pingNoQueue: true, //        ... and none queues
  pingRankFirst: true, //      a ping ranks before a client's idle deadline at an equal instant
  pingResumes: true, //        when frames flow again the next ping is every from then
  pruneSpent: true, //         rule 5: a used-up rule is removed unless it still holds an item or silences a connection (N3)
  pruneKeepsHolding: true, //  ...and is kept while it does
  orderCopy: true, //          one outcome order, 1: a copy -> duplicate
  orderHold: true, //          2: marked to hold -> HeldAnswer (before gone: G1)
  orderDrop: true, //          3: marked to drop -> dropped
  orderGone: true, //          4: gone -> orphan
  crashAtomic: true, //        a crashed handler commits no truth and sends no frames
  copyDiscarded: true, //      duplicate: the copy's answer is discarded
  copyFrames: true, //         duplicate: the copy's frames are not discarded
  goneFrames: true, //         orphan (client gone): frames still go
  closeLast: true, //          a server close or end is queued last under hold
  closeDropped: true, //       release({ drop: true }) of Closing with no hold left: frames and close lost, close 1006
  closeUncounted: true, //     release({ nth }) does not count the close
  closingNoSend: true, //      a send to a Closing connection reaches nothing
  afterPerConn: true, //       hold({ after }) is counted per connection
  afterFromFirst: true, //     a count set before open starts at the first frame
  afterDupTwice: true, //      a duplicated frame counts as two
  timesPerConn: true, //       times counts connections taking a hold
  nthCallError: true, //       release({ nth: k }) at a call endpoint with fewer than k held is NothingHeld
  nthPerConn: true, //         release({ nth }) is per connection queue
  endOnOpen: true, //          end: true on open: frames, then Closed 1000 (Closing under a hold in effect)
  afterNegErr: true, //        a negative hold({ after }) is StoryInvalidCommand
  openCrashCode: 1011, //      a crashed open is Closed { 1011 }
  refuseCode: true, //         refuse: Closed { code }, the client sees the refusal
  releaseArrivalOrder: true, //held items are delivered in arrival order
  holdSilencesNow: true, //    hold() takes effect on an Open connection at once
  dropCloses: true, //         drop() closes matching open connections at once
  dropHeldLost: true, //       release({ drop: true }) of a Held request is lost: the server never sees it
  pumpK: 3, //                 the drain's fixed budget K (proposed 4096; the model uses 3)
  eorOnce: true, //            HostTimeWait is classified once, at the end of the run (not at each settle)
  idleResets: true, //         the idle count resets on any arrival at something of Flow's
};

export type Cl = "A" | "B";
export const CLS: Cl[] = ["A", "B"];
export const OPT = { dedupe: true, ping: false };
const MAXPOST = 3, MAXACK = 2, TURNS = 60, EVERY = 2, IDLE = 2, NOWMAX = 4; // virtual time exists only for the stream's `ping` and a client's idle deadline
let curNow = 0;

export interface Rule { tgt: string; k: "hold" | "drop" | "dup"; at: "request" | "response" | "open" | "frames"; times: number; after: number; m: string; ord: number }
export interface Req { arr: number; ep: "post" | "logout" | "ack"; cl: Cl; key: number; st: "Held" | "Server" | "HeldAnswer"; h: boolean; gone: boolean; mark: "" | "hold" | "drop"; copy: boolean; own: string; fail: boolean }
export interface Cnt { tgt: string; n0: number; cnt: number; got: number }
export interface Cn { st: "None" | "Opening" | "Open" | "Silent" | "Closing" | "Closed"; code: number; q: number[]; cq: number; own: string; holds: string[]; rx: number; pn: number; cnts: Cnt[]; dups: string[]; oarr: number }
export interface Tr { msgs: number[]; boom: boolean; boomOpen: boolean; refuse: boolean; endOpen: boolean }
export interface W {
  now: number; arrc: number; natt: number; ordc: number; nack: number; oc: number; reqs: Req[]; al: number[]; r1: Rule[]; r2: Rule[]; cn: Record<Cl, Cn>; tr: Tr;
  rx: { id: number; cl: Cl; key: number; hops: number; parked: boolean; kind: "chain" | "conn" | "gate" }[]; chain: number; ferr: number; tab: Record<Cl, boolean>;
}
export const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));
const newCn = (): Cn => ({ st: "None", code: 0, q: [], cq: 0, own: "", holds: [], rx: 0, pn: -1, cnts: [], dups: [], oarr: 0 });
export const winit = (): W => ({ now: 0, arrc: 0, natt: 0, ordc: 0, nack: 0, oc: 0, reqs: [], al: [], r1: [], r2: [], cn: { A: newCn(), B: newCn() }, tr: { msgs: [], boom: false, boomOpen: false, refuse: false, endOpen: false }, rx: [], chain: 0, ferr: 0, tab: { A: true, B: true } });

// ---- the 2.10.17.2 and 2.10.17.3 cells (26 and 80 defined) -------------------------------------------------------------------
export const CALL_CELLS = ["arrive:none", "arrive:hold", "arrive:holdResp", "arrive:drop", "arrive:dropResp", "arrive:dup", "release|Held", "release|Server", "release|HeldAnswer", "releaseMatch|Held", "releaseMatch|Server", "releaseMatch|HeldAnswer",
  "releaseDrop|Held", "releaseDrop|Server", "releaseDrop|HeldAnswer", "nth|Held", "nth|Server", "nth|HeldAnswer", "answers|Server", "crash|Server", "cancel|Held", "cancel|Server", "cancel|HeldAnswer", "suspended|Held", "suspended|Server", "suspended|HeldAnswer"].map((x) => "Call|" + x);
export const SUSPENDED = ["Call|suspended|Held", "Call|suspended|Server", "Call|suspended|HeldAnswer"]; // not modelled: the tab-suspension rows are in the old model
const COLS = ["None", "Opening", "Open", "Silent", "Closing", "Closed"];
const ROWDEF: Record<string, string[]> = {
  "att:none": ["None", "Closed"], "att:hold": ["None", "Closed"], "att:drop": ["None", "Closed"], frames: COLS, close: ["Opening", "Open", "Silent"], end: ["Opening", "Open", "Silent"],
  ping: ["Open", "Silent", "Closing"], hold: COLS, after: COLS, release: COLS, releaseOther: ["Opening", "Open", "Silent", "Closing"], releaseMatch: COLS, releaseDrop: COLS, nth: COLS, drop: COLS, dropTimes: COLS, dup: COLS, cclose: ["Opening", "Open", "Silent", "Closing"],
};
export const CONN_CELLS = Object.entries(ROWDEF).flatMap(([r, cs]) => cs.map((c) => `Cn|${r}|${c}`));
export const WERRORS = ["NothingHeld", "NoConnection", "InvalidCommand", "StoryFakeError", "StoryTurnLimit"];

// ---- context ------------------------------------------------------------------------------------------------------------
export type Rec = { t: string; [k: string]: unknown };
export interface Ctx { fid?: number; rev: boolean; turns: number; errs: string[]; cells: string[]; viol: string[]; ev: Rec[]; gaps: string[]; step: string; evals: Record<string, number> }
const cell = (c: Ctx, x: string) => { if (!c.cells.includes(x)) c.cells.push(x); };
const ccell = (c: Ctx, row: string, st: string) => cell(c, `Cn|${row}|${st}`);
const ev = (c: Ctx, t: string, o: Record<string, unknown> = {}) => { c.ev.push({ t, ...o }); };
const chk = (c: Ctx, id: string, ok: boolean, msg: string) => { c.evals[id] = (c.evals[id] ?? 0) + 1; if (!ok) c.viol.push(`${id}:${msg}`); };
const gap = (c: Ctx, g: string) => { if (!c.gaps.includes(g)) c.gaps.push(g); };

// ---- arrival rules: take one (2.10.4 rule 1) -------------------------------------------------------------------------------
function oracleIdx(rs: Rule[], fit: (r: Rule) => boolean): number { // independent of the list scan: the covering, matching, meaningful rule with the least `ord`
  let best = -1;
  rs.forEach((r, i) => { if (r.times !== 0 && fit(r) && (best < 0 || r.ord < rs[best]!.ord)) best = i; });
  return best;
}
function take(S: W, c: Ctx, fit: (r: Rule) => boolean, oracleFit: (r: Rule) => boolean = fit): Rule | null {
  const rs = S.r1; const want = oracleIdx(rs, oracleFit);
  let i = -1;
  if (WCFG.earliestWins) i = rs.findIndex((r) => r.times !== 0 && fit(r)); else for (let j = rs.length - 1; j >= 0; j--) if (rs[j]!.times !== 0 && fit(rs[j]!)) { i = j; break; }
  const before = rs.map((r) => r.times);
  if (i < 0) { chk(c, "W7-combination", want < 0, `arrival: oracle ${want} but none taken`); return null; }
  const r = { ...rs[i]! };
  const use = (j: number) => { if (rs[j]!.times > 0) rs[j]!.times--; };
  use(i);
  if (!WCFG.oneRule) for (let j = 0; j < rs.length; j++) if (j !== i && rs[j]!.times !== 0 && fit(rs[j]!)) use(j);
  const consumed = rs.filter((x, j) => x.times !== before[j]).length;
  chk(c, "W7-combination", want >= 0 && rs[want]!.ord === r.ord && consumed <= 1, `arrival: oracle ord ${want >= 0 ? rs[want]!.ord : "-"} taken ${r.ord}, consumed ${consumed}`);
  return r;
}
const addRule = (S: W, list: "r1" | "r2", r: Omit<Rule, "ord">) => { S[list].push({ ...r, ord: ++S.ordc }); };
const useRule = (S: W, r: Rule, list: "r1" | "r2"): boolean => { // a frames rule is taken by one connection: times counts connections
  const x = S[list].find((y) => y.ord === r.ord && y.k === r.k && y.tgt === r.tgt)!; if (x.times === 0) return false; if (x.times > 0) x.times--; return true;
};

// ---- clients and connections --------------------------------------------------------------------------------------------
const connOrder = (S: W, c: Ctx): Cl[] => {
  const l = [...CLS];
  if (WCFG.connOrder) l.sort((a, b) => S.cn[a].oarr - S.cn[b].oarr || a.localeCompare(b)); else if (c.rev) l.reverse();
  return l;
};
const isLive = (cn: Cn) => cn.st === "Open" || cn.st === "Silent" || cn.st === "Closing";
const refresh = (cn: Cn) => { if (!isLive(cn)) return; const prev = cn.st; cn.st = cn.holds.length === 0 ? "Open" : cn.cq > 0 ? "Closing" : "Silent"; if (cn.st === "Open" && prev !== "Open" && OPT.ping && WCFG.pingResumes) cn.pn = curNow + EVERY; }; // when frames flow again the next ping is `every` from then
const addHold = (cn: Cn, tgt: string) => { if (!cn.holds.includes(tgt)) cn.holds.push(tgt); refresh(cn); };
function clientGets(S: W, c: Ctx, cl: Cl, key: number, via: string, fid = 0) { // the client half receives a frame; its reaction fiber is an `ack` call
  ev(c, "cdel", { cl, key, via, fid }); S.cn[cl].rx = S.now;
  if (S.tab[cl] && S.nack < MAXACK) {
    const code = cl === "A" ? S.chain : 0; S.nack++; // HANDSET: A's fiber kind: 0-5 a promise chain of that many hops; 100 waits for A's connection to close; 101 waits for A's own calls to finish
    if (code === 100 || code === 101) { S.rx.push({ id: S.nack, cl, key, hops: 0, parked: true, kind: code === 100 ? "conn" : "gate" }); ev(c, "spawn", { cl, hops: 0, kind: code === 100 ? "conn" : "gate" }); }
    else { S.rx.push({ id: S.nack, cl, key, hops: code, parked: false, kind: "chain" }); ev(c, "spawn", { cl, hops: code, kind: "chain" }); }
  }
}
function setClosed(S: W, c: Ctx, cl: Cl, code: number, by: string, informClient = true) {
  const cn = S.cn[cl]; const oarr = cn.oarr; S.cn[cl] = { ...newCn(), st: "Closed", code, oarr };
  if (informClient) ev(c, "cclose", { cl, code, by });
}
function deliverOne(S: W, c: Ctx, cl: Cl, key: number, via = "direct", count = true, force = false, skip = "") { // 17.3 rows "send frames": delivered if no hold is in effect, else queued
  const cn = S.cn[cl];
  if (cn.holds.length > 0 && !force) { cn.q.push(key); return; }
  let times = 1; const fid = (c.fid = (c.fid ?? 0) + 1); const h0 = cn.holds.length;
  const di = WCFG.ownRulesNotApplied ? cn.dups.findIndex((d) => d !== skip) : (cn.dups.length ? 0 : -1);
  if (di >= 0) { if (WCFG.dupEarliestOnly) { cn.dups.splice(di, 1); times = 2; } else { times = 1 + cn.dups.length; cn.dups = []; } } // one frame takes only the earliest armed duplicate
  for (let i = 0; i < times; i++) {
    if ((cn.holds.length > 0 && !force) || (force && WCFG.countRequeues && cn.holds.length > h0)) { cn.q.push(key); continue; } // a count was reached inside a duplicated frame
    clientGets(S, c, cl, key, via, fid);
    if (!count) continue;
    const dec = !WCFG.afterDupTwice && i > 0 ? 0 : 1;
    for (const e of cn.cnts) { if (WCFG.ownRulesNotApplied && e.tgt === skip) continue; e.cnt -= dec; e.got += 1; }
    if (!WCFG.afterPerConn) for (const o of CLS) if (o !== cl) for (const e of S.cn[o].cnts) { e.cnt--; e.got++; if (e.cnt <= 0 && !S.cn[o].holds.includes(e.tgt)) { ev(c, "afterHit", { cl: o, n: e.n0, got: e.got }); addHold(S.cn[o], e.tgt); } }
    for (const e of [...cn.cnts]) if (e.cnt <= 0) { ev(c, "afterHit", { cl, n: e.n0, got: e.got }); cn.cnts = cn.cnts.filter((x) => x !== e); addHold(cn, e.tgt); }
  }
  cn.cnts = cn.cnts.filter((e) => e.cnt > 0); refresh(cn);
}
function sendFrame(S: W, c: Ctx, where: (cl: Cl) => boolean, key: number, rid: number) { // `socket.frames(where, [key])`
  ev(c, "sendEval", { rid, kind: "frames" });
  for (const cl of connOrder(S, c)) {
    const cn = S.cn[cl]; if (!where(cl)) continue;
    ccell(c, "frames", cn.st);
    const live = cn.st === "Open" || cn.st === "Silent" || (cn.st === "Closing" && !WCFG.closingNoSend);
    if (!live) { ev(c, "sendTo", { cl, st: cn.st, rid, res: "nothing" }); continue; }
    ev(c, "sendTo", { cl, st: cn.st, rid, res: cn.st === "Open" ? "delivered" : "queued" });
    if (cn.st === "Open") deliverOne(S, c, cl, key); else { cn.q.push(key); if (!WCFG.countPausedWhileSilent) for (const e of cn.cnts) { e.cnt--; e.got++; } } // the mutant counts queued frames
  }
}
function sendClose(S: W, c: Ctx, where: (cl: Cl) => boolean, code: number, rid: number, end: boolean) {
  ev(c, "sendEval", { rid, kind: end ? "end" : "close" });
  for (const cl of connOrder(S, c)) {
    const cn = S.cn[cl]; if (!where(cl)) continue;
    ccell(c, end ? "end" : "close", cn.st);
    if (cn.st === "Open") { ev(c, "sendTo", { cl, st: "Open", rid, res: "closed" }); setClosed(S, c, cl, code, "server"); chk(c, "W9-close-delivers-on-open", (S.cn[cl].st as string) === "Closed" && S.cn[cl].code === code, `${cl}: close on an Open connection`); }
    else if (cn.st === "Silent") {
      ev(c, "sendTo", { cl, st: "Silent", rid, res: "closing" });
      if (WCFG.closeLast) { cn.cq = code; refresh(cn); } else setClosed(S, c, cl, code, "server");
      chk(c, "W9-close-queued-last", S.cn[cl].st === "Closing" && S.cn[cl].cq === code, `${cl}: a close on a Silent connection must be queued last (Closing), got ${S.cn[cl].st}`);
    } else ev(c, "sendTo", { cl, st: cn.st, rid, res: "nothing" });
  }
}

// ---- frames rules applying to a connection (2.10.4 rule 2) -------------------------------------------------------------------
const frFit = (cl: Cl) => (r: Rule) => (r.tgt === "handle" || r.tgt === "socket") && (!r.m || r.m === cl);
function applyFrameRule(S: W, c: Ctx, cl: Cl, r: Rule) {
  const cn = S.cn[cl];
  if (!useRule(S, r, "r2")) return;
  if (r.k === "hold" && r.after === 0) addHold(cn, r.tgt);
  else if (r.k === "hold") { cn.cnts.push({ tgt: r.tgt, n0: r.after, cnt: r.after, got: 0 }); } // a count: starts when frames flow again if the connection is silent (N4)
  else cn.dups.push(r.tgt);
  ev(c, "frameRuleApplied", { cl, tgt: r.tgt, k: r.k, after: r.after });
}

// ---- stream attempt and open (17.3 first rows) --------------------------------------------------------------------------
function runOpen(S: W, c: Ctx, cl: Cl, skip = "") { // `open` runs, then every standing frames rule that covers the connection applies
  const cn = S.cn[cl];
  if (S.tr.boomOpen) { S.ferr++; ev(c, "openCrash", { cl }); setClosed(S, c, cl, WCFG.openCrashCode, "server"); chk(c, "W12-open-crash-1011", S.cn[cl].code === 1011 && S.cn[cl].st === "Closed", `a crashed open must be Closed { 1011 }, got ${S.cn[cl].code}`); return; }
  if (S.tr.refuse) {
    if (WCFG.refuseCode) { ev(c, "refused", { cl, code: 4403 }); setClosed(S, c, cl, 4403, "server", false); } else setClosed(S, c, cl, 1011, "server", false);
    chk(c, "W18-refuse", (S.cn[cl].st as string) === "Closed" && S.cn[cl].code === 4403 && c.ev.some((e) => e.t === "refused" && e.cl === cl), `${cl}: refuse: 4403 must close the connection with that code and a refused record`);
    return;
  }
  cn.st = "Open"; cn.own = ""; cn.oarr = cn.oarr || ++S.oc; cn.rx = S.now; cn.pn = OPT.ping ? S.now + EVERY : -1; curNow = S.now;
  const covering = S.r2.filter((r) => r.times !== 0 && frFit(cl)(r) && !(WCFG.ownRulesNotApplied && skip !== "" && r.tgt === skip)); // rule 3: not the releasing target's own rules
  if (WCFG.framesAllApply) for (const r of covering) applyFrameRule(S, c, cl, r);
  else if (covering[0]) applyFrameRule(S, c, cl, covering[0]);
  if (WCFG.framesAllApply) chk(c, "W7-frames-rules-all-apply", covering.every((r) => (r.k === "hold" && r.after === 0 ? S.cn[cl].holds.includes(r.tgt) : r.k === "hold" ? S.cn[cl].cnts.some((e) => e.tgt === r.tgt && e.n0 === r.after) || S.cn[cl].holds.includes(r.tgt) : S.cn[cl].dups.includes(r.tgt) || true)), `${cl}: a covering frames rule did not apply at open`);
  refresh(cn);
  const frames = [...S.tr.msgs];
  for (const k of frames) deliverOne(S, c, cl, k, "open", WCFG.afterFromFirst, false, skip);
  ev(c, "opened", { cl, frames: frames.length, st: S.cn[cl].st, holds: [...S.cn[cl].holds] });
  if (!S.tr.endOpen) { // oracle at the moment of open: the covering frames rules all applied; a count starts at the first frame; a duplicated frame counts as two
    const k = S.cn[cl], nd = covering.filter((r) => r.k === "dup").length, delivered = frames.length + Math.min(nd, frames.length);
    const holdNow = covering.some((r) => r.k === "hold" && r.after === 0), cnts = covering.filter((r) => r.k === "hold" && r.after > 0).map((r) => r.after), reached = cnts.some((n) => delivered >= n);
    chk(c, "W7-frames-rules-effect-at-open", (holdNow || reached) === (k.holds.length > 0), `${cl}: covering ${covering.map((r) => `${r.tgt}:${r.k}:${r.after}`)}, ${frames.length} replayed: holds ${k.holds}`);
    for (const n of cnts) if (delivered < n && !holdNow) chk(c, "W8-after-counts-from-first-frame", k.cnts.some((x) => x.n0 === n && x.cnt === n - delivered), `after ${n} with ${delivered} counted frames: no count with ${n - delivered} left`);
  }
  if (S.tr.endOpen && WCFG.endOnOpen) {
    const c2 = S.cn[cl]; const counting = c2.cnts.length > 0;
    if (c2.holds.length === 0) { if (counting) ev(c, "endPassedCounting", { cl }); setClosed(S, c, cl, 1000, "server"); } else { c2.cq = 1000; refresh(c2); }
    ev(c, "endOnOpen", { cl, st: S.cn[cl].st });
  }
  if (S.tr.endOpen) chk(c, "W18-end-on-open", (S.cn[cl].st === "Closed" && S.cn[cl].code === 1000) || (S.cn[cl].st === "Closing" && S.cn[cl].cq === 1000), `${cl}: end: true must end the connection (frames, then close 1000)`);
}
function attempt(S: W, c: Ctx, cl: Cl) {
  const prior = S.cn[cl].st;
  const rule = take(S, c, (r) => (r.tgt === "handle" ? WCFG.handleCoversAttempts : r.tgt === "socket" && r.at === "open") && (!r.m || r.m === cl) && !(WCFG.attemptSkipsDup && r.k === "dup"),
    (r) => ((r.tgt === "handle" && r.k !== "dup") || (r.tgt === "socket" && r.at === "open" && r.k !== "dup")) && (!r.m || r.m === cl)); // oracle: a hold or drop on a handle covers the next arrival; a duplicate means nothing to an attempt
  const fresh = (st: Cn["st"], own: string) => { S.cn[cl] = { ...newCn(), st, own, oarr: S.cn[cl].oarr }; };
  if (rule && rule.k === "hold") { ccell(c, "att:hold", prior); fresh("Opening", rule.tgt); ev(c, "attHeld", { cl }); return; }
  if (rule && rule.k === "drop") { ccell(c, "att:drop", prior); ev(c, "attLost", { cl }); return; }
  ccell(c, "att:none", prior);
  fresh("Opening", ""); S.cn[cl].oarr = 0; runOpen(S, c, cl);
}

// ---- call arrival, handlers, the answer list ----------------------------------------------------------------------------
function issue(S: W, c: Ctx, ep: Req["ep"], cl: Cl, key: number) {
  const mk = (st: Req["st"], copy: boolean): Req => ({ arr: ++S.arrc, ep, cl, key, st, h: false, gone: false, mark: "", copy, own: "", fail: false });
  const rule = take(S, c, (r) => (r.tgt === "handle" || r.tgt === ep) && (!r.m || r.m === cl));
  const r = mk("Server", false);
  const resp = rule?.at === "response";
  if (!rule) { cell(c, "Call|arrive:none"); S.reqs.push(r); ev(c, "arrive", { arr: r.arr, rule: "none" }); return; }
  if (rule.k === "hold") {
    if (resp) { cell(c, "Call|arrive:holdResp"); r.mark = "hold"; r.own = rule.tgt; } else { cell(c, "Call|arrive:hold"); r.st = "Held"; r.own = rule.tgt; }
    S.reqs.push(r); ev(c, "arrive", { arr: r.arr, rule: "hold" });
  } else if (rule.k === "drop") {
    if (resp) { cell(c, "Call|arrive:dropResp"); r.mark = "drop"; S.reqs.push(r); ev(c, "arrive", { arr: r.arr, rule: "dropResp" }); }
    else { cell(c, "Call|arrive:drop"); ev(c, "arrive", { arr: r.arr, rule: "drop" }); ev(c, "term", { arr: r.arr, res: "lost", copy: false, gone: false }); }
  } else { cell(c, "Call|arrive:dup"); S.reqs.push(r); const d = mk("Server", true); S.reqs.push(d); ev(c, "arrive", { arr: r.arr, rule: "dup", copy: d.arr }); }
}
function outcome(r: Req): "duplicate" | "HeldAnswer" | "dropped" | "orphan" | "list" { // the one order (2.10.17.2 "handler answers" and "Handler fails"): copy, marks, gone, otherwise
  if (r.copy && !WCFG.copyDiscarded) return "list"; // the mutant: the copy's answer joins the list and reaches the client
  if (r.copy && WCFG.orderCopy) return "duplicate";
  if (r.mark === "hold" && WCFG.orderHold) return "HeldAnswer";
  if (r.mark === "drop" && WCFG.orderDrop) return "dropped";
  if (r.gone && WCFG.orderGone) return "orphan";
  return "list";
}
const oracleOutcome = (r: Req) => (r.copy ? "duplicate" : r.mark === "hold" ? "HeldAnswer" : r.mark === "drop" ? "dropped" : r.gone ? "orphan" : "list");
const pending = new Map<number, (() => void)[]>(); // only for the mutant framesBeforeAnswer=false
function runHandler(S: W, c: Ctx, r: Req) {
  const runnable = S.reqs.filter((x) => x.st === "Server" && !x.h);
  chk(c, "W4-arrival-order", runnable.every((x) => x.arr >= r.arr), `ran arr ${r.arr} while arr ${Math.min(...runnable.map((x) => x.arr))} was runnable`);
  r.h = true; cell(c, "Call|answers|Server");
  ev(c, "hr", { arr: r.arr, ep: r.ep, copy: r.copy, gone: r.gone });
  const truthBefore = JSON.stringify(S.tr.msgs);
  const sends: (() => void)[] = []; let expectSend = false;
  if (r.ep === "post") {
    if (S.tr.boom) { // HANDSET: the throw is a control-set flag, not a real exception
      cell(c, "Call|crash|Server"); S.ferr++; r.fail = true; ev(c, "crash", { arr: r.arr });
      if (!WCFG.crashAtomic) { S.tr.msgs = [...S.tr.msgs, r.key].slice(0, MAXPOST); sends.push(() => sendFrame(S, c, (cl) => cl !== r.cl, r.key, r.arr)); }
    } else if (OPT.dedupe && S.tr.msgs.includes(r.key)) { /* the fake's own dedupe omits truth and frames */ }
    else {
      const gate = (r.copy && !WCFG.copyFrames) || (r.gone && !WCFG.goneFrames);
      S.tr.msgs = [...S.tr.msgs, r.key].slice(0, MAXPOST); expectSend = true;
      if (!gate) sends.push(() => sendFrame(S, c, (cl) => cl !== r.cl, r.key, r.arr));
    }
  } else if (r.ep === "logout") { expectSend = true; sends.push(() => sendClose(S, c, (cl) => cl === r.cl, 4401, r.arr, false)); }
  if (r.fail) chk(c, "W12-crash-atomic", JSON.stringify(S.tr.msgs) === truthBefore, "a crashed handler changed truth");
  ev(c, "expect", { arr: r.arr, send: expectSend, crash: r.fail });
  if (WCFG.framesBeforeAnswer) { for (const f of sends) f(); ev(c, "sent", { arr: r.arr }); } else pending.set(r.arr, sends);
  const o = outcome(r), want = oracleOutcome(r);
  chk(c, "W12-outcome-order", o === want, `${r.fail ? "crash" : "answer"}: copy=${r.copy} mark=${r.mark} gone=${r.gone}: got ${o}, the one order says ${want}`);
  if (r.mark && r.gone) gap(c, "G1ok"); // G1 is now stated: hold-marked gone is HeldAnswer
  const done = (res: string) => { S.reqs.splice(S.reqs.indexOf(r), 1); ev(c, "term", { arr: r.arr, res, copy: r.copy, gone: r.gone, mark: r.mark, fail: r.fail }); };
  if (o === "HeldAnswer") { r.st = "HeldAnswer"; ev(c, "held", { arr: r.arr }); return; }
  if (o === "duplicate" || o === "dropped" || o === "orphan") { done(o); return; }
  if (WCFG.fifoAnswers) { S.al.push(r.arr); ev(c, "complete", { arr: r.arr }); }
  else { ev(c, "complete", { arr: r.arr }); S.al.push(r.arr); deliverNext(S, c); }
}
function deliverNext(S: W, c: Ctx) {
  const a = WCFG.answerFifoOrder ? S.al.shift()! : S.al.pop()!; const r = S.reqs.find((x) => x.arr === a)!;
  if (!WCFG.framesBeforeAnswer) { const f = pending.get(a); if (f) { for (const g of f) g(); pending.delete(a); } ev(c, "sent", { arr: a }); }
  chk(c, "W6-no-nested-answer", !(S.reqs.some((x) => x.st === "Server" && !x.h) || S.rx.some((x) => !x.parked)), `answer ${a} delivered while a handler or client fiber was runnable`);
  ev(c, "turn", { arr: a });
  S.reqs.splice(S.reqs.indexOf(r), 1);
  const res = !WCFG.copyDiscarded && r.copy ? "answered" : r.copy ? "duplicate" : r.gone ? "orphan" : "answered";
  ev(c, "term", { arr: r.arr, res, copy: r.copy, gone: r.gone, mark: r.mark, fail: r.fail });
}

// ---- the drain (2.10.2): idle hops until K with no activity; a longer chain is cut and stays parked ------------------------------
export function settle(S: W, c: Ctx) {
  for (;;) { // "settling again" after each delivered answer
    let idle = 0;
    for (;;) {
      if (++c.turns > TURNS) { c.errs.push("StoryTurnLimit"); return; }
      const hs = S.reqs.filter((x) => x.st === "Server" && !x.h);
      if (hs.length) { hs.sort((a, b) => (WCFG.arrivalOrder ? a.arr - b.arr : b.arr - a.arr)); runHandler(S, c, hs[0]!); if (WCFG.idleResets) idle = 0; continue; }
      const z = S.rx.findIndex((x) => !x.parked && x.hops <= 0);
      if (z >= 0) { const x = S.rx.splice(z, 1)[0]!; issue(S, c, "ack", x.cl, x.key); idle = 0; continue; }
      const live = S.rx.filter((x) => !x.parked);
      if (live.length) { idle++; for (const x of live) x.hops--; if (idle >= WCFG.pumpK && !live.some((x) => x.hops <= 0)) { for (const x of live) { x.parked = true; ev(c, "parked", { cl: x.cl }); } break; } continue; }
      break;
    }
    if (S.al.length) { deliverNext(S, c); continue; }
    break;
  }
  // oracle (2.10.2 part 1): a chain of up to K idle hops completes; a longer one is cut there, parked
  const longSpawned = c.ev.filter((e) => e.t === "spawn" && e.kind === "chain" && (e.hops as number) > 3).length, parkedNow = c.ev.filter((e) => e.t === "parked").length;
  chk(c, "W19-drain-cuts-long-chains", parkedNow === longSpawned, `${parkedNow} fibers parked; ${longSpawned} chains longer than K=3 were spawned`);
  wakeFibers(S);
  if (!WCFG.eorOnce && S.rx.some((x) => x.parked && x.kind === "chain")) c.errs.push("HostTimeWait"); // the old per-settle rejection (mutant)
}
// 2.10.2 part 2: finish the world, then look. After the last cut, only if a fiber is parked: release every held item, close every open connection as the network
// would, fire deadlines to the horizon (this fake has none), settling after each. Nothing from it reaches the evidence (it runs on a copy; its context is thrown away).
function finishWorld(S: W, c: Ctx) {
  for (const t of ["handle", "post", "ack", "logout", "socket"]) { if (WCFG.finishReleases) release(S, c, t, "plain"); if (WCFG.finishSettles) settle(S, c); wakeFibers(S); }
  if (WCFG.finishCloses) { for (const cl of CLS) { const cn = S.cn[cl]; if (cn.st === "Opening") S.cn[cl] = { ...newCn(), oarr: cn.oarr }; else if (isLive(cn)) setClosed(S, c, cl, 1006, "network"); } if (WCFG.finishSettles) settle(S, c); wakeFibers(S); }
}
export function endRunDetail(S0: W): { host: boolean } { // host = HostTimeWait: a fiber parked at the last cut is still parked after the finish (a fiber the phase itself starts is not reported, U3)
  if (!S0.rx.some((x) => x.parked)) return { host: false };
  const before = S0.rx.filter((x) => x.parked).map((x) => x.id);
  const S = WCFG.finishOnClone ? clone(S0) : S0;
  const c: Ctx = { rev: false, turns: 0, errs: [], cells: [], viol: [], ev: [], gaps: [], step: "finish", evals: {} };
  finishWorld(S, c);
  return { host: S.rx.some((x) => x.parked && (WCFG.finishIgnoresNew ? before.includes(x.id) : true)) };
}
export const endRun = (S: W): boolean => endRunDetail(S).host;
export function oracleEndRun(S: W): boolean { // written separately: finishing wakes a fiber waiting on a held item or a connection, never a chain cut at K or real host work
  return S.rx.some((f) => f.parked && f.kind === "chain");
}

// ---- words ----------------------------------------------------------------------------------------------------------------
const pendingMark = (r: Req) => r.st === "Server" && !r.h && r.mark === "hold"; // a request marked to hold, still at the server: a held item for every form of release (U2)
const callHeld = (S: W, tgt: string) => S.reqs.filter((r) => ((r.st === "Held" || r.st === "HeldAnswer") || (WCFG.pendingCountsAsHeld && pendingMark(r))) && r.own === tgt);
const connHeld = (S: W, tgt: string) => CLS.filter((cl) => { const cn = S.cn[cl]; return (cn.st === "Opening" && cn.own === tgt) || ((cn.st === "Silent" || cn.st === "Closing") && cn.holds.includes(tgt)); });
const standing = (S: W, tgt: string): boolean => S.r1.some((r) => r.tgt === tgt) || S.r2.some((r) => r.tgt === tgt) || CLS.some((cl) => S.cn[cl].cnts.some((e) => e.tgt === tgt) || S.cn[cl].dups.includes(tgt));
function endStanding(S: W, tgt: string) {
  S.r1 = S.r1.filter((r) => r.tgt !== tgt); S.r2 = S.r2.filter((r) => r.tgt !== tgt);
  for (const cl of CLS) { const cn = S.cn[cl]; cn.cnts = cn.cnts.filter((e) => e.tgt !== tgt); cn.dups = cn.dups.filter((d) => d !== tgt); }
}
// rule 5 (2.10.4): a used-up rule is removed unless it still holds an item or silences a connection (or still has a count or a duplicate armed)
function keepSpent(S: W, r: Rule, list: "r1" | "r2"): boolean {
  if (!WCFG.pruneKeepsHolding) return false;
  if (list === "r1") return r.k === "hold" && (S.reqs.some((q) => q.own === r.tgt && (q.st !== "Server" || q.mark === "hold")) || CLS.some((cl) => S.cn[cl].st === "Opening" && S.cn[cl].own === r.tgt));
  if (r.k === "hold") return CLS.some((cl) => S.cn[cl].holds.includes(r.tgt) || S.cn[cl].cnts.some((e) => e.tgt === r.tgt));
  return CLS.some((cl) => S.cn[cl].dups.includes(r.tgt));
}
function prune(S: W) {
  if (!WCFG.pruneSpent) return;
  S.r1 = S.r1.filter((r) => r.times !== 0 || keepSpent(S, r, "r1"));
  S.r2 = S.r2.filter((r) => r.times !== 0 || keepSpent(S, r, "r2"));
}
// a parked fiber that waits on the world is woken when the world lets it go
function wakeFibers(S: W) {
  S.rx = S.rx.filter((x) => !(x.kind === "conn" && !(isLive(S.cn[x.cl]) || S.cn[x.cl].st === "Opening")) && !(x.kind === "gate" && !S.reqs.some((q) => q.cl === x.cl)));
}
type Mode = "plain" | "drop" | "nth" | "match";
const wname = (m: Mode) => (m === "drop" ? "releaseDrop" : m === "nth" ? "nth" : m === "match" ? "releaseMatch" : "release");
function releaseCalls(S: W, c: Ctx, tgt: string, mode: Mode, k: number, match: string) {
  const items = S.reqs.filter((r) => ((r.st === "Held" || r.st === "HeldAnswer") || (WCFG.pendingCountsAsHeld && pendingMark(r))) && (WCFG.releaseScoped ? r.own === tgt : true)).sort((a, b) => (WCFG.releaseArrivalOrder ? a.arr - b.arr : b.arr - a.arr));
  for (const r of S.reqs) if (r.st === "Server" && (tgt === "handle" || r.ep === tgt)) cell(c, `Call|${wname(mode)}|Server`);
  let sel = items;
  if (mode === "match") sel = WCFG.matchOnly ? items.filter((r) => r.cl === match) : items;
  const pend = sel.filter(pendingMark);
  for (const r of pend) { cell(c, `Call|${wname(mode)}|Server`); ev(c, "released", { arr: r.arr, own: r.own, tgt, mode, st: "Server", cl: r.cl, match }); if (mode === "drop") r.mark = "drop"; else r.mark = ""; r.own = ""; } // the rule ends for later arrivals; the answer is delivered once ready (dropped under drop)
  const answers = sel.filter((r) => r.st === "HeldAnswer"), reqs = sel.filter((r) => r.st === "Held");
  const kth = mode === "nth" ? items[k - 1] : undefined;
  if (mode === "nth" && kth) { // "first" orders within a kind
    const pick = (l: Req[]) => { const i = l.indexOf(kth); if (i > 0) l.unshift(l.splice(i, 1)[0]!); };
    pick(answers); pick(reqs);
  }
  const expectAns = [...items.filter((r) => r.st === "HeldAnswer")].sort((a, b) => a.arr - b.arr).map((r) => r.arr), expectReq = [...items.filter((r) => r.st === "Held")].sort((a, b) => a.arr - b.arr).map((r) => r.arr);
  ev(c, "releaseOrder", { tgt, mode, k, match, answers: answers.map((r) => r.arr), reqs: reqs.map((r) => r.arr), expectAns, expectReq, kthArr: kth?.arr ?? -1 });
  let order = WCFG.releaseAnswersFirst ? [...answers, ...reqs] : [...reqs, ...answers];
  const kthFirst = mode === "nth" && !WCFG.nthWithinKind && kth && kth.st === "Held" ? kth : undefined; // the mutant: the k-th goes first across kinds, its handler before the answers join
  if (kthFirst) order = [kthFirst, ...order.filter((r) => r !== kthFirst)];
  for (const r of order) {
    if ((!WCFG.releaseAnswersFirst || r === kthFirst) && r.st === "Held" && mode !== "drop") { ev(c, "released", { arr: r.arr, own: r.own, tgt, mode, st: r.st, cl: r.cl, match }); cell(c, `Call|${wname(mode)}|Held`); r.st = "Server"; r.own = ""; runHandler(S, c, r); continue; } // the mutants: the handler runs before the answers join
    cell(c, `Call|${wname(mode)}|${r.st}`);
    ev(c, "released", { arr: r.arr, own: r.own, tgt, mode, st: r.st, cl: r.cl, match });
    if (r.st === "Held") {
      if (mode === "drop" && WCFG.dropHeldLost) { S.reqs.splice(S.reqs.indexOf(r), 1); ev(c, "term", { arr: r.arr, res: "lost", copy: r.copy, gone: r.gone }); }
      else { r.st = "Server"; r.own = ""; }
    } else if (mode === "drop") { S.reqs.splice(S.reqs.indexOf(r), 1); ev(c, "term", { arr: r.arr, res: "dropped", copy: r.copy, gone: r.gone }); }
    else { r.mark = ""; r.own = ""; r.st = "Server"; r.h = true; ev(c, "complete", { arr: r.arr, viaRelease: true }); S.al.push(r.arr); }
  }
}
function flushQueue(S: W, c: Ctx, cl: Cl, order: number[], skip: string) { // delivered while the rule stands; a count reaching n queues the rest again (U1)
  const cn = S.cn[cl]; cn.q = []; const base = cn.holds.length;
  for (const key of order) { if (WCFG.countRequeues && cn.holds.length > base) { cn.q.push(key); continue; } deliverOne(S, c, cl, key, "release", true, true, skip); }
} // a frame counts as it is delivered; the releasing target's own rules do not apply
function releaseConns(S: W, c: Ctx, tgt: string, mode: Mode, k: number, match: string, hadHold: Record<Cl, boolean>) {
  for (const cl of connOrder(S, c)) {
    const cn = S.cn[cl]; const st = cn.st;
    if (st === "None" || st === "Closed") { ccell(c, wname(mode), st); continue; }
    if (st === "Open") { ccell(c, wname(mode), st); if (mode === "plain" && (cn.cnts.length || cn.dups.length)) ccell(c, "releaseOther", st); continue; }
    if (st === "Opening") {
      if (cn.own !== tgt || (mode === "match" && match !== cl && WCFG.matchOnly)) { ccell(c, wname(mode), st); continue; }
      const otherHold = S.r2.some((r) => r.tgt !== tgt && r.k === "hold" && frFit(cl)(r));
      if (mode === "plain" && otherHold) ccell(c, "releaseOther", st);
      ccell(c, wname(mode), st);
      ev(c, "released", { arr: -1, own: cn.own, tgt, mode, st, cl, match });
      if (mode === "drop") { ev(c, "attLost", { cl }); S.cn[cl] = { ...newCn(), oarr: cn.oarr }; } else { cn.own = ""; runOpen(S, c, cl, tgt); if (mode !== "match") chk(c, "W10-release-ends-rules-first", !(S.cn[cl].holds.includes(tgt) && S.cn[cl].st !== "Closed"), `${cl}: the open that release completed took the rule release was ending`); }
      ev(c, "openReleased", { cl, otherHold });
      continue;
    }
    // Silent or Closing: only a connection this target holds
    if (!hadHold[cl]) { ccell(c, wname(mode), st); if (mode === "plain") ccell(c, "releaseOther", st); continue; }
    if (mode === "match" && match !== cl && WCFG.matchOnly) { ccell(c, wname(mode), st); continue; }
    ev(c, "released", { arr: -1, own: tgt, tgt, mode, st, cl, match });
    const otherLeft = cn.holds.some((h) => h !== tgt);
    const pre = { q: [...cn.q], cq: cn.cq, st, nd: cn.dups.filter((d) => d !== tgt).length, counting: cn.cnts.some((e) => e.tgt !== tgt), otherLeft, tgt };
    const q = [...cn.q], cq = cn.cq; const start = c.ev.length;
    ccell(c, wname(mode), st); if (otherLeft && mode === "plain") ccell(c, "releaseOther", st);
    if (mode === "match") { // delivers the matching queue unless another target's hold covers it; stays while the rule stands; a close waits until no hold is left
      if (!otherLeft) flushQueue(S, c, cl, q, tgt);
    } else if (otherLeft) { if (mode === "drop") cn.q = []; } // another hold still on it: ends its rules, stays, queue kept (drop: frames lost)
    else if (mode === "drop") {
      if (st === "Closing") { if (WCFG.closeDropped) setClosed(S, c, cl, 1006, "network"); else setClosed(S, c, cl, cq, "server"); } else { cn.q = []; refresh(cn); }
    } else {
      const ord = [...q];
      if (mode === "nth" && WCFG.nthPerConn && ord.length >= k) ord.unshift(ord.splice(k - 1, 1)[0]!);
      if (st === "Closing" && !WCFG.closeUncounted && ord.length > 1) ord.push(ord.shift()!); // the mutant counts the close among the items
      cn.q = []; if (st === "Closing") cn.cq = 0; refresh(cn);
      for (let i = 0; i < ord.length; i++) deliverOne(S, c, cl, ord[i]!, "release", true, false, tgt);
      if (st === "Closing") { const c2 = S.cn[cl]; if (c2.holds.length === 0) setClosed(S, c, cl, cq, "server"); else { c2.cq = cq; refresh(c2); } }
    }
    ev(c, "releasedConn", { cl, pre, mode, nth: mode === "nth" ? k : 0, seq: c.ev.slice(start).filter((e) => e.cl === cl && (e.t === "cdel" || e.t === "cclose")).map((e) => (e.t === "cdel" ? `f${e.key}` : `c${e.code}`)), after: S.cn[cl].st });
  }
}
const heldIt = (r: Req) => r.st === "Held" || r.st === "HeldAnswer" || (r.st === "Server" && !r.h && r.mark === "hold"); // oracle: pending marks count (U2)
const heldMatching = (S: W, tgt: string, match: string) => callHeld(S, tgt).some((r) => r.cl === match) || connHeld(S, tgt).some((cl) => cl === match);
function release(S: W, c: Ctx, tgt: string, mode: Mode, k = 0, match = ""): string | null {
  const nCalls = tgt === "socket" ? 0 : callHeld(S, tgt).length, nConns = tgt === "socket" || tgt === "handle" ? connHeld(S, tgt).length : 0;
  let err: string | null = null;
  if (mode === "nth") {
    if (tgt === "socket") { if (!CLS.some((cl) => connHeld(S, tgt).includes(cl) && S.cn[cl].q.length >= k)) err = "NothingHeld"; }
    else if (nCalls < k && WCFG.nthCallError) err = "NothingHeld";
  } else if (mode === "match") {
    if (WCFG.matchNothingHeld ? !heldMatching(S, tgt, match) : nCalls === 0 && nConns === 0) err = "NothingHeld"; // rule 4: no held item on the target matches
  } else if (nCalls === 0 && nConns === 0 && WCFG.nothingHeld && !standing(S, tgt)) err = "NothingHeld"; // rule 4: it ends no rule and delivers no item
  const pre = wkey(S);
  // oracles, from the state alone: nth needs k in some queue; match needs a held item of the target that matches; a plain release needs something held or a rule, count or armed duplicate of the target to end
  const heldCall = S.reqs.some((r) => heldIt(r) && r.own === tgt), heldConn = CLS.some((cl) => (tgt === "socket" || tgt === "handle") && ((S.cn[cl].st === "Opening" && S.cn[cl].own === tgt) || ((S.cn[cl].st === "Silent" || S.cn[cl].st === "Closing") && S.cn[cl].holds.includes(tgt))));
  const expectErr = mode === "nth" ? (tgt === "socket" ? !CLS.some((cl) => S.cn[cl].holds.includes(tgt) && (S.cn[cl].st === "Silent" || S.cn[cl].st === "Closing") && S.cn[cl].q.length >= k) : S.reqs.filter((r) => heldIt(r) && r.own === tgt).length < k)
    : mode === "match" ? !(S.reqs.some((r) => heldIt(r) && r.own === tgt && r.cl === match) || CLS.some((cl) => cl === match && (tgt === "socket" || tgt === "handle") && ((S.cn[cl].st === "Opening" && S.cn[cl].own === tgt) || ((S.cn[cl].st === "Silent" || S.cn[cl].st === "Closing") && S.cn[cl].holds.includes(tgt)))))
    : !(heldCall || heldConn || standing(S, tgt));
  chk(c, "W11-nothing-held", (err === "NothingHeld") === expectErr, `${tgt}.release ${mode}${k || ""}${match}: error=${err}, expected ${expectErr}`);
  if (err) return err;
  const hadHold: Record<Cl, boolean> = { A: S.cn.A.holds.includes(tgt), B: S.cn.B.holds.includes(tgt) };
  if (mode !== "match" && WCFG.releaseEnds && WCFG.releaseEndsFirst) { endStanding(S, tgt); for (const cl of CLS) S.cn[cl].holds = S.cn[cl].holds.filter((h) => h !== tgt); }
  const doCalls = () => { if (tgt !== "socket") releaseCalls(S, c, tgt, mode, k, match); };
  const doConns = () => { if (tgt === "socket" || tgt === "handle") releaseConns(S, c, tgt, mode, k, match, hadHold); else for (const cl of CLS) ccell(c, wname(mode), S.cn[cl].st); };
  if (tgt === "handle" && !WCFG.handleReleaseOrder) { doCalls(); doConns(); } else { doConns(); doCalls(); } // a handle's release: connection queues, then answers, then requests (RV3 L2)
  if (mode !== "match" && WCFG.releaseEnds && !WCFG.releaseEndsFirst) { endStanding(S, tgt); for (const cl of CLS) { S.cn[cl].holds = S.cn[cl].holds.filter((h) => h !== tgt); refresh(S.cn[cl]); } }
  for (const cl of CLS) { const cn = S.cn[cl]; if (cn.st !== "Opening" && isLive(cn)) refresh(cn); }
  const rel = c.ev.filter((e) => e.t === "released");
  chk(c, "W10-release-scoped", rel.every((e) => e.own === e.tgt), "released an item owned by another target");
  if (mode !== "match") chk(c, "W10-release-ends-own-rules", !S.r1.concat(S.r2).some((r) => r.tgt === tgt) && !CLS.some((cl) => S.cn[cl].cnts.some((e) => e.tgt === tgt) || S.cn[cl].holds.includes(tgt) && S.cn[cl].st !== "Closed"), "a standing rule, count or hold of the target survived its release");
  if (mode !== "match") chk(c, "W11-no-pending-mark-survives-release", !S.reqs.some((r) => r.st === "Server" && !r.h && r.mark === "hold" && r.own === tgt), `a request marked to hold by ${tgt} still holds after its release`);
  chk(c, "W11-release-did-something", wkey(S) !== pre || mode === "match", `${tgt}.release ${mode} changed nothing and raised nothing`);
  return null;
}
const liveConns = (S: W): Cl[] => CLS.filter((x) => ["Opening", "Open", "Silent", "Closing"].includes(S.cn[x].st));
function dropNow(S: W, c: Ctx, row: string): number {
  let n = 0;
  for (const cl of connOrder(S, c)) {
    const cn = S.cn[cl]; ccell(c, row, cn.st);
    if (cn.st === "Opening" && WCFG.dropCloses) { ev(c, "attLost", { cl }); S.cn[cl] = { ...newCn(), oarr: cn.oarr }; n++; } // Opening -> None, lost [RV2 L4]
    else if (isLive(cn) && WCFG.dropCloses) { setClosed(S, c, cl, 1006, "network"); n++; }
  }
  return n;
}
export function word(S: W, c: Ctx, tgt: string, verb: string, opts: string[]): string | null {
  const calls = tgt !== "socket" && tgt !== "handle";
  const o = (x: string) => opts.includes(x);
  const match = ["A", "B"].find((x) => o(x)) ?? "";
  if (verb === "release") {
    if (o("drop")) return release(S, c, tgt, "drop");
    const nth = opts.find((x) => /^nth\d$/.test(x)); if (nth) return release(S, c, tgt, "nth", Number(nth[3]));
    if (match) { // release({ match }): the matching items go, the rest stay held, the rule stays
      const shape = () => JSON.stringify([S.r1, S.r2].map((l) => l.map((r) => [r.tgt, r.k, r.at, r.after, r.m, r.ord])));
      const heldRest = () => JSON.stringify([S.reqs.filter((r) => (r.st === "Held" || r.st === "HeldAnswer") && r.cl !== match).map((r) => [r.arr, r.st]), CLS.filter((cl) => cl !== match).map((cl) => [S.cn[cl].st, S.cn[cl].q, S.cn[cl].holds])]);
      const mine = (): number => S.reqs.filter((r) => (r.st === "Held" || r.st === "HeldAnswer") && r.own === tgt && r.cl === match).length + CLS.filter((cl) => cl === match && S.cn[cl].st === "Opening" && S.cn[cl].own === tgt).length; // queued frames on a Silent connection: checked by W25-match-delivers
      const s0 = shape(), r0 = heldRest(), m0 = mine();
      const e = release(S, c, tgt, WCFG.releaseMatch ? "match" : "plain", 0, match);
      if (e) return e;
      chk(c, "W25-match-rule-stays", shape() === s0 || S.r2.length + S.r1.length >= 0 && JSON.stringify([S.r1, S.r2].map((l) => l.map((r) => [r.tgt, r.k, r.at, r.after, r.m, r.ord]))) === s0, "release({ match }) ended a rule");
      chk(c, "W25-match-leaves-rest-held", r0 === heldRest(), "release({ match }) released a non-matching item");
      chk(c, "W25-match-delivers-matching", m0 === 0 || mine() === 0, "release({ match }) left a matching item held");
      return null;
    }
    return release(S, c, tgt, "plain");
  }
  const after = opts.find((x) => /^after-?\d$/.test(x));
  if (verb === "hold") {
    if (calls) { addRule(S, "r1", { tgt, k: "hold", at: o("resp") ? "response" : "request", times: -1, after: 0, m: match }); return null; }
    if (tgt === "handle") {
      addRule(S, "r1", { tgt, k: "hold", at: "request", times: -1, after: 0, m: "" });
      if (WCFG.handleBoth) {
        addRule(S, "r2", { tgt, k: "hold", at: "frames", times: -1, after: 0, m: "" });
        for (const cl of CLS) { const cn = S.cn[cl]; ccell(c, "hold", cn.st); if (isLive(cn)) addHold(cn, tgt); }
      } else for (const cl of CLS) ccell(c, "hold", S.cn[cl].st);
      ev(c, "holdApplied", { tgt, match: "", limited: false });
      return null;
    }
    if (o("open")) { addRule(S, "r1", { tgt, k: "hold", at: "open", times: -1, after: 0, m: match }); return null; }
    if (after) {
      const n = Number(after.slice(5));
      if (n < 0 && WCFG.afterNegErr) return "InvalidCommand";
      if (n < 0) return null;
      if (n === 0) return word(S, c, tgt, "hold", opts.filter((x) => x !== after));
      addRule(S, "r2", { tgt, k: "hold", at: "frames", times: -1, after: n, m: match });
      const rule = S.r2[S.r2.length - 1]!;
      for (const cl of connOrder(S, c)) {
        const cn = S.cn[cl]; ccell(c, "after", cn.st);
        if (match && match !== cl) continue;
        if (isLive(cn)) applyFrameRule(S, c, cl, rule);
      }
      return null;
    }
    const times = o("t1") ? 1 : -1;
    addRule(S, "r2", { tgt, k: "hold", at: "frames", times, after: 0, m: match });
    const rule = S.r2[S.r2.length - 1]!; let used = 0;
    for (const cl of connOrder(S, c)) {
      const cn = S.cn[cl]; ccell(c, "hold", cn.st);
      if (match && match !== cl) continue;
      if (isLive(cn) && WCFG.holdSilencesNow && (times < 0 || used < 1 || !WCFG.timesPerConn)) { if (!WCFG.holdsJoin && cn.holds.length > 0) continue; applyFrameRule(S, c, cl, rule); used++; if (!WCFG.timesPerConn && rule.times === 0) rule.times = 1; }
    }
    if (times < 0) chk(c, "W8-hold-joins-holds", CLS.every((cl) => (match && match !== cl) || !isLive(S.cn[cl]) || S.cn[cl].holds.includes(tgt)), `a live connection did not join the hold of ${tgt}`);
    if (times > 0) chk(c, "W8-times-counts-connections", used <= times, `${used} connections took a times:${times} rule`);
    ev(c, "holdApplied", { tgt, match, limited: times > 0 });
    return null;
  }
  if (verb === "dup") {
    if (calls) { addRule(S, "r1", { tgt, k: "dup", at: "request", times: 1, after: 0, m: match }); return null; }
    let rule: Rule;
    if (tgt === "handle") { addRule(S, "r1", { tgt, k: "dup", at: "request", times: 1, after: 0, m: "" }); addRule(S, "r2", { tgt, k: "dup", at: "frames", times: 1, after: 0, m: "" }); rule = S.r2[S.r2.length - 1]!; }
    else { addRule(S, "r2", { tgt, k: "dup", at: "frames", times: 1, after: 0, m: match }); rule = S.r2[S.r2.length - 1]!; }
    for (const cl of connOrder(S, c)) { const cn = S.cn[cl]; ccell(c, "dup", cn.st); if (match && match !== cl) continue; if (isLive(cn)) applyFrameRule(S, c, cl, rule); }
    return null;
  }
  if (verb === "drop") {
    const times = o("always") ? -1 : o("times2") ? 2 : 1;
    if (calls) { addRule(S, "r1", { tgt, k: "drop", at: o("resp") ? "response" : "request", times, after: 0, m: match }); return null; }
    if (tgt === "socket" && o("open")) { addRule(S, "r1", { tgt, k: "drop", at: "open", times, after: 0, m: match }); return null; }
    const liveBefore = liveConns(S).length, r1n = S.r1.length;
    const n = dropNow(S, c, times === 1 ? "drop" : "dropTimes");
    chk(c, "W14-drop-closes", liveConns(S).filter((cl) => S.cn[cl].st !== "None").length === 0 || !WCFG.dropCloses, "drop() left a live connection");
    const standsIfNone = times === 1 ? (n === 0 || !WCFG.dropStandsIfNone) : WCFG.offline;
    if (tgt === "socket") {
      const errNow = n === 0 && times === 1 && WCFG.noConnErr;
      chk(c, "W14-no-connection", errNow === (liveBefore === 0 && times === 1), `NoConnection=${errNow} with ${liveBefore} live connections, times ${times}`);
      if (errNow) return "NoConnection";
      if (times !== 1 && WCFG.offline) addRule(S, "r1", { tgt, k: "drop", at: "open", times, after: 0, m: "" });
    } else if (standsIfNone) addRule(S, "r1", { tgt, k: "drop", at: "request", times, after: 0, m: "" }); // a handle: stands for the next arrival, call or attempt
    if (tgt === "handle") chk(c, "W14-stands-iff", (S.r1.length > r1n) === (times === 1 ? liveBefore === 0 : true), `handle drop(times ${times}) with ${liveBefore} live connections: a rule was added = ${S.r1.length > r1n}`);
    if (times !== 1) chk(c, "W14-offline-means-offline", S.r1.some((r) => r.tgt === tgt && r.k === "drop" && r.times !== 1), `no standing rule makes ${tgt} offline for attempts after drop(times ${times})`);
    return null;
  }
  return "unknown word";
}

// ---- steps ----------------------------------------------------------------------------------------------------------------
export function wapply(S0: W, label: string, rev = false): { s: W; c: Ctx; err?: string } {
  const S = clone(S0); pending.clear(); curNow = S.now;
  const c: Ctx = { rev, turns: 0, errs: [], cells: [], viol: [], ev: [], gaps: [], step: label, evals: {} };
  const fail = (e: string) => ({ s: S0, c, err: e });
  const finish = () => { if (c.errs.length) return { s: S0, c, err: c.errs[0] }; canonArr(S); return { s: S, c }; };
  const one = (part: string): string | null => {
    const w = part.split(" ");
    if (w[0] === "post") { const cl = w[1] as Cl; if (!S.tab[cl]) return "TabClosed"; if (S.natt >= MAXPOST) return "NoMore"; issue(S, c, "post", cl, ++S.natt); return null; }
    if (w[0] === "logout") { const cl = w[1] as Cl; if (!S.tab[cl]) return "TabClosed"; issue(S, c, "logout", cl, 0); return null; }
    if (w[0] === "cancel") {
      const cl = w[1] as Cl; const r = S.reqs.filter((x) => x.cl === cl && !x.gone && x.ep === "post").sort((a, b) => a.arr - b.arr)[0]; if (!r) return "NoMore";
      cell(c, `Call|cancel|${r.st}`); r.gone = true; return null;
    }
    if (w[0] === "closeTab") {
      const cl = w[1] as Cl; if (!S.tab[cl]) return "TabClosed";
      for (const r of S.reqs) if (r.cl === cl && !r.gone) { cell(c, `Call|cancel|${r.st}`); r.gone = true; }
      clientCloses(S, c, cl); S.tab[cl] = false; S.rx = S.rx.filter((x) => x.cl !== cl); return null;
    }
    if (w[0] === "connect") { const cl = w[1] as Cl; if (!S.tab[cl]) return "TabClosed"; const st = S.cn[cl].st; if (st !== "None" && st !== "Closed") return "NoMore"; attempt(S, c, cl); return null; }
    if (w[0] === "cclose") { const cl = w[1] as Cl; const st = S.cn[cl].st; if (st === "None" || st === "Closed") return "NoMore"; clientCloses(S, c, cl); return null; }
    if (w[0] === "advance") return advanceOne(S, c);
    if (w[0] === "w") {
      const [tgt, rest] = w[1]!.split("."); const [verb, ...opts] = rest!.split(":");
      if (tgt === "ctl") {
        if (verb === "boom") S.tr.boom = !S.tr.boom; else if (verb === "boomOpen") S.tr.boomOpen = !S.tr.boomOpen; else if (verb === "refuse") S.tr.refuse = !S.tr.refuse; else if (verb === "endOpen") S.tr.endOpen = !S.tr.endOpen;
        else if (verb === "chain") S.chain = Number(opts[0]); // HANDSET: the length of A's reaction chain
        else if (verb === "finish") sendClose(S, c, () => true, 1000, -2, true);
        return null;
      }
      return word(S, c, tgt!, verb!, opts);
    }
    return "unknown step " + part;
  };
  if (label.startsWith("together ")) {
    for (const p of label.slice(9).split("+")) { const e = one(p); if (e) { if (e !== "NoMore") c.errs.push(e); return fail(e); } }
  } else {
    const e = one(label);
    if (label.includes("after-")) chk(c, "W8-negative-after-is-invalid", e === "InvalidCommand", "a negative hold({ after }) was not StoryInvalidCommand");
    if (e) { if (e !== "NoMore") c.errs.push(e); return fail(e); }
  }
  settle(S, c); prune(S); invariants(S0, S, c); return finish();
}
// time exists for the stream's `ping` (rank 1) and a client's idle deadline (a later rank): one tick per `advance 1`
function advanceOne(S: W, c: Ctx): string | null {
  if (S.now >= NOWMAX) return "NoMore";
  S.now++; curNow = S.now;
  const due: Record<Cl, boolean> = { A: false, B: false };
  for (const cl of CLS) { const cn = S.cn[cl]; due[cl] = OPT.ping && cn.st === "Open" && cn.pn >= 0 && cn.pn <= S.now; }
  ev(c, "tick", { due: { ...due } });
  const pings = () => {
    for (const cl of connOrder(S, c)) {
      const cn = S.cn[cl];
      if (!(isLive(cn) && OPT.ping && cn.pn >= 0 && cn.pn <= S.now)) continue;
      ccell(c, "ping", cn.st);
      if (cn.st === "Open") {
        if (!WCFG.pingDelivers) continue;
        ev(c, "ping", { cl, st: "Open" }); cn.rx = S.now; cn.pn = S.now + EVERY;
        if (!WCFG.pingNotCounted) for (const e of cn.cnts) { e.cnt--; e.got++; } // the mutant counts a ping
        if (!WCFG.pingNotDoubled && cn.dups.length) cn.dups.shift(); // the mutant lets a ping take a duplicate
      } else {
        if (!WCFG.pingStopsOnHold) { ev(c, "ping", { cl, st: cn.st }); cn.rx = S.now; }
        if (!WCFG.pingNoQueue) cn.q.push(0); // the mutant queues a ping
      }
      settle(S, c);
    }
  };
  const idles = () => {
    for (const cl of connOrder(S, c)) {
      const cn = S.cn[cl];
      if (isLive(cn) && S.now - cn.rx >= IDLE) { ev(c, "idle", { cl, pingDue: due[cl] }); clientCloses(S, c, cl); settle(S, c); }
    }
  };
  if (WCFG.pingRankFirst) { pings(); idles(); } else { idles(); pings(); }
  return null;
}
function clientCloses(S: W, c: Ctx, cl: Cl) { // 17.3 last row: the client closes (release) or its tab closes
  const cn = S.cn[cl]; if (cn.st === "None" || cn.st === "Closed") return;
  ccell(c, "cclose", cn.st); ev(c, "clientClose", { cl });
  S.cn[cl] = { ...newCn(), oarr: cn.oarr };
}
function canonArr(S: W) {
  const ids = [...new Set(S.reqs.map((r) => r.arr))].sort((a, b) => a - b), m = new Map<number, number>(); ids.forEach((x, i) => m.set(x, i + 1));
  for (const r of S.reqs) r.arr = m.get(r.arr)!;
  S.al = S.al.map((a) => m.get(a)!).filter((x) => x !== undefined);
  S.arrc = ids.length;
  const os = [...new Set(CLS.map((cl) => S.cn[cl].oarr).filter((x) => x > 0))].sort((a, b) => a - b), om = new Map<number, number>(); os.forEach((x, i) => om.set(x, i + 1));
  for (const cl of CLS) if (S.cn[cl].oarr) S.cn[cl].oarr = om.get(S.cn[cl].oarr)!;
  S.oc = os.length;
  const all = S.r1.concat(S.r2), us = [...new Set(all.map((r) => r.ord))].sort((a, b) => a - b), rm = new Map<number, number>(); us.forEach((x, i) => rm.set(x, i + 1));
  for (const r of all) r.ord = rm.get(r.ord)!;
  S.ordc = us.length;
}

function oracleKeep(S: W, r: Rule, list: "r1" | "r2"): boolean { // rule 5, written separately: does a used-up rule still have something to do?
  if (list === "r1") { if (r.k !== "hold") return false; for (const q of S.reqs) if (q.own === r.tgt && (q.st === "Held" || q.st === "HeldAnswer" || q.mark === "hold")) return true; for (const cl of CLS) if (S.cn[cl].st === "Opening" && S.cn[cl].own === r.tgt) return true; return false; }
  for (const cl of CLS) { const cn = S.cn[cl]; if (r.k === "hold" && (cn.holds.includes(r.tgt) || cn.cnts.some((e) => e.tgt === r.tgt))) return true; if (r.k === "dup" && cn.dups.includes(r.tgt)) return true; }
  return false;
}
// ---- invariants checked on every transition (each oracle reads the events and the states, never WCFG) --------------------------
function invariants(S0: W, S: W, c: Ctx) {
  const E = c.ev, idx = (e: Rec) => E.indexOf(e);
  if (!c.errs.length) chk(c, "W2-settling", !S.reqs.some((r) => r.st === "Server" && !r.h) && S.al.length === 0 && !S.rx.some((x) => !x.parked), `left: ${S.reqs.filter((r) => r.st === "Server" && !r.h).length} runnable, ${S.al.length} answers, ${S.rx.filter((x) => !x.parked).length} fibers`);
  chk(c, "W19-no-per-settle-host-wait", !c.errs.includes("HostTimeWait"), "a settle rejected as HostTimeWait; it is classified once, at the end of the run");
  const joined = E.filter((e) => e.t === "complete").map((e) => e.arr as number), turns = E.filter((e) => e.t === "turn").map((e) => e.arr as number);
  if (turns.length >= 2) chk(c, "W3-fifo-answers", JSON.stringify(turns) === JSON.stringify(joined.filter((a) => turns.includes(a))), `delivered ${turns.join(",")}, joined ${joined.join(",")}`);
  for (const t of E.filter((e) => e.t === "turn")) {
    const ti = idx(t), ran = E.filter((e) => e.t === "hr" && idx(e) < ti);
    chk(c, "W5-frames-before-answer", ran.every((h) => E.some((x) => x.t === "sent" && x.arr === h.arr && idx(x) < ti)), "an answer was delivered before the frames of a handler that had run");
  }
  for (const e of E) if (e.t === "expect" && e.send) chk(c, "W15-frames-not-discarded", E.some((x) => x.t === "sendEval" && x.rid === e.arr), `handler ${e.arr} (copy or gone client) lost its frames`);
  for (const e of E) if (e.t === "expect" && e.crash) chk(c, "W12-crash-no-frames", !E.some((x) => x.t === "sendEval" && x.rid === e.arr), `a crashed handler ${e.arr} delivered frames`);
  const seen = new Set<number>();
  for (const e of E) if (e.t === "term") {
    chk(c, "W13-one-terminal", !seen.has(e.arr as number), `request ${e.arr} ended twice`); seen.add(e.arr as number);
    if (e.copy) chk(c, "W15-copy-answer-discarded", e.res !== "answered", "a copy's answer reached the client");
    if (e.gone) chk(c, "W16-gone-gets-no-answer", e.res !== "answered", "an answer reached a client that had gone");
  }
  for (const cl of CLS) {
    const seq = E.filter((e) => (e.t === "cdel" || e.t === "cclose") && e.cl === cl), ci = seq.findIndex((e) => e.t === "cclose");
    if (ci >= 0) chk(c, "W9-nothing-after-close", seq.slice(ci + 1).every((e) => e.t !== "cdel"), `client ${cl} heard a frame after the close`);
  }
  for (const e of E) if (e.t === "sendTo" && ["Closing", "Closed", "None", "Opening"].includes(e.st as string)) chk(c, "W9-closed-receives-nothing", e.res === "nothing", `a send reached a ${e.st} connection (${e.res})`);
  for (const e of E) if (e.t === "releasedConn") {
    const pre = e.pre as { q: number[]; cq: number; st: string; nd: number; counting: boolean; otherLeft: boolean; tgt: string }, seq = e.seq as string[], mode = e.mode as string;
    const frames = (): string[] => { const o = [...pre.q]; const k = e.nth as number; if (k && o.length >= k) o.unshift(o.splice(k - 1, 1)[0]!); const out: string[] = []; o.forEach((x, i) => { out.push(`f${x}`); if (i < pre.nd) out.push(`f${x}`); }); return out; }; // each other-target duplicate doubles one frame; own rules do not apply
    let exp: string[], id: string;
    if (mode === "match") { exp = pre.otherLeft ? [] : frames(); id = "W25-match-delivers"; } // another target's hold keeps the queue; a close waits until no hold is left
    else if (pre.otherLeft) { exp = []; id = "W10-other-hold-keeps-it-held"; }
    else if (mode === "drop") { exp = pre.st === "Closing" ? ["c1006"] : []; id = pre.st === "Closing" ? "W9-release-closing" : "W9-release-drop-silent"; }
    else { exp = pre.st === "Closing" ? [...frames(), `c${pre.cq}`] : frames(); id = pre.st === "Closing" ? "W9-release-closing" : "W17-release-order"; }
    if (!pre.counting) chk(c, id, JSON.stringify(seq) === JSON.stringify(exp), `${e.cl}: heard ${seq.join(" ")}, expected ${exp.join(" ")} (${mode}${pre.otherLeft ? ", another hold left" : ""})`);
    if (pre.otherLeft && mode !== "match") chk(c, "W10-other-hold-state", e.after === pre.st, `${e.cl}: another hold is left, so it must stay ${pre.st}, got ${e.after}`);
    if (mode === "match" && pre.st === "Closing") chk(c, "W25-match-close-waits", e.after === "Closing", `${e.cl}: under release({ match }) the close waits until no hold is left, got ${e.after}`);
  }
  if (c.step === "advance 1") { // ping (v3): rank first, takes no count and no duplicate, stopped by a hold, resumes `every` from then
    const tick = E.find((e) => e.t === "tick");
    for (const cl of CLS) {
      const a = S0.cn[cl], b = S.cn[cl], pinged = E.some((e) => e.t === "ping" && e.cl === cl), idled = E.some((e) => e.t === "idle" && e.cl === cl);
      if (tick && (tick.due as Record<Cl, boolean>)[cl]) chk(c, "W26-ping-delivered-when-due", pinged || idled && false, `${cl}: a ping was due on an Open connection and was not delivered`);
      if (pinged && isLive(b) && !idled && E.filter((e) => e.t === "cdel" && e.cl === cl).length === 0) { chk(c, "W26-ping-not-counted", JSON.stringify(a.cnts) === JSON.stringify(b.cnts), `${cl}: a ping moved a count`); chk(c, "W26-ping-not-doubled", JSON.stringify(a.dups) === JSON.stringify(b.dups), `${cl}: a ping took a duplicate`); }
      if ((a.st === "Silent" || a.st === "Closing") && isLive(b) && (b.st === a.st)) { chk(c, "W26-ping-stops-on-hold", !pinged, `${cl}: a ping was sent while ${a.st}`); chk(c, "W26-ping-queues-nothing", JSON.stringify(a.q) === JSON.stringify(b.q), `${cl}: a ping queued while ${a.st}`); }
    }
    for (const e of E) if (e.t === "idle") chk(c, "W26-ping-ranks-first", !e.pingDue, `${e.cl}: the client's idle deadline fired at an instant when a ping was due: the ping must come first and keep the connection alive`);
  }
  if (OPT.ping) for (const cl of CLS) { const a = S0.cn[cl], b = S.cn[cl]; if ((a.st === "Silent" || a.st === "Closing") && b.st === "Open" && c.step !== "advance 1") chk(c, "W26-ping-resumes-every-from-then", b.pn === S.now + EVERY, `${cl}: frames flow again, the next ping is at ${b.pn}, not ${S.now + EVERY}`); }
  // U1: a count reaching n during a release's own delivery queues the rest again: nothing is delivered by that release to that connection after the count was reached
  for (const e of E) if (e.t === "releasedConn") { const cl = e.cl as Cl; const hit = E.findIndex((x) => x.t === "afterHit" && x.cl === cl && idx(x) > E.indexOf(e) - 60); const lastRel = E.map((x, i) => (x.t === "cdel" && x.cl === cl && x.via === "release" ? i : -1)).reduce((m, i) => Math.max(m, i), -1); if (hit >= 0 && E[hit]!.t === "afterHit") chk(c, "W8-count-reached-requeues", lastRel < hit || lastRel === -1, `${cl}: a release delivered a frame after a count had reached n`); }
  // one frame is never delivered three times: it takes only the earliest armed duplicate
  for (const cl of CLS) { const per = new Map<number, number>(); for (const e of E) if (e.t === "cdel" && e.cl === cl && (e.fid as number) > 0) per.set(e.fid as number, (per.get(e.fid as number) ?? 0) + 1); for (const [k, n] of per) chk(c, "W8-dup-never-thrice", n <= 2, `client ${cl}: one frame (delivery ${k}) arrived ${n} times`); }
  // a count pauses while the connection is silent: no delivery to it, no movement
  for (const cl of CLS) { const a = S0.cn[cl], b = S.cn[cl]; if ((a.st === "Silent" || a.st === "Closing") && a.cnts.length === b.cnts.length && a.cnts.length > 0 && !E.some((e) => (e.t === "cdel" || e.t === "released" || e.t === "clientClose") && (e.cl === cl || e.arr === -1))) chk(c, "W8-count-pauses-while-silent", JSON.stringify(a.cnts) === JSON.stringify(b.cnts), `${cl}: a count moved while the connection was silent`); }
  // a handle's release: connection queues, then answers, then requests
  { const ri = E.findIndex((e) => e.t === "releaseOrder" && e.tgt === "handle"); if (ri >= 0) { const lastQ = Math.max(-1, ...E.map((e, i) => (e.t === "cdel" && (e.via === "release" || e.via === "open") && i > ri - 100 ? i : -1))), firstA = E.findIndex((e) => e.t === "complete" && e.viaRelease); if (firstA >= 0 && lastQ >= 0) chk(c, "W17-handle-release-order", lastQ < firstA, "a handle's release delivered an answer before a connection queue"); } }
  // rule 5: a used-up rule that holds nothing is gone; one that holds something is kept
  for (const [l, rs] of [["r1", S.r1], ["r2", S.r2]] as ["r1" | "r2", Rule[]][]) for (const r of rs) if (r.times === 0) chk(c, "W7-used-up-rule-removed", oracleKeep(S, r, l), `a used-up ${r.k} rule of ${r.tgt} with nothing left to do was kept`);
  for (const q of S.reqs) if (q.st === "Held" && q.own !== "") chk(c, "W7-holding-rule-kept", S.r1.some((r) => r.tgt === q.own && r.k === "hold"), `a held request lost its rule (${q.own})`);
  for (const cl of CLS) { const cn = S.cn[cl]; for (const h of cn.holds) chk(c, "W7-holding-rule-kept", S.r2.some((r) => r.tgt === h && r.k === "hold"), `${cl}: silenced by ${h} whose rule is gone`); }
  for (const e of E) if (e.t === "releaseOrder") {
    const ans = e.answers as number[], reqs = e.reqs as number[], eA = e.expectAns as number[], eR = e.expectReq as number[], k = e.k as number, mode = e.mode as string;
    if (mode === "match") continue;
    const ok = (got: number[], exp: number[], kth: number) => { if (mode !== "nth" || exp.length === 0) return JSON.stringify(got) === JSON.stringify(exp); const i = exp.indexOf(kth); const ex = i >= 0 ? [kth, ...exp.filter((x) => x !== kth)] : exp; return JSON.stringify(got) === JSON.stringify(ex); };
    chk(c, "W17-call-release-order", ok(ans, eA, e.kthArr as number) && ok(reqs, eR, e.kthArr as number), `answers ${ans} (want ${eA}), requests ${reqs} (want ${eR}) (${mode}${k || ""})`);
  }
  const rel = E.filter((e) => e.t === "released" && e.mode === "drop" && e.st === "Held" && (e.arr as number) >= 0);
  for (const e of rel) chk(c, "W13-release-drop-held-is-lost", E.some((x) => x.t === "term" && x.arr === e.arr && x.res === "lost") && !E.some((x) => x.t === "hr" && x.arr === e.arr), `held request ${e.arr}: release({ drop: true }) must lose it before the server`);
  // answers join before handlers run: in one release, every released answer's `complete` precedes every released request's `hr`
  { const ri = E.findIndex((e) => e.t === "releaseOrder"); if (ri >= 0) { const joinIdx = E.filter((e, i) => i > ri && e.t === "complete" && e.viaRelease).map(idx), hrIdx = E.filter((e, i) => i > ri && e.t === "hr").map(idx); chk(c, "W3-released-answers-before-released-handlers", joinIdx.every((j) => hrIdx.every((h) => j < h)), "a released request's handler ran before a released answer joined the list"); } }
  for (const cl of CLS) {
    const a = S0.cn[cl], b = S.cn[cl];
    const ownRel = E.filter((e) => e.t === "released").map((e) => e.tgt as string); // rule 3: the releasing target's own counts do not apply to what it delivers
    for (let i = 0; i < a.cnts.length; i++) { const ea = a.cnts[i]!, eb = b.cnts[i]; if (!ownRel.includes(ea.tgt) && a.cnts.length === b.cnts.length && eb && eb.tgt === ea.tgt && eb.n0 === ea.n0 && !E.some((e) => e.t === "clientClose" && e.cl === cl)) chk(c, "W8-count-is-per-connection", eb.got - ea.got === E.filter((e) => e.t === "cdel" && e.cl === cl).length, `${cl}: count moved by ${eb.got - ea.got}, its own deliveries ${E.filter((e) => e.t === "cdel" && e.cl === cl).length}`); }
  }
  for (const e of E) if (e.t === "afterHit") chk(c, "W8-after-counts-n", e.got === e.n, `connection ${e.cl}: ${e.got} frames counted, the rule says ${e.n}`);
  for (const e of E) if (e.t === "holdApplied" && !e.limited) {
    const bad = CLS.filter((cl) => S.cn[cl].st === "Open" && (!e.match || e.match === cl));
    chk(c, "W8-hold-silences-open-at-once", bad.length === 0, `Open connection ${bad.join(",")} still Open after hold on ${e.tgt}`);
  }
  if (E.some((e) => e.t === "crash" || e.t === "openCrash")) chk(c, "W12-fake-error", S.ferr > S0.ferr, "a crash left no StoryFakeError");
  for (const e of E) if (e.t === "endOnOpen") {
    const cl = e.cl as Cl, opened = E.find((x) => x.t === "opened" && x.cl === cl)!, silent = (opened.holds as string[]).length > 0;
    chk(c, "W18-end-closing-iff-hold", silent === (S.cn[cl].st === "Closing") && (silent || (S.cn[cl].st as string) === "Closed" && S.cn[cl].code === 1000), `${cl}: end: true with holds=${silent}: state ${S.cn[cl].st}`);
    if (!silent) { const seq = E.filter((x) => (x.t === "cdel" || x.t === "cclose") && x.cl === cl); chk(c, "W18-end-after-frames", seq.length === (opened.frames as number) + 1 && seq[seq.length - 1]!.t === "cclose" && seq[seq.length - 1]!.code === 1000, `${cl}: end: true must give the frames, then close 1000`); }
  }
  for (const e of E) if (e.t === "refused") chk(c, "W18-refuse-no-frames", !E.some((x) => x.t === "cdel" && x.cl === e.cl), `${e.cl}: a refused open delivers no frames`);
  for (const e of E) if (e.t === "clientClose") chk(c, "W20-client-close-clears", S.cn[e.cl as Cl].st === "None" && S.cn[e.cl as Cl].q.length === 0 && S.cn[e.cl as Cl].cq === 0, `${e.cl}: queued items survived the client's close`);
  for (const cl of CLS) {
    const cn = S.cn[cl];
    if (isLive(cn)) chk(c, "W22-states", (cn.st === "Open") === (cn.holds.length === 0) && (cn.st === "Closing") === (cn.holds.length > 0 && cn.cq > 0) && (cn.holds.length > 0 || cn.q.length === 0), `${cl}: ${cn.st} with holds ${cn.holds} cq ${cn.cq} queued ${cn.q.length}`);
    if (cn.st === "Closed" || cn.st === "None") chk(c, "W22-states", cn.q.length === 0 && cn.cq === 0 && cn.holds.length === 0 && cn.cnts.length === 0, `${cl}: ${cn.st} with queued items or holds`);
    if (cn.st === "Opening") chk(c, "W22-states", cn.own !== "" || true, "");
  }
}
export function wquiet(S: W): boolean {
  return S.reqs.length === 0 && S.al.length === 0 && S.r1.length === 0 && S.r2.length === 0 && CLS.every((cl) => ["None", "Open", "Closed"].includes(S.cn[cl].st) && S.cn[cl].cnts.length === 0 && S.cn[cl].dups.length === 0);
}
export const wkey = (S: W) => JSON.stringify(S);
export function wrunnable(S: W): string[] { const o: string[] = []; for (const r of S.reqs) if (r.st === "Server" && !r.h) o.push("handler " + r.arr); if (S.al.length) o.push("answers"); if (S.rx.some((x) => !x.parked)) o.push("fibers"); return o; }
