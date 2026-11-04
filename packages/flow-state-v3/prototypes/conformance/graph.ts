// Round 13: the transition graph of one `Compiled`, read from the data alone (no callback runs). What `flow graph` prints, and what the suite's graph gate
// (`graph-gate.ts`) holds the runtime to: every transition the runtime takes must be an edge here, and every edge here is either one the runtime was seen
// to take, or marked as depending on a value (`guarded`), on lateness (`late`), or never taken (`shadowed`, `unreached`, `unsourced`).
// An edge is one alternative, named by its own place (`definition`, `at`: D207's unique Slot paths), so an observation names exactly one edge.
import type { Alternative, Compiled, Fragment, Node } from "./fixtures/compiled.ts";

export type EdgeKind = "on" | "callback" | "exit" | "trigger";
export type Edge = {
  readonly key: string; // `${definition}\u0000${at}`: the one name an observation and an edge share
  readonly definition: string; // the machine's id, or the fragment's whose body holds it
  readonly at: string; // the alternative's path, or `trigger:<node>:<event>` for a schedule's arm/disarm trigger with no handler (the Runtime's `implicit`)
  readonly kind: EdgeKind;
  readonly from: string; // the node whose table holds it (a filling: the node that places the fragment)
  readonly event: string; // the event, the callback's or the exit's name
  readonly target: string; // a node of `definition`'s own table, or "self"
  readonly history?: true;
  readonly exit?: string; // a subroutine's exit taken by this alternative
  readonly guarded: readonly string[]; // what decides it at run time: `token:<node>`, `idle:<op>`, `retryable:<op>`, `port:<name>`, `closure:<path>`
  readonly members: readonly string[]; // `commit:<op>`, `retry:<op>`, ...
  readonly raises: readonly string[]; // `<instance>.<event>`
  readonly notifies: readonly string[];
  // A callback the fragment's `whenAbandoned` notifies: it fires in the turn that ends the life, which for a plain placement is one that leaves the placing
  // node (or resets, or removes a copy), and for a `.resumable()` one may also be later, from anywhere, when its frozen life ends ("frozen").
  readonly onAbandon?: "placed" | "frozen";
  readonly status: "takeable" | "late" | "shadowed" | "unreached" | "unsourced";
};
export type GraphNode = { readonly definition: string; readonly id: string; readonly parent?: string; readonly default?: string; readonly places: readonly string[] };
export type Graph = {
  readonly machine: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
  readonly sources: Readonly<Record<string, readonly string[]>>; // event -> where it can come from
  readonly unseen: readonly string[]; // what the data cannot say: a follow-up closure's event (labFollowUps), a module block's (D209)
};

const tokenText = (t: Alternative["tokens"][number]): string =>
  "node" in t ? `token:${t.node}` : "port" in t ? `port:${t.port}` : `${t.verb}:${t.op}${t.key ? "(k)" : ""}`;
const membersOf = (a: Alternative) => a.members.map((m) => `${m.verb === "module" ? `${m.module}.${m.name}` : m.verb}:${m.op}`);
// Rule 13 and 2.5: an alternative with no token and no closure guard always passes, so the ones after it in its list never run, unless it leaves and the
// event is a late ending (`LateMayNotLeave` declines it, and the next is tried).
const statusInList = (alts: readonly Alternative[]): Array<"takeable" | "late" | "shadowed"> => {
  let blocker: "none" | "leaves" | "stays" = "none";
  return alts.map((a) => {
    const s = blocker === "none" ? "takeable" : blocker === "leaves" ? "late" : "shadowed";
    if (blocker !== "stays" && a.tokens.length === 0 && a.guards.length === 0) blocker = a.target === "self" && !a.exit ? "stays" : "leaves";
    return s;
  });
};
const chainUp = (nodes: Readonly<Record<string, Node>>, id: string): string[] => {
  const out: string[] = [];
  for (let n: string | undefined = id; n !== undefined && nodes[n]; n = nodes[n]!.parent) out.push(n);
  return out;
};
const defaultLeaf = (nodes: Readonly<Record<string, Node>>, id: string): string[] => {
  const out = [id];
  for (let n = nodes[id]; n?.default !== undefined && nodes[n.default]; n = nodes[n.default]) out.push(n.default);
  return out;
};
export const isUnder = (nodes: Readonly<Record<string, Node>>, leaf: string, target: string) => chainUp(nodes, leaf).includes(target);

type Table = { readonly definition: string; readonly nodes: Readonly<Record<string, Node>>; readonly dflt: string };
export const graphOf = (c: Compiled): Graph => {
  const frags: Readonly<Record<string, Fragment>> = c.fragments ?? {};
  const tables: Table[] = [{ definition: c.id, nodes: c.nodes, dflt: c.default }, ...Object.entries(frags).map(([id, f]) => ({ definition: id, nodes: f.nodes, dflt: f.default }))];
  const nodes: GraphNode[] = tables.flatMap((t) =>
    Object.values(t.nodes).map((n) => ({
      definition: t.definition,
      id: n.id,
      ...(n.parent !== undefined ? { parent: n.parent } : {}),
      ...(n.default !== undefined ? { default: n.default } : {}),
      places: [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])].map((p) => `${p.name}:${p.fragment}`),
    })),
  );
  // ── Where each event can come from, by data.
  const sources: Record<string, string[]> = {};
  const add = (ev: string, from: string) => (sources[ev] ??= []).includes(from) || sources[ev]!.push(from);
  const unseen: string[] = [];
  for (const e of c.events?.external ?? []) add(e, "external");
  for (const f of Object.values(frags)) {
    for (const e of f.events?.external ?? []) add(e, "external");
    for (const e of f.events?.host ?? []) add(e, "host");
  }
  for (const [name, o] of Object.entries(c.ops)) {
    const m = o.outcomes;
    if (m.success) add(m.success.event, `ending:${name}.success`);
    for (const [k, x] of Object.entries(m.failure)) add(x.event, `ending:${name}.failure.${k}`);
    if (m.unknown) {
      if ("byReason" in m.unknown) for (const [k, x] of Object.entries(m.unknown.byReason)) add(x.event, `ending:${name}.unknown.${k}`);
      else add(m.unknown.event, `ending:${name}.unknown`);
    }
  }
  for (const [k, s] of Object.entries(c.streams ?? {})) for (const x of [s.value, s.missed, s.failure, ...Object.values(s.failureBy ?? {}), ...(s.pages ? [s.pages] : [])]) add(x.event, `stream:${k}`);
  if (c.streams && Object.keys(c.streams).length) unseen.push("streams: a module block (D209); its events are listed as sources, its sessions are not edges");
  if (c.domain) unseen.push("domain: a module block (D209); its record changes are not edges");
  // ── Edges, table by table.
  const edges: Edge[] = [];
  for (const t of tables) {
    for (const n of Object.values(t.nodes)) {
      for (const s of n.schedules) add(s.send, `schedule:${t.definition}.${n.id}.${s.id}`);
      const push = (kind: EdgeKind, event: string, alts: readonly Alternative[], definition = t.definition, onAbandon?: "placed" | "frozen") => {
        const st = statusInList(alts);
        alts.forEach((a, i) => {
          if (a.followUps?.length) unseen.push(`${a.at.definition} ${a.at.path}: a follow-up closure's event (labFollowUps, a seam)`);
          for (const r of a.raises ?? []) add(r.event, `raise:${t.definition}.${n.id}.${r.to}`);
          edges.push({
            key: `${a.at.definition}\u0000${a.at.path}`,
            definition: a.at.definition ?? definition,
            at: a.at.path,
            kind,
            from: n.id,
            event,
            target: a.target,
            ...(a.history ? { history: true as const } : {}),
            ...(a.exit ? { exit: a.exit.name } : {}),
            guarded: [...a.tokens.map(tokenText), ...a.guards.map((g) => `closure:${g.at.path}`)],
            members: membersOf(a),
            raises: (a.raises ?? []).map((r) => `${r.to}.${r.event}`),
            notifies: (a.notify ?? []).map((x) => x.name),
            ...(onAbandon ? { onAbandon } : {}),
            status: st[i]!,
          });
        });
      };
      for (const [ev, alts] of Object.entries(n.on)) push("on", ev, alts);
      // A schedule's trigger with no handler at this node is a handler (2.5 step 2): the Runtime's `implicit` alternative, a self edge.
      for (const s of n.schedules)
        for (const ev of new Set([...s.armOn, ...s.disarmOn]))
          if (ev !== "entry" && !n.on[ev] && !edges.some((e) => e.at === `trigger:${n.id}:${ev}` && e.definition === t.definition))
            edges.push({ key: `${t.definition}\u0000trigger:${n.id}:${ev}`, definition: t.definition, at: `trigger:${n.id}:${ev}`, kind: "trigger", from: n.id, event: ev, target: "self", guarded: [], members: [], raises: [], notifies: [], status: "takeable" });
      for (const p of [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])]) {
        const abandons = new Set((frags[p.fragment]?.whenAbandoned?.notify ?? []).map((x) => x.name));
        for (const [name, alts] of Object.entries(p.callbacks ?? {})) push("callback", name, alts, t.definition, abandons.has(name) ? (p.resumable ? "frozen" : "placed") : undefined);
        for (const [name, alts] of Object.entries(p.exits ?? {})) push("exit", name, alts);
      }
    }
  }
  // ── Reachability: from each table's default leaf, over every edge whose node is on a reached leaf's path. A fragment's table is reached when a
  // reached node places it. A history target restores a child reached before, so it adds nothing new.
  const reached = new Map<string, Set<string>>(tables.map((t) => [t.definition, new Set<string>()]));
  const byDef = new Map(tables.map((t) => [t.definition, t]));
  const enter = (def: string, id: string) => {
    const t = byDef.get(def)!;
    for (const x of [...chainUp(t.nodes, id), ...defaultLeaf(t.nodes, id)]) reached.get(def)!.add(x);
  };
  enter(c.id, c.default);
  let grew = true;
  while (grew) {
    grew = false;
    const before = [...reached.values()].reduce((s, x) => s + x.size, 0);
    for (const t of tables) {
      const r = reached.get(t.definition)!;
      for (const id of [...r]) {
        const n = t.nodes[id]!;
        for (const p of [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])]) {
          const f = byDef.get(p.fragment);
          if (f && reached.get(p.fragment)!.size === 0) enter(p.fragment, f.dflt);
        }
      }
      for (const e of edges)
        if (e.definition === t.definition && r.has(e.from) && e.target !== "self" && e.status !== "shadowed" && t.nodes[e.target]) enter(t.definition, e.target);
    }
    grew = [...reached.values()].reduce((s, x) => s + x.size, 0) > before;
  }
  // Callbacks and exits come from the fragment, by name; `on` events from `sources`. Hand data declares no events (`legacy.ts` gives empty lists and no
  // payloads), so for it no edge is called unsourced: said in `unseen`.
  const declared = c.events?.payloads !== undefined;
  if (!declared) unseen.push("events: not declared (hand data), so where an event comes from is not known");
  const portSourced = (e: Edge) => e.kind === "callback" || e.kind === "exit";
  const final = edges.map((e): Edge => {
    if (e.status === "shadowed") return e;
    if (!reached.get(e.definition)?.has(e.from)) return { ...e, status: "unreached" };
    if (declared && !portSourced(e) && e.kind !== "trigger" && !sources[e.event]) return { ...e, status: "unsourced" };
    return e;
  });
  return { machine: c.id, nodes, edges: final, sources, unseen: [...new Set(unseen)] };
};

// ── The gate's check of one observation (a `turn` record's part) against the graph of what was booted.
export type Observed = { readonly definition: string; readonly at: string; readonly node: string; readonly tag: string; readonly target: string; readonly path: readonly string[] };
export const edgeOf = (g: Graph, o: Observed): Edge | undefined =>
  g.edges.find((e) => e.key === (o.at === "implicit" ? `${o.definition}\u0000trigger:${o.node}:${o.tag}` : `${o.definition}\u0000${o.at}`));
export const nodesOf = (c: Compiled, definition: string): Readonly<Record<string, Node>> | undefined =>
  definition === c.id ? c.nodes : c.fragments?.[definition]?.nodes;
