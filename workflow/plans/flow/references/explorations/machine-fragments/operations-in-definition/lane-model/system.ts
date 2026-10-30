// Revision 11 (ddf46d4a): the lane together with the actor's saved record and the leaf that is active (OD21, review 9 H1-H3).
// One persisted (or local) identity, one write lane, one small machine:
//   leaves CARD (initial) -> PAYING (Pay commits) -> DONE; Back: PAYING -> CARD; Reset: DONE -> CARD; Giveup: PAYING, cancel.
// Mapped events: S (success), F (failure), U (unknown), N (NotSent, delivered kinds). A handler sits at the root or at the leaf PAYING.
// Checks: inv 13 (the UI never contradicts what the lane learned), inv 14 (every ending delivered exactly once, saved as a pending
// outcome of the record, or evidence when no record survives), plus the lane invariants 1, 2, 4, 5, 7, 9 on every step.
import { A, CONFIG, RULES, checkState, clone, doAck, doAckRefused, doCaptureRefused, doDispose, doInvoke, doLand, doReload, doRuntimeDispose, doStart, endingTurn, holds, init, laneSt, newCtx, prepRestore, runTurn, turnEnd } from "./model.ts";
import type { Act, Ctx, Mode, S, Spec, Viol } from "./model.ts";

type Leaf = "CARD" | "PAYING" | "DONE";
type Kind = "success" | "failure" | "unknown" | "notsent";
interface Pend { att: number; kind: Kind; why: string; phase: 1 | 2 }
interface Sys {
  lane: S; actor: boolean; leaf: Leaf; cur: number;
  rec: boolean; rleaf: Leaf; rcur: number; pend: Pend[];
  adopted: boolean[]; uSeen: boolean; rt: boolean; restoreAtReady: boolean;
}
export interface Cfg { place: "root" | "leaf"; persisted: boolean }
const uSpec: Spec = { label: "U", guard: "none", acts: ["retry"], outcome: "ok" }; // the unknown handler: an owner (retry)

const mkSys = (mode: Mode): Sys => ({ lane: init(mode), actor: true, leaf: "CARD", cur: 0, rec: false, rleaf: "CARD", rcur: 0, pend: [], adopted: [], uSeen: false, rt: false, restoreAtReady: false });
const cloneSys = (s: Sys): Sys => ({ ...s, lane: clone(s.lane), pend: s.pend.map((p) => ({ ...p })), adopted: [...s.adopted] });
const key = (s: Sys) => JSON.stringify([s.lane.commits, s.lane.st, s.lane.head, s.lane.W, +s.lane.told, +s.lane.disposed, s.lane.srvVal, s.lane.applied, s.lane.refused, [...s.lane.net].sort(),
  s.lane.atts.map((a) => [a.status, a.why, +a.everSent, +a.acked, +a.ackedEver, a.sends, a.resends, +a.interrupting, +a.evid, +a.noInvoke]), +s.actor, s.leaf, s.cur, +s.rec, s.rleaf, s.rcur,
  s.pend.map((p) => [p.att, p.kind, p.why, p.phase]), s.adopted.map(Number), +s.uSeen, +s.rt, +s.restoreAtReady]);

// ---- delivery to the machine ------------------------------------------------------------------------------
type Ev = "S" | "F" | "U" | "N";
// MD rule 14, as amended (OD21): an adopted lane's endings and every unknown { Restored } are current (the active leaf); otherwise the
// owner activation PAYING is alive (current) or gone (late: from the root).
function routeOf(sys: Sys, how: "own" | "adopted" | "pending"): "current" | "late" {
  if (how === "adopted") return RULES.currentFromActiveLeaf ? "current" : "late";
  return sys.leaf === "PAYING" ? "current" : "late";
}
const handles = (cfg: Cfg, sys: Sys, route: "current" | "late") => cfg.place === "root" || (route === "current" && sys.leaf === "PAYING");
function applyEvent(cfg: Cfg, sys: Sys, ev: Ev, att: number, route: "current" | "late"): boolean {
  if (!handles(cfg, sys, route)) return false; // Unhandled: counts as delivered (F8)
  if (ev === "S") { sys.leaf = "DONE"; sys.cur = att; return true; } // a success needs no memory: the event carries the Attempt (S7c)
  if (att !== sys.cur) return true; // a failure of an Attempt the machine is no longer waiting for
  if (ev === "F" || ev === "N") sys.leaf = "CARD";
  return true;
}
const evOf = (k: Kind): Ev => (k === "success" ? "S" : k === "failure" ? "F" : k === "unknown" ? "U" : "N");
function deliverU(cfg: Cfg, sys: Sys, c: Ctx, att: number, how: "own" | "adopted" | "pending", viaTurn: boolean) {
  if (sys.uSeen) c.viol.push({ tag: "inv14", msg: `the unknown of one hold was delivered twice to one incarnation (Attempt ${att})` });
  sys.uSeen = true;
  const route = routeOf(sys, how);
  const ok = handles(cfg, sys, route);
  if (viaTurn) runTurn(sys.lane, c, ok ? uSpec : { ...uSpec, acts: [], outcome: "Unhandled" }, () => att);
  else applyEvent(cfg, sys, "U", att, route);
}
const stateKey = (sys: Sys) => sys.lane.atts.map((a) => a.status + a.why);
// NotSent endings that appeared in this step: Superseded is evidence (principle 1); the rest are delivered, or saved when no actor lives.
function notSents(cfg: Cfg, sys: Sys, c: Ctx, before: string[], how: "own" | "adopted") {
  sys.lane.atts.forEach((a, i) => {
    if (a.status !== "notsent" || before[i] === "notsent" + a.why || (before[i] ?? "").startsWith("notsent")) return;
    if (a.why === "Superseded") return;
    c.produced++;
    if (sys.actor && !sys.rt) { c.handled++; applyEvent(cfg, sys, "N", a.id, routeOf(sys, how === "adopted" || sys.adopted[i] ? "adopted" : "pending")); return; }
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
function newIncarnation(sys: Sys) { sys.adopted = sys.adopted.map(() => true); sys.uSeen = false; }
function deliverAfterStart(cfg: Cfg, sys: Sys, c: Ctx, reload: boolean) {
  sys.lane.bound = true;
  // OD21 order: 1 the record's saved pending outcomes; 2 per lane the Held head's unknown { Restored } (unless its unknown was among step 1), then on a reload W's NotSent { Restored }
  const p1 = sys.pend.filter((p) => p.phase === 1), p2 = sys.pend.filter((p) => p.phase === 2);
  sys.pend = [];
  for (const p of p1) {
    if (p.kind === "unknown") deliverU(cfg, sys, c, p.att, "pending", true);
    else applyEvent(cfg, sys, evOf(p.kind), p.att, routeOf(sys, "pending"));
  }
  const lane = sys.lane;
  const before = statuses(sys);
  let ids: number[] = [];
  if (reload) ids = doReload(lane, c); else { const id = doStart(lane, c); ids = id ? [id] : []; }
  for (const id of ids) {
    if (!RULES.restoredDedup || !sys.uSeen) deliverU(cfg, sys, c, id, "adopted", true);
    else runTurn(lane, c, { ...uSpec, acts: [], outcome: "ok" }, () => { prepRestore(lane, id); return id; }); // already delivered from the saved outcomes: no second event
  }
  if (!ids.length) turnEnd(lane);
  notSents(cfg, sys, c, before, "adopted");
  for (const p of p2) applyEvent(cfg, sys, "N", p.att, routeOf(sys, "adopted"));
}
function steps(cfg: Cfg, sys: Sys, mode: Mode): Step[] {
  const out: Step[] = [];
  const lane = sys.lane;
  const left = CONFIG.maxCommits - lane.commits;
  const live = sys.actor && !sys.rt;
  const wrap = (label: string, f: (x: Sys, c: Ctx) => void) => out.push({ label, run: (x, c) => { x.lane.bound = x.actor; const before = statuses(x); f(x, c); notSents(cfg, x, c, before, "own"); } });
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
      if (a.status === "waiting" && a.everSent) wrap(`capture-refused(${id})`, (x, c) => {
        const d = doCaptureRefused(x.lane, c, id);
        if (d && x.actor) deliverU(cfg, x, c, d, x.adopted[d - 1] ? "adopted" : "own", true); else turnEnd(x.lane);
      });
      if (a.status === "waiting" && a.acked && !a.noInvoke) wrap(`invoke(${id})`, (x, c) => doInvoke(x.lane, c, id));
      if (a.status === "wire") {
        const kinds = [...(lane.applied.includes(id) ? ["success"] : []), ...(lane.refused.includes(id) ? ["failure"] : []), "unknown", "interrupt"] as ("success" | "failure" | "unknown" | "interrupt")[];
        for (const k of kinds) wrap(`end-${k}(${id})${sys.actor ? "" : " [no actor]"}`, (x, c) => {
          const ev: Ev = k === "success" ? "S" : k === "failure" ? "F" : "U";
          if (!x.actor) { // no binding actor: applied to the lane; saved as a pending outcome of the record, else evidence
            endingTurn(x.lane, c, id, k, uSpec);
            const keep = cfg.persisted && x.rec;
            if (keep && RULES.savePendingOutcome) x.pend.push({ att: id, kind: ev === "S" ? "success" : ev === "F" ? "failure" : "unknown", why: "", phase: 1 });
            else if (keep) c.handled--; // dropped: K25 reverted
            return;
          }
          const adopted = x.adopted[id - 1] === true;
          const route = routeOf(x, adopted ? "adopted" : "own");
          if (ev === "U") { // the hold's unknown reaches the handler in this very turn
            if (x.uSeen) c.viol.push({ tag: "inv14", msg: `the unknown of one hold was delivered twice (Attempt ${id})` });
            x.uSeen = true;
            const ok = handles(cfg, x, route);
            endingTurn(x.lane, c, id, k, ok ? uSpec : { ...uSpec, acts: [], outcome: "Unhandled" });
          } else {
            const ok = handles(cfg, x, route);
            endingTurn(x.lane, c, id, k, { label: ev, guard: "none", acts: [], outcome: ok ? "ok" : "Unhandled" });
            applyEvent(cfg, x, ev, id, route);
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
      // retain expiry (the record is kept) and disposeActor / unmount (no record survives)
      out.push({ label: cfg.persisted ? "retain-expiry" : "unmount", run: (x, c) => { x.lane.bound = true; doDispose(x.lane, c); x.actor = false; x.lane.bound = false; if (cfg.persisted) { x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; x.pend = []; } } });
      if (cfg.persisted) out.push({ label: "disposeActor", run: (x, c) => { x.lane.bound = true; doDispose(x.lane, c); x.actor = false; x.lane.bound = false; x.rec = false; x.pend = []; } });
    } else {
      out.push({ label: "ensure", run: (x, c) => {
        newIncarnation(x); x.actor = true;
        if (x.rec && cfg.persisted) { x.leaf = x.rleaf; x.cur = x.rcur; } else { x.leaf = "CARD"; x.cur = 0; }
        deliverAfterStart(cfg, x, c, false);
        if (cfg.persisted) { x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; }
      } });
    }
    out.push({ label: "reload", run: (x, c) => {
      newIncarnation(x);
      if (!cfg.persisted) { // local: no lane record, no actor record (G4)
        for (const a of x.lane.atts) { if (a.status === "queued") { a.status = "notsent"; a.why = "LostLocal"; } else if (["waiting", "wire", "unknown"].includes(a.status)) { a.status = "unknown"; a.evid = true; } }
        x.lane.head = 0; x.lane.st = "Idle"; x.lane.W = []; x.lane.told = false; x.lane.bound = true; x.actor = true; x.leaf = "CARD"; x.cur = 0; x.uSeen = false;
        return;
      }
      if (x.actor) { x.lane.bound = true; x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; deliverAfterStart(cfg, x, c, true); return; }
      // awaiting ensure: the lane is restored by the Runtime; its deliveries wait for the incarnation (deferred to the record)
      x.lane.bound = false;
      const before = statuses(x);
      doReload(x.lane, c);
      notSents(cfg, x, c, before, "adopted");
    } });
    out.push({ label: "runtime-dispose", run: (x, c) => {
      const lane0 = x.lane;
      if (x.actor && cfg.persisted) { x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; } // the final capture saves the actor record
      x.restoreAtReady = x.actor;
      x.actor = false; lane0.bound = false; x.rt = true;
      const before = statuses(x);
      doRuntimeDispose(lane0, c);
      notSents(cfg, x, c, before, "own");
    } });
    // a runtime disposal where the head settles before the final capture is saved as a pending outcome
    for (const k of ["success", "failure"] as const) {
      const h = lane.head ? A(lane, lane.head) : undefined;
      if (holds(mode) && h && h.status === "wire" && (k === "success" ? lane.applied.includes(h.id) : lane.refused.includes(h.id))) {
        out.push({ label: `runtime-dispose, ${k} settles first`, run: (x, c) => {
          const id = h.id;
          if (x.actor && cfg.persisted) { x.rec = true; x.rleaf = x.leaf; x.rcur = x.cur; }
          x.restoreAtReady = x.actor; x.actor = false; x.lane.bound = false; x.rt = true;
          endingTurn(x.lane, c, id, k, uSpec);
          if (cfg.persisted && x.rec) { if (RULES.savePendingOutcome) x.pend.push({ att: id, kind: k, why: "", phase: 1 }); else c.handled--; }
          const before = statuses(x);
          doRuntimeDispose(x.lane, c);
          notSents(cfg, x, c, before, "own");
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
      if (x.restoreAtReady) { x.actor = true; x.lane.bound = true; if (x.rec) { x.leaf = x.rleaf; x.cur = x.rcur; } deliverAfterStart(cfg, x, c, true); if (x.rec) { x.rleaf = x.leaf; x.rcur = x.cur; } }
      else { x.lane.bound = false; const before = statuses(x); doReload(x.lane, c); notSents(cfg, x, c, before, "adopted"); }
    } });
  }
  return out;
}

// ---- checks -----------------------------------------------------------------------------------------------
function checkSys(cfg: Cfg, s: Sys): Viol[] {
  const v: Viol[] = [...checkState(s.lane)];
  const lane = s.lane;
  for (const a of lane.atts) if (a.everSent && a.status === "notsent") v.push({ tag: "inv1", msg: `Attempt ${a.id} was sent but is recorded NotSent { ${a.why} }` });
  if (s.pend.length && s.actor && !s.rt) v.push({ tag: "inv14", msg: "a pending outcome outlived the incarnation it was saved for (never delivered)" });
  if (s.actor && !s.rt && s.pend.length === 0 && s.cur > 0) {
    const a = A(lane, s.cur);
    const known = ["success", "failure", "released"].includes(a.status) || (a.status === "notsent" && a.why !== "Superseded");
    if (s.leaf === "PAYING" && known) v.push({ tag: "inv13", msg: `the UI shows Paying but the lane learned Attempt ${a.id} ${a.status}${a.why ? " " + a.why : ""}` });
    if (s.leaf === "DONE" && a.status !== "success") v.push({ tag: "inv13", msg: `the UI shows Done (saved) but Attempt ${a.id} is ${a.status}${a.why ? " " + a.why : ""}` });
  }
  return v;
}

export interface SysResult { states: number; found: Map<string, { path: string[]; msg: string }>; ms: number }
export function exploreSystem(cfg: Cfg, mode: Mode, commits = 2): SysResult {
  const t0 = Date.now(), saved = CONFIG.maxCommits; CONFIG.maxCommits = commits;
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
  CONFIG.maxCommits = saved;
  return { states: states.length, found, ms: Date.now() - t0 };
}
void laneSt; void (null as unknown as Act);

export function system() {
  for (const persisted of [true, false])
    for (const place of ["root", "leaf"] as const)
      for (const mode of ["reject", "latest", "serialize"] as Mode[]) {
        const cfg: Cfg = { place, persisted };
        const r = exploreSystem(cfg, mode);
        const name = `system-${persisted ? "persisted" : "local"}-${place}-${mode}`;
        console.log(`${name}: ${r.states} states, ${(r.ms / 1000).toFixed(1)}s`);
        const tags = new Set([...r.found.keys()].map((k) => k.split("|")[0]));
        // the leaf placement of handlers is judged by inv 13 under revision 11's routing; the unchanged lane invariants must hold in both
        for (const t of ["inv1", "inv2", "inv2-local", "inv4", "inv5", "inv7", "inv9", "inv13", "inv14"]) console.log(`RESULT mode=${name} ${t} ${tags.has(t) ? "FAIL" : "PASS"}`);
        const seen = new Set<string>();
        for (const [k, f] of [...r.found.entries()].sort((a, b) => a[1].path.length - b[1].path.length)) { const t = k.split("|")[0]!; if (seen.has(t)) continue; seen.add(t); console.log(`  ${t} counterexample (${f.path.length} events): ${f.path.join(" -> ")}\n    ${f.msg}`); }
      }
  // contrast: revision 10's rules (K25 and K26 off) on the same machine, for the record
  const saved = { p: RULES.savePendingOutcome, c: RULES.currentFromActiveLeaf };
  RULES.savePendingOutcome = false; RULES.currentFromActiveLeaf = false;
  for (const place of ["root", "leaf"] as const) {
    const r = exploreSystem({ place, persisted: true }, "reject");
    const tags = new Set([...r.found.keys()].map((k) => k.split("|")[0]));
    console.log(`INFO revision 10 rules (K25, K26 off), persisted, handlers at the ${place}, reject: inv13 ${tags.has("inv13") ? "FAIL" : "PASS"}, inv14 ${tags.has("inv14") ? "FAIL" : "PASS"}`);
    for (const [k, f] of [...r.found.entries()].sort((a, b) => a[1].path.length - b[1].path.length)) { const t = k.split("|")[0]!; if (t === "inv13" || t === "inv14") { console.log(`  ${t} counterexample (${f.path.length} events): ${f.path.join(" -> ")}\n    ${f.msg}`); break; } }
  }
  RULES.savePendingOutcome = saved.p; RULES.currentFromActiveLeaf = saved.c;
}
