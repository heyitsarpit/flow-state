// S1 throwaway: write lane (rule 21, 2.7.13) composed with the record queue (rules 28-31, 2.8.5, 2.8.6). Run: bun main.ts
// Input is already-compiled data: 2 actors, each one `latest` lane; 2 records; a commit predicts record mask 1|2|3.
// Not modelled: persistence ack/capture, basedOn rebase, marks, store predictions, late landing of a lost request,
// cancel on the wire (a no-op here), queue cap 64.
type St = "W" | "wait" | "wire" | "unk" | "rel" | "ok" | "fail" | "sup" | "can";
interface Att { a: number; m: number; st: St; sent: boolean; rets: number; rep: boolean; applied: boolean; sends: number; jb: boolean }
interface S { at: Att[]; q: number[][]; last: number[]; inv: number; unk: boolean; ov: boolean; td: boolean }
// Variants (queue-join rule). a: design tail-join. b1: review mint-order, only on-wire pinned (literal 3.1 code).
// b2: mint-order, on-wire and repair-held pinned. c: W commit joins only when promoted. d: a held entry keeps its place
// until resolved/released (TanStack scope shape). e: tail-join, but gate skips W entries ahead. f: retry passes own lane's W only.
type V = "a" | "b1" | "b2" | "c" | "d" | "e" | "f";
interface Cfg { v: V; retryDuringRepair: boolean; machine: "full" | "noOwner"; maxCommits: number; maxRets: number; cap: number; masks: number[]; timeout?: "wire" | "queue" | "hold" }
let MUT = "";
const recs = (m: number) => (m === 1 ? [0] : m === 2 ? [1] : [0, 1]);
const clone = (s: S): S => ({ at: s.at.map((x) => ({ ...x })), q: s.q.map((x) => x.slice()), last: s.last.slice(), inv: s.inv, unk: s.unk, ov: s.ov, td: s.td });
// Canonical key: finished attempts are dropped (they never act again); ids are kept only as ranks among live attempts,
// plus the ranks of the last-applied and max-ok ids per record, which is all the checks read. Same key => same future.
const dead = (x: Att) => x.st === "ok" || x.st === "fail" || x.st === "sup" || x.st === "can" || (x.st === "rel" && !x.rep);
function key(s: S): string {
  const live = s.at.map((x, i) => (dead(x) ? -1 : i)).filter((i) => i >= 0);
  const rk = (v: number) => (v < 0 ? -1 : live.filter((i) => i < v).length * 2 + (live.includes(v) ? 1 : 0));
  const mo = [0, 1].map((r) => Math.max(-1, ...s.at.map((x, i) => (x.st === "ok" && recs(x.m).includes(r) ? i : -1))));
  const at = live.map((i) => { const x = s.at[i]; return `${x.a}${x.m}${x.st}${+x.sent}${x.rets}${+x.rep}${+x.applied}${x.sends}${+x.jb}`; }).join(".");
  return at + "|" + s.q.map((q) => q.map((j) => live.indexOf(j)).join("")).join("/") + "|" + s.last.map(rk) + "|" + mo.map(rk) + "|" + s.at.length + s.at.some((x) => x.st === "rel") + "|" + s.inv + (s.unk ? "u" : "") + (s.ov ? "o" : "") + (s.td ? "t" : "");
}
const addr = (s: S, a: number) => s.at.findIndex((x) => x.a === a && (x.st === "wait" || x.st === "wire" || x.st === "unk"));
const wIdx = (s: S, a: number) => s.at.findIndex((x) => x.a === a && x.st === "W");

// rule 28 (commit, promote), rule 31 / E7 (retry joins), 2.8.6 review 3.1 (mint order)
function join(cfg: Cfg, s: S, i: number, kind: "commit" | "retry" | "promote") {
  const x = s.at[i];
  for (const r of recs(x.m)) {
    let q = s.q[r];
    if (q.includes(i)) continue;
    const mint = (cfg.v === "b1" || cfg.v === "b2") && MUT !== "tailInB";
    if (mint) {
      const pin = (j: number) => s.at[j].st === "wire" || (cfg.v === "b2" && s.at[j].rep);
      q = [...q.filter(pin), ...[...q.filter((j) => !pin(j)), i].sort((p, o) => p - o)];
    } else if (cfg.v === "f" && kind === "retry") {
      const p = q.findIndex((j) => s.at[j].a === x.a && s.at[j].st === "W");
      q = p < 0 ? [...q, i] : [...q.slice(0, p), i, ...q.slice(p)];
    } else q = [...q, i];
    s.q[r] = q;
    // N1: a retry placed ahead of another actor's never-sent write
    if (kind === "retry" && q.slice(q.indexOf(i) + 1).some((j) => s.at[j].a !== x.a && !s.at[j].sent)) s.ov = true;
  }
}
// 2.8.6 table "Queue release": ok/fail at settlement; unknown after the forced repair settles; Released withdraws.
const keep = (cfg: Cfg, x: Att) => (x.st === "W" || x.st === "wait" || x.st === "wire" ? true : x.st === "unk" ? x.rep || cfg.v === "d" : x.st === "rel" ? x.rep : false);
function refresh(cfg: Cfg, s: S) {
  // 2.7.13 Promotion: addressable resolved or released -> W's head becomes addressable, waiting to be invoked
  if (MUT !== "noPromote") for (const a of [0, 1]) if (addr(s, a) < 0) { const w = wIdx(s, a); if (w >= 0) { s.at[w].st = "wait"; if (cfg.v === "c") join(cfg, s, w, "promote"); } }
  for (const r of [0, 1]) s.q[r] = s.q[r].filter((j) => keep(cfg, s.at[j]));
}
// rule 28: invoked only once its lane promoted it and it heads every queue it joined; one write in flight per record.
function gate(cfg: Cfg, s: S, i: number): boolean {
  if (MUT === "ignoreGate") return true;
  for (const r of recs(s.at[i].m)) {
    const q = s.q[r], p = q.indexOf(i);
    if (p < 0) return false;
    for (let k = 0; k < p; k++) if (!(cfg.v === "e" && s.at[q[k]].st === "W")) return false;
    if (cfg.v === "e") for (const j of q) if (j !== i && (s.at[j].st === "wire" || s.at[j].rep)) return false;
  }
  return true;
}
interface Mv { k: string; l: string; s: S }
const mk = (cfg: Cfg, s: S, f: (t: S) => void): S => { const t = clone(s); f(t); refresh(cfg, t); return t; };
const apply = (t: S, i: number) => { const x = t.at[i]; if (x.applied) return; x.applied = true; for (const r of recs(x.m)) { if (t.last[r] > i) t.inv |= t.unk ? 2 : 1; t.last[r] = i; } };

function progress(cfg: Cfg, s: S, tmo = false): Mv[] { // runtime + environment moves: things that happen with no machine action
  const out: Mv[] = [];
  s.at.forEach((x, i) => {
    // Owner: Flow may have timeouts (rule 25 cancelled). "queue": a waiting-to-be-invoked Attempt that cannot head its queues is given up
    // like cancel-by-history; "hold": a retained unknown is released like cancel. "wire" adds nothing: a wire timeout is the existing unknown ending.
    if (tmo && cfg.timeout === "queue" && x.st === "wait" && !gate(cfg, s, i)) out.push({ k: "timeout", l: `TIMEOUT queue #${i}`, s: mk(cfg, s, (t) => { t.at[i].st = x.sent ? "rel" : "can"; if (!x.sent) t.td = true; }) });
    if (tmo && cfg.timeout === "hold" && x.st === "unk" && !x.rep) out.push({ k: "timeout", l: `TIMEOUT hold #${i}`, s: mk(cfg, s, (t) => { t.at[i].st = "rel"; }) });
    if (x.st === "wait" && gate(cfg, s, i)) out.push({ k: "invoke", l: `invoke#${i}`, s: mk(cfg, s, (t) => { t.at[i].st = "wire"; t.at[i].sent = true; t.at[i].sends++; }) });
    if (x.rep && MUT !== "noRepair") out.push({ k: "repair", l: `repair#${i}`, s: mk(cfg, s, (t) => { t.at[i].rep = false; }) });
    if (x.st !== "wire") return;
    out.push({ k: "end", l: `end#${i}:success`, s: mk(cfg, s, (t) => { apply(t, i); t.at[i].st = "ok"; t.at[i].rep = false; }) });
    if (!x.applied) out.push({ k: "end", l: `end#${i}:failure${x.rets > 0 ? "(StillUnknown)" : ""}`, s: mk(cfg, s, (t) => { if (x.rets > 0) { t.at[i].st = "unk"; t.at[i].rep = true; t.unk = true; } else t.at[i].st = "fail"; }) }); // rule 18
    for (const landed of x.applied ? [true] : [false, true]) out.push({ k: "end", l: `end#${i}:unknown${landed && !x.applied ? "(landed)" : ""}`, s: mk(cfg, s, (t) => { if (landed) apply(t, i); t.at[i].st = "unk"; t.at[i].rep = true; t.unk = true; }) }); // 2.8.6: forced repair
  });
  return out;
}
function machine(cfg: Cfg, s: S, which: "full" | "noOwner", maxC: number): Mv[] { // actions a machine may take: commit, retry, cancel
  const out: Mv[] = [];
  if (s.at.length < maxC) for (const a of [0, 1]) for (const m of cfg.masks) out.push({ k: "commit", l: `commit a${a} m${m}`, s: mk(cfg, s, (t) => { // 2.7.13 commit row, latest
    const x = addr(t, a), w = wIdx(t, a);
    const mine: Att = { a, m, st: "wait", sent: false, rets: 0, rep: false, applied: false, sends: 0, jb: false };
    if (x >= 0 && t.at[x].st === "wait" && !t.at[x].sent) { t.at[x].st = "sup"; t.at.push(mine); }       // replaces never-sent addressable (OD20 F4)
    else if (x >= 0) { if (w >= 0) t.at[w].st = "sup"; mine.st = "W"; t.at.push(mine); }                // becomes W; old W Superseded
    else t.at.push(mine);
    refresh(cfg, t);
    join(cfg, t, t.at.length - 1, "commit"); // rule 28: a W commit joins at commit (variant c defers)
    if (cfg.v === "c" && mine.st === "W") { for (const r of recs(m)) t.q[r] = t.q[r].filter((j) => j !== t.at.length - 1); }
  }) });
  if (which === "noOwner") return out;
  for (const a of [0, 1]) {
    const i = addr(s, a); if (i < 0) continue; const x = s.at[i];
    if (x.st === "unk" && x.rets < cfg.maxRets && (cfg.retryDuringRepair || !x.rep)) out.push({ k: "retry", l: `retry a${a}(#${i})`, s: mk(cfg, s, (t) => { t.at[i].st = "wait"; t.at[i].rets++; join(cfg, t, i, "retry"); }) }); // rule 31
    if (MUT === "doubleSend" && x.st === "wire") out.push({ k: "retry", l: `retry a${a} on wire`, s: mk(cfg, s, (t) => { t.at[i].sends++; }) });
    if (x.st === "unk") out.push({ k: "cancel", l: `cancel a${a}(#${i}) Held`, s: mk(cfg, s, (t) => { t.at[i].st = "rel"; }) });
    if (x.st === "wait") out.push({ k: "cancel", l: `cancel a${a}(#${i}) waiting`, s: mk(cfg, s, (t) => { t.at[i].st = x.sent ? "rel" : "can"; }) }); // 2.7.13 cancel row, by history
  }
  return out;
}
const waiters = (s: S) => s.at.some((x) => x.st === "W" || x.st === "wait");
const isStuck = (cfg: Cfg, s: S) => waiters(s) && progress(cfg, s).length === 0;

// Wait-for graph over Attempts. Edge kinds end in: cycle | orphan (waits on a lane with no addressable) | hold (ends at an unknown nobody has resolved).
function graphKind(cfg: Cfg, s: S): string {
  const edges = (i: number): (number | "HOLD" | "ORPHAN")[] => {
    const x = s.at[i], e: (number | "HOLD" | "ORPHAN")[] = [];
    if (x.st === "W") { const ad = addr(s, x.a); e.push(ad < 0 ? "ORPHAN" : ad); }
    if (x.st === "wait") for (const r of recs(x.m)) { const q = s.q[r], p = q.indexOf(i); for (let k = 0; k < p; k++) if (!(cfg.v === "e" && s.at[q[k]].st === "W")) e.push(q[k]); }
    if (x.st === "unk" && !x.rep) e.push("HOLD");
    return e;
  };
  const col = new Map<number, number>(); let sawO = false, sawH = false, cyc = false, cross = false;
  const dfs = (i: number) => { col.set(i, 1); for (const t of edges(i)) { if (t === "HOLD") sawH = true; else if (t === "ORPHAN") sawO = true; else { if (s.at[t].a !== s.at[i].a) cross = true; if (col.get(t) === 1) cyc = true; else if (!col.has(t)) dfs(t); } } col.set(i, 2); };
  s.at.forEach((x, i) => { if ((x.st === "W" || x.st === "wait") && !col.has(i)) dfs(i); });
  return cyc ? "cycle" : sawO ? "orphan" : sawH ? (cross ? "hold-x" : "hold") : "other";
}
// Which machine actions free a stuck state (any sequence up to 3, any commit budget +2)? Empty set: nothing frees it.
function freedBy(cfg: Cfg, s0: S): string {
  const res = new Set<string>(), mc = s0.at.length + 2;
  const freed = (s: S) => !waiters(s) || progress(cfg, s).length > 0; // timeouts excluded: they are tested separately
  const rec = (s: S, d: number, first: string) => { for (const m of machine(cfg, s, "full", mc)) { const f = first || m.k; if (freed(m.s)) res.add(f); else if (d < 3) rec(m.s, d + 1, f); } };
  rec(s0, 1, "");
  return res.size ? [...res].sort().join("+") : "NONE";
}

function invariants(s: S): string[] {
  const v: string[] = [];
  for (const r of [0, 1]) if (s.at.filter((x) => x.st === "wire" && recs(x.m).includes(r)).length > 1) v.push("S1 two on the wire for one record");
  if (s.at.some((x) => x.sends > x.rets + 1)) v.push("S2 double send");
  for (const x of s.at) if (x.st === "wire") for (const y of s.at) if (y !== x && y.rep && (x.m & y.m)) v.push("S3 sent while another write's repair pending (rule 30)");
  for (const a of [0, 1]) if (s.at.filter((x) => x.a === a && ["wait", "wire", "unk"].includes(x.st)).length > 1 || s.at.filter((x) => x.a === a && x.st === "W").length > 1) v.push("S4 lane shape");
  if (s.at.length && s.at.every((x) => ["ok", "fail", "sup", "can"].includes(x.st))) for (const r of [0, 1]) {
    const oks = s.at.map((x, i) => (x.st === "ok" && recs(x.m).includes(r) ? i : -1)).filter((i) => i >= 0);
    if (oks.length && s.last[r] !== Math.max(...oks)) v.push(s.unk ? "L1 last intent lost (after an unknown)" : "L1 last intent lost (no unknown anywhere)");
  }
  if (s.td) v.push("T1 timeout dropped a never-sent latest write");
  return [...new Set(v)];
}

interface Res { states: number; depth: number; capped: boolean; stuck: Map<string, { n: number; trace: string[] }>; viol: Map<string, { n: number; trace: string[] }>; inv: [number, number, number]; }
function explore(cfg: Cfg): Res {
  const init: S = { at: [], q: [[], []], last: [-1, -1], inv: 0, unk: false, ov: false, td: false };
  const seen = new Set<string>([key(init)]), par = [-1], lab = [""];
  let fr: [S, number][] = [[init, 0]], depth = 0, capped = false;
  const trace = (id: number) => { const t: string[] = []; for (; id > 0; id = par[id]) t.push(lab[id]); return t.reverse(); };
  const stuck: Res["stuck"] = new Map(), viol: Res["viol"] = new Map(); const inv: [number, number, number] = [0, 0, 0];
  const note = (m: Map<string, { n: number; trace: string[] }>, k: string, id: number) => { const e = m.get(k); if (e) e.n++; else m.set(k, { n: 1, trace: trace(id) }); };
  while (fr.length) {
    const nx: [S, number][] = [];
    for (const [s, id] of fr) {
      for (const v of invariants(s)) note(viol, v, id);
      if (s.inv & 1) inv[0]++; if (s.inv & 2) inv[1]++; if (s.ov) { inv[2]++; if (!viol.has("N1 retry placed ahead of another actor's unsent write")) note(viol, "N1 retry placed ahead of another actor's unsent write", id); }
      const pr = progress(cfg, s), prT = progress(cfg, s, true);
      if (waiters(s) && pr.length === 0) note(stuck, `${graphKind(cfg, s)} | freed by ${freedBy(cfg, s)}`, id);
      for (const m of [...prT, ...machine(cfg, s, cfg.machine, cfg.maxCommits)]) {
        const k = key(m.s); if (seen.has(k)) continue;
        if (seen.size >= cfg.cap) { capped = true; continue; }
        seen.add(k); par.push(id); lab.push(m.l); nx.push([m.s, par.length - 1]);
      }
    }
    fr = nx; depth++;
  }
  return { states: seen.size, depth, capped, stuck, viol, inv };
}

const VS: V[] = ["a", "b1", "b2", "c", "d", "e", "f"];
const cnt = (m: Map<string, { n: number }>, p: string) => [...m].filter(([k]) => k.startsWith(p)).reduce((a, [, e]) => a + e.n, 0);
const det = process.argv.includes("--detail");
// Two complete sweeps (state cap is a guard only; CAP in the output would mean the sweep was truncated).
const SWEEPS = [{ name: "3 commits, masks {1,2,3}", maxCommits: 3, masks: [1, 2, 3] }, { name: "4 commits, masks {1,2}", maxCommits: 4, masks: [1, 2] }];
const base = { maxRets: 1, cap: 500_000 };
const results = new Map<string, Res>();
for (const sw of SWEEPS) {
  console.log(`\n== sweep: ${sw.name}\nvariant readingRetryDuringRepair machine | states depth | stuck cycle/orphan/hold/hold-x(cross-actor)/other | safety S1 S2 S3 S4 | last-intent-lost clean/afterUnk | inversion states clean/afterUnk | N1 states`);
  for (const machineK of ["full", "noOwner"] as const) for (const rdr of [false, true]) for (const v of VS) {
    if (machineK === "noOwner" && (rdr || sw.maxCommits > 3)) continue; // retry is absent under noOwner, so the reading is moot
    const cfg: Cfg = { ...base, ...sw, v, retryDuringRepair: rdr, machine: machineK };
    const r = explore(cfg); (globalThis as any).Bun?.gc(true); results.set(`${sw.maxCommits}|${v}|${rdr}|${machineK}`, r);
    const sv = (p: string) => (cnt(r.viol, p) ? "X" : ".");
    console.log(`${v.padEnd(2)} ${rdr ? "y" : "n"} ${machineK.padEnd(7)} | ${r.states}${r.capped ? "+CAP" : ""} ${r.depth} | ${cnt(r.stuck, "cycle")}/${cnt(r.stuck, "orphan")}/${cnt(r.stuck, "hold |")}/${cnt(r.stuck, "hold-x")}/${cnt(r.stuck, "other")} | ${sv("S1")} ${sv("S2")} ${sv("S3")} ${sv("S4")} | ${cnt(r.viol, "L1 last intent lost (no")}/${cnt(r.viol, "L1 last intent lost (after")} | ${r.inv[0]}/${r.inv[1]} | ${r.inv[2]}`);
  }
}
console.log("\nShortest traces (reading n, full machine; --detail for every run). Holds are listed only by which actions free them.");
for (const [k, r] of results) {
  const [c, , rd, mc] = k.split("|");
  if (mc === "noOwner" && !det) continue;
  for (const [g, e] of [...r.stuck, ...r.viol]) { if (!det && g.startsWith("hold |")) continue; console.log(`[${c}c ${k.split("|")[1]} rdr=${rd[0]}] ${g} (n=${e.n}): ${e.trace.join(" ; ")}`); }
}

console.log("\nMutation sanity (3 commits, variant b2; each fault must be reported as a kind the clean run lacks):");
const mut = (m: string, expect: string) => {
  const clean = results.get("3|b2|false|full")!;
  MUT = m; const r = explore({ ...base, ...SWEEPS[0], v: "b2", retryDuringRepair: false, machine: "full" }); MUT = "";
  const had = (x: Res) => [...x.stuck.keys(), ...x.viol.keys()].some((k) => k.startsWith(expect));
  console.log(`${m.padEnd(11)} expects ${expect.padEnd(7)} clean-has-it=${had(clean)} mutant-has-it=${had(r)} -> ${had(r) && !had(clean) ? "CAUGHT" : "FAIL"}`);
};
mut("noPromote", "orphan"); mut("tailInB", "cycle"); mut("ignoreGate", "S1"); mut("doubleSend", "S2"); mut("noRepair", "other");

console.log("\nTimeouts (owner: rule 25 cancelled). 3 commits, masks {1,2,3}, reading n. stuck = no timeout-free progress; T1 = a timeout dropped the user's latest never-sent write.");
for (const v of ["a", "b2", "f"] as V[]) for (const t of [undefined, "wire", "queue", "hold"] as const) {
  const r = explore({ ...base, ...SWEEPS[0], v, retryDuringRepair: false, machine: "full", timeout: t }); (globalThis as any).Bun?.gc(true);
  console.log(`${v.padEnd(2)} timeout=${String(t).padEnd(9)} states=${r.states}${r.capped ? "+CAP" : ""} stuck cycle/orphan/hold/hold-x=${cnt(r.stuck, "cycle")}/${cnt(r.stuck, "orphan")}/${cnt(r.stuck, "hold |")}/${cnt(r.stuck, "hold-x")} T1=${cnt(r.viol, "T1")}${r.viol.get("T1 timeout dropped a never-sent latest write") ? " e.g. " + r.viol.get("T1 timeout dropped a never-sent latest write")!.trace.join(" ; ") : ""}`);
}
