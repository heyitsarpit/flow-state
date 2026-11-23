// One function: step(world, input, env) returns a new value, at most one publication, and commands. Pure: time and ids
// come through `env`, every closure is a compiled Slot, and a throw inside a turn refuses that turn only.
// Strata are convergence-1 4.2's. Absent in round 1: A1 (bookmarks), P2 (resets), P3's parts, P4 (list repair).
import type { Alternative, Compiled, Ev, Member, Slot } from "../conformance/fixtures/compiled.ts";
import { cell, endingEvidence, settleSend, stateOf } from "./lane.ts";
import { cancelRead, lookup, takeRead } from "./reads.ts";
import { armingsFor, armTimer, disarmTimer, pathOf, timerKeyOf } from "./timers.ts";
import {
  activationId,
  emptyWorld,
  enqueue,
  issue,
  laneKey,
  laneOfAttempt,
  note,
  type ActorRec,
  type AttemptEnding,
  type Env,
  type Input,
  type Lane,
  type Machines,
  type Mail,
  type Module,
  type SendExit,
  type StepOut,
  type Tx,
  type World,
} from "./world.ts";

class Refused extends Error {
  constructor(
    readonly origin: string,
    cause: unknown,
  ) {
    super(String(cause));
  }
}
const run = <A, B>(slot: Slot<(a: A) => B>, a: A): B => {
  try {
    return slot.run(a);
  } catch (e) {
    throw new Refused(`${slot.at.definition} ${slot.at.path}`, e);
  }
};
const machineOf = (tx: Tx, a: ActorRec): Compiled => tx.machines[a.machine]!;
// The hook runs first: it may change tx.w, and its slice goes on the result.
const hook = (tx: Tx, m: Module, f: () => unknown) => {
  const slice = f();
  tx.w = { ...tx.w, ext: { ...tx.w.ext, [m.id]: slice } };
};
const isDenial = (v: unknown): v is { deny: string } =>
  typeof v === "object" && v !== null && "deny" in v;

// ── F, N: a completion. Fence first; rule 18 applies now; the ending joins the mail.
const classify = (x: SendExit, cancelled: boolean): AttemptEnding => {
  switch (x.t) {
    case "ok":
      return { ch: "success", value: x.value };
    case "unknown":
      return { ch: "unknown", reason: "Unknown", value: x.reason };
    case "failure":
      return {
        ch: "failure",
        tag: (x.reason as { _tag?: string })?._tag ?? "Failure",
        value: x.reason,
      };
    case "defect":
      return { ch: "unknown", reason: "Defect", value: x.cause };
    case "interrupted":
      return { ch: "unknown", reason: cancelled ? "Cancelled" : "Interrupted", value: x.cause };
  }
};

const onSent = (tx: Tx, i: Extract<Input, { k: "sent" }>) => {
  const lane = laneOfAttempt(tx.w, i.attempt);
  const h = lane?.head;
  if (lane && h && h.wire && h.wire.gen === i.send) {
    const ending = classify(i.exit, h.cancelled === true);
    if (i.exit.t === "defect") issue(tx, { code: "Defect", origin: `${lane.actor} ${lane.op}` });
    settleSend(tx, lane, i.send, ending);
    return;
  }
  const r = takeRead(tx, i.attempt, i.send);
  if (r) {
    if (i.exit.t === "defect") issue(tx, { code: "Defect", origin: `${r.actor} ${r.op}` });
    const e: AttemptEnding =
      i.exit.t === "ok"
        ? { ch: "success", value: i.exit.value }
        : i.exit.t === "failure"
          ? {
              ch: "failure",
              tag: (i.exit.reason as { _tag?: string })?._tag ?? "Failure",
              value: i.exit.reason,
            }
          : { ch: "failure", tag: i.exit.t === "defect" ? "Defect" : "Interrupted", value: {} };
    endingEvidence(tx, { op: r.op, attempt: i.attempt, send: i.send }, e);
    enqueue(tx, { k: "ending", actor: r.actor, op: r.op, owner: r.owner, ending: e });
    return;
  }
  note(tx, "fence", { attempt: i.attempt, send: i.send });
};

const onTimer = (tx: Tx, i: Extract<Input, { k: "timer" }>) => {
  const t = tx.w.timers[i.timer];
  if (!t || t.gen !== i.gen) return note(tx, "fence", { timer: i.timer, gen: i.gen });
  const { [i.timer]: _gone, ...timers } = tx.w.timers;
  tx.w = { ...tx.w, timers };
  if (t.kind === "schedule") {
    return enqueue(tx, {
      k: "fire",
      actor: t.actor!,
      activation: t.activation!,
      event: { tag: t.send!, payload: {} },
    });
  }
  if (t.kind === "timeout") {
    // D8: unknown { TimedOut } at the timer, then interrupt. A later exit of this send carries a stale generation.
    const lane = laneOfAttempt(tx.w, t.attempt!);
    if (!lane?.head.wire) return;
    const send = lane.head.wire.gen;
    settleSend(tx, lane, send, { ch: "unknown", reason: "TimedOut" });
    note(tx, "interrupt", { attempt: t.attempt, send });
    return void tx.commands.push({ k: "interrupt", attempt: t.attempt!, send });
  }
  if (t.kind === "dispose") return finishDisposal(tx);
  const m = tx.modules.find((x) => x.id === t.module)!;
  hook(tx, m, () => m.onTimer!(tx.w.ext[m.id], t, tx));
};

// ── Runtime disposal (D6). Never awaits unbounded: a core timer ends it; survivors are evidence.
const wires = (w: World) => Object.values(w.lanes).filter((l) => l.head.wire);
const finishDisposal = (tx: Tx) => {
  for (const l of wires(tx.w))
    note(tx, "AbandonedFiber", { attempt: l.head.id, send: l.head.wire!.gen });
  note(tx, "Disposed", {});
  disarmTimer(tx, "dispose");
  tx.w = { ...tx.w, disposed: true };
};
const onDispose = (tx: Tx) => {
  tx.w = { ...tx.w, disposing: true, mail: [], dirty: [] };
  for (const l of Object.values(tx.w.lanes))
    cell(tx, "runtimeDisposal", l, {
      actor: l.actor,
      op: l.op,
      key: l.key,
      machine: tx.w.actors[l.actor]!.machine,
    });
  for (const k of Object.keys(tx.w.reads))
    tx.commands.push({ k: "interrupt", attempt: k, send: tx.w.reads[k]!.gen });
  tx.w = { ...tx.w, reads: {} };
  for (const t of Object.values(tx.w.timers)) disarmTimer(tx, t.key);
  if (wires(tx.w).length === 0) finishDisposal(tx);
  else
    armTimer(tx, {
      key: "dispose",
      kind: "dispose",
      dueAt: tx.env.now + (Object.values(tx.machines)[0]?.bounds?.disposeMs ?? 5000),
    });
};

// ── Ensure and restore
const enterActor = (tx: Tx, key: string, machine: string, input: unknown) => {
  if (tx.w.actors[key]) return;
  const m = tx.machines[machine]!;
  const leaf = m.default;
  const activations = { [m.root]: activationId(tx), [leaf]: activationId(tx) };
  try {
    const memory = run(m.memory.initial, input);
    const armings = armingsFor(
      m,
      leaf,
      leaf,
      "",
      (n) => activations[n]!,
      { memory, event: {} },
      run,
    );
    note(tx, "initial", { actor: key });
    tx.w = {
      ...tx.w,
      actors: { ...tx.w.actors, [key]: { key, machine, leaf, memory, activations } },
    };
    commitSchedules(tx, key, armings);
    tx.visible = true;
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    issue(tx, { code: "InvalidTurn", origin: e.origin });
  }
};

// ── A0: admit one item. Kept whatever the turn does: a throw below this line refuses only the turn.
const ROW = { success: "success", failure: "failure", unknown: "unknown" } as const;
const admit = (tx: Tx, item: Extract<Mail, { k: "ending" }>) => {
  const lane = item.lane ? tx.w.lanes[item.lane] : undefined;
  if (!lane) return;
  const machine = tx.w.actors[lane.actor]?.machine ?? "";
  const args = { actor: lane.actor, op: lane.op, key: lane.key, machine, ending: item.ending };
  const interrupted =
    item.ending.ch === "unknown" &&
    (item.ending.reason === "Cancelled" || item.ending.reason === "Interrupted");
  cell(tx, item.restored ? "restore" : interrupted ? "interrupt" : ROW[item.ending.ch], lane, args);
};

const mapEnding = (tx: Tx, a: ActorRec, item: Extract<Mail, { k: "ending" }>): Ev | undefined => {
  const op = machineOf(tx, a).ops[item.op]!;
  const e = item.ending;
  const mapped =
    e.ch === "success"
      ? op.outcomes.success
      : e.ch === "failure"
        ? op.outcomes.failure[e.tag]
        : op.outcomes.unknown;
  if (!mapped) {
    issue(tx, { code: "UnmappedEnding", origin: `${a.machine} operations.${item.op}`, input: e });
    return undefined;
  }
  return { tag: mapped.event, payload: mapped.from ? run(mapped.from, e.value) : {} };
};

// Rule 14: alive means current, from the leaf. Ended means late, from the owner's nearest strict ancestor.
const routeFrom = (
  tx: Tx,
  a: ActorRec,
  item: Extract<Mail, { k: "ending" }>,
): { start: string; late: boolean } => {
  const m = machineOf(tx, a);
  if (item.restored && item.ending.ch !== "success") return { start: a.leaf, late: false };
  const alive = a.activations[item.owner.node] === item.owner.activation;
  if (alive) return { start: a.leaf, late: false };
  // "Never an activation of this incarnation" (a rebind) cannot occur without dispose, which is outside round 1.
  return { start: m.nodes[item.owner.node]?.parent ?? m.root, late: true }; // flat machine: the root (shortcut)
};

// ── P1: select. Tokens first; lanes read as pre-turn with this turn's ending admitted (rule 22).
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
  view: { memory: unknown; event: unknown },
  item: Mail | undefined,
) => {
  for (const t of alt.tokens) {
    if ("node" in t) {
      if (t.node !== a.leaf) return false;
      continue;
    }
    const lane = laneFor(tx, a, t.op, t.key, view, item);
    const state = stateOf(lane);
    note(tx, "lane", { cell: `lane.${t.verb}.${state}`, op: t.op });
    if (t.verb === "idle" && state !== "Idle") return false;
    if (
      t.verb === "retryable" &&
      (state !== "Held" || lane!.head.retryCount >= (t.times ?? Infinity))
    )
      return false;
  }
  return true;
};
const leavesWork = (tx: Tx, a: ActorRec, alt: Alternative, item: Mail | undefined) =>
  alt.target !== "self" &&
  Object.values(tx.w.lanes).some(
    (l) =>
      l.actor === a.key &&
      l.state === "InFlight" &&
      l.head.owner.node === a.leaf &&
      a.activations[a.leaf] === l.head.owner.activation &&
      !(item?.k === "ending" && item.attempt === l.head.id),
  );

type Selected = { node: string; alt: Alternative } | { denied: boolean; reasons: string[] };
const select = (
  tx: Tx,
  a: ActorRec,
  ev: Ev,
  start: string,
  late: boolean,
  item: Mail | undefined,
): Selected => {
  const m = machineOf(tx, a);
  const reasons: string[] = [];
  let handled = false;
  const view = { memory: a.memory, event: ev.payload };
  for (const node of pathOf(m, start)) {
    const alts = m.nodes[node]!.on[ev.tag];
    if (!alts) {
      // A schedule trigger is a handler (2.5 step 2).
      if (
        m.nodes[node]!.schedules.some(
          (s) => s.armOn.includes(ev.tag) || s.disarmOn.includes(ev.tag),
        )
      )
        return {
          node,
          alt: {
            target: "self",
            at: { definition: m.id, path: "implicit" },
            tokens: [],
            guards: [],
            members: [],
          },
        };
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

// ── P5, P6, P7, C: effects read after memory; members apply in action order; then the one commit.
const applyMembers = (
  tx: Tx,
  a: ActorRec,
  members: readonly Member[],
  after: { memory: unknown; event: unknown },
  owner: { node: string; activation: string },
  item: Mail | undefined,
) => {
  // P5 first: every select runs before any cell, so a throw leaves no cell behind.
  const reads = members.map((mem) =>
    mem.verb === "commit" || mem.verb === "lookup"
      ? run(mem.input, after)
      : mem.key
        ? run(mem.key, after)
        : undefined,
  );
  const m = machineOf(tx, a);
  members.forEach((mem, i) => {
    const op = m.ops[mem.op]!;
    if (mem.verb === "lookup") return lookup(tx, a.key, a.machine, mem.op, reads[i], owner);
    if (op.kind === "read")
      return mem.verb === "cancel" ? cancelRead(tx, a.key, mem.op) : undefined;
    if (mem.verb === "commit") {
      const key = op.key(reads[i]);
      return cell(tx, "commit", tx.w.lanes[laneKey(a.key, mem.op, key)], {
        actor: a.key,
        op: mem.op,
        key,
        machine: a.machine,
        input: reads[i],
        owner,
      });
    }
    const lane = mem.key
      ? tx.w.lanes[laneKey(a.key, mem.op, reads[i])]
      : item?.k === "ending" && item.op === mem.op && item.attempt
        ? laneOfAttempt(tx.w, item.attempt)
        : undefined;
    cell(tx, mem.verb, lane, {
      actor: a.key,
      op: mem.op,
      key: lane?.key ?? reads[i],
      machine: a.machine,
      owner,
    });
  });
};

const commitSchedules = (tx: Tx, actor: string, { arm, disarm }: ReturnType<typeof armingsFor>) => {
  for (const d of disarm) disarmTimer(tx, timerKeyOf(actor, d.activation, d.spec.id));
  for (const x of arm)
    armTimer(tx, {
      key: timerKeyOf(actor, x.activation, x.spec.id),
      kind: "schedule",
      actor,
      activation: x.activation,
      send: x.spec.send,
      dueAt: tx.env.now + x.ms,
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
  const { node, alt } = sel;
  const patch = alt.patch ? run(alt.patch, { memory: a.memory, event: ev.payload }) : {};
  const memory = { ...a.memory, ...patch };
  const after = { memory, event: ev.payload };
  const moves = alt.target !== "self";
  const leaf = moves ? alt.target : a.leaf;
  const activations = { ...a.activations };
  const exited = moves ? a.activations[a.leaf] : undefined;
  if (moves) {
    delete activations[a.leaf];
    activations[leaf] = activationId(tx);
  }
  const owner = {
    node: moves ? leaf : node,
    activation: moves ? activations[leaf]! : a.activations[node]!,
  };
  applyMembers(tx, a, alt.members, after, owner, item);
  // P7: the last closures. A throw here still refuses the turn, with nothing armed.
  const armings = armingsFor(
    m,
    leaf,
    moves ? leaf : undefined,
    ev.tag,
    (n) => activations[n]!,
    after,
    run,
  );
  // C: cannot throw. Every closure above has run.
  if (exited)
    for (const t of Object.values(tx.w.timers)) if (t.activation === exited) disarmTimer(tx, t.key);
  tx.w = { ...tx.w, actors: { ...tx.w.actors, [a.key]: { ...a, leaf, memory, activations } } };
  commitSchedules(tx, a.key, armings);
  note(tx, "turn", { event: ev.tag, from: a.leaf, to: leaf });
  tx.visible = true;
};

const onTurn = (tx: Tx) => {
  const [item, ...mail] = tx.w.mail;
  if (!item) return;
  tx.w = { ...tx.w, mail };
  tx.cause = item.k === "ending" ? `ending:${item.op}` : `event:${item.event.tag}`;
  if (item.k === "ending") admit(tx, item);
  const a = tx.w.actors[item.actor];
  if (!a) return note(tx, "unbound", { op: item.k === "ending" ? item.op : undefined });
  const kept = { w: tx.w, commands: tx.commands.length, evidence: tx.evidence.length };
  let tag = item.k === "ending" ? "" : item.event.tag;
  try {
    if (item.k === "fire" && !Object.values(a.activations).includes(item.activation)) {
      return note(tx, "fence", { dead: item.activation }); // a timer of a dead activation (2.5 step 1)
    }
    const ev = item.k === "ending" ? mapEnding(tx, a, item) : item.event;
    if (!ev) return;
    tag = ev.tag;
    const { start, late } =
      item.k === "ending" ? routeFrom(tx, a, item) : { start: a.leaf, late: false };
    runTurn(tx, a, ev, start, late, item);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    // F3: the ending's cell stays; the turn's own members are dropped. Evidence up to here is dropped with them.
    tx.w = kept.w;
    tx.commands.length = kept.commands;
    tx.evidence.length = kept.evidence;
    issue(tx, { code: "InvalidTurn", origin: e.origin, input: { k: "mail", event: tag } });
  }
};

// ── D: after every step. Level-triggered over the dirty set (D4).
const dispatch = (tx: Tx) => {
  if (tx.w.disposing) return;
  for (const id of tx.w.dirty) {
    const l = tx.w.lanes[id];
    if (!l || l.state !== "InFlight" || l.head.wire || l.head.settled) continue;
    if (tx.modules.some((m) => m.blocksInvoke?.(tx.w.ext[m.id], l.head, tx))) continue;
    cell(tx, "invoked", l, {
      actor: l.actor,
      op: l.op,
      key: l.key,
      machine: tx.w.actors[l.actor]!.machine,
    });
  }
  tx.w = {
    ...tx.w,
    dirty: tx.w.dirty.filter(
      (id) =>
        tx.w.lanes[id] &&
        !tx.w.lanes[id]!.head.wire &&
        !tx.w.lanes[id]!.head.settled &&
        tx.w.lanes[id]!.state === "InFlight",
    ),
  };
};

const onBoot = (tx: Tx, records: ReadonlyArray<readonly [string, string]>) => {
  const decoded = new Map(records.map(([k, v]) => [k, JSON.parse(v)]));
  tx.w = { ...tx.w, boot: 1, ext: Object.fromEntries(tx.modules.map((m) => [m.id, m.init?.()])) };
  for (const m of tx.modules) if (m.restore) hook(tx, m, () => m.restore!(decoded, tx));
  tx.visible = true;
  tx.cause = "boot";
};

export const step = (
  world: World,
  input: Input,
  env: Env,
  machines: Machines,
  modules: readonly Module[],
): StepOut => {
  const tx: Tx = {
    w: world,
    env,
    machines,
    modules,
    commands: [],
    evidence: [],
    issues: [],
    visible: false,
    cause: input.k,
  };
  const prev = world;
  if (world.disposed && input.k !== "boot") {
    note(tx, "dropped", { input: input.k });
    return { world, commands: [], evidence: tx.evidence, issues: [] };
  }
  switch (input.k) {
    case "boot":
      onBoot(tx, input.records);
      break;
    case "ensure":
      enterActor(tx, input.actor, input.machine, input.input);
      break;
    case "sent":
      onSent(tx, input);
      break;
    case "timer":
      onTimer(tx, input);
      break;
    case "send":
      if (tx.w.disposing) note(tx, "dropped", { input: "send" });
      else enqueue(tx, { k: "send", actor: input.actor, event: input.event });
      break;
    case "turn":
      onTurn(tx);
      break;
    case "disposeRuntime":
      onDispose(tx);
      break;
    default:
      for (const m of modules)
        if (m.onInput) hook(tx, m, () => m.onInput!(tx.w.ext[m.id], input, tx));
  }
  dispatch(tx);
  if (tx.w.disposing && !tx.w.disposed && wires(tx.w).length === 0 && input.k === "sent")
    finishDisposal(tx);
  for (const m of modules) if (m.onCommit) hook(tx, m, () => m.onCommit!(tx.w.ext[m.id], prev, tx));
  if (!tx.visible)
    return { world: tx.w, commands: tx.commands, evidence: tx.evidence, issues: tx.issues };
  const seq = tx.w.clockSeq + 1;
  const w = { ...tx.w, clockSeq: seq };
  const base = (w.boot - 1) * 1_000_000;
  return {
    world: w,
    commands: tx.commands,
    evidence: tx.evidence,
    issues: tx.issues,
    frame: { cause: tx.cause, at: env.now, seq: base + seq, world: w },
  };
};

export { emptyWorld };
