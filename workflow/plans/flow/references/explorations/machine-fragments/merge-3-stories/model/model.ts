// Executable model of proposal-v2.md (merge 3, Stories) section 3: 3.1 steps (R-Settle), 3.2 a request on the wire, 3.3 a connection,
// 3.4 the stand-in host, 3.5 equal instants. Dependency-free. Where a table is silent the code says `GAP:` or `INVENTED:`.
// CFG holds the key rules; mutations.py flips them one at a time. OPT picks the app configuration of a run.
//
// The app under the Story is the smallest one that reaches the downstream cells: one write operation `pay` (a write lane, policy OPT.policy),
// persisted storage (`Fake.storage`, a call endpoint), and one stream (`Chat`, a stream endpoint plus a history call endpoint) read by a
// session. The lane and session semantics are reduced to the cell level (which row fired in which state); the full models are
// merged/operations/lane-model and merge-6-streams/model.

export const CFG = {
  ranksOk: true, //          3.5: ranks 1 world, 2 adapters, 3 Runtime waits, 4 actor schedules
  armTie: true, //           3.5: "then by ... arming" is the last key of every rank
  orphanTravels: true, //    3.2: a request whose client has gone stays in transit and still reaches the server
  cancelInterrupts: true, // 3.2/2.6: a cancel with the request on the wire interrupts the client (the request still travels)
  ackGate: true, //          2.5: the acknowledgement write of a persisted Attempt gates the send
  closeHold: true, //        2.10/3.3: only an awaiting finalizer (the policy suite's adapter, OPT.suite) makes a close wait
  writeFifo: true, //        3.6: writes of one tab are FIFO
  abortOnClose: true, //     3.6: a tab's Queued and Held writes are aborted with the tab
  clearOnResolve: true, //   3.6: an Attempt that leaves the lane queues a capture that removes its record
  suspendHolds: true, //     3.1: advance(d, { suspended }): the tab runs nothing during the move
  settleAfterWire: true, //  3.1: world, together and advance settle after each control
  nothingHeld: true, //      3.1: release with nothing held is NothingHeld
  heldEscapes: true, //      2.6/3.1: a Held lane can be left by retry (re-send) or cancel (release)
  targetScoped: true, //     3.2: release() ends only the standing rules of its own target (handle or endpoint)
  releaseEndsStanding: true,// 3.2: release() also removes every standing rule; NothingHeld only with no held item and no standing rule
  noInject: true, //         T2/C3: no step names an ending
  lostNotServed: true, //    3.2: release({ drop: true }) of a Held request makes it Lost: the server never sees it
  dupAnswerIgnored: true, // 3.2/2.5: duplicate(): the client sees the first answer only
  goneDiscarded: true, //    3.2: the answer of a request whose client has gone goes nowhere
  dropOpenRefuses: true, //  3.3: drop({ at: "open" }) refuses the attempt (the binding's lost)
};

export const OPT = { policy: "reject" as "reject" | "serialize", src: "reconnect" as "plain" | "reconnect" | "callback", auto: false, host: false, suite: false };

export type T = "a" | "b";
export const TABS: T[] = ["a", "b"];
const BUF = 2, MAXATT = 3, NOWMAX = 6, RETAIN = 2, BOUND = 2, RESETAFTER = 2, SCHED = 2, PAGESCHED = 1, TURNS = 40;

export interface Rule { h?: boolean; k: "hold" | "drop" | "dup"; at: "request" | "response"; times: number; tab?: T; pur?: string }
export type Ans = "" | "ok" | "busy" | "die" | "more" | "empty" | "cannot" | "fail" | "fatal";
export type RS = "Held" | "Server" | "HeldAnswer" | "Waking"; // Waking: answered, the tab is suspended, the transport input waits (3.2 last row)
export interface Req { id: number; ep: "pay" | "hist"; tab: T; pur: string; att: number; st: RS; gone: boolean; ans: Ans; dup: boolean; srv: boolean; due: number; arm: number; mark: "" | "hold" | "drop"; host: boolean }
export interface Wr { tab: T; pur: string; att: number; st: "Queued" | "Held" | "HeldConfirm"; arm: number }
export interface Lane { st: "Idle" | "InFlight" | "Held"; head: number; stage: "" | "ack" | "cap" | "wire"; ended: boolean; W: number[] }
export interface Tab { keep?: boolean; persist: boolean; actor: boolean; exp: boolean; lane: Lane }
export interface Tm { own: 1 | 2 | 3 | 4 | 5; kind: string; tab: T | "-"; due: number; ref: number; fx: number; op: number; arm: number }
export type SSt = "Opening" | "Dropped" | "Live" | "Ended" | "Releasing" | "Released";
export interface Sess { st: SSt; answer: string; owed: boolean }
export interface Ad { cp: boolean; rel: boolean; on: boolean; ph: "Connecting" | "Live" | "CatchingUp" | "Waiting" | "Done"; sig: boolean; last: boolean; any: boolean; ls: number | null; n: number; buf: number; ec: number; ps: number; settled: boolean }
export interface Cb { q: string[]; closing: "open" | "fail" | "end" | "done"; released: boolean }
export interface Conn { st: "Opening" | "Open" | "Silent" | "Closed"; code: number; q: string[]; hc: boolean }
export interface Chat { greet: "proof" | "live" | "lost" | "reset" | "none"; refuse: boolean; hist: Ans; orules: Rule[]; holdClose: number; cn: Conn | null; pos: number; nextSilent: boolean; nextDup: boolean }
export interface S {
  now: number; natt: number; armc: number; nid: number; tabs: { a: Tab | null; b: Tab | null }; own: T | "";
  rec: { att: number; held: boolean; late?: boolean; hc?: boolean; crash?: boolean } | null; rd: T[]; dead: number[]; dh: boolean;
  reqs: Req[]; wr: Wr[]; rules: { pay: Rule[]; sto: Rule[]; hist: Rule[] }; tm: Tm[];
  srv: { busy: number; lat: number; die: boolean; host: boolean; chg: number[] };
  chat: Chat; ad: Ad; ss: Sess; cb: Cb; susp: T | ""; sentS: boolean;
}
export const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));
export const newLane = (): Lane => ({ st: "Idle", head: 0, stage: "", ended: false, W: [] });
export const newAd = (): Ad => ({ cp: false, rel: false, on: false, ph: "Connecting", sig: false, last: false, any: false, ls: null, n: 0, buf: 0, ec: 0, ps: 0, settled: false });
export const init = (): S => ({
  now: 0, natt: 0, armc: 0, nid: 0, tabs: { a: { persist: true, actor: true, exp: false, lane: newLane() }, b: null }, own: "a", rec: null, dead: [], dh: false,
  reqs: [], wr: [], rd: [], rules: { pay: [], sto: [], hist: [] }, tm: [], srv: { busy: 0, lat: 0, die: false, host: false, chg: [] },
  chat: { greet: "proof", refuse: false, hist: "ok", orules: [], holdClose: 0, cn: null, pos: 0, nextSilent: false, nextDup: false }, ad: newAd(), ss: { st: "Opening", answer: "none", owed: false },
  cb: { q: [], closing: "open", released: false }, susp: "", sentS: false,
});

// ---- cells ------------------------------------------------------------------------------------------------------
export const LROWS = ["commit", "retry", "cancel", "idle", "retryable", "invoked", "storageRefused", "success", "failure", "unknown", "interrupt", "dispose", "rebind", "restore", "runtimeDisposal", "hydration"];
const LCANNOT: Record<string, string[]> = { invoked: ["Idle", "Held"], storageRefused: ["Idle", "Held"], success: ["Idle", "Held"], failure: ["Idle", "Held"], unknown: ["Idle", "Held"], interrupt: ["Idle", "Held"], rebind: ["Idle"], hydration: ["InFlight", "Held"] };
export const laneCells = (): string[] => ["W|restore|InFlight:HeldConfirm"].concat(LROWS.flatMap((r) => ["Idle", "InFlight", "Held"].filter((s) => !(LCANNOT[r] ?? []).includes(s)).map((s) => `W|${r}|${s}`)));
export const WIRE_CELLS = ["arrive:none", "arrive:hold", "arrive:holdResp", "arrive:drop", "arrive:dropResp", "arrive:dup", "release|Held", "release|Held:orphan", "release|Server", "release|HeldAnswer", "releaseDrop|Held", "releaseDrop|Server", "releaseDrop|HeldAnswer",
  "nth|Held", "nth|Server", "nth|HeldAnswer", "answers|Server", "fails|Server", "cancel|Held", "cancel|Server", "cancel|HeldAnswer", "suspended|Held", "suspended|Server", "suspended|HeldAnswer"].map((x) => "Wire|" + x);
export const STO_CELLS = ["arrive:queued", "arrive:none", "arrive:hold", "arrive:holdResp", "arrive:drop", "ahead", "release|Queued", "release|Held", "release|HeldConfirm", "releaseDrop|Queued", "releaseDrop|Held", "releaseDrop|HeldConfirm", "close|Queued", "close|Held", "close|HeldConfirm", "read:arrive:none", "read:arrive:hold", "read:arrive:drop", "read:release|Held", "read:releaseDrop|Held", "read:close|Held"].map((x) => "Sto|" + x);
export const CONN_CELLS = ["att:none|None", "att:none|Closed", "att:hold|None", "att:hold|Closed", "att:drop|None", "att:drop|Closed", "frames|None", "frames|Closed", "frames|Opening", "frames|Open", "frames|Silent", "close|Opening", "close|Open", "close|Silent",
  "hold|None", "hold|Opening", "hold|Open", "hold|Closed", "nth|None", "nth|Opening", "nth|Open", "nth|Silent", "nth|Closed", "release|None", "release|Opening", "release|Open", "release|Silent", "release|Closed", "drop|None", "drop|Opening", "drop|Open", "drop|Silent", "drop|Closed",
  "dup|None", "dup|Opening", "dup|Open", "dup|Silent", "dup|Closed", "msg|Open", "msg|Silent", "clientClose|Opening", "clientClose|Open", "clientClose|Silent"].map((x) => "Conn|" + x);
export const HOST_CELLS = ["enter|Absent", "enter|Active", "enter|Frozen", "enter|Ended", "leave|Absent", "leave|Active", "leave|Frozen", "leave|Ended", "leaveEnd|Absent", "leaveEnd|Active", "leaveEnd|Frozen", "leaveEnd|Ended",
  "reset|Absent", "reset|Active", "reset|Frozen", "reset|Ended", "guards|Absent", "guards|Active", "guards|Frozen", "guards|Ended", "send|Absent", "send|Active", "send|Frozen", "send|Ended", "exit|Active"].map((x) => "Host|" + x);
export const PROG_CELLS = ["addr|setter", "other|setter", "addr|ending", "other|ending", "addr|promotion", "addr|restore"].map((x) => "P|" + x);
export const CB_CELLS = ["emitV", "emitS", "fail", "end", "pull", "release"].flatMap((r) => ["room", "full", "closed"].map((c) => `CB|${r}|${c}`));
const RCOLS: string[] = ["proof", "livelost", "reset", "down", "value", "pageOk", "cannotRepair", "pageFailW", "pageFailT", "failW", "failT", "pageDelay", "delay", "release"];
export const rCell = (ph: string, row: string): "defined" | "cannot" => {
  const page = ["pageOk", "cannotRepair", "pageFailW", "pageFailT", "pageDelay"].includes(row);
  if (ph === "Done") return row === "release" ? "defined" : "cannot";
  if (ph === "Waiting") return row === "delay" || row === "release" ? "defined" : "cannot";
  if (row === "delay") return "cannot";
  if (page) return ph === "CatchingUp" ? "defined" : "cannot";
  return "defined";
};
export const RECON_CELLS = ["Connecting", "Live", "CatchingUp", "Waiting", "Done"].flatMap((p) => RCOLS.filter((r) => rCell(p, r) === "defined").map((r) => `R|${p}|${r}`));
export const SINPUTS = ["proof", "live", "lost", "reset", "fresh", "pending", "settleP", "settleL", "value", "down", "fail", "complete", "defect", "release", "closed", "bound"];
export function sKind(st: SSt, k: string): "defined" | "cannot" {
  const adapter = !["release", "closed", "bound"].includes(k), settle = k === "settleP" || k === "settleL";
  if (st === "Released") return "cannot";
  if (st === "Ended") return k === "release" ? "defined" : "cannot";
  if (st === "Releasing") return "defined";
  if (k === "closed" || k === "bound") return "cannot";
  if (settle && st !== "Live") return "cannot";
  return adapter || k === "release" ? "defined" : "cannot";
}
export const SESS_CELLS = (["Opening", "Dropped", "Live", "Ended", "Releasing", "Released"] as SSt[]).flatMap((st) => SINPUTS.filter((k) => sKind(st, k) === "defined").map((k) => `S|${st}|${k}`));
export const ERRORS = ["ActorAbsent", "TabClosed", "TabOpen", "NothingHeld", "NoDeadline", "InvalidDuration", "AlreadyEntered", "NotEntered", "NotEntered(host)", "AlreadyEntered(host)", "StoryTurnLimit", "HostTimeWait"];

// ---- context ----------------------------------------------------------------------------------------------------
export interface End { tab: T; att: number; reason: string; by: "ans" | "lc" | "inj" }
export interface Ctx { qt?: boolean; log: string[]; viol: string[]; cells: string[]; ends: End[]; deliv: { att: number; ans: string }[]; fired: string[]; step: string; rev: boolean; turns: number; errs: string[] }
const cellAdd = (c: Ctx, x: string) => { if (!c.cells.includes(x)) c.cells.push(x); };

// ---- the wire (3.2) -----------------------------------------------------------------------------------------------
const FX: Record<string, number> = { pay: 0, hist: 1, chat: 1 }; // rank 1: fake servers by fixtures order, then Fake.storage (3.5)
function arm(S: S) { return ++S.armc; }
function takeRule(rs: Rule[], tab: T, pur: string): Rule | null { // 3.2: at arrival the earliest-set rule the request fits, and only that rule
  const i = rs.findIndex((r) => r.times !== 0 && (!r.tab || r.tab === tab) && (!r.pur || r.pur === pur));
  if (i < 0) return null;
  const r = { ...rs[i]! }; useRule(rs, i); return r;
}
function useRule(rs: Rule[], i: number) { if (rs[i]!.times > 0) rs[i]!.times--; if (rs[i]!.times === 0) rs.splice(i, 1); }
function newReq(S: S, ep: Req["ep"], tab: T, pur: string, att: number, st: RS): Req {
  const r: Req = { id: ++S.nid, ep, tab, pur, att, st, gone: false, ans: "", dup: false, srv: false, due: S.now, arm: arm(S), mark: "", host: false };
  S.reqs.push(r); return r;
}
function toServer(S: S, r: Req) { r.st = "Server"; r.due = S.now + (r.ep === "pay" ? S.srv.lat : 0); r.arm = arm(S); }
export function issue(S: S, c: Ctx, ep: Req["ep"], tab: T, pur: string, att: number) {
  const r = newReq(S, ep, tab, pur, att, "Server");
  if (ep === "pay" && S.srv.host) { r.host = true; S.srv.host = false; } // a handler that waits on the host (HostTimeWait)
  const rule = takeRule(S.rules[ep], tab, pur);
  if (!rule) { cellAdd(c, "Wire|arrive:none"); toServer(S, r); return; }
  const resp = rule.at === "response";
  if (rule.k === "hold") { cellAdd(c, resp ? "Wire|arrive:holdResp" : "Wire|arrive:hold"); if (resp) { r.mark = "hold"; toServer(S, r); } else r.st = "Held"; }
  else if (rule.k === "drop") {
    cellAdd(c, resp ? "Wire|arrive:dropResp" : "Wire|arrive:drop");
    if (resp) { r.mark = "drop"; toServer(S, r); } else { S.reqs.splice(S.reqs.indexOf(r), 1); clientLost(S, c, r); }
  } else { cellAdd(c, "Wire|arrive:dup"); toServer(S, r); const d = newReq(S, ep, tab, pur, att, "Server"); d.dup = true; d.gone = CFG.dupAnswerIgnored; toServer(S, d); }
}
function interrupt(S: S, c: Ctx, r: Req) { // its client cancels, or its tab closes
  cellAdd(c, "Wire|cancel|" + (r.st === "Waking" ? "Server" : r.st));
  r.gone = true;
  if (!CFG.orphanTravels && r.st === "Held") S.reqs.splice(S.reqs.indexOf(r), 1);
}
function clientLost(S: S, c: Ctx, r: Req) { if (r.gone) return; c.deliv.push({ att: r.att, ans: "lost" }); onAnswer(S, c, r, "lost"); } // Fake/Lost is the fake's answer through the transport
function handlerDone(S: S, c: Ctx, r: Req) {
  r.srv = true;
  if (r.ep === "pay") {
    if (S.srv.die) { S.srv.die = false; cellAdd(c, "Wire|fails|Server"); c.log.push("issue: handler crashed"); S.reqs.splice(S.reqs.indexOf(r), 1); clientLost(S, c, r); return; } // 3.2 "handler fails"
    if (r.dup) r.ans = "ok";
    else if (S.srv.busy > 0) { S.srv.busy--; r.ans = "busy"; }
    else { if (!S.srv.chg.includes(r.att)) S.srv.chg.push(r.att); r.ans = "ok"; }
  } else r.ans = S.chat.hist;
  cellAdd(c, "Wire|answers|Server");
  if (r.mark === "hold") { r.st = "HeldAnswer"; return; }
  if (r.mark === "drop") { S.reqs.splice(S.reqs.indexOf(r), 1); clientLost(S, c, r); return; }
  finish(S, c, r);
}
function finish(S: S, c: Ctx, r: Req) { // answered (or orphan if gone, or the discarded answer of a duplicate copy)
  if (S.susp === r.tab && !r.gone) { r.st = "Waking"; return; }
  S.reqs.splice(S.reqs.indexOf(r), 1);
  if (r.gone && CFG.goneDiscarded) { c.log.push(`orphan ${r.ep}/${r.pur}#${r.att} answer discarded`); return; }
  c.deliv.push({ att: r.att, ans: r.ans });
  onAnswer(S, c, r, r.ans);
}
export function release(S: S, c: Ctx, ep: Req["ep"], drop: boolean, nth = 0, handle = false): string | null {
  const held = S.reqs.filter((r) => r.ep === ep && (r.st === "Held" || r.st === "HeldAnswer"));
  const hadRules = S.rules[ep].some((r) => !!r.h === handle);
  if (CFG.nothingHeld && held.length === 0 && !(CFG.releaseEndsStanding && hadRules)) return "NothingHeld";
  const word = drop ? "releaseDrop" : nth ? "nth" : "release";
  if (S.reqs.some((r) => r.ep === ep && r.st === "Server")) cellAdd(c, `Wire|${word}|Server`);
  const order = [...held];
  if (nth && order.length >= nth) { const k = order.splice(nth - 1, 1)[0]!; order.unshift(k); }
  let first = true;
  for (const r of order) {
    const w = nth && first ? "nth" : word; first = false;
    if (r.st === "Held") {
      if (drop && CFG.lostNotServed) { cellAdd(c, "Wire|releaseDrop|Held"); S.reqs.splice(S.reqs.indexOf(r), 1); clientLost(S, c, r); }
      else { cellAdd(c, `Wire|${w}|Held`); if (r.gone) cellAdd(c, "Wire|release|Held:orphan"); toServer(S, r); }
    } else if (drop) { cellAdd(c, "Wire|releaseDrop|HeldAnswer"); S.reqs.splice(S.reqs.indexOf(r), 1); clientLost(S, c, r); } // dropped: the server handled it
    else { cellAdd(c, `Wire|${w}|HeldAnswer`); finish(S, c, r); }
  }
  if (CFG.releaseEndsStanding) {
    if (CFG.targetScoped) S.rules[ep] = S.rules[ep].filter((r) => !!r.h !== handle);
    else { if (S.rules[ep].some((r) => !!r.h !== handle)) c.viol.push("W:release-ended-other-target"); S.rules[ep] = []; }
  }
  return null;
}

// ---- 3.6 a write at Fake.storage (local, FIFO per tab) ------------------------------------------------------------------
const wc = (c: Ctx, x: string) => cellAdd(c, "Sto|" + x);
function applyW(S: S, w: Wr) {
  if (w.pur === "ack") S.rec = { att: w.att, held: false, late: S.dead.includes(w.att) || !S.tabs[w.tab] || undefined }; // late: an acknowledgement that lands after its Attempt ended or its tab closed
  else if (w.pur === "flush") { if (S.rec && S.rec.att === w.att) S.rec.held = true; }
  else if (w.pur === "clear") { if (S.rec && S.rec.att === w.att) S.rec = null; }
}
function startW(S: S, c: Ctx, w: Wr) { // takes its rule now
  const rule = takeRule(S.rules.sto, w.tab, w.pur);
  if (!rule || rule.k === "dup") { wc(c, "arrive:none"); applyW(S, w); finishW(S, c, w, "stored"); return; } // INVENTED: duplicate() on a write is a no-op
  if (rule.k === "hold") { if (rule.at === "request") { wc(c, "arrive:hold"); w.st = "Held"; } else { wc(c, "arrive:holdResp"); applyW(S, w); if (w.pur === "ack" && S.rec) S.rec.hc = true; w.st = "HeldConfirm"; } return; }
  wc(c, "arrive:drop"); finishW(S, c, w, "refused");
}
export function write(S: S, c: Ctx, tab: T, pur: string, att: number) {
  const behind = S.wr.some((x) => x.tab === tab);
  const w: Wr = { tab, pur, att, st: "Queued", arm: arm(S) }; S.wr.push(w);
  if (behind && CFG.writeFifo) { wc(c, "arrive:queued"); return; }
  startW(S, c, w);
}
function finishW(S: S, c: Ctx, w: Wr, res: "stored" | "refused") {
  const i = S.wr.indexOf(w); if (i >= 0) S.wr.splice(i, 1);
  onWrite(S, c, w, res);
  const nx = S.wr.find((x) => x.tab === w.tab);
  if (nx && nx.st === "Queued") { wc(c, "ahead"); startW(S, c, nx); }
}
export function releaseW(S: S, c: Ctx, drop: boolean): string | null {
  const held = S.wr.filter((w) => w.st === "Held" || w.st === "HeldConfirm"), hadRules = S.rules.sto.length > 0;
  if (CFG.nothingHeld && held.length === 0 && S.rd.length === 0 && !(CFG.releaseEndsStanding && hadRules)) return "NothingHeld";
  const w0 = drop ? "releaseDrop" : "release";
  if (S.wr.some((w) => w.st === "Queued")) wc(c, w0 + "|Queued");
  for (const w of held) {
    wc(c, `${w0}|${w.st}`);
    if (drop) finishW(S, c, w, "refused"); else { if (w.st === "Held") applyW(S, w); finishW(S, c, w, "stored"); }
  }
  for (const t of [...S.rd]) { wc(c, drop ? "read:releaseDrop|Held" : "read:release|Held"); S.rd.splice(S.rd.indexOf(t), 1); restoreTab(S, c, t, !drop); }
  if (CFG.releaseEndsStanding) S.rules.sto = [];
  return null;
}
function closeWrites(S: S, c: Ctx, tab: T) { // its tab closes
  if (S.rd.includes(tab)) { wc(c, "read:close|Held"); S.rd.splice(S.rd.indexOf(tab), 1); }
  for (const w of [...S.wr]) {
    if (w.tab !== tab) continue;
    wc(c, "close|" + w.st);
    if (w.pur === "clear" && w.st !== "HeldConfirm" && S.rec && S.rec.att === w.att) S.rec.crash = true; // a crash before the capture ran
    if (w.st === "HeldConfirm" || CFG.abortOnClose) S.wr.splice(S.wr.indexOf(w), 1); // HeldConfirm: stays written, the confirmation is lost
  }
}
function onWrite(S: S, c: Ctx, w: Wr, res: "stored" | "refused") {
  const t = w.tab, tb = S.tabs[t];
  if (!tb || w.pur === "flush" || w.pur === "clear") return;
  const L = tb.lane;
  if (L.head !== w.att || (L.stage !== "ack" && L.stage !== "cap")) return; // the Attempt has ended: the confirmation is evidence
  if (res === "stored") return sendCommit(S, c, t, w.att);
  lcell(c, "storageRefused", "InFlight"); progEnding(c, L, w.att);
  if (w.pur === "ack") { endRec(c, t, w.att, "NotSent{StorageRefused}", "lc"); resolve(S, c, t, w.att); } else { endRec(c, t, w.att, "unknown{StorageRefused}", "lc"); hold(S, c, t, w.att); }
}

// ---- write lane (reduced) ------------------------------------------------------------------------------------------
function lcOk(c: Ctx) { return /^(send|life|world|together|advance)/.test(c.step); }
function lcell(c: Ctx, row: string, st: string) { cellAdd(c, `W|${row}|${st}`); }
function endRec(c: Ctx, tab: T, att: number, reason: string, by: End["by"]) {
  c.ends.push({ tab, att, reason, by });
  if (by === "ans" && !c.deliv.some((d) => d.att === att)) c.viol.push("C3:answer-ending-without-answer:" + reason);
  if (by === "lc" && !lcOk(c)) c.viol.push("C3:lifecycle-ending-outside-step:" + reason);
  if (by === "inj") c.viol.push("C3:injected:" + reason);
  c.log.push(`ending ${tab}#${att} ${reason} (${by})`);
}
function progEnding(c: Ctx, L: Lane, att: number) { cellAdd(c, `P|${L.head === att && !L.ended ? "addr" : "other"}|ending`); }
function promote(S: S, c: Ctx, t: T) {
  const L = S.tabs[t]!.lane; L.head = 0; L.stage = ""; L.ended = false;
  if (OPT.policy === "serialize" && L.W.length) { const a = L.W.shift()!; cellAdd(c, "P|addr|promotion"); startHead(S, c, t, a); } else L.st = "Idle";
}
function startHead(S: S, c: Ctx, t: T, a: number) {
  const tb = S.tabs[t]!, L = tb.lane; L.st = "InFlight"; L.head = a; L.ended = false;
  if (tb.persist && CFG.ackGate) { L.stage = "ack"; write(S, c, t, "ack", a); } else sendCommit(S, c, t, a);
}
function sendCommit(S: S, c: Ctx, t: T, a: number) { const L = S.tabs[t]!.lane; lcell(c, "invoked", "InFlight"); L.stage = "wire"; issue(S, c, "pay", t, "commit", a); }
function resolve(S: S, c: Ctx, t: T, att: number) { // success, failure, NotSent, Released: the Attempt leaves the lane
  const tb = S.tabs[t]!;
  if (!S.dead.includes(att)) S.dead.push(att);
  if (tb.persist && CFG.clearOnResolve) write(S, c, t, "clear", att); // the next capture of the lane removes its record, queued behind any held acknowledgement
  else if (tb.persist && S.rec && S.rec.att === att) S.rec = null;
  if (tb.lane.head === att) promote(S, c, t);
}
function hold(S: S, c: Ctx, t: T, att: number) { // unknown: the lane holds the Attempt
  const tb = S.tabs[t]!, L = tb.lane; L.st = "Held"; L.stage = ""; L.ended = true;
  if (tb.persist) write(S, c, t, "flush", att);
  if (OPT.auto) S.tm.push({ own: 5, kind: "autoRetry", tab: t, due: S.now + 1, ref: 0, fx: 0, op: 0, arm: arm(S) });
}
function onAnswer(S: S, c: Ctx, r: Req, ans: string) {
  const t = r.tab, tb = S.tabs[t];
  if (r.ep === "hist") return pageAns(S, c, r, ans);
  if (!tb) return;
  const L = tb.lane;
  if (L.head !== r.att || L.stage !== "wire") { c.viol.push("L:stale-commit-answer"); return; }
  progEnding(c, L, r.att);
  if (ans === "ok") { lcell(c, "success", "InFlight"); endRec(c, t, r.att, "success", "ans"); resolve(S, c, t, r.att); }
  else if (ans === "busy") { lcell(c, "failure", "InFlight"); endRec(c, t, r.att, "failure{Busy}", "ans"); resolve(S, c, t, r.att); }
  else { lcell(c, "unknown", "InFlight"); endRec(c, t, r.att, "unknown{NoResponse}", "ans"); hold(S, c, t, r.att); }
}
function commit(S: S, c: Ctx, t: T) {
  const tb = S.tabs[t]!, L = tb.lane; lcell(c, "commit", L.st);
  const a = ++S.natt;
  if (L.st === "Idle") return startHead(S, c, t, a);
  if (OPT.policy === "serialize" && L.W.length < 1) { L.W.push(a); return; }
  const why = OPT.policy === "serialize" ? "Overloaded" : "Rejected";
  cellAdd(c, "P|other|ending"); if (!S.dead.includes(a)) S.dead.push(a); endRec(c, t, a, `NotSent{${why}}`, "lc");
}
function retry(S: S, c: Ctx, t: T) {
  const tb = S.tabs[t]!, L = tb.lane; lcell(c, "retry", L.st);
  if (L.st !== "Held" || !CFG.heldEscapes) return; // evidence NothingToResend / InFlight
  L.st = "InFlight"; L.ended = false;
  if (tb.persist) { L.stage = "cap"; write(S, c, t, "capture", L.head); } else sendCommit(S, c, t, L.head);
}
function cancel(S: S, c: Ctx, t: T) {
  const tb = S.tabs[t]!, L = tb.lane; lcell(c, "cancel", L.st);
  if (L.st === "Idle") return;
  if (L.st === "Held") { if (!CFG.heldEscapes) return; S.dead.includes(L.head) || S.dead.push(L.head); resolve(S, c, t, L.head); return; } // Released
  const att = L.head, stage = L.stage;
  for (const r of S.reqs) if (r.tab === t && r.att === att && !r.gone && r.ep === "pay") interruptReq(S, c, r);
  if (stage === "wire") {
    if (!CFG.cancelInterrupts) { return; }
    lcell(c, "interrupt", "InFlight"); progEnding(c, L, att); endRec(c, t, att, "unknown{Cancelled}", "lc"); hold(S, c, t, att);
  } else { progEnding(c, L, att); endRec(c, t, att, stage === "cap" ? "Released" : "NotSent{Cancelled}", "lc"); resolve(S, c, t, att); }
}
function interruptReq(S: S, c: Ctx, r: Req) { interrupt(S, c, r); }

// ---- stream (3.3 connection, 3.4 reconnect, 3.1 session, M6 3.3 callback queue) -------------------------------------
function sIn(S: S, c: Ctx, k: string) {
  const ss = S.ss; if (!S.ad.on) return;
  if ((ss.st === "Ended" || ss.st === "Released") && !["release", "closed", "bound"].includes(k)) return; // Flow pulls nothing after Ended
  if (sKind(ss.st, k) === "cannot") { c.viol.push(`S:cannot-fired:${ss.st}|${k}`); return; }
  cellAdd(c, `S|${ss.st}|${k}`);
  const st = ss.st;
  const start = (a: string) => { ss.st = "Live"; ss.answer = a; ss.owed = false; };
  if (st === "Releasing") { if (k === "closed" || k === "bound") ss.st = "Released"; return; }
  switch (k) {
    case "proof": if (st === "Live") ss.answer = "proven"; else start("proven"); break;
    case "live": case "lost": case "reset": case "fresh": start(k === "live" ? "unproven" : k); break;
    case "pending": start("pending"); break;
    case "settleP": if (ss.answer === "pending") ss.answer = "proven"; break;
    case "settleL": if (ss.answer === "pending") ss.answer = "lost"; break;
    case "value": if (st === "Opening") start("unproven"); else if (st === "Dropped") ss.owed = true; break;
    case "down": ss.st = "Dropped"; if (ss.answer === "pending") ss.answer = "abandoned"; break;
    case "fail": case "complete": case "defect": ss.st = "Ended"; if (ss.answer === "pending") ss.answer = "abandoned"; break;
    case "release": ss.st = "Releasing"; break;
  }
}
function cbCol(cb: Cb) { return cb.closing !== "open" || cb.released ? "closed" : cb.q.filter((x) => x === "v").length < BUF ? "room" : "full"; }
function cbEmit(S: S, c: Ctx, row: "emitV" | "emitS" | "fail" | "end", sig?: string) {
  const cb = S.cb, col = cbCol(cb); cellAdd(c, `CB|${row}|${col}`);
  if (col === "closed") return;
  if (row === "emitV") { if (col === "full") cb.closing = "fail"; else cb.q.push("v"); }
  else if (row === "emitS") { const tl = cb.q[cb.q.length - 1]; if (tl && tl !== "v") cb.q[cb.q.length - 1] = tl.split(",").slice(-2).concat(sig!).join(","); else cb.q.push(sig!); }
  else if (row === "fail") cb.closing = "fail"; else cb.closing = "end";
}
function pullOne(S: S, c: Ctx): boolean {
  if (OPT.src === "plain" || !S.ad.on) return false;
  const cb = S.cb;
  if (cb.q.length === 0 && (cb.closing === "open" || cb.closing === "done")) return false;
  if (OPT.src === "callback") cellAdd(c, `CB|pull|${cbCol(cb)}`);
  if (cb.q.length === 0) { sIn(S, c, cb.closing === "fail" ? "fail" : "complete"); cb.closing = "done"; return true; }
  const x = cb.q.shift()!;
  if (x.startsWith("a:")) sIn(S, c, x.slice(2)); else if (x === "v") sIn(S, c, "value"); else for (const g of x.split(",")) sIn(S, c, g);
  return true;
}
function emit(S: S, c: Ctx, k: string) { // INVENTED: Feed.reconnect's signals pass through a group queue that Flow pulls at settle; plain and callback sources are read directly
  if (OPT.src !== "reconnect") { sIn(S, c, k); return; }
  if (S.cb.q.length < 12) S.cb.q.push("a:" + k);
}
// 3.4 Feed.reconnect (the adapter): rows on phases, recorded as R|phase|row
function Rcell(S: S, c: Ctx, row: string): boolean {
  if (rCell(S.ad.ph, row) === "cannot") { c.viol.push(`R:cannot-fired:${S.ad.ph}|${row}`); return false; }
  cellAdd(c, `R|${S.ad.ph}|${row}`); return true;
}
function abandon(S: S, c: Ctx) { for (const r of S.reqs) if (r.ep === "hist" && !r.gone) interrupt(S, c, r); S.ad.buf = 0; }
function reqPage(S: S, c: Ctx) { issue(S, c, "hist", "a", "page", 0); }
function startRepair(S: S, c: Ctx, withPending: boolean) {
  const ad = S.ad; if (withPending) emit(S, c, "pending");
  ad.ph = "CatchingUp"; ad.buf = 0; ad.ec = 0; ad.settled = false; ad.ps = 0; reqPage(S, c);
}
function complete(S: S, c: Ctx) {
  const ad = S.ad; abandon(S, c);
  if (!ad.settled) emit(S, c, "settleP");
  ad.ph = "Live"; for (let i = 0; i < ad.buf; i++) { emit(S, c, "value"); ad.last = true; } ad.buf = 0;
}
function closeConn(S: S, c: Ctx) { const cn = S.chat.cn; if (cn && cn.st !== "Closed") { cn.st = "Closed"; cn.q = []; } }
function dropConn(S: S, c: Ctx, e: string) {
  const ad = S.ad; if (ad.ph === "CatchingUp") abandon(S, c);
  closeConn(S, c); emit(S, c, "down");
  if (ad.ls !== null && S.now - ad.ls >= RESETAFTER) ad.n = 0;
  ad.ls = null;
  if (ad.n < SCHED) { ad.n++; ad.ph = "Waiting"; S.tm.push({ own: 2, kind: "reconnect", tab: "a", due: S.now + ad.n, ref: 0, fx: 0, op: 0, arm: arm(S) }); }
  else { ad.ph = "Done"; emit(S, c, "fail"); }
}
function register(S: S, c: Ctx, sig: string) {
  const ad = S.ad; ad.sig = true; ad.ls = S.now;
  if (ad.last) { startRepair(S, c, true); return; }
  if (sig === "live" && !ad.any) emit(S, c, "fresh"); else emit(S, c, sig);
  ad.ph = "Live";
}
function innerSig(S: S, c: Ctx, k: string) {
  const ad = S.ad;
  if (OPT.src === "plain" || (ad.rel && OPT.src === "reconnect")) return;
  if (OPT.src === "callback") { cbEmit(S, c, "emitS", k); return; }
  const row = k === "live" || k === "lost" ? "livelost" : k;
  if (ad.ph === "Waiting" || ad.ph === "Done") return;
  const ph = ad.ph; if (!Rcell(S, c, row)) return;
  if (k === "proof") { if (ph === "Connecting") { emit(S, c, "proof"); ad.sig = true; ad.ls = S.now; ad.ph = "Live"; } else if (ph === "Live") emit(S, c, "proof"); }
  else if (k === "live" || k === "lost") { if (ph === "CatchingUp") { abandon(S, c); startRepair(S, c, false); } else register(S, c, k); }
  else if (k === "reset") {
    if (ph === "CatchingUp") abandon(S, c);
    ad.last = true; emit(S, c, "reset"); if (ph === "Connecting") { ad.sig = true; ad.ls = S.now; } ad.ph = "Live";
  } else if (k === "down") {
    if (ph === "CatchingUp") abandon(S, c);
    emit(S, c, "down"); ad.sig = true; ad.ls = null; if (ph !== "Connecting") ad.ph = "Connecting";
  }
}
function innerValue(S: S, c: Ctx) {
  const ad = S.ad;
  if (OPT.src === "plain") { if (!ad.rel) emit(S, c, "value"); return; }
  if (ad.rel && OPT.src === "reconnect") return;
  if (OPT.src === "callback") { cbEmit(S, c, "emitV"); return; }
  if (ad.ph === "Waiting" || ad.ph === "Done") return;
  const ph = ad.ph; if (!Rcell(S, c, "value")) return;
  const emitV = () => { emit(S, c, "value"); ad.last = true; ad.any = true; };
  if (ph === "Connecting" && !ad.sig) { register(S, c, "live"); if (S.ad.ph === "CatchingUp") S.ad.buf = 1; else emitV(); }
  else if (ph === "CatchingUp") { ad.buf++; if (ad.buf > BUF) dropConn(S, c, "Overflow"); }
  else emitV();
}
function innerClose(S: S, c: Ctx, kind: "lost" | "fatal" | "end" | "die") {
  const ad = S.ad;
  if (kind === "die") { if (!ad.rel || OPT.suite) sIn(S, c, "defect"); return; } // INVENTED: the suite's awaiting adapter can fail while its finalizer waits
  if (ad.rel && OPT.src !== "callback") return;
  if (OPT.src === "plain") { emit(S, c, kind === "end" ? "complete" : "fail"); return; }
  if (OPT.src === "callback") { if (kind === "lost") cbEmit(S, c, "emitS", "down"); else if (kind === "fatal") cbEmit(S, c, "fail"); else cbEmit(S, c, "end"); return; }
  if (ad.ph === "Waiting" || ad.ph === "Done") return;
  const row = kind === "fatal" ? "failT" : "failW"; const ph = ad.ph;
  if (!Rcell(S, c, row)) return;
  if (kind === "fatal") { if (ph === "CatchingUp") abandon(S, c); closeConn(S, c); ad.ph = "Done"; emit(S, c, "fail"); } else dropConn(S, c, kind);
}
function pageAns(S: S, c: Ctx, r: Req, ans: string) {
  const ad = S.ad; if (!ad.on || ad.ph !== "CatchingUp") return;
  const pageFail = (row: "pageFailW" | "pageFailT") => {
    if (!Rcell(S, c, row)) return;
    if (row === "pageFailT") { abandon(S, c); closeConn(S, c); ad.ph = "Done"; emit(S, c, "fail"); return; }
    if (ad.ps < PAGESCHED) { ad.ps++; S.tm.push({ own: 2, kind: "pageDelay", tab: "a", due: S.now + 1, ref: 0, fx: 0, op: 1, arm: arm(S) }); } else dropConn(S, c, "Page");
  };
  if (ans === "cannot") { if (!Rcell(S, c, "cannotRepair")) return; emit(S, c, "settleL"); ad.settled = true; complete(S, c); return; }
  if (ans === "fail" || ans === "lost") { pageFail("pageFailW"); return; }
  if (ans === "fatal") { pageFail("pageFailT"); return; }
  if (!Rcell(S, c, "pageOk")) return;
  const empty = ans === "empty", next = ans === "more" || ans === "empty";
  if (!empty) { ad.buf = 0; emit(S, c, "value"); ad.last = true; ad.any = true; }
  if (empty && next) ad.ec++; else { ad.ec = 0; ad.ps = 0; }
  if (ad.ec >= 2) { pageFail("pageFailW"); return; }
  if (next) reqPage(S, c); else complete(S, c);
}
// 3.3: the connection
const cst = (S: S) => (S.chat.cn ? S.chat.cn.st : "None");
function frames(S: S, c: Ctx, fs: string[]) { // a control sends frames
  const cn = S.chat.cn, st = cst(S); cellAdd(c, "Conn|frames|" + st);
  if (st === "Open") { if (S.chat.nextDup) { fs = [fs[0]!, ...fs]; S.chat.nextDup = false; } for (const f of fs) deliverFrame(S, c, f); }
  else if (st === "Silent") { if (S.chat.nextDup) { fs = [fs[0]!, ...fs]; S.chat.nextDup = false; } cn!.q = cn!.q.concat(fs).slice(0, 4); }
}
function deliverFrame(S: S, c: Ctx, f: string) {
  if (f === "!fatal" || f === "!end") { innerClose(S, c, f === "!fatal" ? "fatal" : "end"); return; } if (!S.ad.on || (S.ad.rel && OPT.src !== "callback")) return; if (f === "value") innerValue(S, c); else innerSig(S, c, f); }
function connect(S: S, c: Ctx) { // an attempt (3.3 first three rows)
  const ch = S.chat, prior = cst(S);
  const rule = takeRule(ch.orules, "a", "open");
  if (rule && rule.k === "hold") { cellAdd(c, `Conn|att:hold|${prior}`); ch.cn = { st: "Opening", code: 0, q: [], hc: false }; return; }
  if (rule && rule.k === "drop" && CFG.dropOpenRefuses) { cellAdd(c, `Conn|att:drop|${prior}`); if (prior !== "Closed") ch.cn = null; innerClose(S, c, "lost"); return; } // refused: the binding's lost, stays None
  cellAdd(c, `Conn|att:none|${prior}`);
  ch.cn = { st: "Opening", code: 0, q: [], hc: false }; acceptOpen(S, c);
}
function acceptOpen(S: S, c: Ctx) { // open runs
  const ch = S.chat, cn = ch.cn!;
  if (ch.refuse) { cn.st = "Closed"; cn.code = 4401; innerClose(S, c, "fatal"); return; }
  cn.st = "Open";
  if (ch.nextSilent) { cn.st = "Silent"; ch.nextSilent = false; if (ch.greet !== "none" && OPT.src !== "plain") cn.q.push(ch.greet); return; }
  if (ch.greet !== "none" && OPT.src !== "plain") deliverFrame(S, c, ch.greet);
}
function clientClose(S: S, c: Ctx) { // the client closes (release) or its tab closes: -> None, the finalizer does not wait (2.10)
  const cn = S.chat.cn;
  if (!cn || cn.st === "Closed") { sIn(S, c, "closed"); return; }
  cellAdd(c, "Conn|clientClose|" + cn.st);
  if (OPT.suite && cn.st === "Open" && S.chat.holdClose !== 0 && CFG.closeHold) { // the policy suite's adapter awaits a gate in its finalizer
    if (S.chat.holdClose > 0) S.chat.holdClose--;
    cn.hc = true; S.tm.push({ own: 4, kind: "bound", tab: "a", due: S.now + BOUND, ref: 0, fx: 0, op: 0, arm: arm(S) }); return;
  }
  S.chat.cn = null; sIn(S, c, "closed");
}
function unsub(S: S, c: Ctx) {
  const ad = S.ad;
  S.tm = S.tm.filter((t) => !(t.tab === "a" && (t.kind === "reconnect" || t.kind === "pageDelay" || t.kind === "sdk"))); ad.rel = true;
  if (OPT.src === "reconnect") { if (Rcell(S, c, "release") && ad.ph === "CatchingUp") abandon(S, c); }
  if (OPT.src === "callback") { cellAdd(c, `CB|release|${cbCol(S.cb)}`); S.cb.released = true; }
  sIn(S, c, "release");
  if (S.ss.st === "Releasing") { if (OPT.suite) ad.cp = true; else clientClose(S, c); } // only an awaiting finalizer (the suite's) lets the pump run first
}

// ---- settling (3.1, R-Settle) -------------------------------------------------------------------------------------
function tick(c: Ctx): boolean { if (++c.turns > TURNS) { c.errs.push("StoryTurnLimit"); return false; } return true; }
export function settle(S: S, c: Ctx, pull = true) {
  for (;;) {
    if (!tick(c)) return;
    let did = false;
    for (const r of S.reqs) {
      if (r.st === "Server" && r.due <= S.now && !r.host) { handlerDone(S, c, r); did = true; break; }
      if (r.st === "Waking" && S.susp !== r.tab) { S.reqs.splice(S.reqs.indexOf(r), 1); c.deliv.push({ att: r.att, ans: r.ans }); onAnswer(S, c, r, r.ans); did = true; break; }
    }
    if (did) continue;
    if (pull && pullOne(S, c)) continue;
    if (pull && S.ad.on && S.ad.cp) { S.ad.cp = false; clientClose(S, c); continue; }
    if (S.ss.st === "Released" && S.ad.on) { S.ad = newAd(); S.cb = { q: [], closing: "open", released: false }; }
    break;
  }
  if (S.ad.on === false) S.ss = { st: "Opening", answer: "none", owed: false };
  if (S.reqs.some((r) => r.st === "Server" && r.host)) c.errs.push("HostTimeWait"); // 2.3: a fiber still waiting on the host after the flush
}
export function runnable(S: S): string[] { // independent of settle: what would still run
  const o: string[] = [];
  for (const r of S.reqs) { if (r.st === "Server" && r.due <= S.now && !r.host) o.push(`handler ${r.ep}/${r.pur}`); if (r.st === "Waking" && S.susp !== r.tab) o.push(`answer ${r.ep}/${r.pur}`); }
  for (const t of TABS) { const f = S.wr.find((w) => w.tab === t); if (f && f.st === "Queued") o.push(`write ${f.pur} not started`); }
  for (const t of S.tm) if (t.due <= S.now && !(S.susp && t.tab === S.susp && t.own >= 2)) o.push(`timer ${t.kind}`);
  for (const t of TABS) { const tb = S.tabs[t]; if (tb && tb.lane.st === "InFlight" && tb.lane.stage === "") o.push(`lane ${t} not started`); if (tb && tb.lane.st === "Idle" && tb.lane.W.length) o.push(`lane ${t} queue not promoted`); }
  if (S.ad.on && OPT.src !== "plain" && (S.cb.q.length || (S.cb.closing === "fail" || S.cb.closing === "end"))) o.push("callback queue not drained");
  if (S.ad.on && S.ad.cp) o.push("close pending");
  if (S.ad.on && S.ss.st === "Releasing" && (!S.chat.cn || S.chat.cn.st === "Closed") && !OPT.suite) o.push("session releasing but closed");
  if (S.ad.on && OPT.src === "reconnect" && S.ad.ph === "Waiting" && !S.tm.some((t) => t.kind === "reconnect")) o.push("waiting with no timer");
  return o;
}

// ---- deadlines and equal instants (3.5) ----------------------------------------------------------------------------
interface Dl { own: number; kind: string; tab: string; due: number; fx: number; op: number; arm: number; req?: Req; tm?: Tm }
function deadlines(S: S, rev: boolean): Dl[] {
  const out: Dl[] = [];
  for (const r of S.reqs) if (r.st === "Server" && r.due > S.now) out.push({ own: 1, kind: "handler", tab: "-", due: r.due, fx: FX[r.ep]!, op: 0, arm: r.arm, req: r });
  for (const t of S.tm) out.push({ own: t.own, kind: t.kind, tab: t.tab, due: t.due, fx: t.fx, op: t.op, arm: t.arm, tm: t });
  return rev ? out.reverse() : out;
}
const RANK: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
function cmp(a: Dl, b: Dl): number {
  const rk = (x: Dl) => (CFG.ranksOk ? RANK[x.own]! : 0);
  const k = (x: Dl) => [x.due, rk(x), x.own === 1 ? x.fx : x.tab === "-" ? 0 : x.tab === "a" ? 0 : 1, x.own === 1 ? 0 : x.tab === "-" ? 0 : x.tab === "a" ? 0 : 1, x.op, CFG.armTie ? x.arm : 0];
  // rank 1: fixture order, arming. rank 2: tab, (actor), operation, (key), arming. rank 3: tab, arming. rank 4: tab, (path, copy, key), arming.
  const ka = k(a), kb = k(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
  return 0;
}
function fire(S: S, c: Ctx, d: Dl, suspended: boolean) {
  const pend = deadlines(S, false).filter((x) => x.due === d.due);
  if (pend.some((x) => x.own < d.own)) c.viol.push(`T:rank-order:${d.kind}@${d.due} before rank ${Math.min(...pend.map((x) => x.own))}`);
  if (suspended && d.tab !== "-" && d.tab === S.susp && d.own >= 2) c.viol.push("T:suspended-tab-fired:" + d.kind);
  c.fired.push(`${d.due}:${d.own}:${d.kind}:${d.tab}`);
  S.now = d.due;
  if (d.req) { handlerDone(S, c, d.req); } else if (d.tm) {
    S.tm.splice(S.tm.indexOf(d.tm), 1);
    const t = d.tm;
    if (t.kind === "reconnect") { if (S.ad.on && S.ad.ph === "Waiting") { Rcell(S, c, "delay"); S.ad.ph = "Connecting"; S.ad.sig = false; S.ad.ls = null; connect(S, c); } }
    else if (t.kind === "pageDelay") { if (S.ad.on && S.ad.ph === "CatchingUp") { Rcell(S, c, "pageDelay"); reqPage(S, c); } }
    else if (t.kind === "sdk") { c.log.push("sdk tick"); }
    else if (t.kind === "bound") { if (S.ad.on && S.ss.st === "Releasing") { S.chat.cn = null; sIn(S, c, "bound"); } }
    else if (t.kind === "retain") { const tb = S.tabs[t.tab as T]; if (tb && !tb.actor) { tb.exp = true; if (!tb.persist) { for (const r of S.reqs) if (r.tab === t.tab && !r.gone) interrupt(S, c, r); tb.lane = newLane(); } } }
    else if (t.kind === "autoRetry") { const tb = S.tabs[t.tab as T]; if (tb && tb.actor && tb.lane.st === "Held") retry(S, c, t.tab as T); }
  }
  c.log.push(`fire ${d.kind}@${d.due}`);
  settle(S, c, !c.qt);
}
function runUntil(S: S, c: Ctx, target: number, suspended: boolean) {
  for (;;) {
    let ds = deadlines(S, c.rev).filter((d) => d.due <= target);
    if (suspended && CFG.suspendHolds) ds = ds.filter((d) => !(d.tab === S.susp && d.own >= 2));
    if (!ds.length) break;
    ds.sort(cmp);
    if (c.errs.length) return;
    fire(S, c, ds[0]!, suspended);
  }
  S.now = Math.max(S.now, target);
}

// ---- steps (3.1) -------------------------------------------------------------------------------------------------------
export function stepList(): string[] {
  const o: string[] = ["send a Pay", "send a Retry", "send a Cancel", "send a GuardIdle", "send a GuardRetryable", "send b Pay", "send b Cancel",
    "advance 1", "advance next", "advance -1",
    "world pay.hold", "world pay.hold:response", "world pay.hold:b", "world pay.release", "world pay.release:drop", "world pay.release:nth2", "world pay.drop:always:handle", "world pay.release:handle", "world sto.hold:read", "world sto.drop:read", "world pay.drop", "world pay.drop:response", "world pay.drop:always", "world pay.dup",
    "world sto.hold:ack", "world sto.hold:ack:response", "world sto.hold:capture", "world sto.hold:flush", "world sto.hold:clear", "world sto.release", "world sto.release:drop", "world sto.drop:ack", "world sto.drop:capture",
    "world srv.busy", "world srv.slow", "world srv.die", "world srv.progress", "world srv.hostwait", "world pay.hold:response", "world pay.drop:response",
    "life closeTab a", "life openTab a", "life openTab b", "life closeTab b", "life dispose a", "life ensure a", "life dispose b", "life ensure b", "life dehydrate", "life hydrate", "life reload a", "life reload b",
    "together pay.release+send a Cancel", "together send a Cancel+pay.release", "together advance 1+send a Cancel", "together advance -1+send a Cancel"];
  return o;
}
export function streamSteps(): string[] {
  return ["send a Sub", "send a SubFrom", "send a Unsub", "send a Msg", "advance 1", "advance 2", "advance next", "advance 1 suspended",
    "world chat.hold", "world chat.release", "world chat.drop", "world chat.dup", "world chat.release:nth2", "world chat.hold:open", "world chat.drop:open", "world chat.drop:open:always", "world chat.close4401", "world chat.end", "world chat.die",
    "world chat.push", "world chat.flood", "world chat.burst", "world chat.burst:fail", "world chat.burst:end", "together chat.burst+send a Unsub", "together chat.burst:fail+send a Unsub", "together chat.sig:proof+send a Unsub", "together chat.sig:lost+send a Unsub", "together chat.sig:reset+send a Unsub", "together chat.sig:down+send a Unsub", "together chat.sig:live+send a Unsub", "together chat.die+send a Unsub", "together chat.close4401+send a Unsub", "together chat.end+send a Unsub", "together chat.drop+send a Unsub", "together hist.release+send a Unsub", "world chat.sig:proof", "world chat.sig:live", "world chat.sig:lost", "world chat.sig:reset", "world chat.sig:down",
    "world chat.greet:live", "world chat.greet:lost", "world chat.greet:reset", "world chat.greet:none", "world chat.refuse",
    "world chat.hist:more", "world chat.hist:empty", "world chat.hist:cannot", "world chat.hist:fail", "world chat.hist:fatal",
    "world hist.hold", "world hist.release", "world hist.hold:response",
    "life closeTab a", "life openTab a", "life reload a"];
}
export const SUITE_EXTRA = ["world chat.hold:close"];

function needTab(S: S, t: T, c: Ctx): string | null { return S.tabs[t] ? null : "TabClosed"; }
export function apply(S0: S, label: string, rev = false): { s: S; c: Ctx; err?: string } {
  const S = clone(S0), c: Ctx = { log: [], viol: [], cells: [], ends: [], deliv: [], fired: [], step: label, rev, turns: 0, errs: [] };
  const w = label.split(" ");
  const fail = (e: string) => { c.errs.push(e); return { s: S0, c, err: e }; };
  const done = () => { if (c.errs.length) return { s: S0, c, err: c.errs[0] }; canon(S); return { s: S, c }; };
  const post = () => { if (CFG.settleAfterWire) settle(S, c); };
  const kind = w[0]!;
  if (kind === "send") {
    const t = w[1] as T, ev = w[2]!;
    const e = needTab(S, t, c); if (e) return fail(e);
    const tb = S.tabs[t]!;
    if (ev === "Sub" || ev === "SubFrom") { if (t !== "a") return fail("ActorAbsent"); if (S.ad.on) return fail("AlreadyEntered"); S.ad = newAd(); S.ad.on = true; S.ad.last = ev === "SubFrom"; S.cb = { q: [], closing: "open", released: false }; S.ss = { st: "Opening", answer: "none", owed: false }; S.tm.push({ own: 3, kind: "sdk", tab: "a", due: S.now + 1, ref: 0, fx: 0, op: 0, arm: arm(S) }); connect(S, c); settle(S, c); return done(); }
    if (ev === "Msg") { const st = cst(S); if (st === "Open" || st === "Silent") cellAdd(c, "Conn|msg|" + st); settle(S, c); return done(); }
    if (ev === "Unsub") { if (!S.ad.on || S.ss.st === "Released") return fail("NotEntered"); unsub(S, c); settle(S, c); return done(); }
    if (!tb.actor) return fail("ActorAbsent");
    if (ev === "Pay") { if (S.natt >= MAXATT) return fail("StoryTurnLimit".replace("StoryTurnLimit", "NoMore")); commit(S, c, t); }
    else if (ev === "Retry") retry(S, c, t);
    else if (ev === "Cancel") cancel(S, c, t);
    else if (ev === "GuardIdle") { lcell(c, "idle", tb.lane.st); if (tb.lane.st === "Idle" && S.natt < MAXATT) commit(S, c, t); }
    else if (ev === "GuardRetryable") { lcell(c, "retryable", tb.lane.st); if (tb.lane.st === "Held") retry(S, c, t); }
    settle(S, c); return done();
  }
  if (kind === "advance") {
    const d = w[1] === "next" ? "next" : Number(w[1]);
    if (d !== "next" && (!Number.isFinite(d) || d < 0)) return fail("InvalidDuration");
    const susp = w[2] === "suspended";
    let target: number;
    if (d === "next") { const ds = deadlines(S, false); if (!ds.length) return fail("NoDeadline"); target = Math.min(...ds.map((x) => x.due)); } else target = S.now + d;
    if (target > NOWMAX) return fail("NoMore");
    if (susp) { if (!S.tabs.a) return fail("TabClosed"); S.susp = "a"; for (const r of S.reqs) if (r.tab === "a") cellAdd(c, "Wire|suspended|" + (r.st === "Waking" ? "Server" : r.st)); }
    runUntil(S, c, target, susp);
    if (c.errs.length) return done();
    if (susp) { S.susp = ""; settle(S, c); runUntil(S, c, S.now, false); }
    settle(S, c); return done();
  }
  if (kind === "world") {
    const r = worldCtl(S, c, w[1]!); if (r) return fail(r);
    post(); return done();
  }
  if (kind === "together") {
    const parts = label.slice("together ".length).split("+");
    for (const p of parts) { // admission held while each arrives: sends are queued, controls run until effects reach a mailbox or gate; then one settle
      if (p.startsWith("send ")) { const q = p.split(" "); const t = q[1] as T; const e = needTab(S, t, c); if (e) return fail(e); const tb = S.tabs[t]!; if (!tb.actor) return fail("ActorAbsent"); if (q[2] === "Cancel") cancel(S, c, t); else if (q[2] === "Unsub") { if (!S.ad.on || S.ss.st === "Released") return fail("NotEntered"); unsub(S, c); } else if (q[2] === "Pay" && S.natt < MAXATT) commit(S, c, t); }
      else if (p.startsWith("advance ")) { const d = Number(p.split(" ")[1]); if (!Number.isFinite(d) || d < 0) return fail("InvalidDuration"); if (S.now + d > NOWMAX) return fail("NoMore"); c.qt = true; runUntil(S, c, S.now + d, false); c.qt = false; if (c.errs.length) return done(); } // deadlines fire, events queue, no turns
      else { const r = worldCtl(S, c, p); if (r) return fail("NothingHeld"); settle(S, c, false); } // a control runs until its effects reach a mailbox or a gate; Flow has not pulled yet
    }
    settle(S, c); return done();
  }
  if (kind === "life") {
    let r: string | null; const wasActor = S.tabs[w[2] as T]?.actor;
    if (w[1] === "reload") { r = lifecycle(S, c, "closeTab", w[2] as T); if (!r) r = lifecycle(S, c, "openTab", w[2] as T, wasActor); } else r = lifecycle(S, c, w[1]!, w[2] as T | undefined);
    if (r) return fail(r);
    settle(S, c); return done();
  }
  if (label === "inject unknown" && !CFG.noInject) { const tb = S.tabs.a; if (tb && tb.lane.st === "InFlight") { endRec(c, "a", tb.lane.head, "unknown{Injected}", "inj"); hold(S, c, "a", tb.lane.head); } return done(); }
  return fail("unknown step " + label);
}
function worldCtl(S: S, c: Ctx, ctl: string): string | null {
  const [ns, rest] = ctl.split("."), parts = rest!.split(":");
  const verb = parts[0]!;
  if (ns === "pay" || ns === "hist") {
    const ep = ns as Req["ep"], rs = S.rules[ep];
    if (verb === "release") { const m = /^nth(\d)$/.exec(parts[1] ?? ""); return release(S, c, ep, parts[1] === "drop", m ? Number(m[1]) : 0, parts.includes("handle")); }
    const o = parts[1], rule: Rule = { k: verb === "dup" ? "dup" : (verb as "hold" | "drop"), at: o === "response" ? "response" : "request", times: o === "always" ? -1 : 1 };
    if (o === "b") rule.tab = "b"; else if (ep === "pay") rule.pur = "commit";
    if (parts.includes("handle")) rule.h = true;
    rs.push(rule); return null;
  }
  if (ns === "sto") {
    if (verb === "release") return releaseW(S, c, parts[1] === "drop");
    S.rules.sto.push({ k: verb as "hold" | "drop", at: parts[2] === "response" ? "response" : "request", times: 1, pur: parts[1] }); return null;
  }
  if (ns === "srv") {
    if (verb === "busy") S.srv.busy = 1; else if (verb === "slow") S.srv.lat = S.srv.lat ? 0 : 1; else if (verb === "die") S.srv.die = true; else if (verb === "hostwait") S.srv.host = true;
    else if (verb === "progress") for (const r of S.reqs) if (r.ep === "pay" && r.st === "Server" && r.pur === "commit") { const tb = S.tabs[r.tab]; cellAdd(c, `P|${tb && tb.lane.head === r.att && !tb.lane.ended ? "addr" : "other"}|setter`); }
    return null;
  }
  const ch = S.chat, cn = ch.cn, st = cst(S); // chat
  const standing = ch.orules.length > 0 || ch.nextSilent || ch.nextDup || ch.holdClose !== 0;
  switch (verb) {
    case "hold": {
      if (parts[1] === "open") { ch.orules.push({ k: "hold", at: "request", times: 1 }); return null; }
      if (parts[1] === "close") { ch.holdClose = 1; return null; }
      if (st === "Silent") return null; // "—" in 3.3
      cellAdd(c, "Conn|hold|" + st);
      if (st === "Open") cn!.st = "Silent"; else ch.nextSilent = true; // a standing rule: the next connection opens Silent
      return null;
    }
    case "release": {
      const nth = parts[1] === "nth2";
      cellAdd(c, (nth ? "Conn|nth|" : "Conn|release|") + st);
      if ((st === "None" || st === "Closed") && CFG.nothingHeld && !(CFG.releaseEndsStanding && standing)) return "NothingHeld";
      if (st === "Opening") acceptOpen(S, c);
      else if (st === "Silent") { cn!.st = "Open"; const q = [...cn!.q]; if (nth && q.length >= 2) q.unshift(q.splice(1, 1)[0]!); cn!.q = []; for (const f of q) deliverFrame(S, c, f); }
      else if (st === "Open" && cn!.hc) { S.chat.cn = null; S.tm = S.tm.filter((t) => t.kind !== "bound"); sIn(S, c, "closed"); }
      if (CFG.releaseEndsStanding) { ch.orules = []; ch.holdClose = 0; ch.nextSilent = false; ch.nextDup = false; }
      return null;
    }
    case "drop": {
      if (parts[1] === "open") { ch.orules.push({ k: "drop", at: "request", times: parts[2] === "always" ? -1 : 1 }); return null; }
      cellAdd(c, "Conn|drop|" + st);
      if (st === "None" || st === "Closed") return null; // nothing, recorded
      const hc = cn!.hc; cn!.st = "Closed"; cn!.code = 1006; cn!.q = []; cn!.hc = false; innerClose(S, c, "lost");
      if (hc) { S.tm = S.tm.filter((t) => t.kind !== "bound"); sIn(S, c, "closed"); } return null;
    }
    case "close4401": case "end": {
      if (st !== "Opening" && st !== "Open" && st !== "Silent") return null; // "—"
      cellAdd(c, "Conn|close|" + st);
      const hc = cn!.hc; cn!.st = "Closed"; cn!.code = verb === "end" ? 1000 : 4401; cn!.q = []; cn!.hc = false; innerClose(S, c, verb === "end" ? "end" : "fatal");
      if (hc) { S.tm = S.tm.filter((t) => t.kind !== "bound"); sIn(S, c, "closed"); } return null;
    }
    case "dup": cellAdd(c, "Conn|dup|" + st); ch.nextDup = true; return null;
    case "die": { if (cn && cn.st !== "Closed") innerClose(S, c, "die"); return null; }
    case "push": ch.pos = Math.min(ch.pos + 1, 2); frames(S, c, ["value"]); return null;
    case "burst": ch.pos = 2; frames(S, c, ["value", "value", "live"].concat(parts[1] === "fail" ? ["!fatal"] : parts[1] === "end" ? ["!end"] : [])); return null;
    case "flood": ch.pos = 2; frames(S, c, ["value", "value", "value"]); return null;
    case "sig": frames(S, c, [parts[1]!]); return null;
    case "greet": ch.greet = parts[1] as Chat["greet"]; return null;
    case "refuse": ch.refuse = !ch.refuse; return null;
    case "hist": ch.hist = parts[1] as Ans; return null;
  }
  return "unknown control " + ctl;
}
function restoreTab(S: S, c: Ctx, t: T, served: boolean) {
  const tb = S.tabs[t]; if (!tb) return;
  tb.actor = tb.keep ?? true;
  if (!served) { lcell(c, "restore", "Idle"); return; } // INVENTED: a refused restore opens an empty lane
  if (!S.rec) { lcell(c, "restore", "Idle"); return; }
  if (S.rec.late && !S.rec.crash) c.viol.push("R:late-ack-restored#" + S.rec.att); // revision 1's ghost: a late acknowledgement survives with nothing to remove it
  const st = S.rec.held ? "Held" : "InFlight"; lcell(c, "restore", st); cellAdd(c, "P|addr|restore");
  if (S.rec.hc && st === "InFlight") cellAdd(c, "W|restore|InFlight:HeldConfirm"); // T7: a stored acknowledgement whose confirmation was held restores as unknown { Restored }
  tb.lane = { st: "Held", head: S.rec.att, stage: "", ended: true, W: [] };
  if (st === "InFlight") { lcell(c, "unknown", "InFlight"); endRec(c, t, S.rec.att, "unknown{Restored}", "lc"); write(S, c, t, "flush", S.rec.att); }
}
function lifecycle(S: S, c: Ctx, op: string, t?: T, keep?: boolean): string | null {
  if (op === "closeTab") {
    if (!S.tabs[t!]) return "TabClosed";
    for (const r of S.reqs) if (r.tab === t && !r.gone) interrupt(S, c, r);
    S.tm = S.tm.filter((x) => x.tab !== t);
    if (S.own === t) S.own = "";
    closeWrites(S, c, t!);
    if (t === "a") { if (S.chat.cn && S.ad.on && S.chat.cn.st !== "Closed") cellAdd(c, "Conn|clientClose|" + S.chat.cn.st); S.chat.cn = null; S.ad = newAd(); S.cb = { q: [], closing: "open", released: false }; }
    S.tabs[t!] = null; return null;
  }
  if (op === "openTab") {
    if (S.tabs[t!]) return "TabOpen";
    const persist = S.own === ""; if (persist) S.own = t!;
    const tb: Tab = { persist, actor: true, exp: false, lane: newLane(), keep: keep ?? true }; S.tabs[t!] = tb;
    if (!persist) { tb.actor = tb.keep!; return null; }
    const rule = takeRule(S.rules.sto, t!, "read"); // 3.6 reads: bootstrap restore is a read
    if (!rule || rule.k === "dup") { wc(c, "read:arrive:none"); restoreTab(S, c, t!, true); }
    else if (rule.k === "hold") { wc(c, "read:arrive:hold"); tb.actor = false; S.rd.push(t!); }
    else { wc(c, "read:arrive:drop"); restoreTab(S, c, t!, false); }
    return null;
  }
  if (op === "dehydrate") { if (!S.tabs.a) return "TabClosed"; S.dh = true; return null; }
  if (op === "hydrate") { if (!S.dh) return "NotEntered"; if (S.tabs.b) return "TabOpen"; S.tabs.b = { persist: false, actor: true, exp: false, lane: newLane() }; lcell(c, "hydration", "Idle"); S.dh = false; return null; }
  const tb = S.tabs[t!]; if (!tb) return "TabClosed";
  if (op === "dispose") {
    if (!tb.actor) return "ActorAbsent";
    lcell(c, "dispose", tb.lane.st); tb.actor = false; tb.exp = false;
    S.tm.push({ own: 4, kind: "retain", tab: t!, due: S.now + RETAIN, ref: 0, fx: 0, op: 0, arm: arm(S) }); return null;
  }
  if (op === "ensure") {
    if (tb.actor) return "AlreadyEntered";
    tb.actor = true; S.tm = S.tm.filter((x) => !(x.kind === "retain" && x.tab === t));
    if (tb.lane.st !== "Idle") lcell(c, "rebind", tb.lane.st);
    return null;
  }
  return "unknown life " + op;
}

// ---- canonical form and invariants ---------------------------------------------------------------------------------
function canon(S: S) {
  const ids = [...new Set(S.reqs.map((r) => r.id))].sort((a, b) => a - b), m = new Map<number, number>(); ids.forEach((x, i) => m.set(x, i + 1));
  for (const r of S.reqs) r.id = m.get(r.id)!;
  S.nid = ids.length;
  const arms = [...new Set([...S.reqs.map((r) => r.arm), ...S.tm.map((t) => t.arm), ...S.wr.map((w) => w.arm)])].sort((a, b) => a - b), am = new Map<number, number>(); arms.forEach((x, i) => am.set(x, i + 1));
  for (const r of S.reqs) r.arm = am.get(r.arm)!;
  for (const t of S.tm) t.arm = am.get(t.arm)!;
  for (const w of S.wr) w.arm = am.get(w.arm)!;
  S.armc = arms.length;
  if (S.srv.chg.length > MAXATT) S.srv.chg = S.srv.chg.slice(0, MAXATT);
  S.srv.chg.sort(); S.dead.sort();
}
export function quiet(S: S): boolean {
  if (S.reqs.length || S.wr.length || S.rd.length || S.chat.nextSilent || S.chat.nextDup || S.tm.length || S.rules.pay.length || S.rules.sto.length || S.rules.hist.length || S.chat.orules.length || S.chat.holdClose) return false;
  for (const t of TABS) { const tb = S.tabs[t]; if (tb && (tb.lane.st !== "Idle" || tb.lane.W.length)) return false; }
  if (S.ad.on && S.ss.st !== "Ended" && S.ss.st !== "Released") return false;
  return true;
}
export const key = (S: S) => JSON.stringify(S);

// ---- 3.4: the stand-in host (a fragment alone) --------------------------------------------------------------------------
export interface H { st: "Absent" | "Active" | "Frozen" | "Ended"; subj: number; guards: number; resum: boolean; pend: boolean }
export const hInit = (resum: boolean): H => ({ st: "Absent", subj: 0, guards: 0, resum, pend: false });
export const HSTEPS = ["enter s1", "enter s2", "leave", "leave end", "reset s1", "reset s2", "guards", "send ev", "send exit"];
export function hApply(h0: H, step: string): { h: H; cells: string[]; err?: string } {
  const h = clone(h0), cells: string[] = []; const [op, arg] = step.split(" ");
  const subj = arg === "s2" ? 2 : 1, st = h0.st;
  switch (op) {
    case "enter":
      cells.push(`Host|enter|${st}`);
      if (st === "Active") return { h: h0, cells, err: "AlreadyEntered(host)" };
      if (st === "Frozen" && h.subj !== subj) h.pend = true; // other subject: reset on return, a new life
      else if (st !== "Frozen") h.pend = false;
      h.st = "Active"; if (st !== "Frozen") h.subj = subj; else if (h.pend) h.subj = subj; return { h, cells };
    case "leave":
      cells.push(`Host|leave|${st}`);
      if (arg === "end") {
        cells.pop(); cells.push(`Host|leaveEnd|${st}`);
        if (st === "Active" || st === "Frozen") { h.st = "Absent"; return { h, cells }; }
        return { h: h0, cells, err: "NotEntered(host)" };
      }
      if (st !== "Active") return { h: h0, cells, err: "NotEntered(host)" };
      h.st = h.resum ? "Frozen" : "Absent"; return { h, cells };
    case "reset":
      cells.push(`Host|reset|${st}`);
      if (st === "Absent" || st === "Ended") return { h: h0, cells, err: "NotEntered(host)" };
      if (st === "Frozen") { h.subj = subj; h.pend = true; return { h, cells }; }
      if (h.subj !== subj) { h.subj = subj; h.pend = true; }
      return { h, cells };
    case "guards": cells.push(`Host|guards|${st}`); h.guards = (h.guards + 1) % 2; return { h, cells };
    case "send":
      cells.push(`Host|send|${st}`);
      if (st === "Active" && arg === "exit") { cells.push("Host|exit|Active"); h.st = "Ended"; }
      return { h, cells };
  }
  return { h: h0, cells, err: "unknown" };
}
