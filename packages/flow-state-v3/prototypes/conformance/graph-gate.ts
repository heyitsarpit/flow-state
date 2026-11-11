// Round 13: `flow graph` as conformance proof (HANDOFF plan cut, step 3b). The whole suite, searches included unless `--no-search`, runs with an observer on
// every boot: each `turn` record the runtime writes names, per part, the alternative that ran (`definition`, `at`), its node, and where the moved incarnation
// went. Each must be an edge of the graph of what that boot was given (`graph.ts`, from `Compiled` alone), from that node, to that target. Then every edge
// the graphs claim is one the runtime was seen to take, or is marked: `guarded` (a value decides), `late`, `shadowed`, `unreached`, `unsourced`. An
// unmarked edge nobody took is listed: the graph says more than the suite showed.
// bun conformance/graph-gate.ts --runtime ../round-13/adapter.ts [--no-search] [--json out]. Exits 1 on any disagreement, or on no observation at all.
import { resolve } from "node:path";
import type { Compiled } from "./fixtures/compiled.ts";
import type { Edge, Graph, Observed } from "./graph.ts";
import type { RuntimeModule } from "./harness.ts";
import { stated } from "./verdicts/state.ts";

await stated("graph-gate", async () => {
const { makeHarness, observeBoots } = await import("./drive.ts");
const { edgeOf, graphOf, isUnder, nodesOf } = await import("./graph.ts");
const { allScenarios, runScenarios } = await import("./suite.ts");
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? undefined : process.argv[i + 1];
};
const mod = (await import(resolve(import.meta.dir, arg("--runtime") ?? "../round-13/adapter.ts"))) as RuntimeModule;
const noSearch = process.argv.includes("--no-search");

const cache = new WeakMap<Compiled, Graph>();
const graph = (c: Compiled) => {
  let g = cache.get(c);
  if (!g) cache.set(c, (g = graphOf(c)));
  return g;
};
type Claim = { edge: Edge; machine: string; seen: number };
// Two fixtures may share a machine id (a release, a variant), so a claim is the edge as that table has it: its place, target and status.
const claimKey = (c: Compiled, e: Edge) => [c.id, e.key, e.from, e.target, e.status].join("\u0000");
const claims = new Map<string, Claim>(); // by machine id and edge key: one release's edge is not another's
const disagreements = new Map<string, { what: string; n: number; where: string }>();
const injected = new Map<string, number>();
let turns = 0;
let parts = 0;
let current = "";
const disagree = (what: string) => {
  const d = disagreements.get(what);
  if (d) d.n++;
  else disagreements.set(what, { what, n: 1, where: current });
};
observeBoots((compiled) => {
  const gs = compiled.map((c) => ({ c, g: graph(c) }));
  for (const { c, g } of gs) for (const e of g.edges) if (!claims.has(claimKey(c, e))) claims.set(claimKey(c, e), { edge: e, machine: c.id, seen: 0 });
  return (batch) => {
    for (const r of batch) {
      if (r["kind"] !== "turn") continue;
      turns++;
      const ps = r["parts"] as readonly Observed[] | undefined;
      if (!Array.isArray(ps)) {
        disagree(`a turn record with no parts: the runtime did not say which alternative ran`);
        continue;
      }
      for (const p of ps) {
        parts++;
        const hit = gs.find(({ g }) => edgeOf(g, p));
        if (!hit) {
          disagree(`not an edge: ${p.definition} ${p.at} (node ${p.node}, event ${p.tag})`);
          continue;
        }
        const e = edgeOf(hit.g, p)!;
        claims.get(claimKey(hit.c, e))!.seen++;
        // An `on` edge is found at the node that holds it; a filling (callback, exit) runs from the host's leaf, which must be under the node that places
        // the fragment, since the placement lives only there.
        // A `whenAbandoned` notify's filling runs inside the turn that leaves the placing node (fused), so the leaf it left must be under that node, and the
        // edge must be one the graph says fires on abandonment.
        const nodes = nodesOf(hit.c, e.definition);
        const mvFrom = (r["moved"] as { from?: string } | undefined)?.from;
        const fused = (p as { fused?: boolean }).fused === true;
        // Abandonment is by leaving that node (the move's `from` is under it), or with the host staying, by a reset or a copy's removal (the leaf is).
        const fromOk = fused
          ? e.kind === "callback" && e.onAbandon !== undefined && e.target === "self" && !!nodes && (e.onAbandon === "frozen" || isUnder(nodes, p.node, e.from) || (mvFrom !== undefined && isUnder(nodes, mvFrom, e.from)))
          : e.kind === "callback" || e.kind === "exit"
            ? !!nodes && isUnder(nodes, p.node, e.from)
            : e.from === p.node;
        if (!fromOk) disagree(`from another node: ${p.definition} ${p.at}: graph ${e.from}, runtime ${p.node}`);
        if (e.target !== p.target) disagree(`another target: ${p.definition} ${p.at}: graph ${e.target}, runtime ${p.target}`);
        // `unsourced` and taken: nothing in the program can send this event, so the suite sent it from outside (a test below the public API). Listed apart.
        if (e.status === "unsourced") injected.set(`${hit.c.id} ${e.event}`, (injected.get(`${hit.c.id} ${e.event}`) ?? 0) + 1);
        else if (e.status === "shadowed" || e.status === "unreached") disagree(`taken, and the graph says ${e.status}: ${p.definition} ${p.at}`);
      }
      // Where the moved incarnation went must be under the edge's target (its default chain, or a history child).
      const mv = r["moved"] as { path: readonly string[]; from?: string; to?: string } | undefined;
      const mover = ps.find((p) => p.target !== "self" && JSON.stringify(p.path) === JSON.stringify(mv?.path ?? null));
      if (mv && mover && mv.to !== undefined) {
        const hit = gs.find(({ g }) => edgeOf(g, mover));
        const nodes = hit && nodesOf(hit.c, mover.definition);
        if (nodes && !isUnder(nodes, mv.to, mover.target)) disagree(`moved outside its target: ${mover.definition} ${mover.at}: target ${mover.target}, leaf ${mv.to}`);
      }
    }
  };
});
const t0 = performance.now();
const make = makeHarness(mod.port);
const only = noSearch ? new Set(allScenarios.filter((s) => !s.id.startsWith("SEARCH-")).map((s) => s.id)) : undefined;
const results = runScenarios(make, new Set(), only, {
  onResult: (r) => {
    current = r.variant ? `${r.id}/${r.variant}` : r.id;
  },
});
observeBoots(undefined);
const failed = results.filter((r) => !r.ok);
const all = [...claims.values()];
const by = (s: string) => all.filter((x) => x.edge.status === s);
const seen = all.filter((x) => x.seen > 0);
const guarded = all.filter((x) => x.seen === 0 && x.edge.status === "takeable" && x.edge.guarded.length > 0);
const shown = all.filter((x) => x.seen === 0 && x.edge.status === "takeable" && x.edge.guarded.length === 0);
const line = {
  cases: results.length,
  casesFailed: failed.length,
  turns,
  parts,
  machines: new Set(all.map((x) => x.machine)).size,
  edges: all.length,
  taken: seen.length,
  notTakenGuarded: guarded.length,
  notTakenLate: by("late").filter((x) => x.seen === 0).length,
  shadowed: by("shadowed").length,
  unreached: by("unreached").length,
  unsourced: by("unsourced").length,
  notTakenUnmarked: shown.length,
  disagreements: [...disagreements.values()].reduce((s, d) => s + d.n, 0),
  injected: injected.size,
  seconds: Math.round((performance.now() - t0) / 1000),
};
for (const d of disagreements.values()) console.log(`DISAGREE  ${d.what}  (x${d.n}, first in ${d.where})`);
for (const [k, n] of injected) console.log(`INJECTED  ${k}  (x${n}): taken, and nothing in the program sends it; the suite sent it from outside`);
if (process.argv.includes("--list")) for (const x of shown) console.log(`UNTAKEN  ${x.machine}  ${x.edge.definition} ${x.edge.at}  ${x.edge.from} -${x.edge.event}-> ${x.edge.target}`);
// What the graph itself says can never be taken, always printed: each is a claim about the program the reader should see.
for (const x of [...by("shadowed"), ...by("unreached"), ...by("unsourced")]) console.log(`MARKED  ${x.edge.status}  ${x.machine}  ${x.edge.definition} ${x.edge.at}  ${x.edge.from} -${x.edge.event}-> ${x.edge.target}${x.seen ? `  (taken ${x.seen})` : ""}`);
console.log(`GRAPH-GATE ${JSON.stringify(line)}`);
const out = arg("--json");
if (out) await Bun.write(out, JSON.stringify({ line, disagreements: [...disagreements.values()], untaken: shown.map((x) => ({ machine: x.machine, definition: x.edge.definition, at: x.edge.at, from: x.edge.from, event: x.edge.event, target: x.edge.target })) }, null, 1));
const bad = disagreements.size > 0 || turns === 0 || parts === 0 || failed.length > 0;
console.log(bad ? "GRAPH FAIL" : "GRAPH PASS  every transition the runtime took is an edge of its graph, from its node, to its target");
const { seconds: _seconds, ...counts } = line;
return [
  { kind: "graph", name: "graph", outcome: disagreements.size > 0 || turns === 0 || parts === 0 ? "fail" : "pass", why: [...disagreements.values()].slice(0, 3).map((d) => d.what).join("; ") || (turns === 0 || parts === 0 ? "no observation at all" : ""), detail: counts },
  ...results.map((r) => ({ kind: "case", name: r.variant ? `${r.id}/${r.variant}` : r.id, outcome: r.ok ? ("pass" as const) : ("fail" as const), why: r.ok ? "" : (r.why ?? "") })),
];
});
