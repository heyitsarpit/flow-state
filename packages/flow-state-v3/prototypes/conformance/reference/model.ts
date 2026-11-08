// Stage E: the suite's own model of which actor may receive an operation's ending, written from `machine-design.md`, not from any runtime.
// It imports nothing from `round-*`. Its inputs are the compiled data the suite holds and the leaf state an actor publishes.
//
// The rules it reads:
// - Rule 49, rule 51: an operation is declared by the machine or by one fragment. One per actor.
// - Rule 14, rule 53: an ending is delivered inside the incarnation that binds it. A machine's own operation is bound at the actor's root
//   for as long as the actor lives. A fragment's operation is bound only while an incarnation of that fragment is live; with none, it parks.
// - Rule 44: an ending whose actor is gone parks (a record survives) or goes as evidence.
// - Rule 52, rule 60: a fragment's life over, or `whenAbandoned.release`, lets its operations go. A `cancel` member lets its op go.
//
// Every answer is three-valued. `unknown` is where this model cannot see (a keyed `.each` placement, a fragment placed inside a fragment,
// a fragment's own states). An oracle may excuse only on a certain answer, and the cross-check compares only certain answers.
import type { Alternative, Compiled, Node, Placement } from "../fixtures/compiled.ts";

export type Answer = "yes" | "no" | "unknown";

// The machine an actor key names: the key is `machine/escaped-id`, and the escaped id holds no `/` (D137).
export const machineOfKey = (key: string) => key.slice(0, key.lastIndexOf("/"));

export class Reference {
  private readonly byId = new Map<string, Compiled>();
  constructor(compiled: readonly Compiled[]) {
    for (const c of compiled) if (!this.byId.has(c.id)) this.byId.set(c.id, c);
  }
  machine = (id: string) => this.byId.get(id);

  // The active configuration: the leaf and its ancestors, by the compiled parent links. Undefined if the leaf is not a node of the machine.
  chain = (m: Compiled, leaf: string): Node[] | undefined => {
    const out: Node[] = [];
    for (let id: string | undefined = leaf, n = 0; id !== undefined && n < 1000; n++) {
      const node: Node | undefined = m.nodes[id];
      if (!node) return undefined;
      out.push(node);
      id = node.parent;
    }
    return out;
  };

  // Is `frag` placed, directly, by a state in the active configuration? `unknown` if only through another fragment or keyed.
  private placed = (m: Compiled, frag: string, leaf: string): Answer => {
    const chain = this.chain(m, leaf);
    if (!chain) return "unknown";
    const direct = chain.flatMap((n) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])]).filter((p) => p.fragment === frag);
    // An incarnation's subject is its host's, plus its `resetOn` value, plus its `.each` key (D64, rule 51): the ending's subject picks one.
    // Only placements with neither have one subject for every ending; one keyed placement beside a plain one (`rows` and `once`) leaves
    // the ending's subject to choose.
    if (direct.some((p) => p.each || p.resetOn)) return "unknown";
    if (direct.length > 0) return "yes";
    const nested = Object.values(m.fragments ?? {}).some((f) => Object.values(f.nodes).some((n) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])].some((p) => p.fragment === frag)));
    return nested ? "unknown" : "no";
  };

  // Rule 14, 53: does the live actor of `machine`, at `leaf`, bind `op`? A leaf of undefined is an actor not alive: nothing binds.
  binds = (machine: string, op: string, leaf: string | undefined): Answer => {
    if (leaf === undefined) return "no";
    const m = this.byId.get(machine);
    const o = m?.ops[op];
    if (!m || !o) return "unknown"; // an op this release removed: `UnmappedEnding` speaks for it
    if (o.fragment === undefined) return "yes";
    return this.placed(m, o.fragment, leaf);
  };

  private readonly placementsMemo = new WeakMap<object, Map<string, readonly Placement[]>>();
  private placementsAt = (nodes: Readonly<Record<string, Node>>, at: string): readonly Placement[] => {
    let byLeaf = this.placementsMemo.get(nodes);
    if (!byLeaf) this.placementsMemo.set(nodes, (byLeaf = new Map()));
    const hit = byLeaf.get(at);
    if (hit) return hit;
    const chain: Node[] = [];
    for (let id: string | undefined = at, n = 0; id !== undefined && n < 1000; n++) {
      const node: Node | undefined = nodes[id];
      if (!node) break;
      chain.push(node);
      id = node.parent;
    }
    const out = chain.flatMap((n) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])]);
    byLeaf.set(at, out);
    return out;
  };

  // Stage F: the live copies of `frag` in an actor, as paths (`name` or `name:key` per level, the runtime's own path form), from what the
  // actor publishes: its leaf and memory, the `.each` membership in a host's memory, and each copy's own published state (`inner`, undefined
  // while not live: left, frozen, or never entered). A copy's `resetOn` values ride along, by the compiled slot on its host's published memory.
  copies = (machine: string, frag: string, leaf: string | undefined, memory: unknown, inner: (path: readonly string[]) => { state: string; memory: any } | undefined) => {
    const m = this.byId.get(machine);
    const out: Array<{ path: string[]; resets: string[] }> = [];
    if (!m || leaf === undefined) return out;
    const seen = new Set<string>();
    const walk = (nodes: Readonly<Record<string, Node>>, at: string, mem: any, here: string[], resets: string[], depth: number) => {
      if (depth > 8) return;
      for (const p of this.placementsAt(nodes, at)) {
        const items: unknown[] = p.each ? (Array.isArray(mem?.[p.each.of]) ? mem[p.each.of] : []) : [undefined];
        let reset: string | undefined;
        if (p.resetOn) {
          try {
            reset = JSON.stringify((p.resetOn as any).run({ memory: mem, event: {} }));
          } catch {
            reset = "$threw";
          }
        }
        for (const item of items) {
          // The published memory is the host's view: a placement named as its `.each` field shows its copies' slices there, each with its `key`.
          const slice = p.each && p.name === p.each.of && item !== null && typeof item === "object" && "key" in (item as object);
          const key = p.each ? (slice ? (item as any).key : p.each.by ? (item as any)?.[p.each.by] : item) : undefined;
          const path = [...here, key === undefined ? p.name : `${p.name}:${String(key)}`];
          const got = inner(path);
          if (!got) continue;
          const rs = reset === undefined ? resets : [...resets, reset];
          // Re-check G1: two members with one key are one incarnation (rule 51), so one copy, not two that leave the suite undecided.
          if (seen.has(JSON.stringify(path))) continue;
          seen.add(JSON.stringify(path));
          if (p.fragment === frag) out.push({ path, resets: rs });
          const f = m.fragments?.[p.fragment];
          if (f) walk(f.nodes, got.state, got.memory, path, rs, depth + 1);
        }
      }
    };
    walk(m.nodes, leaf, memory, [], [], 0);
    return out;
  };

  // The owner's own alternatives with a `cancel` of `op`, on any node of its machine and its fragments. Not any `cancel` of that name anywhere.
  private cancelAlts = (m: Compiled, op: string) => {
    const out: Array<{ node: Node; ev: string; alt: Alternative; inFragment: boolean }> = [];
    const scan = (nodes: Readonly<Record<string, Node>>, inFragment: boolean) => {
      for (const node of Object.values(nodes))
        for (const [ev, alts] of Object.entries(node.on ?? {}))
          for (const alt of alts ?? []) if (alt.members?.some((x) => (x.verb === "cancel" || x.verb === "cancelAll") && x.op === op)) out.push({ node, ev, alt, inFragment });
    };
    scan(m.nodes, false);
    for (const f of Object.values(m.fragments ?? {})) scan(f.nodes, true);
    // Placements' callbacks and exits are alternatives too
    const placementsOf = (nodes: Readonly<Record<string, Node>>) => Object.values(nodes).flatMap((n) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])].map((p) => ({ n, p })));
    for (const { n, p } of [...placementsOf(m.nodes), ...Object.values(m.fragments ?? {}).flatMap((f) => placementsOf(f.nodes))])
      for (const [ev, alts] of [...Object.entries(p.callbacks ?? {}), ...Object.entries(p.exits ?? {})])
        for (const alt of alts ?? []) if (alt.members?.some((x) => (x.verb === "cancel" || x.verb === "cancelAll") && x.op === op)) out.push({ node: n, ev, alt, inFragment: true });
    return out;
  };

  // Can the owner's machine take an alternative on `ev` that cancels `op`, from the state it was in? (D154's cancel by event, per owner)
  cancelsOn = (machine: string, op: string, ev: string, leafBefore: string | undefined): Answer => {
    const m = this.byId.get(machine);
    if (!m || leafBefore === undefined) return "unknown";
    const alts = this.cancelAlts(m, op).filter((x) => x.ev === ev);
    if (alts.length === 0) return "no";
    if (alts.some((x) => x.inFragment)) return "unknown"; // a fragment's own states are not published at the root
    const chain = this.chain(m, leafBefore);
    if (!chain) return "unknown";
    return alts.some((x) => chain.includes(x.node)) ? "yes" : "no";
  };

  // D154's "owner moved", per owner: between the leaf before and after a batch, did the owner's machine take an alternative that cancels
  // `op`, leave every state that binds it, or leave a fragment whose `whenAbandoned.release` names it?
  moveLetsGo = (machine: string, op: string, before: string | undefined, after: string | undefined): Answer => {
    const m = this.byId.get(machine);
    if (!m || before === undefined) return "unknown";
    if (after === undefined) return "yes"; // gone: rule 44
    const cb = this.chain(m, before);
    const ca = this.chain(m, after);
    if (!cb || !ca) return "unknown";
    // A cancel alternative is no cause by a move alone: which alternative ran is not published, and a memory move beside it would excuse
    // any ending (re-check M1'', SURV-03). A cancel is a cause only on an event driven to the owner: `cancelsOn`, asked by the ledger.
    const was = this.binds(machine, op, before);
    const now = this.binds(machine, op, after);
    if (was === "yes" && now === "no") return "yes";
    for (const [fid, f] of Object.entries(m.fragments ?? {}))
      if (f.whenAbandoned?.release?.includes(op)) {
        const pb = this.placed(m, fid, before);
        const pa = this.placed(m, fid, after);
        if (pb === "unknown" || pa === "unknown") return "unknown";
        if (pb === "yes" && pa === "no") return "yes";
      }
    if (was === "unknown" || now === "unknown") return "unknown";
    // A `.resumable()` placement keeps a frozen copy while its state is left (rule 52), and a memory change can end that copy: not published.
    const frag = m.ops[op]?.fragment;
    const releasing = new Set([...(frag ? [frag] : []), ...Object.entries(m.fragments ?? {}).filter(([, f]) => f.whenAbandoned?.release?.includes(op)).map(([id]) => id)]);
    const all = [...Object.values(m.nodes), ...Object.values(m.fragments ?? {}).flatMap((f) => Object.values(f.nodes))].flatMap((n) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])]);
    if (all.some((p) => p.resumable && releasing.has(p.fragment))) return "unknown";
    return "no";
  };

  // The events a timer of this machine can send, for `advance`: per owner, by its machine's own schedules.
  scheduleEvents = (machine: string): string[] => {
    const m = this.byId.get(machine);
    if (!m) return [];
    const nodes = [...Object.values(m.nodes), ...Object.values(m.fragments ?? {}).flatMap((f) => Object.values(f.nodes))];
    return nodes.flatMap((n) => (n.schedules ?? []).map((s) => s.send)).filter((s): s is string => typeof s === "string");
  };

  // The events an ending of `op` maps to, in this machine.
  mappedEvents = (machine: string, op: string): string[] => {
    const o = this.byId.get(machine)?.ops[op] as any;
    if (!o) return [];
    const out: string[] = [];
    const add = (x: any) => x?.event && out.push(x.event);
    add(o.outcomes.success);
    for (const x of Object.values(o.outcomes.failure ?? {})) add(x);
    const u = o.outcomes.unknown;
    if (u?.byReason) for (const x of Object.values(u.byReason)) add(x);
    else add(u);
    return out;
  };
}
