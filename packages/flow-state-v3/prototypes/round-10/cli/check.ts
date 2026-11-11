// D92: `flow check` on `Compiled`. Reads tables only: every Slot is poisoned first, and a call counts. Rules from machine-design: 20, 16, 45 (2.7.14), OD8, 70, 40.
import type { Alternative, Compiled, Fragment, Member, Node, Op } from "../../conformance/fixtures/compiled.ts";

export type Finding = {
  severity: "error" | "warn" | "info";
  rule: string;
  machine: string;
  path: string;
  message: string;
  help: string;
  op?: string;
  event?: string;
  state?: string;
};
type Nodes = Readonly<Record<string, Node>>;
type Where = { alt: Alternative; event: string; node: string };
// One body: a machine's, or a fragment's. A fragment's rules run on it alone (rule 55).
type Body = { id: string; nodes: Nodes; root: string; dflt: string; ops: Record<string, Op> };

export const poison = <T>(v: T, count: { n: number }): T => {
  const seen = new Map<unknown, unknown>();
  const walk = (x: unknown): unknown => {
    if (typeof x === "function")
      return () => {
        count.n++;
        throw new Error("a callback ran during a static command");
      };
    if (x === null || typeof x !== "object") return x;
    if (seen.has(x)) return seen.get(x);
    if (Array.isArray(x)) {
      const a: unknown[] = [];
      seen.set(x, a);
      for (const y of x) a.push(walk(y));
      return a;
    }
    const o: Record<string, unknown> = {};
    seen.set(x, o);
    for (const k of Object.keys(x)) o[k] = walk((x as Record<string, unknown>)[k]);
    return o;
  };
  return walk(v) as T;
};

export const chainOf = (nodes: Nodes, id: string): string[] => {
  const out: string[] = [];
  for (let n: string | undefined = id; n; n = nodes[n]?.parent) out.push(n);
  return out;
};
const kids = (nodes: Nodes, id: string) => Object.values(nodes).filter((n) => n.parent === id).map((n) => n.id);
const leavesUnder = (nodes: Nodes, id: string): string[] => {
  const k = kids(nodes, id);
  return k.length ? k.flatMap((x) => leavesUnder(nodes, x)) : [id];
};
const down = (nodes: Nodes, id: string): string => {
  const d = nodes[id]?.default;
  if (d) return down(nodes, d);
  const k = kids(nodes, id);
  return k.length ? down(nodes, k[0]!) : id;
};
const placedAlts = (n: Node): Alternative[] =>
  [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])].flatMap((p) => [
    ...Object.values(p.callbacks ?? {}).flat(),
    ...Object.values(p.exits ?? {}).flat(),
  ]);
const allAlts = (b: Body): Where[] =>
  Object.values(b.nodes).flatMap((n) => [
    ...Object.entries(n.on).flatMap(([event, l]) => l.map((alt) => ({ alt, event, node: n.id }))),
    ...placedAlts(n).map((alt) => ({ alt, event: "(port)", node: n.id })),
  ]);
const mem = (a: Alternative, verb: Member["verb"], op: string) => a.members.some((m) => m.op === op && m.verb === verb);
const hasTok = (a: Alternative, verb: "idle" | "retryable", op: string) =>
  a.tokens.some((t) => "op" in t && t.op === op && t.verb === verb);
const applies = (nodes: Nodes, a: Alternative, leaf: string) => {
  const c = chainOf(nodes, leaf);
  return a.tokens.every((t) => !("node" in t) || c.includes(t.node));
};
// Rule 45's over-approximation: a closure may pass. A node token is decided. A lane token is a guard.
const unguarded = (a: Alternative) => a.guards.length === 0 && a.tokens.every((t) => "node" in t);
const altsAt = (b: Body, leaf: string, ev: string): Array<{ alt: Alternative; node: string }> =>
  chainOf(b.nodes, leaf).flatMap((node) =>
    (b.nodes[node]?.on[ev] ?? []).filter((a) => applies(b.nodes, a, leaf)).map((alt) => ({ alt, node })),
  );
const total = (b: Body, leaf: string, ev: string) => altsAt(b, leaf, ev).some(({ alt }) => unguarded(alt));
const leavesOf = (b: Body) => Object.keys(b.nodes).filter((n) => kids(b.nodes, n).length === 0 && n !== b.root);
const destLeaves = (b: Body, a: Alternative, from: string): string[] => {
  if (a.exit) return [];
  if (a.target === "self") return [from];
  return a.history ? leavesUnder(b.nodes, a.target) : [down(b.nodes, a.target)];
};
const leavingAlts = (b: Body, leaf: string): Array<{ alt: Alternative; event: string }> =>
  chainOf(b.nodes, leaf).flatMap((node) => {
    const n = b.nodes[node];
    if (!n) return [];
    return [
      ...Object.entries(n.on).flatMap(([event, l]) =>
        l.filter((a) => applies(b.nodes, a, leaf)).map((alt) => ({ alt, event })),
      ),
      ...placedAlts(n).map((alt) => ({ alt, event: "(port)" })),
    ];
  });
const mappedEvents = (op: Op) => {
  const u = op.outcomes.unknown;
  const unknown = u ? ("byReason" in u ? Object.values(u.byReason).map((m) => m.event) : [u.event]) : [];
  return {
    success: op.outcomes.success ? [op.outcomes.success.event] : [],
    failure: Object.values(op.outcomes.failure).map((m) => m.event),
    unknown,
    all: [...new Set([...(op.outcomes.success ? [op.outcomes.success.event] : []), ...Object.values(op.outcomes.failure).map((m) => m.event), ...unknown])],
  };
};
const isBare = (op: Op) => !op.outcomes.success && Object.keys(op.outcomes.failure).length === 0 && !op.outcomes.unknown;
const once = <T>(xs: readonly T[]) => [...new Set(xs)];

const reach = (b: Body, start: readonly string[], stop: (w: { alt: Alternative; event: string }) => boolean): Set<string> => {
  const seen = new Set(start);
  const q = [...start];
  while (q.length) {
    const leaf = q.shift()!;
    for (const w of leavingAlts(b, leaf)) {
      if (stop(w)) continue;
      for (const d of destLeaves(b, w.alt, leaf))
        if (!seen.has(d)) {
          seen.add(d);
          q.push(d);
        }
    }
  }
  return seen;
};
// 2.7.14's arrival set for X: a new incarnation's leaves, while the lane is unresolved.
const arrivalsOf = (b: Body, x: string, U: readonly string[]): Set<string> => {
  const stop = (w: { alt: Alternative; event: string }) =>
    hasTok(w.alt, "idle", x) || U.includes(w.event) || ((mem(w.alt, "retry", x) || mem(w.alt, "cancel", x)) && (U.includes(w.event) || hasTok(w.alt, "retryable", x)));
  const commits = allAlts(b).filter((w) => mem(w.alt, "commit", x));
  const starts = [down(b.nodes, b.dflt), ...commits.flatMap((w) => destLeaves(b, w.alt, w.node === b.root ? down(b.nodes, b.dflt) : down(b.nodes, w.node)))];
  const s = reach(b, starts, stop);
  // Each leaf a commit's alternative can fire from, and each owner: a hold can arrive there too.
  for (const w of commits) for (const l of leavesUnder(b.nodes, w.node)) if (s.has(l) || w.node !== b.root) s.add(l);
  return s;
};

const checkBody = (b: Body, machine: string, push: (f: Finding) => void, persisted: boolean) => {
  const alts = allAlts(b);
  for (const [name, op] of Object.entries(b.ops)) {
    if (isBare(op)) {
      if (op.kind === "write")
        push({ severity: "info", rule: "BareWrite", machine, path: `operations.${name}`, op: name, message: `${name}: maps nothing, so it never holds (rule 40)`, help: "intended for a write nobody needs to hear about" });
      continue;
    }
    const ev = mappedEvents(op);
    const users = alts.filter((w) => w.alt.members.some((m) => m.op === name && (m.verb === "commit" || m.verb === "lookup" || m.verb === "retry")));
    // ── Rule 20, current and late. Owner: the state the transition names (rule 14).
    const owners = once(users.map((w) => (w.alt.target === "self" ? w.node : w.alt.target)));
    for (const owner of owners) {
      for (const e of ev.all) {
        for (const leaf of leavesUnder(b.nodes, owner))
          if (!total(b, leaf, e))
            push({ severity: "error", rule: "Rule20Current", machine, path: `states.${leaf}`, op: name, event: e, state: leaf, message: `\`${e}\` from \`${name}\` can arrive in ${leaf}, its owner's state, and nothing handles it totally`, help: "handle it here or at an ancestor, with a last alternative that has no guard" });
        if (owner !== b.root) {
          const anc = chainOf(b.nodes, owner).slice(1);
          const lateOk = anc.some((n) => (b.nodes[n]?.on[e] ?? []).some((a) => unguarded(a) || a.tokens.some((t) => "node" in t)));
          if (!lateOk)
            push({ severity: "error", rule: "Rule20Late", machine, path: `states.${owner}`, op: name, event: e, state: owner, message: `\`${e}\` from \`${name}\` can arrive after ${owner} is left, and no strict ancestor of ${owner} handles it`, help: 'add a handler at an ancestor; `{ target: "self" }` is the explicit ignore' });
        }
      }
    }
    if (op.kind === "read") {
      for (const t of ["Defect", "Interrupted"])
        if (!op.outcomes.failure[t])
          push({ severity: "error", rule: "Rule20Read", machine, path: `operations.${name}.failure`, op: name, message: `read \`${name}\` must map \`${t}\` (rule 37)`, help: `add \`${t}\` to its failure record` });
      continue;
    }
    // ── Rule 20: NotSent, per operation.
    if ((op.concurrency === "reject" || op.concurrency === "serialize" || persisted) && !op.outcomes.failure["NotSent"])
      push({ severity: "error", rule: "Rule20NotSent", machine, path: `operations.${name}.failure`, op: name, message: `\`${name}\` can end \`NotSent\` here (${op.concurrency}${persisted ? ", persisted" : ""}) and does not map it`, help: "map failure.NotSent" });
    // ── 2.7.14.
    if (ev.unknown.length === 0) {
      push({ severity: "error", rule: "UnresolvedHold", machine, path: `operations.${name}`, op: name, message: `\`${name}\` maps endings but not \`unknown\`: the lane reaches Held with no handler (rule 45, case 1)`, help: "map `unknown` to an event, and handle it where a hold can arrive" });
      continue;
    }
    const U = ev.unknown;
    const arrivals = arrivalsOf(b, name, U);
    // Rule 20, adopted: the same set.
    for (const leaf of arrivals)
      for (const e of ev.all)
        if (!total(b, leaf, e))
          push({ severity: "error", rule: "Rule20Adopted", machine, path: `states.${leaf}`, op: name, event: e, state: leaf, message: `\`${e}\` from \`${name}\` can be adopted in ${leaf} (a new incarnation while the lane is open), and nothing handles it totally`, help: "handle it at the root; adopted endings arrive in any leaf reachable while the lane is unresolved" });
    const owns = (w: { alt: Alternative; event: string }, from: string): boolean => {
      if (!mem(w.alt, "retry", name) && !mem(w.alt, "cancel", name)) return false;
      // Review H4: the unknown event has been spent by the branch that kept the hold. A retry that lives behind that event cannot fire again unless something re-raises it.
      if (U.includes(w.event)) return false;
      if (!hasTok(w.alt, "retryable", name)) return true;
      // R6 M2: behind `retryable`, it counts only if the same event has a later alternative that reaches an owner.
      const same = altsAt(b, from, w.event).map((x) => x.alt);
      const i = same.indexOf(w.alt);
      return same.slice(i + 1).some((a) => mem(a, "retry", name) || mem(a, "cancel", name) || !hasTok(a, "retryable", name));
    };
    const memberExists = alts.some((w) => mem(w.alt, "retry", name) || mem(w.alt, "cancel", name));
    const seen = new Set<string>();
    for (const leaf of arrivals) {
      for (const u of U) {
        const here = altsAt(b, leaf, u);
        const targets: Array<{ to: string[]; how: string; path: string }> = [];
        // 2.7.14: a branch keeps the hold if it has neither member, or only a retry behind `retryable` whose fallback keeps the hold.
        const releases = (a: Alternative) => (mem(a, "cancel", name) || mem(a, "retry", name)) && !hasTok(a, "retryable", name);
        for (const [i, { alt }] of here.entries()) {
          const keeps =
            (!mem(alt, "retry", name) && !mem(alt, "cancel", name)) ||
            (mem(alt, "retry", name) && hasTok(alt, "retryable", name) && !here.slice(i + 1).some((x) => releases(x.alt)));
          if (keeps) targets.push({ to: destLeaves(b, alt, leaf), how: "branch", path: alt.at.path });
        }
        if (here.length === 0) targets.push({ to: [leaf], how: "unhandled", path: `states.${leaf}` });
        else if (!here.some(({ alt }) => unguarded(alt))) targets.push({ to: [leaf], how: "declined", path: `states.${leaf}` });
        for (const t of targets) {
          const found = reach(b, t.to, (w) => hasTok(w.alt, "idle", name));
          let owner = false;
          let commit = false;
          for (const l of found)
            for (const w of leavingAlts(b, l)) {
              if (mem(w.alt, "commit", name)) commit = true; // OD25: an idle-guarded commit counts for `reject`'s terminal pass, and never owns
              if (hasTok(w.alt, "idle", name)) continue;
              if (owns(w, l)) owner = true;
            }
          if (owner || (op.concurrency === "reject" && !commit)) continue;
          const key = `${name}|${leaf}|${u}|${t.how}`;
          if (seen.has(key)) continue;
          seen.add(key);
          push({ severity: memberExists ? "warn" : "error", rule: "UnresolvedHold", machine, path: t.path, op: name, event: u, state: leaf, message: `a hold on \`${name}\` arriving in ${leaf} (${t.how}) has ${memberExists ? "no reachable" : "no"} retry or cancel`, help: "give the state that keeps the hold a path to `retry` or `cancel`" });
        }
      }
    }
  }
  // ── KeyRequired (OD8): a key-less retry or cancel on a keyed write, outside a handler of an event that operation alone maps.
  for (const w of alts)
    for (const m of w.alt.members) {
      if ((m.verb !== "retry" && m.verb !== "cancel") || ("key" in m && m.key)) continue;
      const op = b.ops[m.op];
      if (!op || op.kind !== "write" || op.keyFields?.length === 0 || !op.keyFields) continue;
      const others = Object.entries(b.ops).filter(([n, o]) => n !== m.op && mappedEvents(o).all.includes(w.event));
      const own = mappedEvents(op).all.includes(w.event);
      if (!own || others.length)
        push({ severity: "error", rule: "KeyRequired", machine, path: w.alt.at.path, op: m.op, event: w.event, message: `key-less \`${m.op}.${m.verb}\` outside a handler of an event \`${m.op}\` alone maps`, help: `pass the key: \`O.${m.op}.${m.verb}(k)\`` });
    }
  // ── D122: a handler of an operation's own ending that always asks it again. Nothing stops it but a press. Table data, so it is said before it runs.
  for (const [name, op] of Object.entries(b.ops))
    for (const event of new Set(mappedEvents(op).all))
      for (const leaf of Object.keys(b.nodes)) {
        const here = altsAt(b, leaf, event);
        if (here.length > 0 && here.every(({ alt }) => alt.target === "self" && alt.members.some((m) => m.op === name && (m.verb === "commit" || m.verb === "lookup")))) {
          push({ severity: "warn", rule: "AsksForever", machine, path: `operations.${name}`, op: name, event, message: `every handler of \`${event}\`, \`${name}\`'s own ending, asks \`${name}\` again: nothing here stops it, and if it answers at once it runs as fast as the page allows`, help: "give one alternative a guard and no ask, or a schedule between tries" });
          break;
        }
      }
  // ── D124: an input field the door will refuse, wherever it is. Read from tables.
  for (const [name, op] of Object.entries(b.ops))
    for (const f of op.inputNotCarried ?? [])
      push({ severity: "warn", rule: "InputFieldForm", machine, path: `operations.${name}.input`, op: name, message: `\`${name}\`'s input field \`${f}\` cannot be carried: a commit with such a value ends \`NotSent { Unencodable }\``, help: "use a Schema whose decoded value is a string or a number, such as a `Schema.String` holding the decimal" });
  // ── Rule 16's warning.
  for (const w of alts) {
    if (w.alt.target === "self" || w.alt.target === w.node) continue;
    for (const m of w.alt.members) {
      if (m.verb !== "commit") continue;
      const op = b.ops[m.op];
      if (op?.concurrency !== "reject" || hasTok(w.alt, "idle", m.op)) continue;
      push({ severity: "warn", rule: "Rule16", machine, path: w.alt.at.path, op: m.op, event: w.event, message: `moves to ${w.alt.target} with a \`reject\` commit of \`${m.op}\` and no \`${m.op}.idle\` guard: a press while the lane is busy moves with nothing sent`, help: `add \`O.${m.op}.idle\` to the guard, so \`check()\` and the button agree` });
    }
  }
};

export const check = (raw: Compiled): { findings: Finding[]; callbacksRun: number; incomplete: string[] } => {
  const count = { n: 0 };
  const c = poison(raw, count);
  const findings: Finding[] = [];
  const dedupe = new Set<string>();
  const push = (f: Finding) => {
    const k = JSON.stringify([f.rule, f.machine, f.path, f.op, f.event, f.state]);
    if (dedupe.has(k)) return;
    dedupe.add(k);
    findings.push(f);
  };
  const incomplete: string[] = [];
  const machineOps = Object.fromEntries(Object.entries(c.ops).filter(([, o]) => !o.fragment));
  checkBody({ id: c.id, nodes: c.nodes, root: c.root, dflt: c.default, ops: machineOps }, c.id, push, c.persisted);
  for (const [fid, f] of Object.entries<Fragment>(c.fragments ?? {})) {
    const ops = Object.fromEntries(Object.entries(c.ops).filter(([, o]) => o.fragment === fid));
    checkBody({ id: fid, nodes: f.nodes, root: f.root, dflt: f.default, ops }, `${c.id} > ${fid}`, push, c.persisted);
  }
  // ── Events: declared, or inferred, and said so.
  const bodies: Array<{ id: string; nodes: Nodes }> = [{ id: c.id, nodes: c.nodes }];
  const handled = new Set(bodies.flatMap((b) => Object.values(b.nodes).flatMap((n) => Object.keys(n.on))));
  const mapped = new Set(Object.values(c.ops).flatMap((o) => mappedEvents(o).all));
  const sends = new Set(Object.values(c.nodes).flatMap((n) => n.schedules.map((s) => s.send)));
  if (c.events) {
    const known = new Set([...c.events.external, ...c.events.internal]);
    for (const e of handled)
      if (!known.has(e))
        push({ severity: "error", rule: "UnknownEvent", machine: c.id, path: `on.${e}`, event: e, message: `\`${e}\` is handled but no \`events\` or \`internalEvents\` declares it`, help: "declare it, or remove the handler" });
    for (const e of c.events.external)
      if (!handled.has(e))
        push({ severity: "warn", rule: "UnhandledSend", machine: c.id, path: `events.${e}`, event: e, message: `\`${e}\` can be sent from outside, and no state handles it`, help: "handle it, or remove it from `events`" });
    for (const e of [...mapped, ...sends])
      if (!known.has(e) && !handled.has(e))
        push({ severity: "error", rule: "UnknownEvent", machine: c.id, path: "operations", event: e, message: `\`${e}\` is mapped or scheduled but declared nowhere`, help: "declare it" });
  } else {
    incomplete.push(`events inferred for ${c.id}: \`Compiled.events\` absent`);
  }
  const noKeys = Object.entries(c.ops).filter(([, o]) => o.kind === "write" && !o.keyFields).map(([k]) => k);
  if (noKeys.length) incomplete.push(`KeyRequired not decided for ${c.id}: no \`keyFields\` on ${noKeys.join(", ")}`);
  // ── DuplicateSession (rule 70).
  const byId = new Map<string, string[]>();
  for (const [k, s] of Object.entries(c.streams ?? {})) byId.set(s.id, [...(byId.get(s.id) ?? []), k]);
  for (const [id, names] of byId)
    if (names.length > 1)
      push({ severity: "warn", rule: "DuplicateSession", machine: c.id, path: `streams.${id}`, message: `two operations on one stream contract \`${id}\` are two sessions: ${names.join(", ")} (rule 70)`, help: "use one operation, unless two connections are what you want" });
  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings, callbacksRun: count.n, incomplete };
};
