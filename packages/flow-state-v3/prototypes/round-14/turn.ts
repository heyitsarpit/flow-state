// One turn, as 2.5 writes it: admit; select the source; resets on before-walk; walk raises, notifies and exits depth first;
// move; final lists; leaving, with whenAbandoned fused; after memory; selects; cells in action order; releases after every
// member; re-check resets; commit. It runs on a working copy, so a refusal is one assignment. Rule 22's views are `before`
// (pre-turn, or a fresh incarnation's initial) and the working tree's memory (after, once every patch is applied).
import { getActor, setActor, type Actors } from "./actors.ts";
import type {
  Alternative,
  Compiled,
  Ev,
  Member,
  Notify,
  Placement,
  Slot,
} from "../conformance/fixtures/compiled.ts";
import { entered, own, text } from "./gate.ts";
import { told as moduleTold, prepareAll, Refused, run } from "./hooks.ts";
import { resetValue,
  down,
  kidAt,
  membership,
  partOf,
  partsNamed,
  pathOfId,
  placementOf,
  placementsActive,
  samePath,
  sameSubject,
  seed,
  seedKids,
  up,
  viewOf,
  walkIncs,
  withKid,
  type Path,
  type Started,
} from "./inc.ts";
import { admitRow, cancelAll, cell, decline, endHeldThisTurn, guardCell, letGoKept, ofIdentity, ofVersion, oldVersionLane } from "./lane.ts";
import { cancelRead, dropReadsOf, lookup, lookupUnencodable } from "./reads.ts";
import { armTimer, disarmTimer, scheduleKey } from "./timers.ts";
import {
  deleteLane,
  endingReason,
  enqueue,
  fragOf,
  issue,
  laneKey,
  laneOfAttempt,
  nextGen,
  note,
  noteEnding,
  setLane,
  type ActorRec,
  type EndingMail,
  type FrozenTimer,
  type Inc,
  type Lane,
  type Mail,
  type Owner,
  type Tx,
  clearStranded,
  reapStranded,
  strand,
  takeMail,
  without,
} from "./world.ts";

// D123: a key a refused input can still give, or none.
const nameOf = (op: Compiled["ops"][string], input: unknown): unknown => {
  try {
    const k = entered(() => run(op.key, input));
    return k.ok ? k.v : null;
  } catch (e) {
    if (e instanceof Refused) return null;
    throw e;
  }
};
const isDenial = (v: unknown): v is { deny: string } =>
  typeof v === "object" && v !== null && "deny" in v;
const machineOf = (tx: Tx, a: ActorRec): Compiled => tx.machines[a.machine]!;
const argsOf = (l: Lane) => ({ actor: l.actor, machine: l.machine, op: l.op, key: l.key });

type Part = {
  path: Path;
  alt: Alternative;
  node: string;
  tag: string;
  event: any;
  patch?: object;
  source?: true; // its patch is on before the walk
  fused?: true; // round 13: a `whenAbandoned` notify's filling, run inside the leaving turn (so from the leaf it left to)
};
type Walk = {
  tx: Tx;
  a: ActorRec;
  m: Compiled;
  root0: Inc;
  root: Inc;
  parts: Part[];
  move?: { path: Path; target: string; history: boolean };
  fresh: Set<string>;
  started: Started[];
  ended: Array<{ inc: Inc; path: Path; p: Placement; host: Path }>;
  releases: Array<{ op: string; subject: readonly string[] }>;
  item: Mail | undefined;
  late: boolean;
  lateFill?: boolean;
  thawFollows: Mail[];
  thawed: Path[]; // rule 54: a thawed incarnation adopts what parked while it was frozen
  exited: Set<string>; // rule 6: who ended by its own exit
  members: Array<{ op: string; kind: string; target: { t: "only" } | { t: "key"; key: unknown } | { t: "every" } | { t: "nothing" } }>; // the new suite's Port change 1
};
const inView = (inc: Inc, event: unknown) => ({
  memory: viewOf(inc),
  event,
  ...(inc.key === undefined ? {} : { key: inc.key, item: inc.item }),
});
// Rule 22's before: the pre-turn snapshot; for an incarnation created in this turn, its initial memory.
const beforeInc = (w: Walk, path: Path): Inc => {
  const cur = kidAt(w.root, path)!;
  if (w.fresh.has(cur.id)) return cur;
  return kidAt(w.root0, path) ?? cur;
};
const markFresh = (w: Walk) => {
  for (const s of w.started) w.fresh.add(s.inc.id);
};

// ── Select.
const tokensPass = (w: Walk, path: Path, inc: Inc, alt: Alternative, view: object) => {
  const reasons: string[] = [];
  const frag = fragOf(w.m, inc);
  for (const t of alt.tokens) {
    if ("node" in t) {
      if (!up(frag, inc.leaf).includes(t.node)) return { pass: false, reasons };
      continue;
    }
    if ("port" in t) {
      const host = kidAt(w.root0, path.slice(0, -1)) ?? kidAt(w.root, path.slice(0, -1))!;
      const p = placementOf(w.m, host, inc.name!);
      const g = p?.guards?.[t.port];
      if (!g) continue;
      const r = run(g, inView(host, (view as any).event) as never);
      if (isDenial(r)) return { pass: false, reasons: [r.deny] };
      continue;
    }
    if (t.verb === "idle" && !t.key) {
      // Rule 21: a key-less idle passes only when every lane of this operation it can see is Idle.
      const busy = Object.values(w.tx.w.lanes).filter((l) => l.actor === w.a.key && l.op === t.op); // D123: by the column, as a keyed idle reads it
      if (busy.some((l) => !guardCell(w.tx, "idle", l, t.op))) return { pass: false, reasons };
      const prefix = `${w.a.key}|${t.op}|`; // D88
      if (Object.keys(w.tx.w.quarantined).some((id) => id.startsWith(prefix)))
        return { pass: false, reasons };
      continue;
    }
    // D108: a key with no text names no lane. This alternative is denied; a later one may match. The issue says why, for a guard's reader.
    const named = t.key ? entered(() => run(t.key!, view as never)) : { ok: true as const, v: undefined };
    if (!named.ok) {
      issue(w.tx, { code: "UnencodableValue", origin: `${w.a.machine} ${t.op}` });
      return { pass: false, reasons: ["Unencodable"] };
    }
    const key = named.v;
    const lane = laneOfToken(w, t, key);
    // Rule 51: `retryable` from another path denies NothingToResend. `idle` denies by the lane's state, below.
    if (
      t.verb === "retryable" &&
      lane &&
      w.m.ops[t.op]?.fragment &&
      !sameSubject(lane.subject, inc.subject)
    )
      return { pass: false, reasons: ["NothingToResend"] };
    if (!guardCell(w.tx, t.verb, lane, t.op, t.times, !!(t.key && w.tx.w.quarantined[laneKey(w.a.key, t.op, key)]))) return { pass: false, reasons };
  }
  return { pass: true, reasons };
};
const laneOfToken = (
  w: Walk,
  t: { op: string; key?: Slot<(a: any) => unknown>; previous?: number },
  key: unknown,
): Lane | undefined => {
  // D221: a keyed `idle` says what its commit would meet: its own lane, else an old-version hold of the op (every commit declines beside one). A keyed
  // `retryable` names its own lane only.
  if (t.key) return ofVersion(w.tx.w.lanes[laneKey(w.a.key, t.op, key)], w.m.ops[t.op], t.previous) ?? (t.verb === "idle" ? oldVersionLane(w.tx, w.a.key, w.a.machine, t.op) : undefined);
  const it = w.item;
  if (it?.k === "ending" && it.op === t.op && it.attempt) return laneOfAttempt(w.tx.w, it.attempt);
  return undefined;
};
const exitSet = (w: Walk, inc: Inc, target: string, history: boolean) => {
  const frag = fragOf(w.m, inc);
  const dest = history ? (inc.history[target] ?? down(frag, target)) : down(frag, target);
  const toTarget = up(frag, dest);
  const from = up(frag, inc.leaf);
  // Re-entering an active node is a new activation: the common ancestor is its parent.
  const stay = up(frag, target).slice(1);
  const lca = from.find((n) => stay.includes(n) && toTarget.includes(n));
  const cut = lca === undefined ? from.length : from.indexOf(lca);
  const cutTo = lca === undefined ? toTarget.length : toTarget.indexOf(lca);
  return { exits: from.slice(0, cut), enters: toTarget.slice(0, cutTo).reverse(), dest };
};
// Rule 15: a late turn may not leave a state that owns another pending call, or an active subroutine. Only the host's own.
const ownedByExited = (inc: Inc, exits: readonly string[], owner: { readonly inc: string; readonly node: string; readonly activation: string }) =>
  owner.inc === inc.id && exits.includes(owner.node) && inc.activations[owner.node] === owner.activation;
const leavesWork = (w: Walk, inc: Inc, alt: Alternative) => {
  if (alt.target === "self") return false;
  const { exits } = exitSet(w, inc, alt.target, alt.history === true);
  const frag = fragOf(w.m, inc);
  if (exits.some((n) => frag.nodes[n]!.subroutine)) return true;
  const it = w.item;
  // OD49: an InFlight lookup owned by an exited state is live work too, unless it is this ending's own.
  for (const [id, r] of Object.entries(w.tx.w.reads))
    if (r.actor === w.a.key && ownedByExited(inc, exits, r.owner) && !(it?.k === "ending" && it.attempt === id)) return true;
  return Object.values(w.tx.w.lanes).some((l) => {
    if (l.actor !== w.a.key) return false;
    if (l.w.some((x) => ownedByExited(inc, exits, x.owner))) return true;
    const h = l.head;
    return h !== undefined && h.phase.t !== "held" && ownedByExited(inc, exits, h.owner) && !(it?.k === "ending" && it.attempt === h.id);
  });
};
const IMPLICIT = (id: string): Alternative => ({
  target: "self",
  at: { definition: id, path: "implicit" },
  tokens: [],
  guards: [],
  members: [],
});
type Selected = { node: string; alt: Alternative } | { denied: boolean; reasons: string[] };
const select = (w: Walk, path: Path, ev: Ev, start?: string): Selected => {
  const inc = beforeInc(w, path);
  const frag = fragOf(w.m, inc);
  const reasons: string[] = [];
  let handled = false;
  const view = inView(inc, ev.payload);
  for (const node of up(frag, start ?? inc.leaf)) {
    const n = frag.nodes[node]!;
    const alts = n.on[ev.tag];
    if (!alts) {
      // A schedule trigger is a handler (2.5 step 2).
      if (n.schedules.some((x) => x.armOn.includes(ev.tag) || x.disarmOn.includes(ev.tag)))
        return { node, alt: IMPLICIT(inc.frag ?? w.m.id) };
      continue;
    }
    handled = true;
    next: for (const alt of alts) {
      const t = tokensPass(w, path, inc, alt, view);
      if (!t.pass) {
        reasons.push(...t.reasons);
        continue;
      }
      for (const g of alt.guards) {
        const r = run(g, view as never);
        if (isDenial(r)) {
          reasons.push(r.deny);
          continue next;
        }
      }
      if (w.late && leavesWork(w, inc, alt)) {
        reasons.push("LateMayNotLeave");
        continue;
      }
      return { node, alt };
    }
  }
  return { denied: handled, reasons };
};

// ── The walk: one part, then what it reaches, depth first in written order.
const refused = (at: { definition: string; path: string }, why: string) =>
  new Refused(`${at.definition} ${at.path}`, why);
const runPart = (
  w: Walk,
  path: Path,
  sel: { node: string; alt: Alternative },
  tag: string,
  event: any,
  fused = false,
) => {
  const { alt, node } = sel;
  const inc = beforeInc(w, path);
  const view = inView(inc, event);
  const patch = alt.patch ? run(alt.patch, view as never) : undefined;
  const source = w.parts.length === 0 && !fused;
  // Before-walk: the source's patch is visible to resetOn and input (rule 22's one exception).
  if (source && patch)
    w.root = withKid(w.root, path, (i) => ({ ...i, memory: { ...i.memory, ...patch } }));
  w.parts.push({
    path,
    alt,
    node,
    tag,
    event,
    ...(patch ? { patch } : {}),
    ...(source ? { source: true as const } : {}),
    ...(fused ? { fused: true as const } : {}),
  });
  if (alt.target !== "self") {
    if (fused) throw refused(alt.at, "whenAbandoned may not target");
    if (w.move) throw refused(alt.at, "TwoStateChangers");
    w.move = { path, target: alt.target, history: alt.history === true };
  }
  if (source) doResets(w);
  for (const r of alt.raises ?? []) {
    // D118: a raise with no name reaches nobody. The turn runs.
    const named = r.key ? entered(() => run(r.key!, view as never)) : { ok: true as const, v: undefined };
    if (!named.ok) {
      issue(w.tx, { code: "UnencodableValue", origin: `${alt.at.definition} ${alt.at.path}` });
      note(w.tx, "droppedRaise", { to: r.to });
      continue;
    }
    const key = named.v as string | undefined;
    const part = partOf(r.to, key);
    let child = kidAt(w.root, [...path, part]);
    if (!child && key !== undefined) child = seedIfListed(w, path, r.to, key);
    if (!child) {
      if (w.item && w.item.k !== "send") {
        note(w.tx, "droppedRaise", { to: part });
        continue;
      }
      throw refused(alt.at, `a raise into ${part}, which is absent`);
    }
    const payload = r.from ? run(r.from, view as never) : {};
    const cp = [...path, part];
    const s = select(w, cp, { tag: r.event, payload });
    if ("denied" in s) throw refused(alt.at, `${part} cannot react to ${r.event}`);
    runPart(w, cp, s, r.event, payload);
  }
  for (const n of alt.notify ?? []) reach(w, path, n, view, "callbacks", alt);
  if (alt.exit) reach(w, path, alt.exit, view, "exits", alt);
};
const seedIfListed = (w: Walk, hostPath: Path, name: string, key: string) => {
  const host = kidAt(w.root, hostPath)!;
  const p = placementOf(w.m, host, name);
  if (!p?.each) return undefined;
  const hit = membership(host, p).keys.find((x) => x.key === key);
  if (!hit) return undefined;
  const part = partOf(name, key);
  const k = seed(w.tx, w.m, host, p, [...hostPath, part], key, hit.item, w.started);
  w.root = withKid(w.root, hostPath, (i) => ({ ...i, kids: { ...i.kids, [part]: k } }));
  markFresh(w);
  return k;
};
// A callback's or an exit's filling, in the host (rule 6).
const reach = (
  w: Walk,
  path: Path,
  n: Notify,
  view: object,
  kind: "callbacks" | "exits",
  from: Alternative,
  fused = false,
) => {
  if (path.length === 0) return;
  const hostPath = path.slice(0, -1);
  const kid = (kidAt(w.root, path) ?? kidAt(w.root0, path))!;
  const host = beforeInc(w, hostPath);
  const p = placementOf(w.m, host, kid.name!);
  const alts = p?.[kind]?.[n.name];
  if (!alts) {
    if (kind === "exits") throw refused(from.at, `exit ${n.name} is not filled`);
    return; // an optional callback, unfilled
  }
  const payload = {
    ...(n.from ? run(n.from, view as never) : {}),
    ...(kid.key === undefined ? {} : { key: kid.key }),
  };
  const hv = inView(host, payload);
  next: for (const alt of alts) {
    if (!tokensPass(w, hostPath, host, alt, hv).pass) continue;
    for (const g of alt.guards) if (isDenial(run(g, hv as never))) continue next;
    if (w.lateFill && leavesWork(w, host, alt)) continue;
    if (kind === "exits") w.exited.add(kid.id);
    const node = host.leaf;
    runPart(w, hostPath, { node, alt }, n.name, payload, fused);
    return;
  }
  throw refused(from.at, `no filling of ${n.name} accepted`);
};

// ── Resets on before-walk (rule 1). Declaration order; `.each` keeps one value for the list.
const doResets = (w: Walk) => {
  const visit = (path: Path) => {
    const host = kidAt(w.root, path);
    if (!host) return;
    for (const { p } of placementsActive(w.m, host)) {
      if (!p.resetOn) continue;
      const now = resetValue(w.tx, p.resetOn!, inView(host, {}));
      for (const part of partsNamed(host, p.name)) {
        const kid = host.kids[part]!;
        if (kid.frozen || kid.reset === now) continue;
        endInc(w, path, part, p);
        if (p.each || now === undefined) continue; // OD29 F: becoming absent ends the incarnation as removal does
        const cur = kidAt(w.root, path)!;
        const fresh = seed(w.tx, w.m, cur, p, [...path, part], undefined, undefined, w.started);
        w.root = withKid(w.root, path, (i) => ({ ...i, kids: { ...i.kids, [part]: fresh } }));
        markFresh(w);
      }
      // OD29 F: becoming present starts one (a frozen resumable copy is the thaw's business).
      if (!p.each && now !== undefined && partsNamed(kidAt(w.root, path)!, p.name).length === 0) {
        const cur = kidAt(w.root, path)!;
        const fresh = seed(w.tx, w.m, cur, p, [...path, p.name], undefined, undefined, w.started);
        w.root = withKid(w.root, path, (i) => ({ ...i, kids: { ...i.kids, [p.name]: fresh } }));
        markFresh(w);
      }
    }
    for (const part of Object.keys(kidAt(w.root, path)?.kids ?? {})) visit([...path, part]);
  };
  visit([]);
};
// Ended: taken out of the working tree, and its descendants with it, for whenAbandoned and for what they owned.
const endInc = (w: Walk, hostPath: Path, part: string, p: Placement) => {
  const path = [...hostPath, part];
  const inc = kidAt(w.root, path)!;
  const collect = (i: Inc, pp: Path, pl: Placement, h: Path) => {
    for (const [n, k] of Object.entries(i.kids))
      collect(k, [...pp, n], placementOf(w.m, i, k.name!)!, pp);
    w.ended.push({ inc: i, path: pp, p: pl, host: h });
  };
  collect(inc, path, p, hostPath);
  w.root = withKid(w.root, hostPath, (i) => {
    const { [part]: _gone, ...kids } = i.kids;
    return { ...i, kids };
  });
};
// A resumable trait's life pauses (rule 1, rule 52): schedules keep dueAt, a queued firing is retracted, lookups are interrupted.
const freezeInc = (w: Walk, hostPath: Path, part: string) => {
  const path = [...hostPath, part];
  const inc = kidAt(w.root, path)!;
  if (inc.frozen) return; // M2: already paused by its own host's move; a freeze from above changes nothing
  const tx = w.tx;
  const timers = Object.values(tx.w.timers).filter(
    (t): t is FrozenTimer => t.kind === "schedule" && t.inc === inc.id,
  );
  for (const t of timers) disarmTimer(tx, t.key);
  const queued: FrozenTimer[] = [];
  const queuedReads: Mail[] = [];
  const keep = (m: Mail) => {
    if (m.k === "fire" && m.inc === inc.id) {
      queued.push({
        key: `fired/${m.inc}/${m.event.tag}`,
        gen: "",
        dueAt: tx.env.now,
        kind: "schedule",
        actor: m.actor,
        inc: m.inc,
        activation: m.activation,
        send: m.event.tag,
        id: m.event.tag,
      });
      return false;
    }
    // Rule 52: a read's answer not yet heard is a read of this life, and a freeze interrupts it.
    if (m.k === "ending" && m.inc === inc.id) {
      note(tx, "parked", { op: m.op, attempt: m.attempt ?? "" });
      queuedReads.push({ ...m, ending: { ch: "failure", tag: "Interrupted", value: {} } });
      return false;
    }
    return true;
  };
  tx.w = { ...tx.w, mail: tx.w.mail.filter(keep), follow: tx.w.follow.filter(keep) };
  const parked: Mail[] = [...queuedReads, ...dropReadsOf(tx, inc.id, false).map((r): Mail => {
    const e = { ch: "failure" as const, tag: "Interrupted", value: {} };
    noteEnding(tx, { op: r.op, attempt: `read/${r.actor}/${r.inc}/${r.op}`, send: r.gen }, e);
    note(tx, "parked", { op: r.op, attempt: `read/${r.actor}/${r.inc}/${r.op}` });
    return {
      k: "ending",
      actor: r.actor,
      op: r.op,
      key: r.key,
      owner: r.owner,
      ending: e,
      input: r.input,
      attempt: `read/${r.actor}/${r.inc}/${r.op}`,
      inc: r.inc,
    };
  })];
  w.root = withKid(w.root, path, (i) => ({
    ...i,
    frozen: { timers: [...timers, ...queued], parked },
  }));
  for (const k of Object.keys(kidAt(w.root, path)!.kids)) freezeInc(w, path, k); // a child's life pauses with its host
};
const thawInc = (w: Walk, path: Path) => {
  const inc = kidAt(w.root, path)!;
  const { frozen, ...rest } = inc;
  w.root = withKid(w.root, path, () => rest);
  const tx = w.tx;
  const follows: Mail[] = [...(frozen?.parked ?? [])];
  for (const p of frozen?.parked ?? [])
    if (p.k === "ending") note(tx, "unparked", { op: p.op, attempt: p.attempt ?? "" });
  for (const t of frozen?.timers ?? []) {
    if (t.dueAt <= tx.env.now)
      follows.push({
        k: "fire",
        actor: t.actor,
        inc: t.inc,
        activation: t.activation,
        event: { tag: t.send, payload: {} },
      });
    else {
      const { gen: _g, ...spec } = t;
      armTimer(tx, spec);
    }
  }
  w.thawFollows.push(...follows);
  w.thawed.push(path);
  // M2: a child thaws only if its own placement's node is active. One left by its own host's move stays frozen.
  const m = fragOf(w.m, rest);
  const live = up(m, rest.leaf);
  const onActive = (name: string) =>
    live.some((n) => {
      const node = m.nodes[n]!;
      return node.placements?.some((p) => p.name === name) || node.subroutine?.name === name;
    });
  for (const k of Object.keys(rest.kids)) {
    const kid = rest.kids[k]!;
    if (kid.frozen && onActive(kid.name!)) thawInc(w, [...path, k]);
  }
};

// ── Apply the one state change, then what it starts and ends.
const applyMove = (w: Walk) => {
  const mv = w.move;
  if (!mv) return { entered: new Map<string, readonly string[]>() };
  const inc = kidAt(w.root, mv.path);
  const entered = new Map<string, readonly string[]>();
  if (!inc) return { entered };
  const frag = fragOf(w.m, inc);
  const { exits, enters, dest } = exitSet(w, inc, mv.target, mv.history);
  const activations = { ...inc.activations };
  const history = { ...inc.history };
  for (const n of exits) {
    delete activations[n];
    const parent = frag.nodes[n]!.parent;
    if (parent) history[parent] = inc.leaf;
  }
  for (const n of enters) activations[n] = nextGen(w.tx);
  w.root = withKid(w.root, mv.path, (i) => ({ ...i, leaf: dest, activations, history }));
  // A trait on an exited node ends, or freezes; a subroutine ends.
  for (const n of exits) {
    const node = frag.nodes[n]!;
    for (const p of [...(node.placements ?? []), ...(node.subroutine ? [node.subroutine] : [])]) {
      for (const part of partsNamed(kidAt(w.root, mv.path)!, p.name)) {
        // Rule 1: "Re-entering X does not refresh it".
        if (p.resumable) {
          if (!enters.includes(n)) freezeInc(w, mv.path, part);
        } else endInc(w, mv.path, part, p);
      }
    }
  }
  for (const n of enters) {
    for (const part of Object.keys(kidAt(w.root, mv.path)!.kids)) {
      const k = kidAt(w.root, [...mv.path, part])!;
      const p = frag.nodes[n]!.placements?.find((x) => x.name === k.name);
      if (!k.frozen || !p) continue;
      // D64: a thaw checks first. A changed reset value means this life is over: no frame of the old subject (rule 52).
      if (p.resetOn && resetValue(w.tx, p.resetOn, inView(kidAt(w.root, mv.path)!, {})) !== k.reset)
        endInc(w, mv.path, part, p);
      else thawInc(w, [...mv.path, part]);
    }
  }
  const cur = kidAt(w.root, mv.path)!;
  const seeded = seedKids(w.tx, w.m, cur, [...enters].reverse(), mv.path, w.started);
  w.root = withKid(w.root, mv.path, () => seeded);
  markFresh(w);
  entered.set(cur.id, enters);
  return { entered };
};
const applyPatches = (w: Walk, from: number) => {
  const wrote = new Map<string, Set<string>>();
  w.parts.forEach((part, i) => {
    if (!part.patch) return;
    const id = JSON.stringify(part.path);
    const set = wrote.get(id) ?? new Set<string>();
    for (const k of Object.keys(part.patch)) {
      if (set.has(k)) throw refused(part.alt.at, `OverlappingKeys ${k}`);
      set.add(k);
    }
    wrote.set(id, set);
    if (i < from || part.source) return;
    w.root = withKid(w.root, part.path, (x) => ({ ...x, memory: { ...x.memory, ...part.patch } }));
  });
};
// Rule 9: the final list decides membership, on every active host.
const applyLists = (w: Walk) => {
  const visit = (path: Path) => {
    let host = kidAt(w.root, path);
    if (!host) return;
    const active = placementsActive(w.m, host).filter(({ p }) => p.each);
    for (const { p } of active) {
      const { keys, repairs } = membership(host, p);
      for (let i = 0; i < repairs; i++) note(w.tx, "listRepair", { field: p.each!.of });
      const want = new Set(keys.map((k) => k.key));
      for (const part of partsNamed(host, p.name)) {
        if (want.has(host.kids[part]!.key!)) continue;
        endInc(w, path, part, p);
      }
      for (const { key, item } of keys) {
        host = kidAt(w.root, path)!;
        const part = partOf(p.name, key);
        if (host.kids[part]) continue;
        const k = seed(w.tx, w.m, host, p, [...path, part], key, item, w.started);
        w.root = withKid(w.root, path, (i) => ({ ...i, kids: { ...i.kids, [part]: k } }));
      }
      markFresh(w);
      // M7: in the field's order.
      const order = keys.map((k) => partOf(p.name, k.key));
      const cur = kidAt(w.root, path)!;
      const now = partsNamed(cur, p.name);
      if (!samePath(now, order)) {
        const rest = Object.keys(cur.kids).filter((x) => cur.kids[x]!.name !== p.name);
        const kids = Object.fromEntries([...rest, ...order].map((x) => [x, cur.kids[x]!]));
        w.root = withKid(w.root, path, (i) => ({ ...i, kids }));
      }
    }
    // M3: frozen copies are reconciled every turn too (rule 9). A removed one has ended; nothing is seeded.
    const on = new Set(active.map(({ p }) => p.name));
    for (const p of Object.values(fragOf(w.m, host).nodes).flatMap((n) => n.placements ?? [])) {
      if (!p.each || on.has(p.name)) continue;
      host = kidAt(w.root, path)!;
      const want = new Set(membership(host, p).keys.map((k) => k.key));
      for (const part of partsNamed(host, p.name))
        if (host.kids[part]!.frozen && !want.has(host.kids[part]!.key!)) endInc(w, path, part, p);
    }
    const names = active.map(({ p }) => p.name);
    host = kidAt(w.root, path)!;
    if (!samePath(names, host.each ?? []))
      w.root = withKid(w.root, path, (i) => {
        const { each: _e, ...rest } = i;
        return names.length ? { ...rest, each: names } : rest;
      });
    for (const part of Object.keys(kidAt(w.root, path)?.kids ?? {})) visit([...path, part]);
  };
  visit([]);
};
// Fused into the leaving turn, deepest first. Mappers read the incarnation's pre-turn memory (rule 6).
const applyLeaving = (w: Walk) => {
  const from = w.parts.length;
  const ended = w.ended;
  for (const e of ended) {
    if (w.fresh.has(e.inc.id) && !kidAt(w.root0, e.path)) continue; // created and ended in one turn: never published
    if (w.exited.has(e.inc.id)) continue; // rule 6: "other than by its own exit". Its descendants were abandoned
    const frag = w.m.fragments![e.inc.frag!]!;
    const wa = frag.whenAbandoned;
    if (!wa) continue;
    if (kidAt(w.root, e.host))
      for (const n of wa.notify ?? []) {
        const view = inView(kidAt(w.root0, e.path) ?? e.inc, {});
        const at = { at: { definition: frag.id, path: "whenAbandoned" } } as never;
        reach(w, e.path, n, view, "callbacks", at, true);
      }
    for (const op of wa.release ?? []) w.releases.push({ op, subject: e.inc.subject });
  }
  applyPatches(w, from);
};
const ownerOf = (w: Walk, part: Part): Owner => {
  const inc = kidAt(w.root, part.path) ?? kidAt(w.root0, part.path)!;
  const frag = fragOf(w.m, inc);
  const moved = w.move && samePath(w.move.path, part.path) && part.alt.target !== "self";
  const node = moved ? (w.move!.target in frag.nodes ? w.move!.target : inc.leaf) : part.node;
  const at = (n: string) => inc.activations[n] ?? "";
  return {
    inc: inc.id,
    node,
    activation: at(node),
    chain: up(frag, node)
      .slice(1)
      .map((n) => ({ node: n, activation: at(n) })),
  };
};
// The new suite's Port change 1: a lane member as the turn reports it, its lane named before any cell runs. Lookups, module members and
// a read's cancels are not lane members. Key-less: an unkeyed operation's one lane; in an ending of its operation with an Attempt, that
// ending's lane; a cancel outside an ending, every lane of the operation for this actor. `nothing`: the member names no lane (a key that
// did not enter, an ending with no Attempt or of another operation, a key-less retry outside an ending), and applyMembers does nothing.
const memberOf = (w: Walk, mem: Member, key: unknown, unencodable: boolean): Walk["members"] => {
  const op = w.m.ops[mem.op]!;
  if (op.kind === "read" || !(mem.verb === "commit" || mem.verb === "retry" || mem.verb === "cancel" || mem.verb === "cancelAll")) return [];
  const it = w.item;
  const named = (k: unknown) => (k === undefined || k === null ? { t: "nothing" as const } : { t: "key" as const, key: k });
  const target: Walk["members"][number]["target"] =
    op.keyFields?.length === 0
      ? { t: "only" }
      : mem.verb === "commit"
        ? named(key)
        : mem.key
          ? unencodable ? { t: "nothing" } : named(key)
          : it?.k === "ending"
            ? it.op === mem.op && it.attempt ? named(it.key) : { t: "nothing" }
            : mem.verb === "retry" ? { t: "nothing" } : { t: "every" };
  return [{ op: mem.op, kind: mem.verb, target }];
};
// P5 first: every select runs before any cell, so a throw leaves no cell behind. P6 then applies in action order.
const applyMembers = (w: Walk) => {
  const tx = w.tx;
  const reads = w.parts.flatMap((part) => {
    const inc = kidAt(w.root, part.path) ?? kidAt(w.root0, part.path)!;
    const after = inView(inc, part.event);
    return part.alt.members.map((mem: Member) => {
      const op = w.m.ops[mem.op]!;
      const owner = ownerOf(w, part);
      // D108: one reader. What each verb does with a value that did not enter is `UNENCODABLE`, below.
      let asked: { input: unknown } | undefined;
      const got = entered(() => {
        if (mem.verb === "commit" || mem.verb === "lookup") {
          const input = run(mem.input, after as never);
          asked = { input };
          return { input, key: run(op.key, input), value: undefined };
        }
        if (mem.verb === "module") return { input: undefined, key: undefined, value: mem.value ? run(mem.value, after as never) : undefined };
        return { input: undefined, key: mem.key ? run(mem.key, after as never) : undefined, value: undefined };
      });
      if (!got.ok) {
        const input = asked ? asked.input : got.value;
        // D123: only the part that failed the door is lost. If the input can still name its lane, that is the lane it was asked of.
        const key = mem.verb === "commit" || mem.verb === "lookup" ? nameOf(op, input) : null;
        return { part, mem, inc, unencodable: true, input, key, value: undefined, prepared: undefined, owner };
      }
      const prepared = mem.verb === "commit" ? prepareAll(tx, { machine: w.a.machine, op: mem.op, input: got.v.input }) : {};
      return { part, mem, inc, unencodable: false, ...got.v, prepared, owner };
    });
  });
  w.members = [
    ...reads.flatMap((r) => memberOf(w, r.mem, r.key, r.unencodable)),
    ...w.releases.map(({ op }) => ({ op, kind: "release", target: w.m.ops[op]?.keyFields?.length === 0 ? { t: "only" as const } : { t: "every" as const } })),
  ];
  for (const r of reads) {
    const { mem, inc } = r;
    const op = w.m.ops[mem.op]!;
    const base = { actor: w.a.key, machine: w.a.machine, op: mem.op, owner: r.owner };
    if (mem.verb === "lookup") clearStranded(tx, w.a.key, inc.id, mem.op); // D123: this life's next ask is what replaces its lost answer
    if (r.unencodable) {
      issue(tx, { code: "UnencodableValue", origin: `${w.a.machine} ${mem.op}` });
      // D108: by verb. A module's value goes nowhere. A `retry` or `cancel` key names no lane, since no lane has a key with no text.
      if (mem.verb === "lookup") lookupUnencodable(tx, { ...base, inc: inc.id, input: r.input, key: r.key });
      else if (mem.verb === "commit")
        decline(tx, { ...base, key: r.key, input: r.input, subject: op.fragment ? inc.subject : [] }, "Unencodable"); // D114
      continue;
    }
    if (mem.verb === "module") {
      // M8: in action order. A refused turn restores tx.w, the module's slice with it.
      moduleTold(tx, mem.module, {
        k: "member",
        actor: w.a.key,
        inc: inc.id,
        op: mem.op,
        name: mem.name,
        value: r.value,
      });
      continue;
    }
    if (mem.verb === "lookup") {
      lookup(tx, { ...base, input: r.input, key: r.key, inc: inc.id });
      continue;
    }
    if (op.kind === "read") {
      if (mem.verb === "cancel" || mem.verb === "cancelAll") cancelRead(tx, w.a.key, inc.id, mem.op);
      continue;
    }
    const subject = op.fragment ? inc.subject : [];
    if (mem.verb === "commit") {
      // D26, review H3: this machine declared write-ahead, and this tab cannot do it. It declines, as an ending; nothing goes out.
      if (w.m.persisted && !tx.w.persistence) {
        decline(tx, { ...base, key: r.key, input: r.input, subject }, "NoPersistence");
        continue;
      }
      const lane = tx.w.lanes[laneKey(w.a.key, mem.op, r.key)];
      if (lane && !sameSubject(lane.subject, subject)) {
        decline(tx, { ...base, key: r.key, input: r.input, subject }, "Rejected"); // rule 51
        continue;
      }
      cell(tx, "commit", lane, {
        ...base,
        key: r.key,
        input: r.input,
        subject,
        prepared: r.prepared!,
      });
      continue;
    }
    const it = w.item;
    const cancels = mem.verb === "cancel" || mem.verb === "cancelAll";
    // D123: a key-less `cancel` outside an ending names no Attempt (D22), and every kept ending of the op it can see is its to let go.
    if (cancels && !mem.key && it?.k !== "ending" && op.keyFields?.length !== 0) {
      for (const l of Object.values(tx.w.lanes))
        if (l.actor === w.a.key && l.op === mem.op && sameSubject(l.subject, subject) && ofIdentity(tx, l)) letGoKept(tx, l); // Q17: never the old identity's
      continue;
    }
    // D221: a keyed `retry(k)`/`cancel(k)` names the lane of exactly that key, in its own version: an old-version hold is named by its own old
    // key through `previous[i]` (2.7.15), the owner's way out.
    const named = mem.key
      ? ofVersion(tx.w.lanes[laneKey(w.a.key, mem.op, r.key)], op, mem.previous)
      : op.keyFields?.length === 0
        ? tx.w.lanes[laneKey(w.a.key, mem.op, {})] // rule 43: on an unkeyed operation a key-less member names its one lane, in an ending or not
        : it?.k === "ending" && it.op === mem.op && it.attempt
        ? laneOfAttempt(tx.w, it.attempt) // D22: key-less names the ending's own Attempt only
        : undefined;
    const lane = named && cancels && sameSubject(named.subject, subject) ? letGoKept(tx, named) : named;
    // In a NotSent ending there is no Attempt: a key-less member does nothing (2.7.13).
    if (!mem.key && !lane) {
      if (it?.k === "ending") continue;
    }
    if (lane && !sameSubject(lane.subject, subject)) {
      note(tx, mem.verb === "retry" ? "NothingToResend" : "OtherPath", { op: mem.op }); // rule 51
      continue;
    }
    if (mem.verb === "cancelAll")
      cancelAll(tx, lane, { ...base, key: lane?.key ?? r.key }, lane !== undefined && w.releases.some((x) => x.op === mem.op && sameSubject(x.subject, lane.subject)));
    else cell(tx, mem.verb, lane, { ...base, key: lane?.key ?? r.key });
  }
  // Rule 60: after every member.
  for (const { op, subject } of w.releases)
    for (const l of Object.values(tx.w.lanes))
      if (l.actor === w.a.key && l.op === op && sameSubject(l.subject, subject) && ofIdentity(tx, l))
        cell(tx, "release", l, argsOf(l));
};

// ── Schedules. Rule 23, 2.5 step 6: entry schedules of what was entered, armOn on an event accepted anywhere on the path.
const collectArmings = (w: Walk, entered: ReadonlyMap<string, readonly string[]>) => {
  const arm: Array<{ inc: Inc; spec: any; ms: number }> = [];
  const disarm: string[] = [];
  const armAt = (inc: Inc, n: string, tags: readonly string[], isEntry: boolean) => {
    const node = fragOf(w.m, inc).nodes[n]!;
    for (const spec of node.schedules) {
      const onEntry = spec.armOn.length === 0 || spec.armOn.includes("entry");
      if ((isEntry && onEntry) || spec.armOn.some((t) => tags.includes(t))) {
        const ms =
          "ms" in spec.schedule ? spec.schedule.ms : run(spec.schedule, inView(inc, {}) as never);
        arm.push({ inc, spec, ms });
      }
      if (spec.disarmOn.some((t) => tags.includes(t)))
        disarm.push(scheduleKey(w.a.key, inc.id, inc.activations[n] ?? "", spec.id));
    }
  };
  const tagsOf = new Map<string, { path: Path; tags: string[] }>();
  for (const part of w.parts) {
    const id = JSON.stringify(part.path);
    const e = tagsOf.get(id) ?? { path: part.path, tags: [] };
    tagsOf.set(id, { path: e.path, tags: [...e.tags, part.tag] });
  }
  for (const { path, tags } of tagsOf.values()) {
    const inc = kidAt(w.root, path);
    if (!inc) continue;
    for (const n of up(fragOf(w.m, inc), inc.leaf)) armAt(inc, n, tags, false);
  }
  for (const [id, nodes] of entered) {
    const p = pathOfId(w.root, id);
    if (!p) continue;
    const inc = kidAt(w.root, p)!;
    for (const n of nodes) armAt(inc, n, [], true);
  }
  for (const s of w.started) {
    const inc = kidAt(w.root, s.path);
    if (inc?.id !== s.inc.id) continue;
    for (const n of s.entered) armAt(inc, n, [], true);
  }
  return { arm, disarm };
};
// C: every timer whose activation or incarnation is gone. Rule 1's "its schedules are cancelled".
const reapTimers = (w: Walk) => {
  const tx = w.tx;
  const live = (inc: string, activation: string) => {
    const p = pathOfId(w.root, inc);
    const i = p && kidAt(w.root, p);
    return !!i && (!!i.frozen || Object.values(i.activations).includes(activation));
  };
  // D123: what a life is owed ends with it.
  reapStranded(tx, (s) => s.actor === w.a.key && !pathOfId(w.root, s.inc));
  // D118: rule 1 for a kept firing too.
  if (tx.w.keptFires.some((f) => f.actor === w.a.key && !live(f.inc, f.activation)))
    tx.w = { ...tx.w, keptFires: tx.w.keptFires.filter((f) => f.actor !== w.a.key || live(f.inc, f.activation)) };
  for (const t of Object.values(tx.w.timers)) {
    if (t.kind !== "schedule" || t.actor !== w.a.key) continue;
    const p = pathOfId(w.root, t.inc);
    const inc = p && kidAt(w.root, p);
    if (!inc || (!inc.frozen && !Object.values(inc.activations).includes(t.activation)))
      disarmTimer(tx, t.key);
  }
  // Round 14 (rule 73): a waiting deadline of an activation that has ended goes with it, as its armed timer would.
  for (const t of Object.values(tx.w.waiting)) if (t.actor === w.a.key && !live(t.inc, t.activation)) disarmTimer(tx, t.key);
};
// Adoption (rule 54): per lane whose path is its own, parked endings, then a held head's unknown { Restored } once.
export const adoption = (tx: Tx, a: ActorRec, inc: Inc, thawing = false): Mail[] => {
  const m = machineOf(tx, a);
  const out: Mail[] = [];
  const holds: Mail[] = []; // rule 54: every parked ending first, then each lane's hold
  const lanes = Object.values(tx.w.lanes).sort((x, y) => (x.head?.mint ?? 0) - (y.head?.mint ?? 0));
  for (const l of lanes) {
    if (l.actor !== a.key || !sameSubject(l.subject, inc.subject) || !ofIdentity(tx, l)) continue; // rule 74: never the old identity's
    const owner = m.ops[l.op]?.fragment ?? null;
    if (owner !== inc.frag) continue;
    for (const p of l.parked) {
      note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });
      out.push({
        k: "ending",
        actor: a.key,
        op: l.op,
        key: l.key,
        owner: p.owner,
        ending: p.ending,
        input: p.input,
        subject: l.subject,
        ...(p.attempt ? { attempt: p.attempt } : {}),
        ...(p.kept ? { kept: true as const, redelivered: true as const } : {}), // D123: one try per life or boot. It was refused twice already
      });
    }
    const had = l.parked.some((p) => p.attempt === l.head?.id);
    let next: Lane = { ...l, parked: [] };
    if (next.releasing && !m.local) {
      const { releasing: _r, ...rest } = next;
      next = rest;
    }
    if (!next.head && next.parked.length === 0) deleteLane(tx, l.id);
    else if (next !== l) setLane(tx, next);
    // A thawed life is the one that owned this hold: it has heard. Only a new one is told Restored.
    if (!thawing && l.head?.phase.t === "held" && !had) {
      const e = { ch: "unknown" as const, reason: "Restored" };
      note(tx, "lane", { cell: "lane.rebind.Held", op: l.op, attempt: l.head.id });
      noteEnding(tx, { op: l.op, attempt: l.head.id }, e);
      holds.push({
        k: "ending",
        actor: a.key,
        op: l.op,
        key: l.key,
        owner: l.head.owner,
        ending: e,
        input: l.head.input,
        subject: l.subject,
        attempt: l.head.id,
        restored: true,
      });
    }
  }
  return [...out, ...holds];
};
export const startActor = (tx: Tx, a: ActorRec) => adoption(tx, a, a.root);
// H5: a rebind is an adoption of every life in the tree that is awake. A frozen one adopts at its thaw (rule 54).
export const rebindActor = (tx: Tx, a: ActorRec): Mail[] => {
  const out: Mail[] = [];
  walkIncs(a.root, (i) => {
    if (!i.frozen) out.push(...adoption(tx, a, i));
  });
  return out;
};
const recheckResets = (w: Walk): boolean => {
  let pending = false;
  walkIncs(w.root, (host) => {
    if (host.frozen) return;
    for (const { p } of placementsActive(w.m, host)) {
      if (!p.resetOn) continue;
      const now = resetValue(w.tx, p.resetOn!, inView(host, {}));
      for (const part of partsNamed(host, p.name))
        if (!host.kids[part]!.frozen && host.kids[part]!.reset !== now) pending = true;
      if (!p.each && now !== undefined && partsNamed(host, p.name).length === 0) pending = true; // OD29 F: a value became present
    }
  });
  return pending;
};

// ── One turn over a working copy.
const newWalk = (tx: Tx, a: ActorRec, item: Mail | undefined, late: boolean): Walk => ({
  tx,
  a,
  m: machineOf(tx, a),
  root0: a.root,
  root: a.root,
  parts: [],
  fresh: new Set(),
  started: [],
  ended: [],
  releases: [],
  item,
  late,
  thawFollows: [],
  thawed: [],
  exited: new Set(),
  members: [],
});
const finish = (
  w: Walk,
  entered: ReadonlyMap<string, readonly string[]>,
  ev: { tag: string },
  from: string,
) => {
  const tx = w.tx;
  applyMembers(w);
  const armings = collectArmings(w, entered);
  const reset = recheckResets(w);
  const m = w.m;
  // D89: O5. Memory that will not encode does not refuse the turn. The driver keeps the whole batch back, with the last good capture on disk.
  const follows = w.parts.flatMap((p) =>
    (p.alt.followUps ?? []).map((f) =>
      run(f, inView(kidAt(w.root, p.path) ?? kidAt(w.root0, p.path)!, p.event) as never),
    ),
  );
  // C: cannot throw. Every closure above has run.
  for (const k of armings.disarm) disarmTimer(tx, k);
  const actor: ActorRec = { ...w.a, root: w.root };
  tx.w = { ...tx.w, actors: setActor(tx.w.actors, w.a.key, actor) };
  reapTimers(w);
  for (const x of armings.arm)
    armTimer(tx, {
      key: scheduleKey(w.a.key, x.inc.id, x.inc.activations[nodeOfSpec(w, x)] ?? "", x.spec.id),
      kind: "schedule",
      actor: w.a.key,
      inc: x.inc.id,
      activation: x.inc.activations[nodeOfSpec(w, x)] ?? "",
      send: x.spec.send,
      id: x.spec.id,
      dueAt: tx.env.now + x.ms,
    });
  // Rule 52: what ended takes its lookups with it. Its write lanes run on; a parked or held one waits for the next (rule 53).
  for (const e of w.ended) {
    dropReadsOf(tx, e.inc.id);
    for (const p of e.inc.frozen?.parked ?? []) if (p.k === "ending") note(tx, "ParkedLetGo", { op: p.op, attempt: p.attempt ?? "" }); // rule 52: its life is over
  }
  tx.touchedActors.add(w.a.key);
  note(tx, "turn", {
    actor: w.a.key,
    event: ev.tag,
    from,
    to: w.root.leaf,
    ...((w.parts[0]?.event as any)?.n !== undefined ? { n: (w.parts[0]?.event as any).n } : {}),
    // Round 13 (`flow graph`'s conformance gate, `flow trace`): which alternative ran in which incarnation, and where the moved one went. Read only by tools.
    parts: w.parts.map((p) => ({ path: p.path, definition: p.alt.at.definition, at: p.alt.at.path, node: p.node, tag: p.tag, target: p.alt.target, ...(p.fused ? { fused: true } : {}) })),
    members: w.members,
    ...(w.move ? { moved: { path: w.move.path, from: kidAt(w.root0, w.move.path)?.leaf, to: kidAt(w.root, w.move.path)?.leaf } } : {}),
  });
  tx.visible = true;
  // D1, D35: a follow-up runs next, up to a bound per admitted item. A pending reset first, then adoption (rule 54).
  // M4: the bound drops only what can loop by itself: a send, a recheck. A thaw's or an adoption's ending is a fact (rule 8).
  const loops: Mail[] = [...(reset ? [{ k: "recheck" as const, actor: w.a.key }] : [])];
  const sends: Mail[] = follows.map((event: Ev) => ({ k: "send" as const, actor: w.a.key, event }));
  const facts: Mail[] = [
    ...w.thawFollows,
    ...w.thawed.flatMap((p) => {
      const live = kidAt(w.root, p);
      return live ? adoption(tx, actor, live, true) : [];
    }),
    ...w.started.flatMap((s) => {
      const live = kidAt(w.root, s.path);
      return live?.id === s.inc.id ? adoption(tx, actor, live) : [];
    }),
  ];
  const over = tx.w.chain >= tx.bounds.followUps;
  if (over && loops.length + sends.length > 0)
    issue(tx, {
      code: "InvalidTurn",
      origin: `${w.parts[0]?.alt.at.definition ?? m.id} ${w.parts[0]?.alt.at.path ?? ""}`,
      input: { chain: "FollowUpBound", event: ev.tag },
    });
  const mail = over ? facts : [...loops, ...facts, ...sends];
  if (mail.length) tx.w = { ...tx.w, follow: [...mail, ...tx.w.follow] };
};
const nodeOfSpec = (w: Walk, x: { inc: Inc; spec: { id: string } }) => {
  const frag = fragOf(w.m, x.inc);
  return (
    up(frag, x.inc.leaf).find((n) => frag.nodes[n]!.schedules.some((s) => s.id === x.spec.id)) ?? ""
  );
};
const runTurn = (
  tx: Tx,
  a: ActorRec,
  path: Path,
  ev: Ev,
  start: string | undefined,
  late: boolean,
  item: Mail | undefined,
) => {
  const w = newWalk(tx, a, item, late);
  const sel = select(w, path, ev, start);
  if ("denied" in sel)
    return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons });
  w.late = false; // the source is chosen; below, only a filling's own target can still leave (rule 15 in step 3)
  w.lateFill = late;
  runPart(w, path, sel, ev.tag, ev.payload);
  const { entered } = applyMove(w);
  applyPatches(w, 0);
  applyLists(w);
  applyLeaving(w);
  finish(w, entered, ev, a.root.leaf);
};
// A pending reset's follow-up (rule 1): no event, resets and whenAbandoned, cannot refuse by a guard.
const runRecheck = (tx: Tx, a: ActorRec) => {
  const w = newWalk(tx, a, undefined, false);
  doResets(w);
  applyLists(w); // M2: an `.each` whose reset was pending reseeds in this turn
  applyLeaving(w);
  finish(w, new Map(), { tag: "PendingReset" }, a.root.leaf);
};

// ── Admit. Rule 14's test, inside the binding incarnation. Rule 53: no binding incarnation, parked. Rule 60: evidence.
const bindingOf = (tx: Tx, a: ActorRec, op: string, subject: readonly string[]): Path | undefined =>
  bindingIn(tx.machines, a, op, subject);
// Stage E: the same question, asked from outside a turn, so the suite can check it against its own reference (`conformance/reference/`).
export const bindingIn = (
  machines: Readonly<Record<string, Compiled>>,
  a: ActorRec,
  op: string,
  subject: readonly string[],
): Path | undefined => {
  const frag = machines[a.machine]!.ops[op]?.fragment ?? null;
  if (frag === null) return [];
  const here: string[] = [];
  const find = (i: Inc): boolean => {
    if (i.frag === frag && !i.frozen && sameSubject(i.subject, subject)) return true;
    for (const name of Object.keys(i.kids)) {
      here.push(name);
      if (find(i.kids[name]!)) return true;
      here.pop();
    }
    return false;
  };
  return find(a.root) ? [...here] : undefined;
};
// D123: it stays with what owes it, and ends with that. A read's answer is owed to the life that asked: a wait until its next ask, or its end. A write's ending and a decline go on the lane of their key: on disk if persisted, and heard at the next boot or adoption. A hold's lane already holds it. Only an ending that was sent blocks its key (`columnOf`), and a newer decline says all an older one did.
const keepEnding = (tx: Tx, a: ActorRec, item: EndingMail) => {
  const lane = tx.w.lanes[laneKey(item.actor, item.op, item.key)];
  const said = { op: item.op, attempt: item.attempt ?? "" };
  if (item.inc) {
    note(tx, "kept", said);
    return strand(tx, item.actor, item.inc, item.op);
  }
  if (item.attempt && lane?.head?.id === item.attempt) return note(tx, "kept", said); // D114: only an Attempt can be a hold. A decline has none
  note(tx, "kept", { ...said, onLane: !item.kept });
  if (!item.attempt && lane?.parked.some((p) => !p.attempt && p.kept)) note(tx, "KeptLetGo", said);
  const base = !item.attempt && lane ? { ...lane, parked: lane.parked.filter((p) => p.attempt || !p.kept) } : lane;
  parkEnding(tx, item, base, item.subject ?? lane?.subject ?? [], a.machine, true);
};
const parkEnding = (
  tx: Tx,
  item: EndingMail,
  lane: Lane | undefined,
  subject: readonly string[],
  machine: string,
  kept = false, // D118: after a refused turn. Its `delivered` is already said, so nothing further is owed in evidence
) => {
  if (!kept) note(tx, "parked", { op: item.op, attempt: item.attempt ?? "" });
  const parked = {
    ...(kept || item.kept ? { kept: true as const } : {}),
    ...(item.attempt ? { attempt: item.attempt } : {}),
    ending: item.ending,
    owner: item.owner,
    input: item.input,
  };
  const base: Lane = lane ?? {
    id: laneKey(item.actor, item.op, item.key),
    actor: item.actor,
    machine,
    op: item.op,
    key: item.key,
    subject,
    w: [],
    parked: [],
  };
  setLane(tx, { ...base, parked: [...base.parked, parked] });
};
const mappedFor = (m: Compiled, item: EndingMail) => {
  const op = m.ops[item.op];
  if (!op) return undefined; // removed by this release: `UnmappedEnding` tells the owner
  const e = item.ending;
  if (e.ch === "success") return op.outcomes.success;
  if (e.ch === "failure") return op.outcomes.failure[e.tag];
  const u = op.outcomes.unknown;
  return u && "byReason" in u ? u.byReason[e.reason] : u;
};
const routeFrom = (tx: Tx, a: ActorRec, item: EndingMail, inc: Inc) => {
  if (item.restored || item.owner.inc !== inc.id) return { start: undefined, late: false }; // adopted, or Restored: current
  if (inc.activations[item.owner.node] === item.owner.activation)
    return { start: undefined, late: false };
  const near = item.owner.chain.find((x) => inc.activations[x.node] === x.activation);
  return { start: near?.node ?? fragOf(machineOf(tx, a), inc).root, late: true };
};
const admitEnding = (tx: Tx, item: EndingMail): void => {
  const laneId = item.lane ?? laneKey(item.actor, item.op, item.key);
  if (item.inc) return admitRead(tx, item);
  if (item.attempt && tx.w.interrupted?.[item.attempt]) {
    tx.w = { ...tx.w, interrupted: without(tx.w.interrupted, item.attempt) };
    return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt });
  }
  const before = item.onLane ? laneOfAttempt(tx.w, item.attempt!) : tx.w.lanes[laneId];
  const subject = item.subject ?? before?.subject ?? [];
  const machine = before?.machine ?? item.machine ?? getActor(tx.w.actors, item.actor)?.machine;
  const releasing = before?.releasing === true;
  if (item.onLane && before)
    cell(tx, admitRow(item), before, { ...argsOf(before), ending: item.ending });
  if (releasing) {
    const cur = tx.w.lanes[laneId];
    note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });
    if (item.ending.ch === "unknown" && cur?.head?.id === item.attempt && item.attempt)
      cell(tx, "cancel", cur, argsOf(cur)); // a release: its evidence is the cell's
    return;
  }
  // D72: this restored ending is now mail no more. The record on disk may follow.
  if (item.restored) tx.touchedLanes.set(laneId, item.actor);
  // OD28 (2.7.18): an ignored ending is admitted with no turn. Its cell's lane effect applied above; an unknown also releases the Attempt, as `cancel`
  // does in Held (rule 40, P1: 2.8.6's `Released` row), at admission. No event, no handler, no late route, no parking, with or without an incarnation.
  const mm = machine === undefined ? undefined : tx.machines[machine];
  if (mm && mappedFor(mm, item)?.ignore) {
    note(tx, "ignored", { op: item.op, attempt: item.attempt ?? "", channel: item.ending.ch, reason: endingReason(item.ending) });
    const cur = tx.w.lanes[laneId];
    if (item.ending.ch === "unknown" && cur?.head?.phase.t === "held" && cur.head.id === item.attempt) cell(tx, "cancel", cur, argsOf(cur));
    tx.visible = true;
    return;
  }
  const a = getActor(tx.w.actors, item.actor);
  const lane = tx.w.lanes[laneId];
  if (!a || !ofIdentity(tx, lane)) {
    // Rule 74 (migration round 3): an old identity's ending reaches no live actor of its name, which is another identity.
    // Rule 44: parked if a record of the identity survives; evidence otherwise. D15's Abandoned parks either way.
    const local = tx.machines[machine ?? ""]?.local;
    const keep =
      !local &&
      machine !== undefined &&
      (own(tx.w.retired, item.actor) !== undefined || tx.machines[machine]?.persisted);
    if (keep) return parkEnding(tx, item, lane, subject, machine);
    note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });
    return endHeldThisTurn(tx, item.attempt);
  }
  const path = bindingOf(tx, a, item.op, subject);
  if (!path) return parkEnding(tx, item, lane, subject, a.machine);
  deliver(tx, a, path, item);
};
const admitRead = (tx: Tx, item: EndingMail) => {
  const a = getActor(tx.w.actors, item.actor);
  const path = a && pathOfId(a.root, item.inc!);
  if (!a || !path) return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });
  if (mappedFor(machineOf(tx, a), item)?.ignore) {
    note(tx, "ignored", { op: item.op, attempt: item.attempt ?? "", channel: item.ending.ch, reason: endingReason(item.ending) }); // OD28: a read's too
    tx.visible = true;
    return;
  }
  deliver(tx, a, path, item);
};
const deliver = (tx: Tx, a: ActorRec, path: Path, item: EndingMail) => {
  const m = machineOf(tx, a);
  const inc = kidAt(a.root, path)!;
  const mapped = mappedFor(m, item);
  if (!item.redelivered || item.kept)
    note(tx, "delivered", { op: item.op, attempt: item.attempt ?? "", event: mapped?.event, at: path, reason: endingReason(item.ending), actor: a.key }); // stage F: the copy it runs in
  if (!mapped) {
    issue(tx, { code: "UnmappedEnding", origin: `${a.machine} operations.${item.op}`, input: item.ending, ending: { op: item.op, ...(item.attempt ? { attempt: item.attempt } : {}), actor: a.key } });
    return endHeldThisTurn(tx, item.attempt);
  }
  if (!item.redelivered) countFailure(tx, item);
  const ran = attemptTurn(tx, item, mapped.event, () => {
    const e = item.ending;
    const value = "value" in e ? e.value : undefined;
    const ev = {
      tag: mapped.event,
      payload: mapped.from
        ? run(
            mapped.from,
            value as never,
            {
              key: item.key,
              input: item.input,
              ...(e.ch === "unknown" ? { reason: e.reason } : {}),
            } as never,
          )
        : {},
    };
    const { start, late } = routeFrom(tx, a, item, inc);
    runTurn(tx, a, path, ev, start, late, item);
  });
  if (ran && item.ending.ch === "unknown") endHeldThisTurn(tx, item.attempt);
  // D123: refused twice, or once more at a boot.
  if (!ran && item.redelivered) keepEnding(tx, a, item);
};
// D122: what a spin is, by its evidence: one ask with one input, failing, in a row. It names it. It decides nothing, so a failure costs what a success does.
const countFailure = (tx: Tx, item: EndingMail) => {
  const key = `${item.actor}|${item.op}`;
  if (item.ending.ch === "success") {
    if (tx.w.failing[key]) tx.w = { ...tx.w, failing: without(tx.w.failing, key) };
    return;
  }
  const input = text(item.input) ?? "";
  const was = tx.w.failing[key];
  const n = was?.input === input ? was.n + 1 : 1;
  tx.w = { ...tx.w, failing: { ...tx.w.failing, [key]: { input, n } } };
  if (n === tx.bounds.sameFailures)
    issue(tx, { code: "TurnStorm", origin: `${item.actor} ${item.op}`, input: { failures: n } });
};
const attemptTurn = (tx: Tx, item: Mail, tag: string, f: () => void): boolean => {
  const kept = {
    w: tx.w,
    commands: tx.commands.length,
    evidence: tx.evidence.length,
    asks: tx.asks.length,
    touchedA: new Set(tx.touchedActors),
    touchedL: new Map(tx.touchedLanes),
  };
  tx.inTurn = true;
  try {
    f();
    return true;
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    // F3: the ending's cell stays; the turn's own members are dropped. L6: `disabled` only grows.
    tx.w = { ...kept.w, disabled: tx.w.disabled };
    tx.commands.length = kept.commands;
    tx.evidence.length = kept.evidence;
    tx.asks.length = kept.asks;
    tx.touchedActors.clear();
    for (const x of kept.touchedA) tx.touchedActors.add(x);
    tx.touchedLanes.clear();
    for (const [x, a] of kept.touchedL) tx.touchedLanes.set(x, a);
    const again = (item.k === "ending" || item.k === "fire" || item.k === "deliver") && item.redelivered === true;
    issue(tx, {
      code: "InvalidTurn",
      origin: e.origin,
      cause: e.message, // D123
      input: { k: "mail", event: tag, ...(again ? { redelivered: true } : {}) },
      ...(item.k === "ending" ? { ending: { op: item.op, ...(item.attempt ? { attempt: item.attempt } : {}), actor: item.actor } } : {}),
    });
    if ((item.k === "ending" || item.k === "fire") && !again) note(tx, "refused", { event: tag }); // D125: it is owed a second try
    // D50: a refused turn of an ending comes once more, after other mail, with no second cell.
    if (item.k === "ending" && !again) {
      const { onLane: _o, ...rest } = item;
      enqueue(tx, { ...rest, redelivered: true });
    }
    // D50, M5: a firing is a delivery too (rule 8). `EXPIRED`'s GiveUp is the only way out of it.
    if (item.k === "fire" && !again) enqueue(tx, { ...item, redelivered: true });
    // D118: and then it stays on the record, so a reload fires it again.
    if (item.k === "fire" && again) {
      note(tx, "kept", { op: item.event.tag, attempt: "" });
      tx.w = { ...tx.w, keptFires: [...tx.w.keptFires, item] };
      tx.visible = true; // the record on disk already has its timer; a later write keeps it
    }
    return false;
  } finally {
    tx.inTurn = false;
  }
};

export const onTurn = (tx: Tx) => {
  const fromFollow = tx.w.follow.length > 0;
  const item = fromFollow ? tx.w.follow[0] : takeMail(tx);
  if (!item) return;
  tx.w = fromFollow ? { ...tx.w, follow: tx.w.follow.slice(1), chain: tx.w.chain + 1 } : { ...tx.w, chain: 0 };
  tx.cause =
    item.k === "ending"
      ? `ending:${item.op}`
      : item.k === "recheck"
        ? "reset"
        : `event:${item.event.tag}`;
  // Rule 73: a turn that handles the ending of work in flight (an InFlight lane's, a kept read's, one owed at ready) keeps the reads it starts.
  tx.keeps = item.k === "ending" && (item.keeps === true || (!item.inc && laneOfAttempt(tx.w, item.attempt ?? "")?.head?.phase.t !== "held"));
  if (item.k === "ending") return admitEnding(tx, item); // A0: kept whatever the turn does
  const a = getActor(tx.w.actors, item.actor);
  if (!a) return note(tx, "unbound", { actor: item.actor });
  if (item.k === "recheck")
    return void attemptTurn(tx, item, "PendingReset", () => runRecheck(tx, a));
  if (item.k === "deliver") {
    const path = pathOfId(a.root, item.inc);
    const inc = path && kidAt(a.root, path);
    // Rule 70: the placement's activation, not only the incarnation's.
    if (!inc || inc.frozen || !Object.values(inc.activations).includes(item.activation)) {
      note(tx, "fence", { dead: item.inc });
      return moduleTold(tx, item.module, { k: "turned", tag: item.tag, outcome: "fenced" });
    }
    const ran = attemptTurn(tx, item, item.event.tag, () =>
      runTurn(tx, a, path!, item.event, undefined, false, item),
    );
    if (!ran && item.ending && !item.redelivered) note(tx, "refused", { event: item.event.tag });
    if (!ran && item.ending && !item.redelivered) enqueue(tx, { ...item, redelivered: true }); // D50
    if (!ran && item.ending && item.redelivered) note(tx, "kept", { op: item.event.tag, attempt: "" });
    if (!ran && item.ending && item.redelivered) strand(tx, item.actor, item.inc, item.event.tag); // D123
    return moduleTold(tx, item.module, {
      k: "turned",
      tag: item.tag,
      outcome: ran ? "ran" : "invalid",
    });
  }
  if (item.k === "fire") {
    const path = pathOfId(a.root, item.inc);
    const inc = path && kidAt(a.root, path);
    if (!inc || inc.frozen || !Object.values(inc.activations).includes(item.activation))
      return note(tx, "fence", { dead: item.activation }); // a timer of a dead activation (2.5 step 1)
    note(tx, "fired", { actor: item.actor, id: item.event.tag });
    return void attemptTurn(tx, item, item.event.tag, () =>
      runTurn(tx, a, path!, item.event, undefined, false, item),
    );
  }
  const to = item.event.to;
  const path = Array.isArray(to) ? (to as Path) : []; // D57
  const inc = to === undefined || Array.isArray(to) ? kidAt(a.root, path) : undefined;
  if (!inc || inc.frozen) return note(tx, "Unhandled", { event: item.event.tag, to: path });
  void attemptTurn(tx, item, item.event.tag, () =>
    runTurn(tx, a, path, item.event, undefined, false, item),
  );
};
export { enqueue };
