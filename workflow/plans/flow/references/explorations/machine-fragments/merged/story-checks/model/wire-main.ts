// Exhaustive bounded search over sequences of wire steps (stories-amended.md 2.10.4, 2.10.17.2, 2.10.17.3, the pump of 2.10.2).
// Types: `tsc -p .`   Run: bun wire-main.ts   (ONLY=name-prefix picks configs, DEPTH=n overrides the depths, QUICK=1 lowers them)
import { CALL_CELLS, CLS, CONN_CELLS, OPT, SUSPENDED, WCFG, WERRORS, clone, endRunDetail, oracleEndRun, wapply, winit, wkey, wquiet, wrunnable } from "./wire.ts";
import type { W } from "./wire.ts";

declare const process: any;
declare const performance: any;
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
const QUICK = !!env("QUICK");
const D = (n: number) => (env("DEPTH") ? Number(env("DEPTH")) : QUICK ? Math.max(3, n - 2) : n);

interface Cfg { ping?: boolean; name: string; dedupe: boolean; steps: string[]; depth: number; maxStates: number; root?: number }
const POST = ["post A", "post B"];
const CALLS = ["w post.hold", "w post.hold:resp", "w post.drop", "w post.drop:resp", "w post.dup", "w post.hold:B", "w post.release", "w post.release:drop", "w post.release:nth2", "w post.release:A"];
const RECOV = ["w handle.release", "w post.release", "w ack.release", "w socket.release", "cclose A", "cclose B", "w ctl.boom"];
const CONFIGS: Cfg[] = [
  { name: "Calls[dedupe]", dedupe: true, depth: D(6), maxStates: 200000, steps: [...POST, "cancel A", "closeTab A", "together post A+post B", "together post A+cancel A", "together post A+w post.release", "together post B+w post.release:nth2", "together post A+w post.release:drop", "together post A+w post.release:A", ...CALLS, "w ctl.boom"] },
  { name: "Calls[nodedupe]", dedupe: false, depth: D(5), maxStates: 150000, steps: [...POST, "cancel A", "together post A+post B", "w post.dup", "w post.hold", "w post.release", "w post.drop:resp", "w post.hold:resp", "w post.release:drop", "w handle.dup", "w ctl.boom", "connect B", "closeTab A"] },
  { name: "Calls[ack]", dedupe: true, depth: D(6), maxStates: 200000, steps: ["connect A", "connect B", "post A", "post B", "w ack.hold", "w ack.release", "w ack.drop", "w ack.dup", "w post.hold:resp", "w post.release", "w ack.release:nth2", "together post A+post B", "w ctl.boom", "w ack.hold:resp"] },
  { name: "Frames", dedupe: true, depth: D(6), maxStates: 200000, steps: ["connect A", "connect B", "post A", "post B", "logout B", "w socket.hold", "w socket.hold:after1", "w socket.hold:after2", "w socket.hold:t1", "w socket.hold:A", "w socket.dup", "w socket.release", "w socket.release:drop", "w socket.release:nth2", "w socket.release:A", "w handle.hold", "w handle.release", "w handle.release:A", "together post B+w handle.hold", "cclose A", "w ctl.finish", "w socket.drop"] },
  { name: "Closing", dedupe: true, depth: D(7), maxStates: 200000, steps: ["connect A", "connect B", "post A", "post B", "logout A", "logout B", "w ctl.finish", "w socket.hold", "w socket.release", "w socket.release:drop", "w socket.release:nth2", "w socket.drop", "w socket.dup", "cclose A", "w socket.hold:after1", "w socket.hold:after2", "w socket.release:A", "w handle.hold", "w handle.release"] },
  { name: "Handle", dedupe: true, depth: D(6), maxStates: 200000, steps: ["connect A", "connect B", "post A", "post B", "w handle.hold", "w handle.drop", "w handle.drop:always", "w handle.drop:times2", "w handle.dup", "w handle.release", "w handle.release:drop", "w handle.release:A", "w post.hold", "w post.release", "w socket.hold", "w socket.release", "w socket.release:A", "w socket.hold:open", "w socket.drop:open", "w socket.drop:times2", "w socket.drop", "cclose A", "cclose B"] },
  { name: "Open", dedupe: true, depth: D(6), maxStates: 200000, steps: ["connect A", "connect B", "post A", "post B", "w ctl.refuse", "w ctl.endOpen", "w ctl.boomOpen", "w ctl.boom", "w socket.hold", "w socket.release", "w socket.release:drop", "w socket.hold:open", "w socket.hold:after1", "w socket.drop", "w socket.drop:times2", "cclose A", "cclose B", "w socket.hold:after-1", "w socket.hold:after0", "logout A", "w ctl.finish"] },
  { name: "Nth", dedupe: true, depth: D(8), maxStates: 100000, steps: ["connect A", "connect B", "post A", "w socket.hold:open:A", "w socket.hold", "w socket.release:nth2", "w socket.release", "w socket.drop", "post B"] },
  { name: "Ping", ping: true, dedupe: true, depth: D(8), maxStates: 120000, steps: ["connect A", "connect B", "post B", "advance 1", "w socket.hold", "w socket.release", "w socket.hold:after1", "w socket.dup", "w handle.hold", "w handle.release", "cclose A", "w socket.release:A", "w socket.hold:A", "logout A"] },
  { name: "Pump", dedupe: true, depth: D(6), maxStates: 200000, steps: ["connect A", "connect B", "post A", "post B", "w ctl.chain:0", "w ctl.chain:1", "w ctl.chain:3", "w ctl.chain:4", "w ctl.chain:5", "w ctl.chain:100", "w ctl.chain:101", "w post.hold:A", "w handle.hold", "w handle.release", "w ack.hold", "w ack.release", "together post A+post B", "w socket.hold", "w socket.release", "w post.hold", "w post.release", "cclose A", "closeTab A"] },
];

interface Res { name: string; states: number; depth: number; capped: boolean; ms: number; transitions: number }
const evals: Record<string, number> = {}, viols = new Map<string, string[]>(), fails = new Map<string, Map<string, string[]>>();
const verdicts = new Map<string, string[]>();
const cells = new Set<string>(), errors = new Map<string, string[]>(), gaps = new Map<string, string[]>(), unusedCells = new Set<string>();
const FAILPAIRS: string[] = [];

function explore(cfg: Cfg): Res {
  const t0 = performance.now(); OPT.dedupe = cfg.dedupe; OPT.ping = !!cfg.ping;
  const seen = new Map<string, number>(), nodes: string[] = [], parent: number[] = [], lab: string[] = [], dep: number[] = []; // nodes are their keys (parsed when expanded): memory
  const myFails = new Map<string, string[]>(); fails.set(cfg.name, myFails);
  const trace = (i: number, last?: string) => { const p: string[] = []; for (let j = i; j > 0; j = parent[j]!) p.push(lab[j]!); p.reverse(); if (last) p.push(last); return p; };
  const fail = (id: string, i: number, last?: string) => { if (!myFails.has(id)) myFails.set(id, trace(i, last)); };
  const add = (s: W, par: number, l: string, d: number): number => {
    const k = wkey(s); const e = seen.get(k); if (e !== undefined) return e; const i = nodes.length;
    { // W24: every state may be the end of a run: HostTimeWait is classified once, there, from the world
      const before = wkey(s), det = endRunDetail(s), got = det.host, want = oracleEndRun(s);
      evals["W24-finish-leaves-no-evidence"] = (evals["W24-finish-leaves-no-evidence"] ?? 0) + 1; if (wkey(s) !== before && !myFails.has("W24-finish-leaves-no-evidence")) myFails.set("W24-finish-leaves-no-evidence", [...trace(par, l), "   [the finish phase changed the state: it must not reach the evidence]"]); evals["W24-end-of-run-classification"] = (evals["W24-end-of-run-classification"] ?? 0) + 1;
      if (s.rx.some((x) => x.parked)) { evals["W24-end-of-run-with-parked-fiber"] = (evals["W24-end-of-run-with-parked-fiber"] ?? 0) + 1; const key = got ? "HostTimeWait" : "parked-but-woken-by-finish"; if (!verdicts.has(key)) verdicts.set(key, [cfg.name, ...trace(par, l)]); }
      if (got !== want && !myFails.has("W24-end-of-run-classification")) myFails.set("W24-end-of-run-classification", [...trace(par, l), `   [classified ${got}, the world says ${want}]`]);
    } seen.set(k, i); nodes.push(k); parent.push(par); lab.push(l); dep.push(d); return i; };
  add(winit(), -1, "", 0);
  let maxD = 0, capped = false, transitions = 0;
  for (let i = 0; i < nodes.length; i++) {
    const d = dep[i]!; if (d > maxD) maxD = d;
    if (d >= cfg.depth) { capped = true; continue; }
    if (nodes.length > cfg.maxStates) { capped = true; break; }
    const s = JSON.parse(nodes[i]!) as W;
    for (const l of cfg.steps) {
      const r = wapply(s, l), r2 = wapply(s, l, true);
      transitions++;
      for (const e of r.c.cells) cells.add(e);
      for (const [k, v] of Object.entries(r.c.evals)) evals[k] = (evals[k] ?? 0) + v;
      for (const g of r.c.gaps) if (!gaps.has(g)) gaps.set(g, [cfg.name, ...trace(i, l)]);
      if (r.err && r.err !== "NoMore") { const k = r.err; if (!errors.has(k)) errors.set(k, [cfg.name, ...trace(i, l)]); }
      if (r.err === "NoMore") continue;
      if (!r.err && r.s.ferr > s.ferr && !errors.has("StoryFakeError")) errors.set("StoryFakeError", [cfg.name, ...trace(i, l)]);
      const sig = (x: typeof r) => JSON.stringify([wkey(x.s), x.c.ev, x.c.cells, x.c.errs, x.c.viol]);
      if (sig(r) !== sig(r2)) fail("W1-determinism", i, l);
      for (const v of r.c.viol) fail(v.split(":")[0]!, i, l + `   [${v.slice(v.indexOf(":") + 1)}]`);
      if (r.err) continue;
      add(r.s, i, l, d + 1);
    }
  }
  evals["W1-determinism"] = (evals["W1-determinism"] ?? 0) + transitions;
  // W23 no deadlocks: from every state within 3 steps of the start, the recovery steps (every release, a client close) reach a quiet state
  const mainN = nodes.length, roots: number[] = [];
  for (let i = 0; i < mainN; i++) if (dep[i]! <= (cfg.root ?? 3) && roots.length < 4000) roots.push(i);
  const redges = new Map<number, number[]>(); const todo = [...roots], proc = new Set<number>(roots), cap = nodes.length + 40000;
  for (let h = 0; h < todo.length && nodes.length < cap; h++) {
    const i = todo[h]!;
    for (const l of RECOV) { const r = wapply(JSON.parse(nodes[i]!) as W, l); if (r.err) continue; const j = add(r.s, i, l, dep[i]! + 1); (redges.get(i) ?? redges.set(i, []).get(i)!).push(j); if (!proc.has(j)) { proc.add(j); todo.push(j); } }
  }
  const n = nodes.length, rev: number[][] = Array.from({ length: n }, () => []);
  for (const [i, js] of redges) for (const j of js) rev[j]!.push(i); // only the recovery steps are ways out
  const good = new Array(n).fill(false), q: number[] = [];
  for (let i = 0; i < n; i++) if (wquiet(JSON.parse(nodes[i]!) as W)) { good[i] = true; q.push(i); }
  while (q.length) { const x = q.pop()!; for (const p of rev[x]!) if (!good[p]) { good[p] = true; q.push(p); } }
  let stuck = 0;
  for (const i of roots) { evals["W23-no-deadlock"] = (evals["W23-no-deadlock"] ?? 0) + 1; if (!good[i]) { stuck++; fail("W23-no-deadlock", i); } }
  void stuck; void wrunnable; void clone; void CLS;
  return { name: cfg.name, states: n, depth: maxD, capped, ms: Math.round(performance.now() - t0), transitions };
}

const only = env("ONLY"); const results: Res[] = []; let total = 0;
for (const cfg of CONFIGS) {
  if (only && !cfg.name.startsWith(only)) continue;
  const r = explore(cfg); results.push(r); total += r.ms;
  console.log(`RUN ${r.name} states=${r.states} depth=${r.depth} ${r.capped ? "(bounded by depth/state cap)" : "(fixpoint)"} transitions=${r.transitions} ${r.ms} ms`);
}
const ids = [...new Set([...Object.keys(evals), ...[...fails.values()].flatMap((m) => [...m.keys()])])].sort();
let failing = 0;
for (const id of ids) {
  const bad = [...fails.entries()].filter(([, m]) => m.has(id));
  console.log(`RESULT ${id} ${bad.length ? "FAIL" : "PASS"} evaluations=${evals[id] ?? 0}`);
  for (const [name, m] of bad) { const t = m.get(id)!; failing++; console.log(`   counterexample in ${name} (${t.length} steps): ${t.join(" ; ")}`); FAILPAIRS.push(`FAILPAIR ${id} | ${name} | ${t.join(" ; ")}`); }
}
const want = [...CALL_CELLS.filter((x) => !SUSPENDED.includes(x)), ...CONN_CELLS];
const miss = want.filter((x) => !cells.has(x));
console.log(`RESULT reachability ${miss.length ? "MISSING" : "PASS"} call cells ${CALL_CELLS.length - SUSPENDED.length - miss.filter((x) => x.startsWith("Call|")).length}/${CALL_CELLS.length - SUSPENDED.length} (+${SUSPENDED.length} suspended: not modelled), connection cells ${CONN_CELLS.length - miss.filter((x) => x.startsWith("Cn|")).length}/${CONN_CELLS.length}${miss.length ? "; UNREACHED: " + miss.join(", ") : ""}`);
if (miss.length) FAILPAIRS.push(`FAILPAIR reachability | cells | ${miss.join(", ")}`);
console.log(`INFO errors reached: ${[...errors.keys()].sort().join(", ")}`);
console.log(`INFO errors not reached: ${WERRORS.filter((e) => !errors.has(e)).join(", ") || "none"}`);
for (const [g, t] of gaps) console.log(`GAP ${g} reached in ${t[0]}: ${t.slice(1).join(" ; ")}`);
for (const [v, t] of verdicts) console.log(`INFO end-of-run ${v}: ${t[0]}: ${t.slice(1).join(" ; ")}`);
for (const [e, t] of errors) if (e === "StoryFakeError") console.log(`INFO ${e}: ${t[0]}: ${t.slice(1).join(" ; ")}`);
console.log(`INFO total search time ${(total / 1000).toFixed(1)} s, ${results.reduce((a, r) => a + r.states, 0)} states; ${failing} failing invariant instances; WCFG pumpK=${WCFG.pumpK}`);
for (const f of FAILPAIRS) console.log(f);
void unusedCells; void viols;
