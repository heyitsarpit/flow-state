// Invariant 6, second half: UnresolvedHold (3.8.1 "UnresolvedHold over the graph") as written, against the lane model.
// A tiny machine (two leaves S0, S1; one user event `e` per leaf; one `unknown` handler) is run in product with the lane.
// "Actually stuck" = a reachable product state from which no sequence of machine transitions and environment events reaches an Idle lane.
import { CONFIG, A, clone, commitsIn, doAck, doAckRefused, doCaptureRefused, doDispose, doInvoke, doLand, doReload, doStart, endingTurn, init, laneSt, newCtx, prepRestore, runTurn, turnEnd, holds } from "./model.ts";
import type { Act, Guard, Mode, S } from "./model.ts";

type Tr = { g: Guard; a: "none" | Act; to: 0 | 1 } | null;
interface M { t: [Tr, Tr]; hU: Tr }
const GS: Guard[] = ["none", "idle", "retryable"];
const AS: ("none" | Act)[] = ["none", "retry", "cancel", "commit"];
const key = (g: Guard, a: string) => `${g}:${a}`;
const SPECS = GS.flatMap((g) => AS.map((a) => ({ g, a })));
const specOf = (g: Guard, a: "none" | Act) => ({ label: key(g, a), guard: g, acts: a === "none" ? [] : [a], outcome: "ok" as const });

interface Edge { kind: "plain" | "user" | "end" | "start" | "reload" | "dispose"; spec: string; to: number; denied: boolean; what: string; from: number }
interface Lane { nodes: S[]; edges: Edge[][]; good: boolean[] }
const nk = (s: S) => JSON.stringify([s.commits, s.st, s.head, s.told, s.disposed, s.W, s.bound, s.srvVal, s.applied, s.refused, [...s.net].sort(), s.atts.map((a) => [a.status, a.everSent, a.acked, a.ackedEver, a.sends, a.resends, a.interrupting, a.evid])]);

function buildLane(mode: Mode): Lane {
  const nodes: S[] = [], edges: Edge[][] = [], ids = new Map<string, number>();
  const add = (s: S) => { const k = nk(s); let i = ids.get(k); if (i === undefined) { i = nodes.length; ids.set(k, i); nodes.push(s); } return i; };
  add(init(mode));
  for (let n = 0; n < nodes.length; n++) {
    const s = nodes[n]!, es: Edge[] = [];
    const push = (kind: Edge["kind"], spec: string, f: (x: S, c: ReturnType<typeof newCtx>) => string | void, what = kind as string) => {
      const x = clone(s), c = newCtx(); const o = f(x, c);
      es.push({ kind, spec, to: add(x), denied: o === "Denied", what, from: n });
    };
    // A commit past the budget is a no-op on the lane (the machine still moves); only the guard is evaluated.
    const fit = (sp: { g: Guard; a: "none" | Act }) => { const spec = specOf(sp.g, sp.a); return commitsIn(spec.acts) <= left ? spec : { ...spec, acts: [] as Act[] }; };
    const specRun = (sp: { g: Guard; a: "none" | Act }, x: S, c: ReturnType<typeof newCtx>, pre?: () => number) => {
      const spec = specOf(sp.g, sp.a);
      return runTurn(x, c, commitsIn(spec.acts) <= left ? spec : { ...spec, acts: [] }, pre);
    };
    const left = CONFIG.maxCommits - s.commits;
    if (s.bound) for (const sp of SPECS) push("user", key(sp.g, sp.a), (x, c) => specRun(sp, x, c));
    for (const a of s.atts) {
      const id = a.id;
      if (a.status === "waiting" && !a.acked) { push("plain", "", (x) => doAck(x, id)); push("plain", "", (x, c) => doAckRefused(x, c, id), "ack-refused (first send)"); }
      if (a.status === "waiting" && a.everSent) { // a refused re-send re-delivers the mapped unknown (OD20 F5)
        if (s.bound) for (const sp of SPECS) push("end", key(sp.g, sp.a), (x, c) => { const d = doCaptureRefused(x, c, id); return d ? runTurn(x, c, fit(sp), () => d) : (turnEnd(x), undefined); }, "capture-refused (re-send, delivers unknown)");
        else push("plain", "", (x, c) => { doCaptureRefused(x, c, id); turnEnd(x); }, "capture-refused (re-send, no actor)");
      }
      if (a.status === "waiting" && a.acked) push("plain", "", (x, c) => doInvoke(x, c, id));
      if (a.status === "wire") {
        const handler = s.bound && s.head === id;
        const kinds = [...(s.applied.includes(id) ? ["success"] : []), ...(s.refused.includes(id) ? ["failure"] : []), "unknown", "interrupt"] as ("success" | "failure" | "unknown" | "interrupt")[];
        for (const k of kinds) {
          if (handler && (k === "unknown" || k === "interrupt")) for (const sp of SPECS) push("end", key(sp.g, sp.a), (x, c) => endingTurn(x, c, id, k, fit(sp)) as string, `end-${k} (bound)`);
          else push("plain", "", (x, c) => { endingTurn(x, c, id, k, specOf("none", "none")); }, `end-${k}${s.bound ? "" : " (no actor)"}`);
        }
      }
    }
    for (const id of [...new Set(s.net)]) { push("plain", "", (x) => doLand(x, id, false)); if (!s.applied.includes(id) && !s.refused.includes(id)) push("plain", "", (x) => doLand(x, id, true)); }
    if (s.bound) push("dispose", "", (x, c) => doDispose(x, c));
    if (!s.bound) {
      if (holds(s.mode) && laneSt(s) === "Held") for (const sp of SPECS) push("start", key(sp.g, sp.a), (x, c) => { const id = doStart(x, c); return runTurn(x, c, fit(sp), () => id); }, "rebind (Held, delivers Restored)");
      else push("start", "", (x, c) => { doStart(x, c); }, "start (no hold to deliver)");
    }
    if (s.bound && laneSt(s) !== "Idle") for (const sp of SPECS) push("reload", key(sp.g, sp.a), (x, c) => { const ids = doReload(x, c); if (!ids.length) { turnEnd(x); return undefined; } let o: string | undefined; for (const id of ids) o = runTurn(x, c, fit(sp), () => { prepRestore(x, id); return id; }); return o; }, `reload (${laneSt(s)}: delivers unknown { Restored })`);
    else push("reload", "", (x, c) => { doReload(x, c); turnEnd(x); }, "reload (no delivery)");
    edges.push(es);
  }
  return { nodes, edges, good: nodes.map((s) => laneSt(s) === "Idle" && s.W.length === 0 && s.out.length === 0) };
}

// Product of a machine with the lane. Returns the stuck reachable nodes (and parents for a path).
function product(L: Lane, m: M, wantPath: boolean) {
  const N = L.nodes.length;
  const seen = new Uint8Array(N * 2), par = wantPath ? new Int32Array(N * 2).fill(-1) : null;
  const parEv: string[] = [];
  const from: number[] = [], to: number[] = [];
  const hk = m.hU ? key(m.hU.g, m.hU.a) : key("none", "none");
  const stack = [0]; seen[0] = 1;
  // Host moves (dispose, start, reload) are explored, but are not counted as a way out: UnresolvedHold "needs no host knowledge" (rule 4).
  const go = (u: number, v: number, ev: string, host = false) => { if (!host) { from.push(u); to.push(v); } if (!seen[v]) { seen[v] = 1; if (par) { par[v] = u; parEv[v] = ev; } stack.push(v); } };
  for (let qi = 0; qi < stack.length; qi++) { // breadth-first: shortest paths
    const u = stack[qi]!, n = u >> 1, ms = (u & 1) as 0 | 1;
    for (const e of L.edges[n]!) {
      if (e.kind === "plain") go(u, e.to * 2 + ms, e.what);
      else if (e.kind === "dispose") go(u, e.to * 2 + ms, "dispose", true);
      else if (e.kind === "user") { const t = m.t[ms]; if (t && key(t.g, t.a) === e.spec) go(u, e.to * 2 + (e.denied ? ms : t.to), `e/${e.spec}`); }
      else if (e.kind === "end") { if (e.spec === hk) go(u, e.to * 2 + (m.hU && !e.denied ? m.hU.to : ms), `unknown->${hk}`); }
      else { // start / reload: a new actor of the machine starts in S0; a delivered unknown { Restored } meets the handler there
        if (e.spec === "") go(u, e.to * 2 + 0, e.kind, true);
        else if (e.spec === hk) go(u, e.to * 2 + (m.hU && !e.denied ? m.hU.to : 0), `${e.kind}+Restored->${hk}`, true);
      }
    }
  }
  const radj = new Map<number, number[]>();
  for (let i = 0; i < from.length; i++) { const l = radj.get(to[i]!); if (l) l.push(from[i]!); else radj.set(to[i]!, [from[i]!]); }
  const ok = new Uint8Array(N * 2), q: number[] = [];
  for (let u = 0; u < N * 2; u++) if (seen[u] && L.good[u >> 1]) { ok[u] = 1; q.push(u); }
  while (q.length) { const x = q.pop()!; for (const y of radj.get(x) ?? []) if (!ok[y]) { ok[y] = 1; q.push(y); } }
  let bad = -1;
  for (let u = 0; u < N * 2; u++) if (seen[u] && !ok[u] && L.nodes[u >> 1]!.bound) { bad = u; break; } // a lane with no actor awaits the host: not counted
  let path: string[] = [];
  if (bad >= 0 && par) { for (let x = bad; x > 0 && par[x]! >= 0; x = par[x]!) path.push(parEv[x]!); path = path.reverse().filter((p) => p !== "plain"); }
  return { stuck: bad >= 0, bad, path };
}

// The rule as written. Returns "pass" | "error" | "warning".
function rule(mode: Mode, m: M, terminal = true): "pass" | "error" | "warning" {
  const trans = (st: 0 | 1) => m.t[st];
  const isOwnerAct = (t: Tr) => !!t && (t.a === "retry" || t.a === "cancel");
  const anyMember = [m.t[0], m.t[1], m.hU].some(isOwnerAct);
  const reach = (from: 0 | 1, pass: (t: NonNullable<Tr>) => "block" | "owner" | "go") => {
    const vis = new Set<number>([from]), st: (0 | 1)[] = [from];
    let owner = false, commit = false;
    while (st.length) { const x = st.pop()!, t = trans(x); if (!t) continue; if (t.a === "commit") commit = true; const r = pass(t); if (r === "owner") owner = true; if (r === "go" && !vis.has(t.to)) { vis.add(t.to); st.push(t.to); } }
    return { owner, commit };
  };
  const searchOwner = (T: 0 | 1) => reach(T, (t) => (t.g === "idle" ? "block" : isOwnerAct(t) ? (t.g === "none" ? "owner" : "block") : "go"));
  const anyCommit = (T: 0 | 1) => reach(T, (t) => (t.a === "commit" ? "go" : "go")).commit; // plain reachability over every transition
  let worst: "pass" | "error" | "warning" = "pass";
  const leaves: (0 | 1)[] = m.t[0] && m.t[0].to === 1 ? [0, 1] : [0];
  for (const L of leaves) { // U can arrive in any reachable leaf; S0 is also the initial leaf
    const kept: (0 | 1)[] = [];
    if (!m.hU) kept.push(L);
    else {
      const b = m.hU;
      if (isOwnerAct(b) && b.g === "none") continue; // the handler itself retries or cancels: owned
      if (b.g !== "none") kept.push(L); // implicit "declined" branch: every alternative has a guard
      if (!(isOwnerAct(b) && b.g === "retryable") && !(isOwnerAct(b) && b.g === "idle")) kept.push(b.to); // a branch that keeps the hold
      else kept.push(b.to === L ? L : L); // INVENTED: a guarded retry/cancel in the handler keeps the hold only through its declined branch
    }
    for (const T of kept) {
      if (searchOwner(T).owner) continue;
      if (terminal && mode === "reject" && !anyCommit(T)) continue; // 5.1's LEFT
      const r = anyMember ? "warning" : "error";
      if (r === "error") worst = "error"; else if (worst === "pass") worst = "warning";
    }
  }
  return worst;
}

const dTr = (t: Tr) => (t ? `${t.g === "none" ? "" : t.g + "?"}${t.a}->S${t.to}` : "-");
const dM = (m: M) => `S0:{${dTr(m.t[0])}} S1:{${dTr(m.t[1])}} unknown:{${dTr(m.hU)}}`;
const cx = (m: M) => [m.t[0], m.t[1], m.hU].filter(Boolean).length;

export function audit() {
  const saved = { ...CONFIG };
  CONFIG.maxCommits = 2; CONFIG.resendCap = 1;
  const trs: Tr[] = [null];
  for (const g of GS) for (const a of AS) for (const to of [0, 1] as const) trs.push({ g, a, to });
  const machines: M[] = [];
  for (const t0 of trs) for (const t1 of trs) for (const hU of trs) {
    const leaves = new Set<number>([0]); if (t0) leaves.add(t0.to); if (t0 && t0.to === 1 && t1) leaves.add(t1.to);
    const reachable = [...leaves]; // S1 is reachable only through t0 -> S1
    if (reachable.some((l) => { const t = [t0, t1][l] as Tr; return t?.a === "commit" && t.g !== "retryable"; })) machines.push({ t: [t0, t1], hU });
  }
  for (const mode of ["reject", "latest", "serialize"] as Mode[]) {
    const t0 = Date.now();
    const L = buildLane(mode);
    let tp = 0, fp = 0, fn = 0, tn = 0; const ex = { fp: [] as M[], fn: [] as M[] }; const cause = new Map<string, M[]>();
    for (const m of machines) {
      const flagged = rule(mode, m) !== "pass", stuck = product(L, m, false).stuck;
      if (flagged && stuck) tp++; else if (flagged) { fp++; ex.fp.push(m); } else if (stuck) {
        fn++; ex.fn.push(m);
        const why = rule(mode, m, false) !== "pass" ? "reject's terminal pass (5.1 LEFT): the hold is left on purpose" : "other (unexpected)";
        cause.set(why, [...(cause.get(why) ?? []), m]);
      } else tn++;
    }
    console.log(`AUDIT mode=${mode} lane-nodes=${L.nodes.length} machines=${machines.length} stuck-and-flagged=${tp} flagged-but-never-stuck=${fp} stuck-but-not-flagged=${fn} neither=${tn} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    const show = (name: string, list: M[], n: number) => {
      list.sort((a, b) => cx(a) - cx(b));
      for (const m of list.slice(0, n)) {
        const p = product(L, m, true);
        const bad = p.bad >= 0 ? L.nodes[p.bad >> 1]! : null;
        console.log(`  ${name}: ${dM(m)}${bad ? `\n      stuck lane: ${laneSt(bad)} head=${bad.head ? A(bad, bad.head).status : "-"} W=${bad.W.length} bound=${bad.bound} via ${p.path.join(" , ") || "(start)"}` : ""}`);
      }
    };
    for (const [why, list] of cause) { console.log(`  FALSE NEGATIVES caused by ${why}: ${list.length}`); show("   e.g.", list, 2); }
    const into = new Map<string, number>();
    for (const es of L.edges) for (const e of es) if (laneSt(L.nodes[e.from]!) !== "Held" && laneSt(L.nodes[e.to]!) === "Held") into.set(e.what, (into.get(e.what) ?? 0) + 1);
    console.log(`  transitions into Held, by cause: ${[...into].map(([k, v]) => `${k} x${v}`).join("; ")}`);
    show("FALSE POSITIVE (rule flags, never stuck)", ex.fp, 3);
  }
  Object.assign(CONFIG, saved);
}
