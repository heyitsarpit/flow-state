// One turn on a flat machine: A0 admit, P1 select, P5 read, P6 apply, P7 reconcile, C commit. A throw from a user closure
// refuses the turn; the ending's cell, applied before it, stays. Absent until round 3: P2, P3's parts, P4.
import type { Alternative, Compiled, Ev, Member, Slot } from "../conformance/fixtures/compiled.ts";
import { cell, guardCell } from "./lane.ts";
import { prepareAll, Refused, run } from "./hooks.ts";
import { cancelRead, lookup } from "./reads.ts";
import { armingsFor, commitSchedules, disarmTimer, pathOf, timerKeyOf } from "./timers.ts";
import {
  issue,
  laneKey,
  laneOfAttempt,
  nextGen,
  note,
  type ActorRec,
  type Lane,
  type Mail,
  type Tx,
} from "./world.ts";

type EndingMail = Extract<Mail, { k: "ending" }>;
const isDenial = (v: unknown): v is { deny: string } =>
  typeof v === "object" && v !== null && "deny" in v;
const machineOf = (tx: Tx, a: ActorRec): Compiled => tx.machines[a.machine]!;
const argsOf = (l: Lane) => ({ actor: l.actor, machine: l.machine, op: l.op, key: l.key });

const ROW = { success: "success", failure: "failure", unknown: "unknown" } as const;
const admit = (tx: Tx, item: EndingMail) => {
  const lane = item.onLane ? laneOfAttempt(tx.w, item.attempt!) : undefined;
  if (!lane) return;
  const e = item.ending;
  const interrupted =
    e.ch === "unknown" && (e.reason === "Cancelled" || e.reason === "Interrupted");
  const row = item.restored ? "restore" : interrupted ? "interrupt" : ROW[e.ch];
  cell(tx, row, lane, { ...argsOf(lane), ending: e });
};
const mappedFor = (tx: Tx, a: ActorRec, item: EndingMail) => {
  const op = machineOf(tx, a).ops[item.op]!;
  const e = item.ending;
  return e.ch === "success"
    ? op.outcomes.success
    : e.ch === "failure"
      ? op.outcomes.failure[e.tag]
      : op.outcomes.unknown;
};
// Rule 14: alive means current, from the leaf. Ended means late, from the owner's nearest strict ancestor.
const routeFrom = (tx: Tx, a: ActorRec, item: EndingMail) => {
  const m = machineOf(tx, a);
  if (item.restored) return { start: a.leaf, late: false };
  if (a.activations[item.owner.node] === item.owner.activation)
    return { start: a.leaf, late: false };
  return { start: m.nodes[item.owner.node]?.parent ?? m.root, late: true };
};

const laneFor = (
  tx: Tx,
  a: ActorRec,
  op: string,
  keySlot: Slot<(x: any) => unknown> | undefined,
  view: unknown,
  item: Mail | undefined,
): Lane | undefined => {
  if (keySlot) return tx.w.lanes[laneKey(a.key, op, run(keySlot, view as never))];
  // D22: key-less names the ending's own Attempt only.
  if (item?.k === "ending" && item.op === op && item.attempt)
    return laneOfAttempt(tx.w, item.attempt);
  return undefined;
};
const tokensPass = (
  tx: Tx,
  a: ActorRec,
  alt: Alternative,
  view: object,
  item: Mail | undefined,
) => {
  for (const t of alt.tokens) {
    if ("node" in t) {
      if (t.node !== a.leaf) return false;
      continue;
    }
    const lane = laneFor(tx, a, t.op, t.key, view, item);
    if (!guardCell(tx, t.verb, lane, t.op, t.times)) return false;
  }
  return true;
};
// Rule 15: a late ending may not leave a state that owns live work.
const leavesWork = (tx: Tx, a: ActorRec, alt: Alternative, item: Mail | undefined) =>
  alt.target !== "self" &&
  Object.values(tx.w.lanes).some(
    (l) =>
      l.actor === a.key &&
      l.head.phase.t !== "held" &&
      l.head.owner.node === a.leaf &&
      a.activations[a.leaf] === l.head.owner.activation &&
      !(item?.k === "ending" && item.attempt === l.head.id),
  );

const IMPLICIT = (m: Compiled): Alternative => ({
  target: "self",
  at: { definition: m.id, path: "implicit" },
  tokens: [],
  guards: [],
  members: [],
});
const select = (
  tx: Tx,
  a: ActorRec,
  ev: Ev,
  start: string,
  late: boolean,
  item: Mail | undefined,
) => {
  const m = machineOf(tx, a);
  const reasons: string[] = [];
  let handled = false;
  const view = { memory: a.memory, event: ev.payload };
  for (const node of pathOf(m, start)) {
    const alts = m.nodes[node]!.on[ev.tag];
    if (!alts) {
      // A schedule trigger is a handler (2.5 step 2).
      const s = m.nodes[node]!.schedules;
      if (s.some((x) => x.armOn.includes(ev.tag) || x.disarmOn.includes(ev.tag)))
        return { node, alt: IMPLICIT(m) };
      continue;
    }
    handled = true;
    next: for (const alt of alts) {
      if (!tokensPass(tx, a, alt, view, item)) continue;
      for (const g of alt.guards) {
        const r = run(g, view);
        if (isDenial(r)) {
          reasons.push(r.deny);
          continue next;
        }
      }
      if (late && leavesWork(tx, a, alt, item)) {
        reasons.push("LateMayNotLeave");
        continue;
      }
      return { node, alt };
    }
  }
  return { denied: handled, reasons };
};

// P5 first: every select runs before any cell, so a throw leaves no cell behind. P6 then applies in action order.
const applyMembers = (
  tx: Tx,
  a: ActorRec,
  members: readonly Member[],
  after: { memory: unknown; event: unknown },
  owner: { node: string; activation: string },
  item: Mail | undefined,
) => {
  const m = machineOf(tx, a);
  const reads = members.map((mem) => {
    const op = m.ops[mem.op]!;
    if (mem.verb === "commit" || mem.verb === "lookup") {
      const input = run(mem.input, after);
      const key = run(op.key, input);
      const prepared =
        mem.verb === "commit" ? prepareAll(tx, { machine: a.machine, op: mem.op, input }) : {};
      return { input, key, prepared };
    }
    return { key: mem.key ? run(mem.key, after) : undefined };
  });
  members.forEach((mem, i) => {
    const r = reads[i]!;
    const op = m.ops[mem.op]!;
    const base = { actor: a.key, machine: a.machine, op: mem.op, owner };
    if (mem.verb === "lookup") return lookup(tx, { ...base, input: r.input, key: r.key });
    if (op.kind === "read")
      return mem.verb === "cancel" ? cancelRead(tx, a.key, mem.op) : undefined;
    if (mem.verb === "commit")
      return cell(tx, "commit", tx.w.lanes[laneKey(a.key, mem.op, r.key)], {
        ...base,
        key: r.key,
        input: r.input,
        ...(r.prepared ? { prepared: r.prepared } : {}),
      });
    const lane = mem.key
      ? tx.w.lanes[laneKey(a.key, mem.op, r.key)]
      : item?.k === "ending" && item.op === mem.op && item.attempt
        ? laneOfAttempt(tx.w, item.attempt)
        : undefined;
    // In a NotSent ending there is no Attempt: a key-less member does nothing (2.7.13).
    if (!mem.key && !lane && item?.k === "ending") return;
    cell(tx, mem.verb, lane, { ...base, key: lane?.key ?? r.key });
  });
};

const runTurn = (
  tx: Tx,
  a: ActorRec,
  ev: Ev,
  start: string,
  late: boolean,
  item: Mail | undefined,
) => {
  const m = machineOf(tx, a);
  const sel = select(tx, a, ev, start, late, item);
  if ("denied" in sel)
    return note(tx, sel.denied ? "Denied" : "Unhandled", { event: ev.tag, reasons: sel.reasons });
  const { node, alt } = sel as { node: string; alt: Alternative };
  const before = { memory: a.memory, event: ev.payload };
  const memory = { ...a.memory, ...(alt.patch ? run(alt.patch, before) : {}) };
  const after = { memory, event: ev.payload };
  const moves = alt.target !== "self";
  const leaf = moves ? alt.target : a.leaf;
  const activations = { ...a.activations };
  if (moves) {
    delete activations[a.leaf];
    activations[leaf] = nextGen(tx);
  }
  const owner = {
    node: moves ? leaf : node,
    activation: moves ? activations[leaf]! : a.activations[node]!,
  };
  applyMembers(tx, a, alt.members, after, owner, item);
  const armings = armingsFor(
    m,
    leaf,
    moves ? leaf : undefined,
    ev.tag,
    (n) => activations[n]!,
    after,
    run,
  );
  const follows = (alt.followUps ?? []).map((f) => run(f, after));
  // C: cannot throw. Every closure above has run.
  if (moves)
    for (const s of m.nodes[a.leaf]!.schedules)
      disarmTimer(tx, timerKeyOf(a.key, a.activations[a.leaf]!, s.id));
  tx.w = { ...tx.w, actors: { ...tx.w.actors, [a.key]: { ...a, leaf, memory, activations } } };
  tx.touchedActors.add(a.key);
  commitSchedules(tx, a.key, armings);
  note(tx, "turn", {
    actor: a.key,
    event: ev.tag,
    from: a.leaf,
    to: leaf,
    ...(ev.payload?.n !== undefined ? { n: ev.payload.n } : {}),
  });
  tx.visible = true;
  // D1, D35: a follow-up runs next, before any other mail, up to a bound per admitted item.
  if (follows.length) {
    if (tx.w.chain >= tx.bounds.followUps) {
      issue(tx, {
        code: "InvalidTurn",
        origin: `${alt.at.definition} ${alt.at.path}`,
        input: { chain: "FollowUpBound", event: ev.tag },
      });
    } else {
      const mail = follows.map((event) => ({ k: "send" as const, actor: a.key, event }));
      tx.w = { ...tx.w, follow: [...mail, ...tx.w.follow] };
    }
  }
};

export const onTurn = (tx: Tx) => {
  const fromFollow = tx.w.follow.length > 0;
  const [item, ...rest] = fromFollow ? tx.w.follow : tx.w.mail;
  if (!item) return;
  tx.w = fromFollow
    ? { ...tx.w, follow: rest, chain: tx.w.chain + 1 }
    : { ...tx.w, mail: rest, chain: 0 };
  tx.cause = item.k === "ending" ? `ending:${item.op}` : `event:${item.event.tag}`;
  if (item.k === "ending") admit(tx, item); // A0: kept whatever the turn does
  const a = tx.w.actors[item.actor];
  if (!a) return note(tx, "unbound", { actor: item.actor });
  const mapped = item.k === "ending" ? mappedFor(tx, a, item) : undefined;
  if (item.k === "ending") {
    note(tx, "delivered", { op: item.op, attempt: item.attempt, event: mapped?.event });
    if (!mapped)
      return issue(tx, {
        code: "UnmappedEnding",
        origin: `${a.machine} operations.${item.op}`,
        input: item.ending,
      });
  }
  const kept = {
    w: tx.w,
    commands: tx.commands.length,
    evidence: tx.evidence.length,
    asks: tx.asks.length,
  };
  let tag = item.k === "ending" ? mapped!.event : item.event.tag;
  try {
    if (item.k === "fire" && !Object.values(a.activations).includes(item.activation))
      return note(tx, "fence", { dead: item.activation }); // a timer of a dead activation (2.5 step 1)
    let ev: Ev;
    if (item.k === "ending") {
      const e = item.ending;
      const value = "value" in e ? e.value : undefined;
      ev = {
        tag: mapped!.event,
        payload: mapped!.from ? run(mapped!.from, value as never, { key: item.key } as never) : {},
      };
    } else ev = item.event;
    tag = ev.tag;
    const { start, late } =
      item.k === "ending" ? routeFrom(tx, a, item) : { start: a.leaf, late: false };
    runTurn(tx, a, ev, start, late, item);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    // F3: the ending's cell stays; the turn's own members are dropped. D31: the fact is not redelivered.
    tx.w = kept.w;
    tx.commands.length = kept.commands;
    tx.evidence.length = kept.evidence;
    tx.asks.length = kept.asks;
    issue(tx, { code: "InvalidTurn", origin: e.origin, input: { k: "mail", event: tag } });
  }
};
