// Exhaustive bounded search over sequences of Story steps (proposal-v2.md section 3).
// Types: `tsc -p .`   Run: bun main.ts   (QUICK=1 lowers the depths; DEPTH=n overrides)
import {
  CB_CELLS, CFG, CONN_CELLS, ERRORS, HOST_CELLS, OPT, PROG_CELLS, RECON_CELLS, SESS_CELLS, STO_CELLS, SUITE_EXTRA, WIRE_CELLS, apply, clone, hApply, hInit, init, key, laneCells, quiet, runnable, stepList, streamSteps, HSTEPS,
} from "./model.ts";
import type { H, S } from "./model.ts";

declare const process: any;
declare const performance: any;
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
const QUICK = !!env("QUICK");

interface Run { name: string; steps: string[]; depth: number; maxStates: number; root?: number }
interface Res {
  name: string; states: number; depth: number; capped: boolean; ms: number; fails: Map<string, string[]>; cells: Set<string>; errors: Set<string>; stuck: number; stuckEx: string[]; settledChecked: number; transitions: number;
}
const FAILPAIRS: string[] = [];
const errTr = new Map<string, string[]>();
const ROOT = 3;
const RECOV = ["send a Retry", "send a Cancel", "send b Cancel", "world pay.release", "world pay.release:handle", "world pay.release:drop", "world sto.release", "world hist.release", "world chat.release", "send a Unsub", "advance next", "life ensure a", "life ensure b"];

function explore(run: Run): Res {
  const t0 = performance.now();
  const seen = new Map<string, number>(), nodes: S[] = [], parent: number[] = [], lab: string[] = [], dep: number[] = [], edges: number[][] = [];
  const fails = new Map<string, string[]>(), cells = new Set<string>(), errors = new Set<string>();
  const trace = (i: number, last?: string) => { const p: string[] = []; for (let j = i; j > 0; j = parent[j]!) p.push(lab[j]!); p.reverse(); if (last) p.push(last); return p; };
  const fail = (id: string, i: number, last?: string) => { if (!fails.has(id)) fails.set(id, trace(i, last)); };
  const add = (s: S, par: number, l: string, d: number): number => {
    const k = key(s); const e = seen.get(k); if (e !== undefined) return e;
    const i = nodes.length; seen.set(k, i); nodes.push(s); parent.push(par); lab.push(l); dep.push(d); edges.push([]); return i;
  };
  add(init(), -1, "", 0);
  let maxD = 0, capped = false, transitions = 0, settledChecked = 0;
  for (let i = 0; i < nodes.length; i++) {
    const d = dep[i]!; if (d > maxD) maxD = d;
    if (d >= run.depth) { capped = true; continue; }
    if (nodes.length > run.maxStates) { capped = true; break; }
    const s = nodes[i]!;
    for (const l of run.steps) {
      const r = apply(s, l), r2 = apply(s, l, true);
      transitions++;
      for (const e of r.c.cells) cells.add(e);
      if (r.err) { if (r.err === "StoryTurnLimit" && !errTr.has(run.name)) errTr.set(run.name, trace(i, l)); if (r.err !== "NoMore") errors.add(r.err); if (r.err === "NoMore") continue; }
      // 1 determinism: the same step on the same state, with every unordered collection scanned the other way round
      const sig = (x: typeof r) => JSON.stringify([key(x.s), x.c.log, x.c.ends, x.c.cells, x.c.fired, x.err ?? ""]);
      if (sig(r) !== sig(r2)) fail("1-determinism", i, l);
      // 2 settling
      if (!r.err) { settledChecked++; const rn = runnable(r.s); if (rn.length) fail("2-settling", i, l + `   [left runnable: ${rn.join("; ")}]`); }
      // 3 no injected endings; other conformance violations
      for (const v of r.c.viol) { if (v.startsWith("C3:")) fail("3-injected", i, l + `   [${v}]`); else if (v.startsWith("S:") || v.startsWith("R:cannot")) fail("4-cannot-cell-fired", i, l + `   [${v}]`); else fail("6-conformance:" + v.split(":")[0] + ":" + v.split(":")[1]!, i, l + `   [${v}]`); }
      if (r.err) continue;
      const j = add(r.s, i, l, d + 1);
      edges[i]!.push(j);
    }
  }
  // 5 no deadlocks: from every state within ROOT steps of the start, the recovery steps (release, retry, cancel, unsubscribe, next deadline, close) reach a quiet state
  const mainN = nodes.length;
  const roots: number[] = []; for (let i = 0; i < mainN; i++) if (dep[i]! <= (run.root ?? ROOT) && roots.length < 5000) roots.push(i);
  const todo = [...roots], proc = new Set<number>(roots); const cap = nodes.length + 30000;
  for (let h = 0; h < todo.length && nodes.length < cap; h++) {
    const i = todo[h]!;
    for (const l of RECOV) {
      const r = apply(nodes[i]!, l); if (r.err) continue;
      const j = add(r.s, i, l, dep[i]! + 1);
      edges[i]!.push(j); if (!proc.has(j)) { proc.add(j); todo.push(j); }
    }
  }
  const n = nodes.length, rev: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (const j of edges[i]!) rev[j]!.push(i);
  const good = new Array(n).fill(false), q: number[] = [];
  for (let i = 0; i < n; i++) if (quiet(nodes[i]!)) { good[i] = true; q.push(i); }
  while (q.length) { const x = q.pop()!; for (const p of rev[x]!) if (!good[p]) { good[p] = true; q.push(p); } }
  let stuck = 0; const stuckEx: string[] = [];
  for (const i of roots) if (!good[i]) { stuck++; if (stuckEx.length < 1) { stuckEx.push(trace(i).join(" ; ")); fail("5-deadlock", i); } }
  return { name: run.name, states: n, depth: maxD, capped, ms: Math.round(performance.now() - t0), fails, cells, errors, stuck, stuckEx, settledChecked, transitions };
}

// ---- the host (3.4) --------------------------------------------------------------------------------------------------------
function exploreHost(resum: boolean): { states: number; cells: Set<string>; errors: Set<string>; fails: string[] } {
  const seen = new Set<string>(), q: H[] = [hInit(resum)], cells = new Set<string>(), errors = new Set<string>(), fails: string[] = [];
  seen.add(JSON.stringify(q[0]));
  for (let i = 0; i < q.length; i++) for (const st of HSTEPS) {
    const r = hApply(q[i]!, st), r2 = hApply(clone(q[i]!), st);
    if (JSON.stringify(r) !== JSON.stringify(r2)) fails.push("1-determinism " + st);
    for (const c of r.cells) cells.add(c);
    if (r.err) errors.add(r.err);
    const k = JSON.stringify(r.h); if (!seen.has(k)) { seen.add(k); q.push(r.h); }
  }
  return { states: q.length, cells, errors, fails };
}

// ---- runs ---------------------------------------------------------------------------------------------------------------------
const D = (n: number) => (env("DEPTH") ? Number(env("DEPTH")) : QUICK ? Math.max(4, n - 2) : n);
const W_STEPS = stepList(), S_STEPS = streamSteps();
const ALL = [...new Set([...W_STEPS, ...S_STEPS])];
const extra = CFG.noInject ? [] : ["inject unknown"];
interface Cfg { suite?: boolean; name: string; policy: "reject" | "serialize"; src: "plain" | "reconnect" | "callback"; auto: boolean; run: Run }
const RELOAD0 = ["send a Pay", "send a Retry", "send a Cancel", "world sto.hold:ack", "world sto.hold:flush", "world sto.release", "world pay.hold", "world pay.release", "life closeTab a", "life openTab a", "advance next"];
const RELOAD = ["send a Pay", "send a Retry", "send a Cancel", "world sto.hold:ack", "world sto.hold:ack:response", "world sto.hold:clear", "world sto.hold:flush", "world sto.release", "world pay.hold", "world pay.release", "life reload a", "advance next"];
void RELOAD0;
const SER = ["send a Pay", "send a Retry", "send a Cancel", "send a GuardIdle", "world pay.hold", "world pay.release", "world pay.drop:response", "world srv.slow", "world srv.progress", "world sto.hold:ack", "world sto.release",
  "life dispose a", "life ensure a", "life closeTab a", "life openTab a", "advance 1", "advance next", "together pay.release+send a Cancel"];
const EQ = ["life openTab b", "life dispose a", "life dispose b", "advance 1", "advance next", "world srv.slow", "world srv.die", "send b Pay", "send a Pay", "send a Retry", "send b Retry", "send b Cancel"];
const CONFIGS: Cfg[] = [
  { name: "W[reject]", policy: "reject", src: "reconnect", auto: false, run: { name: "W[reject]", steps: [...W_STEPS, ...extra], depth: D(4), maxStates: 300000 } },
  { name: "W[serialize,autoRetry]", policy: "serialize", src: "reconnect", auto: true, run: { name: "W[serialize,autoRetry]", steps: SER, depth: D(7), maxStates: 150000 } },
  { name: "Wreload[reject]", policy: "reject", src: "reconnect", auto: false, run: { name: "Wreload[reject]", steps: RELOAD, depth: D(8), maxStates: 300000 } },
  { name: "S[reconnect]", policy: "reject", src: "reconnect", auto: false, run: { name: "S[reconnect]", steps: S_STEPS, depth: D(4), maxStates: 200000 } },
  { name: "S[plain]", policy: "reject", src: "plain", auto: false, run: { name: "S[plain]", steps: S_STEPS, depth: D(4), maxStates: 200000 } },
  { name: "S[callback]", policy: "reject", src: "callback", auto: false, run: { name: "S[callback]", steps: S_STEPS, depth: D(4), maxStates: 200000 } },
  { name: "S[suite,reconnect]", suite: true, policy: "reject", src: "reconnect", auto: false, run: { name: "S[suite,reconnect]", steps: [...S_STEPS, ...SUITE_EXTRA], depth: D(4), maxStates: 200000 } },
  { name: "S[suite,callback]", suite: true, policy: "reject", src: "callback", auto: false, run: { name: "S[suite,callback]", steps: [...S_STEPS, ...SUITE_EXTRA], depth: D(4), maxStates: 200000 } },
  { name: "Eq[auto]", policy: "reject", src: "reconnect", auto: true, run: { name: "Eq[auto]", steps: EQ, depth: D(7), maxStates: 100000, root: -1 } },
  { name: "WS[reject,reconnect]", policy: "reject", src: "reconnect", auto: false, run: { name: "WS[reject,reconnect]", steps: ALL, depth: D(4), maxStates: 50000 } },
];

const only = env("ONLY");
const suiteCells = new Set<string>(), allCells = new Set<string>(), allErrors = new Set<string>(), results: Res[] = [];
let totalMs = 0;
for (const cfg of CONFIGS) {
  if (only && !cfg.name.startsWith(only)) continue;
  OPT.suite = !!cfg.suite; OPT.policy = cfg.policy; OPT.src = cfg.src; OPT.auto = cfg.auto;
  const r = explore(cfg.run); results.push(r); totalMs += r.ms;
  console.log(`RUN ${r.name} states=${r.states} depth=${r.depth} ${r.capped ? "(bounded by depth/state cap)" : "(fixpoint)"} transitions=${r.transitions} ${r.ms} ms`);
  for (const c of r.cells) (cfg.suite ? suiteCells : allCells).add(c);
  for (const e of r.errors) allErrors.add(e);
}
for (const [k, t] of errTr) console.log(`INFO StoryTurnLimit in ${k}: ${t.join(" ; ")}`);
const hosts = [true, false].map(exploreHost);
for (const h of hosts) { for (const c of h.cells) allCells.add(c); for (const e of h.errors) allErrors.add(e); }
console.log(`RUN Host[resumable,plain] states=${hosts[0]!.states},${hosts[1]!.states}`);

// ---- results ----------------------------------------------------------------------------------------------------------------------
const CHECKS: [string, string][] = [["1-determinism", "1 determinism (same step, same state, unordered collections scanned both ways)"], ["2-settling", "2 settling (nothing runnable after any step)"], ["3-injected", "3 no injected endings (T2)"],
  ["4-cannot-cell-fired", "4a a 'cannot occur' cell fires"], ["5-deadlock", "5 no deadlocks (every state reaches a quiet state)"]];
const failRows: [string, string, string[]][] = [];
for (const [id, title] of CHECKS) {
  const bad = results.filter((r) => r.fails.has(id));
  console.log(`RESULT ${id} ${bad.length ? "FAIL" : "PASS"} ${title}`);
  for (const r of bad) { const t = r.fails.get(id)!; console.log(`   counterexample in ${r.name} (${t.length} steps): ${t.join(" ; ")}`); failRows.push([id, r.name, t]); FAILPAIRS.push(`FAILPAIR ${id} | ${r.name} | ${t.join(" ; ")}`); }
}
const conf = new Set<string>(); for (const r of results) for (const k of r.fails.keys()) if (k.startsWith("6-")) conf.add(k);
for (const k of [...conf].sort()) { const r = results.find((x) => x.fails.has(k))!; const t = r.fails.get(k)!; console.log(`RESULT ${k} FAIL`); console.log(`   counterexample in ${r.name} (${t.length} steps): ${t.join(" ; ")}`); FAILPAIRS.push(`FAILPAIR ${k} | ${r.name} | ${t.join(" ; ")}`); }
for (const h of hosts) for (const f of h.fails) { console.log("RESULT host FAIL " + f); FAILPAIRS.push("FAILPAIR host | Host | " + f); }
if (!conf.size) console.log("RESULT 6-conformance PASS (no table-level violation: Lost never served, rank order, suspended tab silent, no late restore of an ended Attempt)");

const groups: [string, string[]][] = [["write lane (2.7.13 holding table)", laneCells()], ["3.2 request on the wire", WIRE_CELLS], ["3.6 write at Fake.storage", STO_CELLS], ["3.3 connection", CONN_CELLS], ["3.4 stand-in host", HOST_CELLS],
  ["write progress (M6 3.5)", PROG_CELLS], ["Feed.callback queue (M6 3.3)", CB_CELLS], ["Feed.reconnect (M6 3.4)", RECON_CELLS], ["stream session (M6 3.1)", SESS_CELLS]];
let missTotal = 0;
for (const [g, list] of groups) {
  const miss = list.filter((c) => !allCells.has(c)), suiteOnly = miss.filter((c) => suiteCells.has(c)), expected = g.startsWith("write lane") ? miss.filter((c) => c.includes("runtimeDisposal")) : [];
  const bad = miss.filter((c) => !suiteOnly.includes(c) && !expected.includes(c)); missTotal += bad.length;
  console.log(`RESULT 4-reachability ${bad.length ? "MISSING" : "PASS"} ${g}: ${list.length - miss.length}/${list.length} reached by app Stories${suiteOnly.length ? "; suite-only (policy suite adapter): " + suiteOnly.join(", ") : ""}${expected.length ? "; by design (T2): " + expected.join(", ") : ""}${bad.length ? "; UNREACHABLE: " + bad.join(", ") : ""}`);
  if (bad.length) FAILPAIRS.push(`FAILPAIR 4-reachability | ${g} | ${bad.join(", ")}`);
}
const stray = [...allCells, ...suiteCells].filter((c) => !groups.some(([, l]) => l.includes(c)) && !c.startsWith("W|"));
const wstray = [...allCells].filter((c) => c.startsWith("W|") && !laneCells().includes(c));
console.log(`INFO cells outside the target lists: ${[...stray, ...wstray].join(", ") || "none"}`);
const errMiss = ERRORS.filter((e) => !allErrors.has(e));
console.log(`INFO errors reached: ${[...allErrors].sort().join(", ")}`);
console.log(`INFO errors not reached by the alphabet: ${errMiss.join(", ") || "none"}`);
if (errMiss.includes("NoDeadline") || errMiss.includes("NothingHeld") || errMiss.includes("InvalidDuration")) FAILPAIRS.push("FAILPAIR 4-reachability | errors | " + errMiss.join(", "));
console.log(`INFO total search time ${(totalMs / 1000).toFixed(1)} s, ${results.reduce((a, r) => a + r.states, 0)} states`);
for (const f of FAILPAIRS) console.log(f);
