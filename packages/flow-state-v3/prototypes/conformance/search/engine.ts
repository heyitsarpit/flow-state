// BFS over states (D32). A state is reached by replaying its script from `start`, so the search needs only Reads and
// survives a rewrite; `Reads.stateHash` is what makes depth exact: two scripts with one hash have one future. The hash
// is opaque text from the runtime and the fake, reduced to 64 bits by Bun.hash. Oracles run per edge and on each state, so
// no history is needed beyond what the hash carries.
import type { Harness, Step } from "../harness.ts";

// D131: `idle`: this action never changes the state hash, and why that is true. Otherwise an action no edge moved makes the verdict `vacuous`.
export type Action = { name: string; step: Step; on?: (h: Harness) => boolean; idle?: string };
export type Probe = (h: Harness, script: readonly string[]) => void;
export class Oracle extends Error {}

export type Report = {
  verdict: "completed" | "closed" | "inconclusive" | "failed" | "vacuous";
  deadActions?: readonly string[]; // D131: what no edge moved, and no `idle` excused
  perDepth: readonly number[]; // new states per depth
  states: number;
  edges: number;
  steps: number;
  depthCompleted: number;
  failure?: string;
  classes: Readonly<Record<string, { count: number; witness: string }>>;
};

// `onePre`: a state's script is replayed once as the parent of all its actions, not once per action. Sound when no guard (`on`) and no edge
// oracle writes to the parent (each reads only), which holds for every search here. Only for a search in a process of its own (search/run.ts):
// inside a case every harness made is tracked, checked and counted (RECIPIENTS), so the count of replays is part of what the case says.
export const engine = { onePre: false };
export const bfs = (o: {
  make: () => Harness;
  actions: readonly Action[];
  depth: number;
  maxStates: number;
  extra?: (script: readonly Action[]) => string; // search-level state that belongs in the key (a commit budget)
  edge: (pre: Harness, post: Harness, last: Action) => void; // pre is the parent replayed
  state: Probe; // on each new state
  drain?: (h: Harness, script: readonly string[], report: (cls: string) => void) => void; // on each new state, destroys h
}): Report => {
  let edges = 0;
  let steps = 0;
  const seen = new Set<bigint | number>();
  const perDepth: number[] = [];
  const classes: Record<string, { count: number; witness: string }> = {};
  const report = (s: readonly string[]) => (cls: string) => {
    const c = (classes[cls] ??= { count: 0, witness: s.join(" ") });
    c.count++;
    if (s.join(" ").length < c.witness.length) c.witness = s.join(" ");
  };
  const run = (script: readonly Action[]) => {
    const h = o.make();
    for (const a of script) {
      h.do(a.step);
      steps++;
    }
    return h;
  };
  const key = (h: Harness, s: readonly Action[]) =>
    Bun.hash(`${h.read.stateHash()}|${o.extra?.(s) ?? ""}`);
  // D131: `closed` means no new hash appeared, and that alone is what a dead runtime or a constant hash looks like. A verdict needs every action to have moved the state on some edge. A guard that never let it run counts the same.
  const moved = new Set<string>();
  const tried = new Set<string>(); // re-audit M4: an action the search ran, from at least one state
  const done = (v: Report["verdict"], depthCompleted: number, failure?: string): Report => {
    const dead = v === "failed" ? [] : o.actions.filter((a) => !moved.has(a.name) && a.idle === undefined).map((a) => a.name);
    // `closed` says the space is exhausted, so an action that never moved it must be named `idle`. A depth or a budget that ended first may simply not have reached an action: at least half must have moved, or nothing was searched.
    // Re-audit M4: and a budget is no excuse for an action that ran and never moved anything. Only one never reached may be unmoved, and only half of all.
    const ranDead = dead.filter((a) => tried.has(a));
    const verdict = v === "failed" ? v : (v === "closed" ? dead.length > 0 : ranDead.length > 0 || dead.length * 2 > o.actions.length) ? "vacuous" : v;
    return {
    verdict,
    ...(dead.length ? { deadActions: dead } : {}),
    perDepth,
    states: seen.size,
    edges,
    steps,
    depthCompleted,
    ...(failure ? { failure } : {}),
    classes,
    };
  };
  const names = (s: readonly Action[]) => s.map((a) => a.name);
  const finish = (h: Harness) => h.end?.();
  const out = () => seen.size >= o.maxStates;
  let frontier: Action[][] = [[]];
  let depthCompleted = 0;
  try {
    const root = run([]);
    seen.add(key(root, []));
    o.state(root, []);
    finish(root);
    perDepth.push(1);
    if (o.drain) {
      const h = run([]);
      o.drain(h, [], report([]));
      finish(h);
    }
    for (let d = 1; d <= o.depth; d++) {
      const next: Action[][] = [];
      for (const script of frontier) {
        let parent: Harness | undefined;
        let parentText: string | undefined;
        const endPre = (h: Harness) => {
          if (!engine.onePre) finish(h);
        };
        for (const a of o.actions) {
          if (out()) return done("inconclusive", depthCompleted);
          const pre = engine.onePre ? (parent ??= run(script)) : run(script);
          if (a.on && !a.on(pre)) {
            endPre(pre);
            continue;
          }
          tried.add(a.name);
          edges++;
          const s = [...script, a];
          const post = run(script);
          try {
            post.do(a.step);
            steps++;
            o.edge(pre, post, a);
          } catch (e) {
            if (e instanceof Error && !(e instanceof Oracle))
              throw new Oracle(`${e.message} on ${names(s).join(" ")}`);
            throw new Oracle(`${(e as Error).message} on ${names(s).join(" ")}`);
          }
          const k = key(post, s);
          const kp = engine.onePre ? Bun.hash(`${(parentText ??= pre.read.stateHash())}|${o.extra?.(s) ?? ""}`) : key(pre, s);
          if (kp !== k) moved.add(a.name);
          endPre(pre);
          if (seen.has(k)) {
            finish(post);
            continue;
          }
          seen.add(k);
          next.push(s);
          try {
            o.state(post, names(s));
            if (o.drain) o.drain(post, names(s), report(names(s)));
          } catch (e) {
            throw new Oracle(`${(e as Error).message} on ${names(s).join(" ")}`);
          }
          finish(post);
        }
        if (parent && parentText !== undefined && parent.read.stateHash() !== parentText) throw new Error(`a guard or an edge oracle wrote to the shared parent of ${names(script).join(" ") || "the root"}`);
        if (parent) finish(parent);
      }
      perDepth.push(next.length);
      depthCompleted = d;
      if (next.length === 0) return done("closed", d);
      frontier = next;
    }
  } catch (e) {
    // M2: a throw anywhere is this search's verdict, never a crash with none: an oracle in the fake throws a plain Error.
    return done("failed", depthCompleted, e instanceof Oracle ? e.message : `threw: ${(e as Error).message}`);
  }
  return done("completed", depthCompleted);
};
