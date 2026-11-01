// Model checker for the write lane of operations-in-definition/proposal.md rev 10 (65f542fe), 3.8.1.
// Types: `tsc -p .`   Run: bun main.ts   (MODES=reject,latest to restrict; COMMITS, DEPTH, RAW, QUICK to tune)
import {
  A, CANNOT, CONFIG, LSTATES, MODES, ROWS, RULES, VISITED, checkState, clone, commitsIn, doAck, doAckRefused, doCaptureRefused, doDispose, doHydrate, doInvoke,
  doLand, doReload, doRuntimeDispose, doStart, endingTurn, holds, init, laneSt, newCtx, prepRestore, runTurn, turnEnd,
} from "./model.ts";
import type { Ctx, EndKind, Mode, S, Spec, Viol } from "./model.ts";
import { audit } from "./audit.ts";
import { HS, events, mk, restoreTurns } from "./events.ts";
import { identity } from "./identity.ts";
import { system } from "./system.ts";

declare const process: any;
declare const performance: any;
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

// ---- drain: a benign continuation used by invariant 3 -----------------------------------------------
function drain(s0: S): { s: S; v: Viol[] } {
  const s = clone(s0), c = newCtx();
  {
    for (let i = 0; i < 120; i++) {
      if (s.disposed) { restoreTurns(s, c, doReload(s, c), HS[0]!); continue; }
      if (!s.bound) { restoreTurns(s, c, doStart(s, c), HS[0]!); continue; }
      const h = s.head ? A(s, s.head) : undefined;
      if (h && h.status === "waiting" && !h.noInvoke) { if (!h.acked) doAck(s, h.id); doInvoke(s, c, h.id); continue; }
      if (s.net.length) { doLand(s, Math.min(...s.net), false); continue; }
      if (h && h.status === "wire") { endingTurn(s, c, h.id, s.applied.includes(h.id) ? "success" : s.refused.includes(h.id) ? "failure" : "unknown", HS[0]!); continue; }
      if (h && h.status === "unknown" && s.st === "Held") { runTurn(s, c, mk("drain-retry", "none", ["retry"])); continue; }
      break;
    }
  }
  return { s, v: c.viol };
}
function inv3(s0: S): Viol | null {
  const { s } = drain(s0);
  const elig = s.atts.filter((a) => !["notsent", "released", "failure"].includes(a.status));
  const expected = elig.length ? Math.max(...elig.map((a) => a.val)) : 0;
  if (s.srvVal === expected) return null;
  const tainted = s.atts.some((a) => a.status === "released" && s.applied.includes(a.id));
  const lastApplied = s.applied.length ? A(s, s.applied[s.applied.length - 1]!) : undefined;
  const stale = tainted && lastApplied?.status === "released" && expected > s.srvVal;
  return { tag: tainted ? (stale ? "inv3-limit-stale" : "inv3-limit-landed") : "inv3", msg: `server=${s.srvVal} expected(latest eligible commit)=${expected}; applied order=[${s.applied.map((i) => A(s, i).val)}]; Attempts ${s.atts.map((a) => `c${a.val}:${a.status}${a.why ? "/" + a.why : ""}`).join(" ")}` };
}

const keyOf = (s: S) =>
  [s.commits, s.st, s.head, +s.told, +s.disposed, s.W.join(","), s.out.join(","), s.old.join(","), s.bound ? 1 : 0, s.srvVal, s.applied.join(","), s.refused.join(","), [...s.net].sort().join(","),
    s.atts.map((a) => [a.status, +a.everSent, +a.acked, +a.ackedEver, a.sends, a.resends, +a.interrupting, +a.cancelled, +a.noInvoke, +a.evid, +a.captured, a.why].join("")).join("|")].join(";");

interface Found { depth: number; path: string[]; msg: string }
export interface Result {
  mode: Mode; states: number; edges: number; maxDepth: number; truncated: boolean; ms: number;
  found: Map<string, Found>; tagFirst: Map<string, Found>; stuck: Found[]; missing: string[]; unexpected: string[];
}
const norm = (m: string) => m.replace(/\d+/g, "#").slice(0, 60);

export function explore(mode: Mode, opts: { reduced: boolean; maxDepth: number; check3?: boolean }): Result {
  const t0 = performance.now();
  VISITED.clear();
  const check3 = opts.check3 ?? holds(mode);
  const ids = new Map<string, number>();
  const states: (S | null)[] = []; const goodArr: boolean[] = []; const stText: string[] = []; const parent: number[] = []; const via: string[] = []; const depth: number[] = [];
  const efrom: number[] = []; const eto: number[] = [];
  const found = new Map<string, Found>(); const tagFirst = new Map<string, Found>();
  const pathOf = (i: number) => { const p: string[] = []; for (let x = i; parent[x]! >= 0; x = parent[x]!) p.push(via[x]!); return p.reverse(); };
  const note = (v: Viol, i: number, last?: string, d?: number) => {
    const k = v.tag + "|" + norm(v.msg);
    if (found.has(k)) return;
    const path = pathOf(i); if (last) path.push(last);
    const f = { depth: path.length, path, msg: v.msg };
    found.set(k, f);
    if (!tagFirst.has(v.tag)) tagFirst.set(v.tag, f);
  };
  const add = (s: S, p: number, ev: string): number => {
    const k = keyOf(s);
    const have = ids.get(k);
    if (have !== undefined) return have;
    const id = states.length;
    ids.set(k, id); states.push(s); goodArr.push(laneSt(s) === "Idle" && s.W.length === 0 && s.out.length === 0); stText.push(`${laneSt(s)} head=${s.head}`); parent.push(p); via.push(ev); depth.push(p < 0 ? 0 : depth[p]! + 1);
    for (const v of checkState(s)) note(v, id);
    if (check3) { const v = inv3(s); if (v) note(v, id); }
    return id;
  };
  add(init(mode), -1, "");
  let truncated = false, edges = 0;
  for (let i = 0; i < states.length; i++) {
    if (depth[i]! >= opts.maxDepth) { truncated = true; continue; }
    const s = states[i]!;
    states[i] = null; // free the state once expanded
    for (const ev of events(s, opts.reduced)) {
      const s2 = clone(s), c = newCtx();
      ev.run(s2, c);
      if (c.produced !== c.handled) c.viol.push({ tag: "inv1", msg: `ending dropped: produced ${c.produced} handled ${c.handled}` });
      for (const a of s2.atts) if (a.everSent && a.status === "notsent") c.viol.push({ tag: "inv1", msg: `Attempt ${a.id} was sent but is recorded NotSent { ${a.why} }` });
      for (const v of c.viol) note(v, i, ev.label);
      const j = add(s2, i, ev.label);
      efrom.push(i); eto.push(j); edges++;
    }
  }
  // inv 6: every reachable state reaches Idle (only meaningful on a complete graph)
  const stuck: Found[] = [];
  if (!truncated) {
    const n = states.length;
    const good = goodArr;
    const radj: number[][] = Array.from({ length: n }, () => []);
    for (let e = 0; e < efrom.length; e++) radj[eto[e]!]!.push(efrom[e]!);
    const ok = new Array<boolean>(n).fill(false); const q: number[] = [];
    good.forEach((g, i) => { if (g) { ok[i] = true; q.push(i); } });
    while (q.length) { const x = q.pop()!; for (const y of radj[x]!) if (!ok[y]) { ok[y] = true; q.push(y); } }
    for (let i = 0; i < n && stuck.length < 3; i++) if (!ok[i]) stuck.push({ depth: depth[i]!, path: pathOf(i), msg: `cannot reach Idle: ${stText[i]}` });
  }
  // inv 7/8 on cells
  const missing: string[] = []; const unexpected: string[] = [];
  for (const r of ROWS) for (const st of LSTATES) {
    const cannot = !!CANNOT[r]?.includes(st);
    const seen = VISITED.has(`${mode}|${r}|${st}`);
    if (!cannot && !seen) missing.push(`${r} x ${st}`);
    if (cannot && seen) unexpected.push(`${r} x ${st}`);
  }
  return { mode, states: states.length, edges, maxDepth: depth.reduce((m, x) => Math.max(m, x), 0), truncated, ms: performance.now() - t0, found, tagFirst, stuck, missing, unexpected };
}

// raw enumeration of every sequence (no state merging), to cross-check the merged search
function enumerate(mode: Mode, D: number) {
  const tags = new Map<string, number>(); let seqs = 0;
  const go = (s: S, d: number) => {
    if (d === D) return;
    for (const ev of events(s, true)) {
      const s2 = clone(s), c = newCtx();
      ev.run(s2, c); seqs++;
      if (c.produced !== c.handled) c.viol.push({ tag: "inv1", msg: "" });
      for (const a of s2.atts) if (a.everSent && a.status === "notsent") c.viol.push({ tag: "inv1", msg: "" });
      for (const v of [...c.viol, ...checkState(s2)]) if (!tags.has(v.tag) || tags.get(v.tag)! > d + 1) tags.set(v.tag, d + 1);
      if (holds(mode)) { const v = inv3(s2); if (v && (!tags.has(v.tag) || tags.get(v.tag)! > d + 1)) tags.set(v.tag, d + 1); }
      go(s2, d + 1);
    }
  };
  go(init(mode), 0);
  return { seqs, tags };
}

export const BOUND = Number(env("DEPTH") ?? 200);
const RAW = Number(env("RAW") ?? 6);
const only = (env("MODES") ?? MODES.join(",")).split(",") as Mode[];
if (env("COMMITS")) CONFIG.maxCommits = Number(env("COMMITS"));
if (env("RESEND")) CONFIG.resendCap = Number(env("RESEND"));
const TAGS = ["inv1", "inv2", "inv3", "inv3-limit-landed", "inv3-limit-stale", "inv4", "inv5", "inv9"];

function reading(label: string, modes: Mode[], commits?: number) {
  console.log(`\n######## reading: ${label}\nconfig: ${JSON.stringify(CONFIG)}  depthBound=${BOUND}`);
  for (const mode of modes) {
    CONFIG.maxCommits = env("COMMITS") ? Number(env("COMMITS")) : commits ?? (mode === "latest" ? 3 : 2); // latest: 3 commits (a replaced W needs them); the others 2, to stay under a minute
    const r = explore(mode, { reduced: false, maxDepth: BOUND });
    console.log(`\n=== ${mode}: ${r.states} states, ${r.edges} transitions, longest shortest-path ${r.maxDepth}${r.truncated ? " (TRUNCATED at depth bound)" : " (complete: every sequence of any length is covered)"}, ${(r.ms / 1000).toFixed(1)}s`);
    for (const t of TAGS) {
      const fs = [...r.found.entries()].filter(([k]) => k.split("|")[0] === t);
      if (!fs.length) { console.log(`RESULT mode=${mode} ${t} PASS`); continue; }
      console.log(`RESULT mode=${mode} ${t} FAIL (${fs.length} distinct)`);
      fs.sort((a, b) => a[1].depth - b[1].depth);
      for (const [, f] of fs.slice(0, 3)) console.log(`  counterexample (${f.depth} events): ${f.path.join(" -> ")}\n    ${f.msg}`);
    }
    if (r.truncated) console.log(`RESULT mode=${mode} inv6 NOT-COMPUTED (graph truncated)`);
    else if (r.stuck.length) { console.log(`RESULT mode=${mode} inv6 FAIL`); for (const f of r.stuck) console.log(`  stuck (${f.depth} events): ${f.path.join(" -> ")}  ${f.msg}`); }
    else console.log(`RESULT mode=${mode} inv6 PASS (every reachable state reaches Idle)`);
    const i7 = [...r.found.entries()].filter(([k]) => k.startsWith("inv7|"));
    console.log(`RESULT mode=${mode} inv7 ${r.unexpected.length || i7.length ? "FAIL " + r.unexpected.join("; ") : "PASS (cannot-occur cells never reached)"}`);
    for (const [, f] of i7.slice(0, 3)) console.log(`  counterexample (${f.depth} events): ${f.path.join(" -> ")}\n    ${f.msg}`);
    const nreach = ROWS.length * LSTATES.length - ROWS.reduce((n, x) => n + (CANNOT[x]?.length ?? 0), 0);
    if (holds(mode)) console.log(`RESULT mode=${mode} inv8 ${r.missing.length ? "MISSING " + r.missing.join("; ") : "PASS (all " + nreach + " reachable cells visited)"}`);
    else console.log(`INFO mode=${mode} cells visited ${VISITED.size}/${nreach} of the holding table (cancel and allow use the HeldThisTurn table; an unknown is never held between turns); not visited: ${r.missing.join("; ") || "none"}`);
  }
}

function main() {
  console.log("invariants: 1 sent endings never dropped (and NotSent only for never-sent); 2 nothing newer sent past an older unresolved unknown (holding modes); 3 server ends at the latest commit not cancelled/NotSent/failed;");
  console.log("            4 no double send except same-id re-send; 5 pending/uncertain/waiting match their definitions; 6 every reachable state reaches Idle; 7 cannot-occur cells never reached; 8 reachable cells all visited");
  reading("revision 10 as written", only);
  if (!env("QUICK") || env("REV9")) {
    // the same model with revision 10's three fixes switched off: shows what F2, F3 and F5 each did
    Object.assign(RULES, { ackPerAttempt: false, restoreDeliversHeld: false, refusedResendDelivers: false });
    reading("revision 9 behaviour (F2 ack per send, F3 reload not delivered, F5 refused re-send silent), 2 commits", only.filter(holds), 2);
    Object.assign(RULES, { ackPerAttempt: true, restoreDeliversHeld: true, refusedResendDelivers: true });
  }
  console.log("\n=== two actor identities on one contract and key (identity.ts; scoped=true is revision 10, false is revision 9's lane per contract and key)");
  identity();
  console.log("\n=== the lane with the actor's saved record and the active leaf (system.ts; revision 11: OD21)");
  system();
  console.log("\n=== UnresolvedHold audit (invariant 15)");
  audit();
  if (env("QUICK")) return;
  console.log("\n=== raw enumeration of every event sequence (reduced alphabet, no state merging) vs merged search on the same alphabet");
  for (const mode of only) {
    const t0 = performance.now();
    const raw = enumerate(mode, RAW);
    const m = explore(mode, { reduced: true, maxDepth: RAW });
    const agree = [...raw.tags].every(([t, d]) => {
      const mm = [...m.found.entries()].filter(([k]) => k.split("|")[0] === t).map(([, f]) => f.depth);
      return mm.length > 0 && Math.min(...mm) === d;
    }) && [...m.tagFirst.keys()].every((t) => raw.tags.has(t));
    console.log(`RESULT mode=${mode} rawcheck sequences=${raw.seqs} depth=${RAW} tags={${[...raw.tags].map(([t, d]) => t + "@" + d)}} merged-search-agrees=${agree} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  }
}
main();
