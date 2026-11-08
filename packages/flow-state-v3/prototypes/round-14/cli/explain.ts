// D92: static `flow explain`. Reads the table; runs nothing. An opaque guard stops it at `at.path`, and it says so.
import type { Alternative, Compiled, Member, Op } from "../../conformance/fixtures/compiled.ts";
import { chainOf, poison } from "./check.ts";

const keyText = (op: Op) =>
  op.keyFields ? (op.keyFields.length ? `one lane per ${op.keyFields.join(", ")}` : "one lane") : "key: opaque closure";
const memberText = (c: Compiled, m: Member) => {
  const op = c.ops[m.op];
  const verb = { commit: "commits", lookup: "looks up", retry: "retries", cancel: "cancels", cancelAll: "cancels the whole lane of", module: "calls" }[m.verb];
  if (!op) return { verb, text: m.op };
  return { verb, text: `${m.op} (${op.contract}${m.verb === "commit" ? `, ${op.concurrency}` : ""}, ${keyText(op)})` };
};
const guardsOf = (a: Alternative) => [
  ...a.tokens.map((t) =>
    "node" in t
      ? { kind: "state", node: t.node, decided: true }
      : "op" in t
        ? { kind: "lane", op: t.op, verb: t.verb, ...(t.times ? { times: t.times } : {}), decided: false }
        : { kind: "port", port: t.port, decided: false },
  ),
  ...a.guards.map((g) => ({ kind: "opaque", path: g.at.path, decided: false })),
];
export const explain = (raw: Compiled, state: string, event: string) => {
  const count = { n: 0 };
  const c = poison(raw, count);
  const chain = chainOf(c.nodes, state);
  const alternatives: Array<Record<string, unknown>> = [];
  let certainFrom = false;
  for (const node of chain) {
    (c.nodes[node]?.on[event] ?? []).forEach((a) => {
      if (a.tokens.some((t) => "node" in t && !chain.includes(t.node))) return; // a state token that is decided: not this leaf
      const guards = guardsOf(a).filter((g) => g.kind !== "state");
      const certain = guards.length === 0;
      alternatives.push({
        index: Number(/\[(\d+)\]$/.exec(a.at.path)?.[1] ?? 0),
        path: a.at.path,
        node,
        target: a.exit ? `exit ${a.exit.name}` : a.target,
        guards,
        memory: a.patch?.at.path,
        members: a.members.map((m) => ({ verb: m.verb, op: m.op, ...memberText(c, m) })),
        certain,
        reachable: !certainFrom,
      });
      if (certain) certainFrom = true;
    });
  }
  const live = alternatives.filter((a) => a["reachable"]);
  const decided = live.length === 1 && live[0]!["certain"] === true;
  return { command: "explain", machine: c.id, state, event, alternatives, decided, callbacksRun: count.n };
};
export const explainText = (r: ReturnType<typeof explain>) => {
  const out = [`${r.event} in ${r.state} (${r.machine}), nearest first`];
  if (r.alternatives.length === 0) out.push("  nothing handles it here: dropped, as evidence");
  for (const a of r.alternatives) {
    const where = a["node"] === "root" ? "    (root)" : "";
    const never = a["reachable"] ? "" : "  never: an alternative above cannot decline";
    out.push(`  [${a["index"]}] ${a["path"]}  -> ${a["target"]}${where}${never}`);
    const gs = a["guards"] as Array<Record<string, unknown>>;
    if (!gs.length && !a["memory"] && !(a["members"] as unknown[]).length) out.push("      always");
    for (const g of gs) {
      if (g["kind"] === "opaque") out.push(`      guard    ${g["path"]}  opaque: stopped here, nothing was run`);
      else if (g["kind"] === "lane") out.push(`      guard    ${g["op"]}.${g["verb"]}${g["times"] ? `, ${g["times"]} times` : ""}: a lane fact, known only at run time`);
      else out.push(`      guard    port ${g["port"]}: filled by the host`);
    }
    if (a["memory"]) out.push(`      memory   ${a["memory"]}  opaque`);
    for (const m of a["members"] as Array<Record<string, string>>) out.push(`      ${m["verb"]!.padEnd(8)} ${m["text"]}`);
  }
  const live = r.alternatives.filter((a) => a["reachable"]);
  const depends = live.filter((a) => !a["certain"]).length;
  out.push(r.decided ? "decided statically: yes" : `decided statically: no. ${depends} of ${live.length} alternatives depend on values`);
  return out.join("\n");
};
// The design's one-liners (2.7.16): each event, what it can do.
export const overview = (raw: Compiled) => {
  const c = poison(raw, { n: 0 });
  const lines: string[] = [];
  for (const [id, n] of Object.entries(c.nodes))
    for (const [ev, alts] of Object.entries(n.on))
      for (const a of alts) {
        if (a.target === "self" && a.members.length === 0) continue;
        const from = id === c.root ? "*" : id;
        const to = a.exit ? `exit ${a.exit.name}` : a.target === "self" ? from : a.target;
        const what = a.members.map((m) => {
          const t = memberText(c, m);
          return `${t.verb} ${t.text}`;
        });
        lines.push(`${ev}  ${from} -> ${to}${what.length ? `; ${what.join("; ")}` : ""}`);
      }
  return lines;
};
