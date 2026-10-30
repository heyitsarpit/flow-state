// Model checker for the write lane of operations-in-definition/proposal.md rev 9, 3.8.1.
// Types: `tsc -p .`   Run: bun main.ts   (MODES=reject,latest to restrict, ACK=attempt for the per-Attempt ack reading)
import {
  A, CANNOT, CONFIG, FLAGS, LSTATES, MODES, ROWS, VISITED, checkState, clone, commitsIn, doAck, doAckRefused, doDispose, doInvoke, doLand, doReload,
  doStart, endingTurn, holds, init, laneSt, newCtx, runTurn, turnEnd,
} from "./model.ts";
import type { Ctx, EndKind, Mode, S, Spec, Viol } from "./model.ts";
import { audit } from "./audit.ts";

declare const process: any;
declare const performance: any;
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

const mk = (label: string, guard: Spec["guard"], acts: Spec["acts"], outcome: Spec["outcome"] = "ok"): Spec => ({ label, guard, acts, outcome });
const USER: Spec[] = [
  mk("commit", "none", ["commit"]), mk("commit/Denied", "none", ["commit"], "Denied"), mk("commit/Unhandled", "none", ["commit"], "Unhandled"),
  mk("commit/InvalidTurn", "none", ["commit"], "InvalidTurn"), mk("retry", "none", ["retry"]), mk("cancel", "none", ["cancel"]),
  mk("cancel;cancel", "none", ["cancel", "cancel"]), mk("commit;commit", "none", ["commit", "commit"]), mk("commit;cancel", "none", ["commit", "cancel"]),
  mk("cancel;commit", "none", ["cancel", "commit"]), mk("retry;cancel", "none", ["retry", "cancel"]), mk("idle?commit", "idle", ["commit"]),
  mk("retryable?retry", "retryable", ["retry"]),
];
const USER_R = USER.filter((u) => ["commit", "commit/Denied", "retry", "cancel", "cancel;cancel", "commit;commit"].includes(u.label));
const HS: Spec[] = [
  mk("h:none", "none", []), mk("h:retry", "none", ["retry"]), mk("h:cancel", "none", ["cancel"]), mk("h:cancel;cancel", "none", ["cancel", "cancel"]),
  mk("h:commit", "none", ["commit"]), mk("h:Denied(retry)", "none", ["retry"], "Denied"), mk("h:Unhandled(cancel)", "none", ["cancel"], "Unhandled"),
  mk("h:InvalidTurn(commit)", "none", ["commit"], "InvalidTurn"), mk("h:retryable?retry", "retryable", ["retry"]), mk("h:idle?commit", "idle", ["commit"]),
];
const HS_R = HS.filter((h) => ["h:none", "h:retry", "h:cancel"].includes(h.label));

export interface Ev { label: string; run: (s: S, c: Ctx) => void }
function events(s: S, reduced: boolean): Ev[] {
  const out: Ev[] = [];
  const left = CONFIG.maxCommits - s.commits;
  const hs = (reduced ? HS_R : HS).filter((h) => commitsIn(h.acts) <= left);
  const users = (reduced ? USER_R : USER).filter((u) => commitsIn(u.acts) <= left && (s.mode !== "allow" || (!u.acts.includes("retry") && !u.acts.includes("cancel") && u.guard !== "retryable")));
  if (s.bound) for (const u of users) out.push({ label: u.label, run: (x, c) => runTurn(x, c, u) });
  for (const a of s.atts) {
    const id = a.id;
    if (a.status === "waiting" && !a.acked) {
      out.push({ label: `ack(${id})`, run: (x) => doAck(x, id) });
      out.push({ label: `ack-refused(${id})`, run: (x, c) => doAckRefused(x, c, id) });
    }
    if (a.status === "waiting" && a.acked && !a.noInvoke) out.push({ label: `invoke(${id})`, run: (x, c) => doInvoke(x, c, id) });
    if (a.status === "wire") {
      const kinds: EndKind[] = [];
      if (s.applied.includes(id)) kinds.push("success");
      if (s.refused.includes(id)) kinds.push("failure");
      kinds.push("unknown", "interrupt");
      for (const k of kinds) {
        const withHandler = s.bound && (s.mode === "allow" ? s.out.includes(id) : s.head === id);
        for (const h of withHandler ? hs : [HS[0]!])
          out.push({ label: `end-${k}(${id})${withHandler ? "/" + h.label : " [evidence]"}`, run: (x, c) => endingTurn(x, c, id, k, h) });
      }
    }
  }
  for (const id of [...new Set(s.net)]) {
    out.push({ label: `land(${id})`, run: (x) => doLand(x, id, false) });
    if (!s.applied.includes(id) && !s.refused.includes(id)) out.push({ label: `land-refuse(${id})`, run: (x) => doLand(x, id, true) });
  }
  if (s.bound) out.push({ label: "dispose", run: (x, c) => doDispose(x, c) });
  const delivering = (x: S) => holds(x.mode) && laneSt(x) === "Held";
  if (!s.bound) {
    if (delivering(s)) for (const h of hs) out.push({ label: `start/Restored/${h.label}`, run: (x, c) => { const id = doStart(x, c); runTurn(x, c, h, () => id); } });
    else out.push({ label: "start", run: (x, c) => { doStart(x, c); } });
  }
  const reloadDelivers = !!s.bound && (s.mode !== "allow") && ((s.mode === "cancel" ? false : false) || laneSt(s) === "InFlight");
  if (reloadDelivers) for (const h of hs) out.push({ label: `reload/${h.label}`, run: (x, c) => { const id = doReload(x, c); if (id) runTurn(x, c, h, () => id); else turnEnd(x); } });
  else out.push({ label: "reload", run: (x, c) => { doReload(x, c); turnEnd(x); } });
  return out;
}

// ---- drain: a benign continuation used by invariant 3 -----------------------------------------------
function drain(s0: S): { s: S; v: Viol[] } {
  const s = clone(s0), c = newCtx();
  FLAGS.cap = false;
  try {
    for (let i = 0; i < 120; i++) {
      if (!s.bound) { const id = doStart(s, c); if (id) runTurn(s, c, HS[0]!, () => id); continue; }
      const h = s.head ? A(s, s.head) : undefined;
      if (h && h.status === "waiting" && !h.noInvoke) { if (!h.acked) doAck(s, h.id); doInvoke(s, c, h.id); continue; }
      if (s.net.length) { doLand(s, Math.min(...s.net), false); continue; }
      if (h && h.status === "wire") { endingTurn(s, c, h.id, s.applied.includes(h.id) ? "success" : s.refused.includes(h.id) ? "failure" : "unknown", HS[0]!); continue; }
      if (h && h.status === "unknown" && s.st === "Held") { runTurn(s, c, mk("drain-retry", "none", ["retry"])); continue; }
      break;
    }
  } finally { FLAGS.cap = true; }
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
  [s.commits, s.st, s.head, s.W.join(","), s.out.join(","), s.old.join(","), s.bound ? 1 : 0, s.srvVal, s.applied.join(","), s.refused.join(","), [...s.net].sort().join(","),
    s.atts.map((a) => [a.status, +a.everSent, +a.acked, +a.ackedEver, a.sends, a.resends, +a.interrupting, +a.cancelled, +a.noInvoke, +a.evid, a.why].join("")).join("|")].join(";");

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
const TAGS = ["inv1", "inv2", "inv3", "inv3-limit-landed", "inv3-limit-stale", "inv4", "inv5"];

function reading(label: string, ackPerSend: boolean, modes: Mode[]) {
  CONFIG.ackPerSend = ackPerSend;
  console.log(`\n######## reading: ${label}\nconfig: ${JSON.stringify(CONFIG)}  depthBound=${BOUND}`);
  for (const mode of modes) {
    CONFIG.maxCommits = env("COMMITS") ? Number(env("COMMITS")) : holds(mode) ? 3 : 2; // cancel and allow: 2 commits (their state space is far larger; they are informational for invariant 3)
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
  reading("literal: every (re-)send needs its own storage acknowledgement (needed for the storage-refused re-send cell)", true, only);
  reading("per-Attempt: acknowledged is per Attempt and sticky (R6 L2; the restore row's wording)", false, only.filter(holds));
  if (env("QUICK")) return;
  console.log("\n=== raw enumeration of every event sequence (reduced alphabet, no state merging) vs merged search on the same alphabet");
  CONFIG.ackPerSend = false;
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
  console.log("\n=== UnresolvedHold audit (invariant 6, second half)");
  audit();
}
main();
