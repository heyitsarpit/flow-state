// BFS over states (D32). A state is reached by replaying its script from `start`, so the search needs only Reads and
// survives a rewrite; `Reads.stateHash` is what makes depth exact: two scripts with one hash have one future. The hash
// is opaque text from the runtime and the fake, reduced to 64 bits by Bun.hash. Oracles run per edge and on each state, so
// no history is needed beyond what the hash carries.
import type { Harness, Step } from "../harness.ts";

export type Action = { name: string; step: Step; on?: (h: Harness) => boolean };
export type Probe = (h: Harness, script: readonly string[]) => void;
export class Oracle extends Error {}

export type Report = {
  verdict: "completed" | "closed" | "inconclusive" | "failed";
  perDepth: readonly number[]; // new states per depth
  states: number;
  edges: number;
  steps: number;
  depthCompleted: number;
  failure?: string;
  classes: Readonly<Record<string, { count: number; witness: string }>>;
  ms: number;
  peakRssMb: number;
};

export const bfs = (o: {
  make: () => Harness;
  actions: readonly Action[];
  depth: number;
  maxStates: number;
  deadlineMs: number;
  extra?: (script: readonly Action[]) => string; // search-level state that belongs in the key (a commit budget)
  edge: (pre: Harness, post: Harness, last: Action) => void; // pre is the parent replayed
  state: Probe; // on each new state
  drain?: (h: Harness, script: readonly string[], report: (cls: string) => void) => void; // on each new state, destroys h
}): Report => {
  const t0 = Date.now();
  let peak = 0;
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
  const done = (verdict: Report["verdict"], depthCompleted: number, failure?: string): Report => ({
    verdict,
    perDepth,
    states: seen.size,
    edges,
    steps,
    depthCompleted,
    ...(failure ? { failure } : {}),
    classes,
    ms: Date.now() - t0,
    peakRssMb: Math.round(peak / 1e6),
  });
  const names = (s: readonly Action[]) => s.map((a) => a.name);
  const out = () => seen.size >= o.maxStates || Date.now() - t0 > o.deadlineMs;
  let frontier: Action[][] = [[]];
  let depthCompleted = 0;
  try {
    const root = run([]);
    seen.add(key(root, []));
    o.state(root, []);
    perDepth.push(1);
    if (o.drain) o.drain(run([]), [], report([]));
    for (let d = 1; d <= o.depth; d++) {
      const next: Action[][] = [];
      for (const script of frontier) {
        for (const a of o.actions) {
          if (out()) return done("inconclusive", depthCompleted);
          const pre = run(script);
          if (a.on && !a.on(pre)) continue;
          edges++;
          const post = run(script);
          post.do(a.step);
          steps++;
          const s = [...script, a];
          try {
            o.edge(pre, post, a);
          } catch (e) {
            if (e instanceof Error && !(e instanceof Oracle))
              throw new Oracle(`${e.message} on ${names(s).join(" ")}`);
            throw new Oracle(`${(e as Error).message} on ${names(s).join(" ")}`);
          }
          const k = key(post, s);
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(s);
          try {
            o.state(post, names(s));
            if (o.drain) o.drain(post, names(s), report(names(s)));
          } catch (e) {
            throw new Oracle(`${(e as Error).message} on ${names(s).join(" ")}`);
          }
          if (seen.size % 500 === 0) peak = Math.max(peak, process.memoryUsage().rss);
        }
      }
      perDepth.push(next.length);
      depthCompleted = d;
      if (next.length === 0) return done("closed", d);
      frontier = next;
    }
  } catch (e) {
    if (e instanceof Oracle) return done("failed", depthCompleted, e.message);
    throw e;
  }
  return done("completed", depthCompleted);
};
