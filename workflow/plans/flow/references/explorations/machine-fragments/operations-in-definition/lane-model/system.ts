// Revisions 11 and 12 (ddf46d4a, 9772678a): the lane together with the actor's saved record and the leaf that is active (OD21, review 9 H1-H3).
// One persisted (or local) identity, one write lane, one small machine:
//   leaves CARD (initial) -> PAYING (Pay commits) -> DONE; Back: PAYING -> CARD; Reset: DONE -> CARD; Giveup: PAYING, cancel.
// Mapped events: S (success), F (failure), U (unknown), N (NotSent, delivered kinds). A handler sits at the root or at the leaf PAYING.
// Checks: inv 13 (the UI never contradicts what the lane learned), inv 14 (every ending delivered exactly once, saved as a pending
// outcome of the record, or evidence when no record survives), plus the lane invariants 1, 2, 4, 5, 7, 9 on every step.
import { A, CONFIG, RULES, checkState, clone, doAck, doAckRefused, doCapture, doCaptureRefused, doDispose, doInvoke, doLand, doReload, doRuntimeDispose, doStart, endQueuedDisposed, endingTurn, holds, init, laneSt, newCtx, prepRestore, runTurn, turnEnd } from "./model.ts";
import type { Act, Ctx, Mode, S, Spec, Viol } from "./model.ts";

declare const process: any;

type Leaf = "CARD" | "PAYING" | "DONE";
type Kind = "success" | "failure" | "unknown" | "notsent";
interface Pend { att: number; kind: Kind; why: string; phase: 1 | 2 }
interface Sys {
  lane: S; actor: boolean; leaf: Leaf; cur: number;
  rec: boolean; rleaf: Leaf; rcur: number; pend: Pend[];
  adopted: boolean[]; uSeen: boolean; rt: boolean; restoreAtReady: boolean; restoredAtt: number;
}
// place: handlers at the root; at the leaf PAYING only; or at PAYING with explicit ignores (`{ target: "self" }`) at the other leaves and the root
export interface Cfg { place: "root" | "leaf" | "leafIgnore"; persisted: boolean }
// MD rule 20, amended (OD22): every mapped event is handled or explicitly ignored from every leaf of the arrival set (CARD, PAYING, DONE here)
export const rule20Accepts = (cfg: Cfg) => !RULES.rule20 || cfg.place !== "leaf";
const uSpec: Spec = { label: "U", guard: "none", acts: ["retry"], outcome: "ok" }; // the unknown handler: an owner (retry)

const mkSys = (mode: Mode): Sys => ({ lane: init(mode), actor: true, leaf: "CARD", cur: 0, rec: false, rleaf: "CARD", rcur: 0, pend: [], adopted: [], uSeen: false, rt: false, restoreAtReady: false, restoredAtt: 0 });
const cloneSys = (s: Sys): Sys => ({ ...s, lane: clone(s.lane), pend: s.pend.map((p) => ({ ...p })), adopted: [...s.adopted] });
const key = (s: Sys) => JSON.stringify([s.lane.commits, s.lane.st, s.lane.head, s.lane.W, +s.lane.told, +s.lane.disposed, s.lane.srvVal, s.lane.applied, s.lane.refused, [...s.lane.net].sort(),
  s.lane.atts.map((a) => [a.status, a.why, +a.everSent, +a.acked, +a.ackedEver, a.sends, a.resends, +a.interrupting, +a.evid, +a.noInvoke]), +s.actor, s.leaf, s.cur, +s.rec, s.rleaf, s.rcur,
  s.pend.map((p) => [p.att, p.kind, p.why, p.phase]), s.adopted.map(Number), +s.uSeen, +s.rt, +s.restoreAtReady, s.restoredAtt, s.lane.atts.map((a) => +a.captured)]);

// ---- delivery to the machine ------------------------------------------------------------------------------
type Ev = "S" | "F" | "U" | "N";
// MD rule 14, one owner test (OD22, R10 M2). An Attempt of this incarnation, or one whose owner activation was restored with the record, is
// current while that activation (PAYING for that Attempt) is alive and late once it has ended. Any other adopted Attempt, and every
// unknown { Restored } and NotSent { Restored }, is current from the active leaf (OD21).
function routeOf(sys: Sys, att: number, restoredEvent = false): "current" | "late" {
  const alive = sys.leaf === "PAYING" && sys.cur === att;
  if (restoredEvent) return RULES.currentFromActiveLeaf ? "current" : "late";
  if (!sys.adopted[att - 1] || att === sys.restoredAtt) return alive ? "current" : "late";
  return RULES.currentFromActiveLeaf ? "current" : "late";
}
type Handling = "handled" | "ignored" | "unhandled";
function handling(cfg: Cfg, sys: Sys, route: "current" | "late"): Handling {
  if (cfg.place === "root") return "handled";
  if (route === "current" && sys.leaf === "PAYING") return "handled";
  return cfg.place === "leafIgnore" ? "ignored" : "unhandled"; // an explicit ignore, or nothing: Unhandled counts as delivered (F8) and is lost
}
const handles = (cfg: Cfg, sys: Sys, route: "current" | "late") => handling(cfg, sys, route) !== "unhandled";
// returns the handling; an adopted success or failure that nothing handles or ignores breaks inv 16 (R10 H1)
function applyEvent(cfg: Cfg, sys: Sys, ev: Ev, att: number, route: "current" | "late", c?: Ctx): Handling {
  const h = handling(cfg, sys, route);
  if (h === "unhandled" && (ev === "S" || ev === "F") && sys.adopted[att - 1] && c)
    c.viol.push({ tag: "inv16", msg: `an adopted ${ev === "S" ? "success" : "failure"} of Attempt ${att} reached ${sys.leaf} with no handler and no explicit ignore (MD rule 20)` });
  if (h !== "handled") return h;
  if (ev === "S") { sys.leaf = "DONE"; sys.cur = att; return h; } // memory-free: the event carries the Attempt (S7c, C4)
  if (ev === "F" || ev === "N") sys.leaf = "CARD"; // memory-free as well (C4)
  return h;
}
const evOf = (k: Kind): Ev => (k === "success" ? "S" : k === "failure" ? "F" : k === "unknown" ? "U" : "N");
function deliverU(cfg: Cfg, sys: Sys, c: Ctx, att: number, restored: boolean, viaTurn: boolean) {
  if (sys.uSeen) c.viol.push({ tag: "inv14", msg: `the unknown of one hold was delivered twice to one incarnation (Attempt ${att})` });
  sys.uSeen = true;
  const route = routeOf(sys, att, restored);
  const h = handling(cfg, sys, route);
  if (viaTurn) runTurn(sys.lane, c, h === "handled" ? uSpec : { ...uSpec, acts: [], outcome: h === "ignored" ? "ok" : "Unhandled" }, () => att);
}
const stateKey = (sys: Sys) => sys.lane.atts.map((a) => a.status + a.why);
// NotSent endings that appeared in this step: Superseded is evidence (principle 1); the rest are delivered, or saved when no actor lives.
function notSents(cfg: Cfg, sys: Sys, c: Ctx, before: string[]) {
  sys.lane.atts.forEach((a, i) => {
    if (a.status !== "notsent" || before[i] === "notsent" + a.why || (before[i] ?? "").startsWith("notsent")) return;
    if (a.why === "Superseded") return;
    c.produced++;
    if (sys.actor && !sys.rt) { c.handled++; applyEvent(cfg, sys, "N", a.id, routeOf(sys, a.id, a.why === "Restored"), c); return; }
    if (cfg.persisted && sys.rec) {
      if (RULES.savePendingOutcome || a.why === "Restored") { c.handled++; sys.pend.push({ att: a.id, kind: "notsent", why: a.why, phase: a.why === "Restored" ? 2 : 1 }); } // a reload's NotSent { Restored } is the lane's own step 2
      return; // K25 reverted: dropped (produced, never handled)
    }
    c.handled++; // evidence: no record survives
  });
}
const statuses = (sys: Sys) => sys.lane.atts.map((a) => (a.status === "notsent" ? "notsent" + a.why : a.status));

// ---- steps ------------------------------------------------------------------------------------------------
interface Step { label: string; run: (s: Sys, c: Ctx) => void }
function newIncarnation(sys: Sys) { sys.adopted = sys.adopted.map(() => true); sys.uSeen = false; sys.restoredAtt = 0; }
// the activations restored with the record: PAYING and the Attempt it was waiting for
const restoreActivations = (sys: Sys) => { sys.restoredAtt = sys.leaf === "PAYING" ? sys.cur : 0; };
function deliverAfterStart(cfg: Cfg, sys: Sys, c: Ctx, reload: boolean) {
  sys.lane.bound = true;
  // OD21/OD22 order: 1 the parked endings, in saved order, each mapped through the current outcomes; 2 per lane the Held head's unknown { Restored }
  // (unless its unknown was among step 1), and on a reload W's NotSent { Restored } (C3: produced by the restore itself, not parked)
  const p1 = sys.pend.filter((p) => p.phase === 1), p2 = sys.pend.filter((p) => p.phase === 2);
  sys.pend = [];
  for (const p of p1) {
    if (p.kind === "unknown") deliverU(cfg, sys, c, p.att, false, true);
    else applyEvent(cfg, sys, evOf(p.kind), p.att, routeOf(sys, p.att), c);
  }
  const lane = sys.lane;
  const before = statuses(sys);
  let ids: number[] = [];
  if (reload) ids = doReload(lane, c); else ids = doStart(lane, c);
  for (const id of ids) {
    if (!RULES.restoredDedup || !sys.uSeen) deliverU(cfg, sys, c, id, true, true);
    else runTurn(lane, c, { ...uSpec, acts: [], outcome: "ok" }, () => { prepRestore(lane, id); return id; }); // already delivered from the parked endings: no second event
  }
  if (!ids.length) turnEnd(lane);
  notSents(cfg, sys, c, before);
  for (const p of p2) applyEvent(cfg, sys, "N", p.att, routeOf(sys, p.att, true), c);
}
function steps(cfg: Cfg, sys: Sys, mode: Mode): Step[] {
  const out: Step[] = [];
  const lane = sys.lane;
  const left = CONFIG.maxCommits - lane.commits;
  const live = sys.actor && !sys.rt;
  const wrap = (label: string, f: (x: Sys, c: Ctx) => void) => out.push({ label, run: (x, c) => { x.lane.bound = x.actor; const before = statuses(x); f(x, c); notSents(cfg, x, c, before); } });
  if (live) {
    if (sys.leaf === "CARD" && left > 0) wrap("Pay", (x, c) => { const n0 = x.lane.atts.length; runTurn(x.lane, c, { label: "Pay", guard: "none", acts: ["commit"], outcome: "ok" }); if (x.lane.atts.length > n0) { x.cur = x.lane.atts[n0]!.id; x.leaf = "PAYING"; x.adopted.push(false); } });
    if (sys.leaf === "PAYING") {
      wrap("Back", (x) => { x.leaf = "CARD"; });
      wrap("Giveup", (x, c) => { runTurn(x.lane, c, { label: "Giveup", guard: "none", acts: ["cancel"], outcome: "ok" }); x.leaf = "CARD"; });
    }
    if (sys.leaf === "DONE") wrap("Reset", (x) => { x.leaf = "CARD"; });
  }
  if (!sys.rt) {
    for (const a of lane.atts) {
      const id = a.id;
      if (a.status === "waiting" && !a.acked && !a.everSent) { wrap(`ack(${id})`, (x) => doAck(x.lane, id)); wrap(`ack-refused(${id})`, (x, c) => doAckRefused(x.lane, c, id)); }
      if (a.status === "waiting" && a.everSent && CONFIG.persistLanes && !a.captured) wrap(`capture(${id})`, (x) => doCapture(x.lane, id));
      if (a.status === "waiting" && a.everSent) wrap(`capture-refused(${id})`, (x, c) => {
        const d = doCaptureRefused(x.lane, c, id);
        if (d && x.actor) deliverU(cfg, x, c, d, false, true); else turnEnd(x.lane);
      });
      if (a.status === "waiting" && a.acked && !a.noInvoke && (!a.everSent || a.captured || !CONFIG.persistLanes)) wrap(`invoke(${id})`, (x, c) => doInvoke(x.lane, c, id));
      if (a.status === "wire") {
        const kinds = [...(lane.applied.includes(id) ? ["success"] : []), ...(lane.refused.includes(id) ? ["failure"] : []), "unknown", "interrupt"] as ("success" | "failure" | "unknown" | "interrupt")[];
        for (const k of kinds) wrap(`end-${k}(${id})${sys.actor ? "" : " [no actor]"}`, (x, c) => {
          const ev: Ev = k === "success" ? "S" : k === "failure" ? "F" : "U";
          if (!x.actor) { // no binding actor: applied to the lane; parked on the lane record if the identity's record survives, else evidence
            const addressable = x.lane.head === id; // an older Attempt's ending (cancel) is evidence by Attempt id and never parked
            endingTurn(x.lane, c, id, k, uSpec);
            const keep = cfg.persisted && x.rec && addressable;
            if (keep && RULES.savePendingOutcome) x.pend.push({ att: id, kind: ev === "S" ? "success" : ev === "F" ? "failure" : "unknown", why: "", phase: 1 });
            else if (keep) c.handled--; // dropped: K25 reverted
            return;
          }
          const route = routeOf(x, id);
          const h = handling(cfg, x, route);
          if (ev === "U") { // the hold's unknown reaches the handler in this very turn
            if (x.uSeen) c.viol.push({ tag: "inv14", msg: `the unknown of one hold was delivered twice (Attempt ${id})` });
            x.uSeen = true;
            endingTurn(x.lane, c, id, k, h === "handled" ? uSpec : { ...uSpec, acts: [], outcome: h === "ignored" ? "ok" : "Unhandled" });
          } else {
            endingTurn(x.lane, c, id, k, { label: ev, guard: "none", acts: [], outcome: h === "unhandled" ? "Unhandled" : "ok" });
            applyEvent(cfg, x, ev, id, route, c);
          }
        });
      }
    }
  }
  for (const id of [...new Set(lane.net)]) {
    wrap(`land(${id})`, (x) => doLand(x.lane, id, false));
    if (!lane.applied.includes(id) && !lane.refused.includes(id)) wrap(`land-refuse(${id})`, (x) => doLand(x.lane, id, true));
  }
  if (!sys.rt) {
    if (sys.actor) {
      // retain expiry (the record is kept) and disposeActor / unmount (no record survives; parked endings stay on their lane records)
      out.push({ label: cfg.persisted ? "retain-expiry" : "unmount", run: (x, c) => { x.lane.bound = true; doDispose(x.lane, c); x.actor = false; x.lane.bound = false; if (cfg.persisted) { x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; } } });
      if (cfg.persisted) out.push({ label: "disposeActor", run: (x, c) => { x.lane.bound = true; doDispose(x.lane, c); x.actor = false; x.lane.bound = false; x.rec = false; } });
    } else {
      if (cfg.persisted && sys.rec) // a release: the actor record no longer decodes (or disposeActor on a retained record); the lane records stay
        out.push({ label: "release (the actor record no longer decodes)", run: (x, c) => { x.rec = false; if (!RULES.parkRaw) { c.handled -= x.pend.length; x.pend = []; } } });
      out.push({ label: "ensure", run: (x, c) => {
        newIncarnation(x); x.actor = true;
        if (x.rec && cfg.persisted) { x.leaf = x.rleaf; x.cur = x.rcur; restoreActivations(x); } else { x.leaf = "CARD"; x.cur = 0; }
        deliverAfterStart(cfg, x, c, false);
        if (cfg.persisted) { x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; }
      } });
    }
    out.push({ label: "reload", run: (x, c) => {
      newIncarnation(x);
      if (!cfg.persisted) { // local: no lane record, no actor record (G4, L1: the hold is lost too)
        for (const a of x.lane.atts) { if (a.status === "queued") { a.status = "notsent"; a.why = "LostLocal"; } else if (["waiting", "wire", "unknown"].includes(a.status)) { a.status = "unknown"; a.evid = true; } }
        x.lane.head = 0; x.lane.st = "Idle"; x.lane.W = []; x.lane.told = false; x.lane.bound = true; x.actor = true; x.leaf = "CARD"; x.cur = 0; x.uSeen = false;
        return;
      }
      if (x.actor) { x.lane.bound = true; x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; restoreActivations(x); deliverAfterStart(cfg, x, c, true); return; }
      // awaiting ensure: the lane is restored by the Runtime; its step-2 deliveries wait for the incarnation
      x.lane.bound = false;
      const before = statuses(x);
      doReload(x.lane, c);
      notSents(cfg, x, c, before);
    } });
    const finalCapture = (x: Sys) => { if (x.actor && cfg.persisted) { x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; } x.restoreAtReady = x.actor; x.actor = false; x.lane.bound = false; x.rt = true; };
    out.push({ label: "runtime-dispose", run: (x, c) => {
      finalCapture(x);
      const before = statuses(x);
      const sent = x.lane.atts.filter((a) => a.everSent && ["wire", "waiting", "unknown"].includes(a.status) && !a.evid).map((a) => a.id);
      doRuntimeDispose(x.lane, c);
      notSents(cfg, x, c, before);
      if (cfg.persisted && x.rec && sent.some((id) => A(x.lane, id).evid)) c.viol.push({ tag: "inv14", msg: "a persisted identity's sent work became evidence at Runtime disposal: no incarnation will hear its ending (OD22 H2)" });
    } });
    // the head settles before the final capture: its ending is parked first, then W ends (lane order, M4)
    const h = lane.head ? A(lane, lane.head) : undefined;
    for (const k of ["success", "failure"] as const) {
      if (h && h.status === "wire" && (k === "success" ? lane.applied.includes(h.id) : lane.refused.includes(h.id))) {
        out.push({ label: `runtime-dispose, ${k} settles first`, run: (x, c) => {
          const id = h.id;
          finalCapture(x);
          const park = () => { endingTurn(x.lane, c, id, k, uSpec); if (cfg.persisted && x.rec) { if (RULES.savePendingOutcome) x.pend.push({ att: id, kind: k, why: "", phase: 1 }); else c.handled--; } };
          const before = statuses(x);
          if (RULES.laneOrder) { park(); doRuntimeDispose(x.lane, c); }
          else { endQueuedDisposed(x.lane); notSents(cfg, x, c, before); park(); doRuntimeDispose(x.lane, c, true); } // revision 11: W first
          notSents(cfg, x, c, before);
        } });
      }
    }
  } else {
    out.push({ label: "reload (new Runtime)", run: (x, c) => {
      x.rt = false; newIncarnation(x);
      if (!cfg.persisted) {
        for (const a of x.lane.atts) { if (a.status === "queued") { a.status = "notsent"; a.why = "LostLocal"; } else if (["waiting", "wire", "unknown"].includes(a.status)) { a.status = "unknown"; a.evid = true; } }
        x.lane.head = 0; x.lane.st = "Idle"; x.lane.W = []; x.lane.told = false; x.lane.disposed = false; x.lane.bound = true; x.actor = true; x.leaf = "CARD"; x.cur = 0;
        return;
      }
      x.lane.disposed = false;
      if (x.restoreAtReady) { x.actor = true; x.lane.bound = true; if (x.rec) { x.leaf = x.rleaf; x.cur = x.rcur; restoreActivations(x); } deliverAfterStart(cfg, x, c, true); if (x.rec) { x.rleaf = x.leaf; x.rcur = x.cur; } }
      else { x.lane.bound = false; const before = statuses(x); doReload(x.lane, c); notSents(cfg, x, c, before); }
    } });
  }
  return out;
}

// ---- checks -----------------------------------------------------------------------------------------------
function checkSys(cfg: Cfg, s: Sys): Viol[] {
  const v: Viol[] = [...checkState(s.lane)];
  const lane = s.lane;
  for (const a of lane.atts) if (a.everSent && a.status === "notsent") v.push({ tag: "inv1", msg: `Attempt ${a.id} was sent but is recorded NotSent { ${a.why} }` });
  { const p1 = s.pend.filter((p) => p.phase === 1).map((p) => p.att); if (p1.some((x, i) => i > 0 && x < p1[i - 1]!)) v.push({ tag: "inv17", msg: `parked endings out of lane order: ${p1}` }); }
  if (s.pend.length && s.actor && !s.rt) v.push({ tag: "inv14", msg: "a pending outcome outlived the incarnation it was saved for (never delivered)" });
  if (s.actor && !s.rt && s.pend.length === 0 && s.cur > 0) {
    const a = A(lane, s.cur);
    const known = ["success", "failure", "released"].includes(a.status) || (a.status === "notsent" && a.why !== "Superseded");
    if (s.leaf === "PAYING" && known) v.push({ tag: "inv13", msg: `the UI shows Paying but the lane learned Attempt ${a.id} ${a.status}${a.why ? " " + a.why : ""}` });
    if (s.leaf === "PAYING" && a.status === "unknown" && a.evid && lane.st === "Idle") v.push({ tag: "inv18", msg: `the UI shows Paying but Attempt ${a.id}'s fate is evidence only: nothing is in flight or held, so no ending can arrive` });
    if (s.leaf === "DONE" && a.status !== "success") v.push({ tag: "inv13", msg: `the UI shows Done (saved) but Attempt ${a.id} is ${a.status}${a.why ? " " + a.why : ""}` });
  }
  return v;
}

export interface SysResult { states: number; found: Map<string, { path: string[]; msg: string }>; ms: number }
export function exploreSystem(cfg: Cfg, mode: Mode, commits = 2): SysResult {
  const t0 = Date.now(), saved = CONFIG.maxCommits, savedP = CONFIG.persistLanes; CONFIG.maxCommits = commits; CONFIG.persistLanes = cfg.persisted;
  const ids = new Map<string, number>(); const states: (Sys | null)[] = []; const parent: number[] = []; const via: string[] = [];
  const found = new Map<string, { path: string[]; msg: string }>();
  const pathOf = (i: number) => { const p: string[] = []; for (let x = i; parent[x]! >= 0; x = parent[x]!) p.push(via[x]!); return p.reverse(); };
  const note = (v0: Viol, path: string[]) => { const v = !cfg.persisted && v0.tag === "inv2" ? { ...v0, tag: "inv2-local" } : v0; const k = v.tag + "|" + v.msg.replace(/\d+/g, "#").slice(0, 60); if (!found.has(k)) found.set(k, { path, msg: v.msg }); };
  const add = (s: Sys, p: number, ev: string) => {
    const k = key(s); if (ids.has(k)) return; ids.set(k, states.length); states.push(s); parent.push(p); via.push(ev);
    for (const v of checkSys(cfg, s)) note(v, pathOf(states.length - 1));
  };
  add(mkSys(mode), -1, "");
  for (let i = 0; i < states.length; i++) {
    const s = states[i]!; states[i] = null;
    for (const st of steps(cfg, s, mode)) {
      const x = cloneSys(s), c = newCtx();
      st.run(x, c);
      if (x.lane.st !== "Held") x.uSeen = false;
      if (c.produced !== c.handled) c.viol.push({ tag: "inv14", msg: `ending lost: produced ${c.produced} handled ${c.handled}` });
      for (const v of c.viol) note(v, [...pathOf(i), st.label]);
      add(x, i, st.label);
    }
  }
  CONFIG.maxCommits = saved; CONFIG.persistLanes = savedP;
  return { states: states.length, found, ms: Date.now() - t0 };
}
void laneSt; void (null as unknown as Act);

export function system() {
  const exact: string[] = []; let acceptedBroken = false;
  // the matrix is trimmed to keep the run under a minute: serialize repeats latest's shape, cancel runs with one commit
  const fast = typeof process !== "undefined" && !!process.env.SYSFAST;
  const modesFor = (persisted: boolean, place: Cfg["place"]): Mode[] => fast ? (persisted && place === "root" ? ["reject", "cancel"] : ["reject"]) : (place === "root" ? (persisted ? ["reject", "latest", "serialize", "cancel"] : ["reject", "latest", "serialize"]) : place === "leafIgnore" ? (persisted ? ["reject", "latest", "cancel"] : ["reject"]) : ["reject", ...(persisted ? ["cancel" as Mode] : [])]);
  for (const persisted of [true, false])
    for (const place of ["root", "leafIgnore", "leaf"] as const)
      for (const mode of modesFor(persisted, place)) {
        const cfg: Cfg = { place, persisted };
        const r = exploreSystem(cfg, mode, mode === "cancel" ? 1 : 2);
        const name = `system-${persisted ? "persisted" : "local"}-${place}-${mode}`;
        const tags = new Set([...r.found.keys()].map((k) => k.split("|")[0]));
        const accepted = rule20Accepts(cfg);
        console.log(`${name}: ${r.states} states, ${(r.ms / 1000).toFixed(1)}s; MD rule 20 ${accepted ? "accepts" : "rejects"} this machine`);
        // a machine that rule 20 rejects is not a design the check lets through: its dynamic results are information
        for (const t of ["inv1", "inv2", "inv2-local", "inv4", "inv5", "inv7", "inv9", "inv13", "inv14", "inv16", "inv17", "inv18"]) console.log(`${accepted ? "RESULT" : "INFO"} mode=${name} ${t} ${tags.has(t) ? "FAIL" : "PASS"}`);
        if (accepted && tags.has("inv16")) acceptedBroken = true;
        exact.push(`${name}:${accepted === !tags.has("inv16")}`);
        const seen = new Set<string>();
        for (const [k, f] of [...r.found.entries()].sort((a, b) => a[1].path.length - b[1].path.length)) { const t = k.split("|")[0]!; if (seen.has(t)) continue; seen.add(t); console.log(`  ${t} counterexample (${f.path.length} events): ${f.path.join(" -> ")}\n    ${f.msg}`); }
      }
  console.log(`RESULT mode=system-rule20 inv16 ${acceptedBroken ? "FAIL (a machine that rule 20 accepts ignores an adopted success or failure)" : "PASS (every accepted machine handles or explicitly ignores every adopted success and failure)"}`);
  const bad = exact.filter((e) => e.endsWith(":false"));
  console.log(`RESULT mode=system-rule20 exact ${bad.length ? "FAIL " + bad.join(", ") : "PASS (rule 20 rejects exactly the machines where an adopted success or failure is silently lost)"}`);
  // contrast: revision 10's rules (K25 and K26 off) on the same machines
  const saved = { p: RULES.savePendingOutcome, c: RULES.currentFromActiveLeaf };
  RULES.savePendingOutcome = false; RULES.currentFromActiveLeaf = false;
  for (const place of ["root", "leafIgnore"] as const) {
    const r = exploreSystem({ place, persisted: true }, "reject");
    const tags = new Set([...r.found.keys()].map((k) => k.split("|")[0]));
    console.log(`INFO revision 10 rules (K25, K26 off), persisted, handlers ${place}, reject: inv13 ${tags.has("inv13") ? "FAIL" : "PASS"}, inv14 ${tags.has("inv14") ? "FAIL" : "PASS"}`);
    for (const [k, f] of [...r.found.entries()].sort((a, b) => a[1].path.length - b[1].path.length)) { const t = k.split("|")[0]!; if (t === "inv13" || t === "inv14") { console.log(`  ${t} counterexample (${f.path.length} events): ${f.path.join(" -> ")}\n    ${f.msg}`); break; } }
  }
  RULES.savePendingOutcome = saved.p; RULES.currentFromActiveLeaf = saved.c;
}
