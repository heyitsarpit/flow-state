// Round 13: `flow graph <machine>`, from `Compiled` alone (`conformance/graph.ts`), with every Slot poisoned first so the count of callbacks run is a fact.
// The suite's graph gate (`conformance/graph-gate.ts`) holds the runtime to the same graph. Exit 0; an unknown machine is exit 2 (CommandLine O3).
import type { Compiled } from "../../conformance/fixtures/compiled.ts";
import { graphOf, type Edge, type Graph } from "../../conformance/graph.ts";
import { poison } from "./check.ts";

export const graphCommand = (raw: Compiled): { graph: Graph; callbacksRun: number } => {
  const count = { n: 0 };
  const graph = graphOf(poison(raw, count));
  return { graph, callbacksRun: count.n };
};
const edgeLine = (e: Edge) => {
  const where = e.at;
  const marks = [
    e.guarded.length ? `if ${e.guarded.join(" & ")}` : "",
    e.status === "takeable" ? "" : e.status,
    e.exit ? `exit ${e.exit}` : "",
    e.history ? "history" : "",
    e.onAbandon ? `on abandon (${e.onAbandon})` : "",
    e.members.length ? e.members.join(" ") : "",
    e.raises.length ? `raises ${e.raises.join(" ")}` : "",
    e.notifies.length ? `notifies ${e.notifies.join(" ")}` : "",
  ].filter(Boolean);
  return `  ${`${e.from} -${e.event}-> ${e.target}`.padEnd(40)} ${where}${marks.length ? `   ${marks.join("; ")}` : ""}`;
};
export const graphText = (r: { graph: Graph; callbacksRun: number }): string => {
  const g = r.graph;
  const n = (s: Edge["status"]) => g.edges.filter((e) => e.status === s).length;
  const lines = [
    `flow graph ${g.machine}: ${g.nodes.length} nodes, ${g.edges.length} edges; ${g.edges.filter((e) => e.guarded.length).length} depend on a value, ${n("late")} late, ${n("shadowed")} shadowed, ${n("unreached")} unreached, ${n("unsourced")} unsourced`,
  ];
  for (const def of [...new Set(g.edges.map((e) => e.definition))]) {
    lines.push(`${def === g.machine ? g.machine : `fragment ${def}`}`);
    for (const e of g.edges.filter((x) => x.definition === def)) lines.push(edgeLine(e));
  }
  for (const u of g.unseen) lines.push(`unseen: ${u}`);
  lines.push(`callbacks run: ${r.callbacksRun}`);
  return lines.join("\n");
};
