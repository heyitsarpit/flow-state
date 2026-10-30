// Two actor identities on one contract and key (OD20 K21): lane identity is (actor identity, contract id, key).
// Two lanes share one server value. Each lane is driven by the single-lane engine through a view.
// Checks: the per-lane invariants (1, 2, 4, 5, 7, 9), plus
//   inv 11: a lane's endings and unknown { Restored } reach only an incarnation of its own identity;
//   inv 12: a turn of identity k's incarnation never changes an Attempt of another identity.
// With RULES.identityScoped = false the two identities share one lane (revision 9: lane per contract id and key).
import { CONFIG, RULES, checkState, doDispose, doLand, doReload, doStart, newCtx, prepRestore, runTurn, turnEnd } from "./model.ts";
import type { Ctx, Mode, S, Viol } from "./model.ts";
import { HS_R, USER_R, events } from "./events.ts";

interface Lane { head: number; st: S["st"]; W: number[]; out: number[]; old: number[]; commits: number; told: boolean }
interface Sys { mode: Mode; lanes: Lane[]; live: boolean[]; atts: S["atts"]; ident: number[]; net: number[]; applied: number[]; refused: number[]; srvVal: number }

const mkSys = (mode: Mode): Sys => ({ mode, lanes: [0, 1].map(() => ({ head: 0, st: "Idle", W: [], out: [], old: [], commits: 0, told: false })), live: [true, true], atts: [], ident: [], net: [], applied: [], refused: [], srvVal: 0 });
const cloneSys = (s: Sys): Sys => ({
  ...s, lanes: s.lanes.map((l) => ({ ...l, W: [...l.W], out: [...l.out], old: [...l.old] })), live: [...s.live], atts: s.atts.map((a) => ({ ...a })),
  ident: [...s.ident], net: [...s.net], applied: [...s.applied], refused: [...s.refused],
});
// The lane an identity's commits go to: its own (OD20), or the one shared lane (revision 9).
const laneOf = (k: number) => (RULES.identityScoped ? k : 0);
const boundOf = (s: Sys, lane: number) => (RULES.identityScoped ? s.live[lane]! : s.live[0]! || s.live[1]!);
function view(s: Sys, lane: number): S {
  const l = s.lanes[lane]!;
  return { mode: s.mode, commits: l.commits, atts: s.atts, head: l.head, st: l.st, W: l.W, out: l.out, old: l.old, bound: boundOf(s, lane), srvVal: s.srvVal, applied: s.applied, refused: s.refused, net: s.net, laneId: lane, told: l.told, disposed: false };
}
function back(s: Sys, lane: number, v: S) {
  const l = s.lanes[lane]!;
  l.head = v.head; l.st = v.st; l.W = v.W; l.out = v.out; l.old = v.old; l.commits = v.commits; l.told = v.told; s.srvVal = v.srvVal;
}
const key = (s: Sys) => JSON.stringify([s.lanes, s.live, s.atts.map((a) => [a.status, a.everSent, a.acked, a.ackedEver, a.sends, a.resends, a.interrupting, a.evid, a.lane]), s.ident, [...s.net].sort(), s.applied, s.refused, s.srvVal]);
const perLane = (l: string) => /^(ack|capture-refused|invoke|end-)/.test(l);

interface Step { label: string; run: (s: Sys, c: Ctx, bad: Viol[]) => void }
function steps(s: Sys): Step[] {
  const out: Step[] = [];
  // user turns of identity k's incarnation, on its lane
  for (const k of [0, 1]) {
    if (!s.live[k]) continue;
    const lane = laneOf(k);
    const v = view(s, lane);
    v.bound = true;
    for (const u of USER_R.filter((u) => u.acts.length === 1 && (u.acts[0] !== "commit" || v.commits < CONFIG.maxCommits)))
      out.push({
        label: `I${k + 1}:${u.label}`,
        run: (x, c, bad) => {
          const vv = view(x, lane); vv.bound = true;
          const before = x.atts.map((a) => a.status + a.interrupting);
          const n0 = x.atts.length;
          runTurn(vv, c, u); back(x, lane, vv);
          for (let i = n0; i < x.atts.length; i++) x.ident[i] = k;
          for (let i = 0; i < n0; i++) if (x.ident[i] !== k && x.atts[i]!.status + x.atts[i]!.interrupting !== before[i])
            bad.push({ tag: "inv12", msg: `a turn of identity ${k + 1}'s incarnation changed Attempt ${i + 1}, which belongs to identity ${(x.ident[i] ?? 0) + 1}` });
        },
      });
  }
  // runtime and server events, per lane, through the shared event alphabet
  for (const lane of [0, 1]) {
    const v = view(s, lane);
    for (const ev of events(v, true).filter((e) => perLane(e.label))) {
      out.push({
        label: `L${lane + 1}:${ev.label}`,
        run: (x, c, bad) => {
          const vv = view(x, lane);
          // an ending that finds no incarnation of its own identity is evidence; one delivered to another identity is a violation (inv 11)
          const m = /^end-\w+\((\d+)\)\//.exec(ev.label);
          if (m) {
            const id = Number(m[1]);
            const owner = x.ident[id - 1] ?? lane;
            if (vv.bound && !x.live[owner]) bad.push({ tag: "inv11", msg: `the ending of Attempt ${id} (identity ${owner + 1}) was delivered to an incarnation of identity ${(x.live[0] ? 0 : 1) + 1}` });
          }
          const n0 = x.atts.length;
          ev.run(vv, c); back(x, lane, vv);
          for (let i = n0; i < x.atts.length; i++) x.ident[i] = x.live[0] && !x.live[1] ? 0 : x.live[1] && !x.live[0] ? 1 : lane; // a handler's commit belongs to the incarnation running it
        },
      });
    }
  }
  for (const id of [...new Set(s.net)]) {
    out.push({ label: `land(${id})`, run: (x) => { const vv = view(x, 0); doLand(vv, id, false); x.srvVal = vv.srvVal; } });
    if (!s.applied.includes(id) && !s.refused.includes(id)) out.push({ label: `land-refuse(${id})`, run: (x) => { doLand(view(x, 0), id, true); } });
  }
  for (const k of [0, 1]) {
    if (s.live[k]) out.push({ label: `dispose I${k + 1}`, run: (x, c) => { x.live[k] = false; for (const lane of [0, 1]) if (!boundOf(x, lane)) { const vv = view(x, lane); vv.bound = true; doDispose(vv, c); back(x, lane, vv); } } });
    else
      for (const h of HS_R)
        out.push({
          label: `start I${k + 1}/${h.label}`,
          run: (x, c, bad) => {
            const lane = laneOf(k); // OD20: only its own identity's lane; revision 9: the lane of the contract and key
            const wasBound = boundOf(x, lane);
            x.live[k] = true;
            if (wasBound) return; // the lane already has a live incarnation (shared-lane reading)
            const vv = view(x, lane);
            vv.bound = false;
            const id = doStart(vv, c); vv.bound = true;
            if (id) {
              const owner = x.ident[id - 1] ?? lane;
              if (owner !== k) bad.push({ tag: "inv11", msg: `unknown { Restored } of identity ${owner + 1}'s Attempt ${id} was delivered to an incarnation of identity ${k + 1}` });
              runTurn(vv, c, h, () => id);
            }
            back(x, lane, vv);
          },
        });
  }
  out.push({
    label: "reload/h:none",
    run: (x, c, bad) => {
      for (const lane of [0, 1]) {
        const vv = view(x, lane); const ids = doReload(vv, c); if (!ids.length) turnEnd(vv);
        for (const id of ids) { const owner = x.ident[id - 1] ?? lane; if (!x.live[owner]) bad.push({ tag: "inv11", msg: `unknown { Restored } of identity ${owner + 1}'s Attempt ${id} was delivered to another identity` }); runTurn(vv, c, HS_R[0]!, () => { prepRestore(vv, id); return id; }); }
        back(x, lane, vv);
      }
    },
  });
  return out;
}

export function identity() {
  const configured = RULES.identityScoped;
  for (const scoped of [configured, !configured]) {
    RULES.identityScoped = scoped;
    const first = scoped === configured;
    for (const mode of ["reject", "latest"] as Mode[]) {
      const saved = CONFIG.maxCommits; CONFIG.maxCommits = 1;
      const t0 = Date.now();
      const ids = new Map<string, number>(); const states: (Sys | null)[] = []; const parent: number[] = []; const via: string[] = [];
      const found = new Map<string, { path: string[]; msg: string }>();
      const pathOf = (i: number) => { const p: string[] = []; for (let x = i; parent[x]! >= 0; x = parent[x]!) p.push(via[x]!); return p.reverse(); };
      const add = (s: Sys, p: number, ev: string) => {
        const k = key(s); if (ids.has(k)) return; ids.set(k, states.length); states.push(s); parent.push(p); via.push(ev);
        for (const lane of [0, 1]) for (const v of checkState(view(s, lane))) { const kk = v.tag + "|" + v.msg.replace(/\d+/g, "#").slice(0, 50); if (!found.has(kk)) found.set(kk, { path: pathOf(states.length - 1), msg: v.msg }); }
      };
      add(mkSys(mode), -1, "");
      for (let i = 0; i < states.length; i++) {
        const s = states[i]!; states[i] = null;
        for (const st of steps(s)) {
          const x = cloneSys(s), c = newCtx(), bad: Viol[] = [];
          st.run(x, c, bad);
          if (c.produced !== c.handled) bad.push({ tag: "inv1", msg: `ending dropped: produced ${c.produced} handled ${c.handled}` });
          for (const v of [...c.viol, ...bad]) { const kk = v.tag + "|" + v.msg.replace(/\d+/g, "#").slice(0, 50); if (!found.has(kk)) found.set(kk, { path: [...pathOf(i), st.label], msg: v.msg }); }
          add(x, i, st.label);
        }
      }
      const tags = new Set([...found.keys()].map((k) => k.split("|")[0]));
      console.log(`${first ? "" : "INFO (the other reading) "}identity lanes ${scoped ? "per (identity, contract, key): revision 10" : "per (contract, key): revision 9"}, ${mode}, ${states.length} states, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      for (const t of ["inv1", "inv2", "inv4", "inv5", "inv7", "inv9", "inv11", "inv12"]) console.log(`${first ? "RESULT" : "INFO"} mode=identity-${mode} ${t} ${tags.has(t) ? "FAIL" : "PASS"}`);
      const seen = new Set<string>();
      for (const [k, f] of [...found.entries()].sort((a, b) => a[1].path.length - b[1].path.length)) { const t = k.split("|")[0]!; if (seen.has(t)) continue; seen.add(t); console.log(`  ${t} counterexample (${f.path.length} events): ${f.path.join(" -> ")}\n    ${f.msg}`); }
      CONFIG.maxCommits = saved;
    }
  }
  RULES.identityScoped = configured;
}
