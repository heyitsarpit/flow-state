// Exhaustive bounded search over the sections 3.1 to 3.4 model.
// Types: `tsc -p .`   Run: bun main.ts   (QUICK=1 lowers the composite depth)
import {
  CONFIG, INPUTS, RCFG, STATES, admit, canPull, cbClose, cbEmitSignal, cbEmitValue, cbInit, cbInv, cbPull, cbRelease, cellKind, clone, initSess,
  lEvent, lInit, lInv, lNorm, lReadLand, lReadStart, pendingAny, pgInit, pgMoves, rCell, rInit, rInv, rMoves, sIn, sessInv, turnEnd,
} from "./model.ts";
import type { Cb, Emit, Kind, Ls, Rc, SIn, Sess, Sig } from "./model.ts";

declare const process: any;
declare const performance: any;
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
const QUICK = !!env("QUICK");

// ---- generic explorer ------------------------------------------------------------------------------------------
interface Mv<T> { label: string; next: T; viol: string[]; ev: string[] }
interface Sys<T> { name: string; init: T[]; moves(t: T): Mv<T>[]; inv(t: T): string[]; norm?: (t: T) => T }
interface Res { name: string; states: number; depth: number; capped: boolean; ms: number; fails: Map<string, string[]>; cells: Set<string>; keys: string[] }
function explore<T>(sys: Sys<T>, maxDepth: number, maxStates: number): Res {
  const t0 = performance.now();
  const seen = new Map<string, number>(), nodes: string[] = [], parent: number[] = [], lab: string[] = [], dep: number[] = [];
  const fails = new Map<string, string[]>(), cells = new Set<string>();
  const trace = (i: number, last?: string) => { const p: string[] = []; for (let j = i; j >= 0 && lab[j] !== undefined; j = parent[j]!) if (lab[j]) p.push(lab[j]!); p.reverse(); if (last) p.push(last); return p; };
  const fail = (id: string, i: number, last?: string) => { if (!fails.has(id)) fails.set(id, trace(i, last)); };
  const add = (t: T, par: number, l: string, d: number) => {
    const n = sys.norm ? sys.norm(t) : t, k = JSON.stringify(n);
    if (seen.has(k)) return;
    const i = nodes.length; seen.set(k, i); nodes.push(k); parent.push(par); lab.push(l); dep.push(d);
    for (const id of sys.inv(n)) fail(id, i);
  };
  for (const t of sys.init) add(t, -1, "", 0);
  let maxD = 0, capped = false;
  for (let i = 0; i < nodes.length; i++) {
    const d = dep[i]!; if (d > maxD) maxD = d;
    if (d >= maxDepth) { capped = true; continue; }
    if (nodes.length > maxStates) { capped = true; break; }
    const t: T = JSON.parse(nodes[i]!);
    for (const m of sys.moves(t)) {
      for (const e of m.ev) cells.add(e);
      for (const id of m.viol) fail(id, i, m.label);
      add(m.next, i, m.label, d + 1);
    }
  }
  return { name: sys.name, states: nodes.length, depth: maxD, capped, ms: Math.round(performance.now() - t0), fails, cells, keys: nodes };
}
function normEp<T>(t: T): T {
  const nums: number[] = [];
  const walk = (o: any, f: (holder: any, key: string) => void) => {
    if (Array.isArray(o)) o.forEach((x) => walk(x, f));
    else if (o && typeof o === "object") for (const k of Object.keys(o)) { if (["ep", "cov", "gep"].includes(k) && typeof o[k] === "number") f(o, k); else walk(o[k], f); }
  };
  walk(t, (h, k) => nums.push(h[k]));
  const m = nums.length ? Math.min(...nums) : 0;
  if (m > 0) walk(t, (h, k) => { h[k] -= m; });
  return t;
}

// ---- standalone session: 3.1 and 3.2 under the sixteen inputs (optionally with 3.6's coverage attached) ------------------
interface SS { s: Sess; old: Sess | null; wait: boolean; L: Ls | null }
const ADAPTER: { l: string; i: SIn }[] = [
  { l: "proof(b)", i: { k: "proof" } }, { l: "live()", i: { k: "live" } }, { l: "lost(r)", i: { k: "lost" } }, { l: "reset(r, at)", i: { k: "reset", ra: 0 } },
  { l: "fresh", i: { k: "fresh" } }, { l: "pending(b)", i: { k: "pending" } }, { l: "settle(proven)", i: { k: "settleP" } }, { l: "settle(lost r)", i: { k: "settleL" } },
  { l: "value 0", i: { k: "value", v: 0 } }, { l: "value 1", i: { k: "value", v: 1 } }, { l: "down(1)", i: { k: "down", v: 1 } }, { l: "down(2)", i: { k: "down", v: 2 } },
  { l: "stream fails", i: { k: "fail" } }, { l: "stream completes", i: { k: "complete" } }, { l: "defect/interrupt", i: { k: "defect" } },
];
function pumpMoves(s: Sess, wrap: (n: Sess) => any, out: Mv<any>[]) {
  const a = admit(s); if (a) out.push({ label: "admission", next: wrap(a.s), viol: a.viol, ev: a.ev });
  const e = turnEnd(s); if (e) out.push({ label: "turn ends", next: wrap(e.s), viol: e.viol, ev: e.ev });
}
function sysS(kind: Kind, withL: boolean): Sys<SS> {
  const inits: SS[] = [];
  const vals: (number | null)[] = kind === "state" && !withL ? [null, 0, 1] : [null];
  for (const l of vals) for (const h of kind === "state" && !withL ? vals : [null]) inits.push({ s: initSess(kind, l, h), old: null, wait: false, L: withL ? lInit() : null });
  return {
    name: withL ? "S+L" : "S", init: inits, norm: withL ? (t) => ({ ...t, L: lNorm(t.L!) }) : undefined,
    inv: (t) => { const v = sessInv(t.s); if (t.old) v.push(...sessInv(t.old)); if ([t.s, t.old].filter((x) => x && x.st !== "Released").length > 1) v.push("I10"); if (t.L) v.push(...lInv(t.L, t.s)); return v; },
    moves(t) {
      const mv: Mv<SS>[] = [];
      const { s } = t;
      const live = s.st === "Opening" || s.st === "Dropped" || s.st === "Live";
      const withLev = (r: { s: Sess; lev: string[] }) => ({ ...t, s: r.s, L: t.L ? r.lev.reduce((l, e) => lEvent(l, e), t.L) : null });
      for (const { l, i } of ADAPTER) {
        if (cellKind(s.st, i.k) === "cannot") continue;
        const pulled = i.k !== "defect"; // an outside interrupt can land at any time; everything else is a pulled element
        if (s.st !== "Releasing" && pulled && !canPull(s)) continue;
        if (!live && s.st !== "Releasing") continue;
        const r = sIn(s, i);
        mv.push({ label: l, next: withLev(r), viol: r.viol, ev: r.ev });
      }
      if (s.st !== "Released") { const r = sIn(s, { k: "release" }); mv.push({ label: "release", next: withLev(r), viol: r.viol, ev: r.ev }); }
      if (s.st === "Releasing") for (const k of ["closed", "bound"]) { const r = sIn(s, { k }); mv.push({ label: k === "closed" ? "scope closed" : "release bound passed", next: withLev(r), viol: r.viol, ev: r.ev }); }
      pumpMoves(s, (n) => ({ ...t, s: n }), mv);
      if (t.L) {
        const L = t.L;
        mv.push({ label: "read of r starts", next: { ...t, L: lReadStart(L) }, viol: [], ev: ["L|readStart"] });
        const landed = lReadLand(L); if (landed) mv.push({ label: "read of r lands", next: { ...t, L: landed }, viol: [], ev: ["L|readLand"] });
        mv.push({ label: "subscribed toggles", next: { ...t, L: { ...L, sub: !L.sub } }, viol: [], ev: [] });
      } else {
        if (!t.wait) { const r = s.st === "Releasing" || s.st === "Released" ? { s, viol: [] as string[], ev: [] as string[] } : sIn(s, { k: "release" }); mv.push({ label: "restart (reload or key re-entered)", next: { ...t, s: r.s, wait: true }, viol: r.viol, ev: r.ev }); }
        if (t.wait && (s.st === "Released" || (!CONFIG.successorAfterClosed && s.st === "Releasing"))) {
          const n = initSess(kind, s.lastV, s.heard);
          mv.push({ label: "successor starts", next: { s: n, old: s.st === "Released" ? null : s, wait: false, L: null }, viol: [], ev: [] });
        }
        if (t.old && t.old.st === "Releasing") mv.push({ label: "old scope closed", next: { ...t, old: null }, viol: [], ev: [] });
      }
      return mv;
    },
  };
}

// ---- Feed.callback feeding a facts or state session -----------------------------------------------------------------
interface SC { cb: Cb; s: Sess; gneed: boolean; gep: number; gdown: boolean; ne: number; truth: "none" | "up" | "down" }
function sysCB(kind: Kind): Sys<SC> {
  const col = (c: Cb) => (c.released || c.closing !== "open" ? "closed" : c.q.filter((e) => "v" in e).length >= 2 ? "full" : "room");
  return {
    name: "CB+S", norm: normEp, init: [{ cb: cbInit(), s: initSess(kind, null, null), gneed: false, gep: 0, gdown: false, ne: 0, truth: "none" }],
    inv: (t) => [...cbInv(t.cb), ...sessInv(t.s), ...(t.cb.q.length === 0 && (t.s.st === "Live" || t.s.st === "Dropped") && t.truth !== "none" && (t.truth === "up") !== (t.s.st === "Live") && pendingAny(t.s) === 0 ? ["CB-status"] : [])],
    moves(t) {
      const mv: Mv<SC>[] = [], c0 = col(t.cb);
      const push = (label: string, row: string, patch: Partial<SC>, viol: string[] = []) => mv.push({ label, next: { ...t, ...patch }, viol, ev: [`CB|${c0}|${row}`] });
      const dead = t.s.st === "Ended" || t.s.st === "Releasing" || t.s.st === "Released";
      if (t.ne < 5 && !dead) {
        const r = cbEmitValue(t.cb, 0, t.gep, t.gneed); push("emit(value 0)", "emit(value)", { cb: r.c, ne: t.ne + 1 });
        const sigs: [Sig, string][] = [["down", "emit(down)"], ["proof", "emit(proof)"], ["live", "emit(live)"], ["lost", "emit(lost)"], ["reset", "emit(reset)"]];
        for (const [k, l] of sigs) {
          const gep = k === "proof" || (k === "down" && t.gdown) ? t.gep : t.gep + 1, gneed = k !== "proof", gdown = k === "down";
          const r = cbEmitSignal(t.cb, k, gep, 0), ok = !r.ev.startsWith("evidence");
          push(l, "emit(signal)", ok ? { cb: r.c, gep, gneed, gdown, ne: t.ne + 1, truth: k === "down" ? "down" : "up" } : { cb: r.c, ne: t.ne + 1 }, r.viol);
        }
        push("emit.fail(e)", "emit.fail", { cb: cbClose(t.cb, "fail").c, ne: t.ne + 1 });
        push("emit.end()", "emit.end", { cb: cbClose(t.cb, "end").c, ne: t.ne + 1 });
      }
      if (!t.cb.released) {
        const r = sIn(t.s, { k: "release" });
        mv.push({ label: "release", next: { ...t, cb: cbRelease(t.cb), s: r.s }, viol: r.viol, ev: [`CB|${c0}|release`, ...r.ev] });
      }
      if (canPull(t.s) && !dead) {
        const p = cbPull(t.cb);
        if (p) {
          const r = sIn(t.s, p.inp), viol = [...r.viol];
          if (t.cb.ovf && (p.inp.k === "complete" || (p.inp.k === "fail" && p.inp.e !== "Overflow"))) viol.push("C6-overflow");
          mv.push({ label: `pull -> ${p.inp.k}`, next: { ...t, cb: p.c, s: r.s }, viol, ev: [`CB|${c0}|pull`, ...r.ev] });
        }
      }
      if (t.s.st === "Releasing") for (const k of ["closed", "bound"]) { const r = sIn(t.s, { k }); mv.push({ label: k, next: { ...t, s: r.s }, viol: r.viol, ev: r.ev }); }
      pumpMoves(t.s, (n) => ({ ...t, s: n }), mv);
      return mv;
    },
  };
}

// ---- Feed.reconnect feeding a session -------------------------------------------------------------------------------
interface SR2 { rc: Rc; out: Emit[]; s: Sess; resume: number | null }
function sysR(kind: Kind, name: string, bare = false): Sys<SR2> {
  const toIn = (e: Emit): SIn => e.t === "value" ? { k: "value", v: e.v } : e.k === "down" ? { k: "down", v: 1 } : { k: e.k, ra: e.ra };
  return {
    name, norm: (t) => { if (bare) t.rc.opens = Math.min(t.rc.opens, 4); return t; },
    init: (() => { const r = rInit(); return [{ rc: r.r, out: r.out, s: initSess(kind, null, null, kind === "facts"), resume: null }]; })(),
    inv: (t) => {
      const v = [...rInv(t.rc), ...(bare ? [] : sessInv(t.s))];
      if (!bare) for (const it of [t.s.inFlight && !t.s.adm ? t.s.inFlight : null, ...t.s.Q]) if (it && it.t === "value" && t.resume !== null && t.resume >= it.v!) v.push("I5");
      return v;
    },
    moves(t) {
      const mv: Mv<SR2>[] = [];
      if (bare) return rMoves(t.rc).map((m) => { const r = m.fn(t.rc); return { label: m.label, next: { ...t, rc: r.r }, viol: r.viol, ev: r.ev }; });
      const dead = t.s.st === "Ended" || t.s.st === "Releasing" || t.s.st === "Released";
      // The adapter Stream is back-pressured, so what R emits reaches the session in order. Between R events the pump drains to rest
      // (pull when allowed, else admit, else end the turn); a release can still land at any rest point.
      const settle = (n: SR2, viol: string[], ev: string[]): SR2 => {
        let { s, out, resume } = n;
        for (let g = 0; g < 60; g++) {
          if (out.length && canPull(s)) { const r = sIn(s, toIn(out[0]!)); viol.push(...r.viol); ev.push(...r.ev); s = r.s; out = out.slice(1); continue; }
          const a = admit(s);
          if (a) {
            const it = s.inFlight && !s.adm ? s.inFlight : null;
            if (it && a.ev[0]?.startsWith("admit")) { if (it.t === "value") resume = it.v!; else if (it.k === "R") resume = it.ra ?? resume; }
            viol.push(...a.viol); ev.push(...a.ev); s = a.s; continue;
          }
          const e = turnEnd(s); if (e) { viol.push(...e.viol); s = e.s; continue; }
          break;
        }
        if (s.st === "Ended") out = [];
        return { ...n, s, out, resume };
      };
      if (!dead) for (const m of rMoves(t.rc)) {
        if (m.row === "release") continue;
        const r = m.fn(t.rc), viol = [...r.viol], ev = [...r.ev];
        mv.push({ label: m.label, next: settle({ ...t, rc: r.r, out: [...t.out, ...r.out] }, viol, ev), viol, ev });
      }
      if (t.s.st !== "Released" && t.s.st !== "Releasing") {
        const r = sIn(t.s, { k: "release" });
        const rr = rMoves(t.rc).find((m) => m.row === "release");
        const x = rr && !t.rc.rel ? rr.fn(t.rc) : null;
        mv.push({ label: "release", next: { ...t, rc: x ? x.r : t.rc, out: [], s: r.s }, viol: r.viol, ev: [...r.ev, ...(x ? x.ev : [])] });
      }
      if (t.s.st === "Releasing") for (const k of ["closed", "bound"]) { const r = sIn(t.s, { k }); mv.push({ label: k, next: { ...t, s: r.s }, viol: r.viol, ev: r.ev }); }
      return mv;
    },
  };
}
// I22: from every CatchingUp state, under good behaviour (pages succeed or say CannotRepair, the socket stays up), Live is reached.
function liveness(keys: string[], strictNoEmpty: boolean, cannotOnly = false): string | null {
  const good = (m: { label: string }) => (cannotOnly ? /^(page delay|page CannotRepair\b|inner value|server append|tick)/ : /^(page ok|page delay|page CannotRepair|inner value|server append|tick)/).test(m.label) && !(strictNoEmpty && m.label.includes("empty")) && !(cannotOnly && m.label.includes("continueAt"));
  const memo = new Map<string, boolean>(), stack = new Set<string>();
  let bad: string | null = null;
  const go = (r: Rc): boolean => {
    if (r.ph === "Live") return true;
    if (r.ph !== "CatchingUp") { bad = bad ?? `left CatchingUp for ${r.ph} on good moves`; return false; }
    const k = JSON.stringify(r);
    if (memo.has(k)) return memo.get(k)!;
    if (stack.has(k)) { bad = bad ?? `cycle at cursor ${r.cursor}, emptyRun ${r.ec}`; return false; }
    stack.add(k);
    let ok = true, any = false;
    for (const m of rMoves(r)) {
      if (!good(m)) continue;
      const n = m.fn(r).r; if (JSON.stringify(n) === k) { if (m.label.includes("empty")) { bad = bad ?? `an empty page with a next cursor repeats forever (emptyRun = ${r.ec})`; ok = false; } continue; }
      if (n.ph === "Waiting" || n.ph === "Done" || n.ph === "Connecting") continue; // the connection did not stay up: not a good move
      any = true;
      if (!go(n)) ok = false;
    }
    if (!any) { ok = false; bad = bad ?? "stuck in CatchingUp"; }
    stack.delete(k); memo.set(k, ok); return ok;
  };
  const seenR = new Set<string>();
  for (const key of keys) { const t: SR2 = JSON.parse(key); if (t.rc.ph !== "CatchingUp") continue; const rk = JSON.stringify(t.rc); if (seenR.has(rk)) continue; seenR.add(rk); if (!go(t.rc)) return bad; }
  return null;
}
function sysP(): Sys<any> {
  return { name: "P", init: [pgInit()], inv: () => [], moves: (p) => pgMoves(p) };
}

// ---- run everything -----------------------------------------------------------------------------------------------
interface Run { sys: string; kind: Kind | "-"; reading: string; res: Res }
const runs: Run[] = [];
const DEPTH = QUICK ? 8 : Number(env("DEPTH") ?? 10);
const out = (s: string) => console.log(s);
function runOne<T>(sys: Sys<T>, kind: Kind | "-", reading: string, depth: number, max = 1_500_000) {
  const res = explore(sys, depth, max);
  runs.push({ sys: sys.name, kind, reading, res });
  out(`RUN ${sys.name} kind=${kind} reading=${reading} states=${res.states} depth=${res.depth}${res.capped ? " (bounded by depth/state cap)" : " (fixpoint)"} ${res.ms} ms`);
  return res;
}
const T0 = performance.now();
for (const kind of ["facts", "state"] as Kind[]) runOne(sysS(kind, false), kind, "spec", 99);
for (const kind of ["facts", "state"] as Kind[]) runOne(sysS(kind, true), kind, "spec", 12, 400_000);
for (const kind of ["facts", "state"] as Kind[]) runOne(sysCB(kind), kind, "spec", 99);
runOne(sysP(), "-", "spec", 99);
const rcfgs = [
  { n: "R+S[catchUp,from=0]", catchUp: true, from: 0 as number | null, nopos: false }, { n: "R+S[catchUp,from=none]", catchUp: true, from: null, nopos: false },
  { n: "R+S[no catchUp,from=0]", catchUp: false, from: 0 as number | null, nopos: false }, { n: "R+S[no catchUp,from=none,no positions]", catchUp: false, from: null, nopos: true },
];
let liveFail: string | null = null, liveFail2: string | null = null;
// data path: positions up to 3, no clock. budget path: one position, the clock on (resetAfter abstracted to "stable" / "not stable").
RCFG.tick = false; RCFG.hmax = 3;
for (const c of rcfgs) {
  RCFG.catchUp = c.catchUp; RCFG.from = c.from; RCFG.nopos = c.nopos;
  for (const kind of ["facts", "state"] as Kind[]) {
    if (c.nopos && kind === "state") continue;
    const r = runOne(sysR(kind, c.n + "/data"), kind, "spec", DEPTH);
    if (kind === "facts" && c.catchUp && c.from === 0) { liveFail = liveness(r.keys, false); liveFail2 = liveness(r.keys, true) ?? liveness(r.keys, true, true); }
  }
}
RCFG.nopos = false; RCFG.tick = true; RCFG.hmax = 1; RCFG.catchUp = false; RCFG.from = 0;
runOne(sysR("facts", "R/budget[no catchUp]", true), "facts", "spec", 60);
RCFG.hmax = 0; RCFG.catchUp = true;
runOne(sysR("facts", "R/budget[catchUp,head=0]", true), "facts", "spec", 11, 400_000);

// ---- report -----------------------------------------------------------------------------------------------------------
const IDS = ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9", "I10", "I11", "I12", "I13", "I14", "I15", "I16", "I17", "I18", "I19", "I20", "I20b", "I21", "I22", "I22b", "I23", "I24",
  "I1a", "I24x", "C6-overflow", "CB-status", "CB-order", "CB-down-lost", "CB-upgrade", "CB-waiter"];
const norm = (id: string) => (id.startsWith("I7") ? "I7" : id.startsWith("I2-") ? "I2" : id);
function summary(reading: string) {
  const m = new Map<string, { sys: string; trace: string[] }>();
  for (const r of runs.filter((x) => x.reading === reading)) for (const [id, tr] of r.res.fails) {
    const n = norm(id), key = n + "|" + r.sys.split("/")[0] + " " + r.kind, cur = m.get(key);
    if (!cur || tr.length < cur.trace.length) m.set(key, { sys: `${r.sys} ${r.kind}`, trace: tr });
  }
  return m;
}
const failed = (m: Map<string, any>, id: string) => [...m.keys()].some((k) => k.split("|")[0] === id);
const sp = summary("spec");
if (liveFail2) sp.set("I22|live", { sys: "R+S[catchUp,from=0] facts (liveness)", trace: [liveFail2] });
if (liveFail) sp.set("I22b|live", { sys: "R+S[catchUp,from=0] facts (liveness, endless empty pages)", trace: [liveFail] });
for (const id of IDS) out(`RESULT mode=spec ${id} ${failed(sp, id) ? "FAIL" : "PASS"}`);
for (const [k, c] of sp) out(`CE ${k.split("|")[0]} [${c.sys}] (${c.trace.length} steps): ${c.trace.join(" -> ")}`);
out(`NOTE I22 under strict fairness (no empty page with a next cursor, forever): ${liveFail2 ?? "reaches Live on every good path"}; with such pages allowed: ${liveFail ?? "also fine"}`);
if (liveFail2) out(`FAILPAIR I22 | liveness | facts | ${liveFail2}`);
if (liveFail) out(`FAILPAIR I22b | liveness | facts | ${liveFail}`);
for (const r of runs.filter((x) => x.reading === "spec")) for (const [id, tr] of r.res.fails) out(`FAILPAIR ${norm(id)} | ${r.sys} | ${r.kind} | ${tr.join(" -> ")}`);
// coverage
const all = new Set<string>(); for (const r of runs.filter((x) => x.reading === "spec")) for (const c of r.res.cells) all.add(c);
let definedS = 0, cannotS = 0, missS: string[] = [];
out("COVERAGE 3.1 (rows = inputs, columns = states; F = facts reached, S = state reached, - = cannot occur, . = defined but unreached)");
out("  input     " + STATES.map((s) => s.padEnd(10)).join(""));
for (const inp of INPUTS) {
  let line = "  " + inp.padEnd(10);
  for (const st of STATES) {
    if (cellKind(st, inp) === "cannot") { cannotS++; line += "-".padEnd(10); continue; }
    definedS++;
    const f = all.has(`facts|${st}|${inp}`), s = all.has(`state|${st}|${inp}`);
    if (!f || !s) missS.push(`${st}x${inp}${f ? "" : "(facts)"}${s ? "" : "(state)"}`);
    line += ((f ? "F" : ".") + (s ? "S" : ".")).padEnd(10);
  }
  out(line);
}
out(`COVERAGE 3.1 cells: ${definedS} defined, ${cannotS} cannot occur; unreached (cell, kind): ${missS.join(", ") || "none"}`);
const rrows = ["proof", "live", "reset", "down", "value", "pageOk", "cannotRepair", "pageFailW", "pageFailT", "failW", "failT", "pageDelay", "delay", "release"];
const phs = ["Connecting", "Live", "CatchingUp", "Waiting", "Done"] as const;
let dR = 0, cR = 0; const missR: string[] = [];
for (const row of rrows) for (const ph of phs) {
  if (rCell(ph, row) === "cannot") { cR++; continue; }
  dR++; if (!all.has(`R|${ph}|${row}`)) missR.push(`${ph}x${row}`);
}
out(`COVERAGE 3.4 cells: ${dR + cR} = ${dR} defined + ${cR} cannot; unreached defined: ${missR.join(", ") || "none"}`);
const cbRows = ["emit(value)", "emit(signal)", "emit.fail", "emit.end", "pull", "release"], cbCols = ["room", "full", "closed"];
const cbMiss: string[] = [];
for (const r of cbRows) for (const c of cbCols) if (!all.has(`CB|${c}|${r}`)) cbMiss.push(`${c}x${r}`);
out(`COVERAGE 3.3 cells (6 inputs x 3 columns): unreached: ${cbMiss.join(", ") || "none"}`);
const pMiss = ["addr|setter", "other|setter", "addr|ending", "other|ending", "addr|promotion", "addr|restore"].filter((c) => !all.has("P|" + c));
out(`COVERAGE 3.5 cells: unreached: ${pMiss.join(", ") || "none"}; 3.6 events: readStart ${all.has("L|readStart")}, readLand ${all.has("L|readLand")}`);
out(`TOTAL ${Math.round(performance.now() - T0)} ms`);
