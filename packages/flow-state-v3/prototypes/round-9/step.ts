// One function: step(world, input, env, system) returns a new value, at most one publication, and commands. Pure: time and ids
// come through `env`, every closure is a compiled Slot. A throw from core code escapes: fatal (D46).
import { getActor, setActor, deleteActor, allActors, changedActors } from "./actors.ts";
import type { Compiled } from "../conformance/fixtures/compiled.ts";
import {
  blockedBy,
  hook,
  input as moduleInput,
  Refused,
  run,
  told as moduleTold,
  toldAll,
} from "./hooks.ts";
import { flush, onStorageBound, onStored, restore } from "./durable.ts";
import { own } from "./gate.ts";
import { down, placementsActive, seedKids, up, walkIncs, viewOf, type Started } from "./inc.ts";
import { cell, dropParked, parkWaiting, settleSend } from "./lane.ts";
import { dropReadsOf, takeRead } from "./reads.ts";
import { armTimer, disarmTimer, scheduleKey } from "./timers.ts";
import { onTurn, rebindActor, startActor } from "./turn.ts";
import {
  clearStall,
  enqueue,
  fireAsTimer,
  fragOf,
  issue,
  reapStranded,
  laneOfAttempt,
  nextGen,
  note,
  noteEnding,
  setLane,
  without,
  type ActorRec,
  type Ending,
  type Env,
  type FrozenTimer,
  type Inc,
  type Input,
  type Lane,
  type SendExit,
  type StepOut,
  type System,
  type Tx,
  type World,
} from "./world.ts";

// ── F, N: a completion. Fence first; rule 18 applies now; the store hears it; the ending joins the mail.
const classify = (x: SendExit, cancelled: boolean): Ending => {
  switch (x.t) {
    case "ok":
      return { ch: "success", value: x.value };
    case "unknown":
      return {
        ch: "unknown",
        reason: (x.reason as { _tag?: string })?._tag ?? "Unknown",
        value: x.reason,
      };
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
const readEnding = (x: SendExit): Ending =>
  x.t === "ok"
    ? { ch: "success", value: x.value }
    : x.t === "failure"
      ? { ch: "failure", tag: (x.reason as { _tag?: string })?._tag ?? "Failure", value: x.reason }
      : {
          ch: "failure",
          tag: x.t === "defect" ? "Defect" : x.t === "unknown" ? "NoResponse" : "Interrupted",
          value: {},
        };

const onSent = (tx: Tx, i: Extract<Input, { k: "sent" }>) => {
  const lane = laneOfAttempt(tx.w, i.attempt);
  const p = lane?.head?.phase;
  if (lane && p?.t === "wire" && p.gen === i.send) {
    if (i.exit.t === "defect") issue(tx, { code: "Defect", origin: `${lane.actor} ${lane.op}` });
    return settleSend(tx, lane, i.send, classify(i.exit, p.cancelled));
  }
  const r = takeRead(tx, i.attempt, i.send);
  if (r) {
    if (i.exit.t === "defect") issue(tx, { code: "Defect", origin: `${r.actor} ${r.op}` });
    const e = readEnding(i.exit);
    noteEnding(tx, { op: r.op, attempt: i.attempt, send: i.send }, e);
    if (e.ch === "success")
      toldAll(tx, {
        k: "answered",
        machine: r.machine,
        op: r.op,
        input: r.input,
        value: e.value,
        pos: r.pos,
      });
    return enqueue(tx, {
      k: "ending",
      actor: r.actor,
      op: r.op,
      key: r.key,
      owner: r.owner,
      ending: e,
      input: r.input,
      attempt: i.attempt,
      inc: r.inc,
    });
  }
  note(tx, "fence", { attempt: i.attempt, send: i.send });
};

// D15: an unbound hold with a waiter gives way. Released; the mark stays; parked for whoever comes.
const yieldHold = (tx: Tx, attempt: string) => {
  const l = laneOfAttempt(tx.w, attempt);
  if (!l?.head || l.head.phase.t !== "held" || getActor(tx.w.actors, l.actor)) return;
  // "With a waiter": it may have gone in the five minutes. Dispatch arms this again if another comes.
  const waited = Object.keys(tx.w.ready).some((id) => {
    const b = blockedBy(tx, tx.w.lanes[id]!.head!.id, tx.w.lanes[id]!.machine);
    return b && b.on === "queue" && b.behind.includes(attempt);
  });
  if (!waited) return;
  const e: Ending = { ch: "unknown", reason: "Abandoned" };
  noteEnding(tx, { op: l.op, attempt }, e);
  note(tx, "parked", { op: l.op, attempt });
  const parked: Lane = {
    ...l,
    parked: [...l.parked, { attempt, ending: e, owner: l.head.owner, input: l.head.input }],
  };
  setLane(tx, parked);
  cell(tx, "cancel", parked, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });
};
const onTimer = (tx: Tx, i: Extract<Input, { k: "timer" }>) => {
  const t = tx.w.timers[i.timer];
  if (!t || t.gen !== i.gen) return note(tx, "fence", { timer: i.timer, gen: i.gen });
  tx.w = { ...tx.w, timers: without(tx.w.timers, i.timer) };
  switch (t.kind) {
    case "schedule":
      // L6: the record is not touched: if the turn never commits, the disk still has this timer.
      return enqueue(tx, {
        k: "fire",
        actor: t.actor,
        inc: t.inc,
        activation: t.activation,
        event: { tag: t.send, payload: {} },
      });
    case "timeout": {
      // D8: unknown { TimedOut } at the timer, then interrupt. A later exit of this send carries a stale generation.
      const lane = laneOfAttempt(tx.w, t.attempt);
      const p = lane?.head?.phase;
      if (!lane || p?.t !== "wire") return;
      note(tx, "interrupt", { attempt: t.attempt, send: p.gen });
      tx.commands.push({ k: "interrupt", attempt: t.attempt, send: p.gen });
      return settleSend(tx, lane, p.gen, { ch: "unknown", reason: "TimedOut" });
    }
    case "storage":
      return onStorageBound(tx, t.attempt);
    case "stall": {
      const l = laneOfAttempt(tx.w, t.attempt);
      if (!l) return;
      const b = blockedBy(tx, t.attempt, l.machine);
      if (!b || b.on !== "queue") return;
      note(tx, "RecordHeld", { op: l.op, holder: b.behind[0], waiter: t.attempt });
      tx.w = { ...tx.w, stalled: { ...tx.w.stalled, [t.attempt]: "record" } };
      tx.visible = true;
      return;
    }
    case "yield":
      return yieldHold(tx, t.attempt);
    case "dispose":
      return finishDisposal(tx);
    case "module":
      return moduleInput(tx, t.module, { k: "timer", key: t.key });
  }
};

// ── Runtime disposal (D6). Never awaits unbounded: a core timer ends it; survivors are evidence.
const wires = (w: World) => Object.values(w.lanes).filter((l) => l.head?.phase.t === "wire");
const finishDisposal = (tx: Tx) => {
  for (const l of wires(tx.w)) {
    const p = l.head!.phase;
    if (p.t === "wire") note(tx, "AbandonedFiber", { op: l.op, attempt: l.head!.id, send: p.gen });
    setLane(tx, parkWaiting(tx, l));
  }
  note(tx, "Disposed", {});
  disarmTimer(tx, "dispose");
  tx.w = { ...tx.w, status: "disposed" };
  tx.visible = true;
};
const onDisposeRuntime = (tx: Tx) => {
  note(tx, "DisposeStart", {});
  tx.w = { ...tx.w, status: "disposing", mail: [], rota: [], follow: [] };
  for (const l of Object.values(tx.w.lanes))
    if (l.head)
      cell(tx, "runtimeDisposal", l, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });
  for (const [k, r] of Object.entries(tx.w.reads)) {
    tx.commands.push({ k: "interrupt", attempt: k, send: r.gen });
    note(tx, "Superseded", { op: r.op, attempt: k, send: r.gen });
  }
  tx.w = { ...tx.w, reads: {} };
  for (const t of Object.values(tx.w.timers)) disarmTimer(tx, t.key);
  hook(tx, "dispose", (m, s, cx) => m.dispose!(s, cx));
  if (wires(tx.w).length === 0) finishDisposal(tx);
  else armTimer(tx, { key: "dispose", kind: "dispose", dueAt: tx.env.now + tx.bounds.disposeMs });
};

// ── An actor's life. D21: a local identity's hold releases at once and is never adopted. Otherwise the lanes stay the Runtime's.
const onDisposeActor = (tx: Tx, key: string) => {
  const a = getActor(tx.w.actors, key);
  if (!a) return;
  const m = tx.machines[a.machine]!;
  walkIncs(a.root, (i) => void dropReadsOf(tx, i.id));
  reapStranded(tx, (s) => s.actor === key);
  tx.w = { ...tx.w, failing: Object.fromEntries(Object.entries(tx.w.failing).filter(([k]) => !k.startsWith(`${key}|`))) };
  const armed = Object.values(tx.w.timers).filter(
    (t): t is FrozenTimer => t.kind === "schedule" && t.actor === key,
  );
  for (const t of armed) disarmTimer(tx, t.key);
  const timers = [...armed, ...tx.w.keptFires.filter((f) => f.actor === key).map((f) => fireAsTimer(f, tx.env.now))]; // D118
  const actors = deleteActor(tx.w.actors, key);
  tx.w = {
    ...tx.w,
    keptFires: tx.w.keptFires.filter((f) => f.actor !== key),
    actors,
    ...(m.persisted ? { retired: { ...tx.w.retired, [key]: { ...a, timers } as ActorRec } } : {}),
  };
  if (m.local)
    for (const old of Object.values(tx.w.lanes)) {
      if (old.actor !== key) continue;
      const l = dropParked(tx, old); // D21, D123: no next life hears this one's. It goes as evidence
      if (!l?.head) continue;
      if (l.head.phase.t === "held")
        cell(tx, "cancel", l, { actor: key, machine: l.machine, op: l.op, key: l.key });
      else setLane(tx, { ...l, releasing: true });
    }
  if (m.persisted) tx.touchedActors.add(key); // D73: the disk says it sleeps
  note(tx, "disposed", { actor: key });
  tx.visible = true;
};
const startRoot = (tx: Tx, key: string, machine: string, input: unknown) => {
  const m: Compiled = tx.machines[machine]!;
  const retired = own(tx.w.retired, key);
  if (retired) {
    const { timers, ...rec } = retired as ActorRec & { timers: readonly FrozenTimer[] };
    tx.w = {
      ...tx.w,
      retired: without(tx.w.retired, key),
      actors: setActor(tx.w.actors, key, rec),
    };
    for (const t of timers) {
      const { gen: _g, ...spec } = t;
      armTimer(tx, spec);
    }
    // Computed first: `{ ...tx.w, follow: [...adoption()] }` spreads a world before adoption's own writes, and loses them.
    const adopted = rebindActor(tx, rec);
    tx.w = { ...tx.w, follow: [...adopted, ...tx.w.follow] };
    tx.touchedActors.add(key);
    tx.visible = true;
    return;
  }
  const frag = m;
  const leaf = down(frag, frag.default);
  const active = up(frag, leaf);
  const activations = Object.fromEntries(active.map((n) => [n, nextGen(tx)]));
  const base: Inc = {
    id: nextGen(tx),
    frag: null,
    leaf,
    memory: run(m.memory.initial, input as never),
    activations,
    history: {},
    subject: [],
    kids: {},
  };
  const started: Started[] = [];
  const root = seedKids(tx, m, base, active, [], started);
  const armAll = (inc: Inc, nodes: readonly string[]) => {
    const f = fragOf(m, inc);
    for (const n of nodes)
      for (const spec of f.nodes[n]!.schedules) {
        if (!(spec.armOn.length === 0 || spec.armOn.includes("entry"))) continue;
        const ms =
          "ms" in spec.schedule
            ? spec.schedule.ms
            : run(spec.schedule, { memory: viewOf(inc), event: {} } as never);
        armTimer(tx, {
          key: scheduleKey(key, inc.id, inc.activations[n]!, spec.id),
          kind: "schedule",
          actor: key,
          inc: inc.id,
          activation: inc.activations[n]!,
          send: spec.send,
          id: spec.id,
          dueAt: tx.env.now + ms,
        });
      }
  };
  armAll(root, active);
  for (const s of started) armAll(s.inc, s.entered);
  note(tx, "initial", { actor: key });
  const rec: ActorRec = { key, machine, root };
  tx.w = { ...tx.w, actors: setActor(tx.w.actors, key, rec) };
  tx.touchedActors.add(key);
  tx.visible = true;
  const adopted = [
    ...startActor(tx, rec),
    ...started.flatMap((s) => startActor(tx, { ...rec, root: s.inc })),
  ];
  tx.w = { ...tx.w, follow: [...adopted, ...tx.w.follow] };
};
const onEnsure = (tx: Tx, key: string, machine: string, input: unknown) => {
  if (getActor(tx.w.actors, key)) return;
  if (!tx.machines[machine]) return issue(tx, { code: "InvalidTurn", origin: `ensure ${machine}` }); // L8
  const kept = { w: tx.w, commands: tx.commands.length, evidence: tx.evidence.length };
  tx.inTurn = true;
  try {
    startRoot(tx, key, machine, input);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    tx.w = kept.w;
    tx.commands.length = kept.commands;
    tx.evidence.length = kept.evidence; // L9
    tx.touchedActors.delete(key);
    issue(tx, { code: "InvalidTurn", origin: e.origin, cause: e.message });
  } finally {
    tx.inTurn = false;
  }
};

const onBoot = (
  tx: Tx,
  records: ReadonlyArray<readonly [string, string]>,
  persistence: boolean,
) => {
  note(tx, "boot", {});
  tx.w = {
    ...tx.w,
    boot: 1,
    persistence,
    ext: Object.fromEntries(tx.modules.map((m) => [m.id, m.init()])),
  };
  restore(tx, records);
  // Rule 1, rule 51: a reset lost by the reload runs first. Then what restore queued, in order.
  const recheck = allActors(tx.w.actors)
    .filter((a) => hasResetOn(tx, a))
    .map((a) => ({ k: "recheck" as const, actor: a.key }));
  tx.w = { ...tx.w, follow: [...recheck, ...tx.w.follow] };
  tx.visible = true;
  tx.cause = "boot";
};
const hasResetOn = (tx: Tx, a: ActorRec) => {
  let yes = false;
  walkIncs(a.root, (i) => {
    if (placementsActive(tx.machines[a.machine]!, i).some(({ p }) => p.resetOn)) yes = true;
  });
  return yes;
};

// ── D: after every step, over the lanes whose head is `ready`. Level-triggered (D4). D49: a wait past its bound gets a sign. D15.
const dispatch = (tx: Tx) => {
  if (tx.w.status !== "live") return;
  for (const id of Object.keys(tx.w.ready)) {
    const l = tx.w.lanes[id]!;
    const h = l.head!;
    const b = blockedBy(tx, h.id, l.machine);
    if (!b) {
      disarmTimer(tx, `stall/${h.id}`);
      clearStall(tx, h.id);
      cell(tx, "invoked", l, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });
      continue;
    }
    if (b.on === "disabled") {
      if (tx.w.stalled[h.id] !== "module")
        tx.w = { ...tx.w, stalled: { ...tx.w.stalled, [h.id]: "module" } };
      continue;
    }
    if (b.on !== "queue") continue;
    if (!tx.w.stalled[h.id] && !tx.w.timers[`stall/${h.id}`])
      armTimer(tx, {
        key: `stall/${h.id}`,
        kind: "stall",
        attempt: h.id,
        dueAt: tx.env.now + tx.bounds.recordStallMs,
      });
    for (const holder of b.behind) {
      const hl = laneOfAttempt(tx.w, holder);
      if (hl?.head?.phase.t === "held" && !getActor(tx.w.actors, hl.actor) && !tx.w.timers[`yield/${holder}`])
        armTimer(tx, {
          key: `yield/${holder}`,
          kind: "yield",
          attempt: holder,
          dueAt: tx.env.now + tx.bounds.unboundHoldMs,
        });
    }
  }
};

// D63: lifecycle is level-triggered, as dispatch is (D4). A session is a function of the tree, so start, dispose, restore, rebind,
// freeze, thaw and reset all reach a module the one way: this actor changed, here it is.
const tell = (tx: Tx, before: World) => {
  if (tx.w.status !== "live") return;
  const watching = tx.modules.filter((m) => m.observes);
  if (watching.length === 0) return;
  const now = tx.w.actors;
  const was = before.actors;
  const changed = changedActors(was, now);
  if (changed.length === 0) return;
  const view = changed.map((k) => ({ key: k, machine: (getActor(now, k) ?? getActor(was, k)!).machine }));
  for (const m of watching) moduleTold(tx, m.id, { k: "actors", changed: view });
};

export const step = (world: World, input: Input, env: Env, sys: System): StepOut => {
  const tx: Tx = {
    ...sys,
    w: world,
    env,
    commands: [],
    evidence: [],
    issues: [],
    touchedActors: new Set(),
    touchedLanes: new Map(),
    armedDeadline: false,
    asks: [],
    visible: false,
    inTurn: false,
    cause: input.k,
  };
  if (world.status === "disposed" && input.k !== "boot") {
    note(tx, "dropped", { input: input.k });
    return { world, commands: [], evidence: tx.evidence, issues: [] };
  }
  switch (input.k) {
    case "boot":
      onBoot(tx, input.records, input.persistence ?? true);
      break;
    case "ensure":
      onEnsure(tx, input.actor, input.machine, input.input);
      break;
    case "dispose":
      onDisposeActor(tx, input.actor);
      break;
    case "sent":
      onSent(tx, input);
      break;
    case "timer":
      onTimer(tx, input);
      break;
    case "stored":
      onStored(tx, input);
      break;
    case "module":
      moduleInput(tx, input.m, input.payload);
      break;
    case "send":
      if (tx.w.status !== "live") note(tx, "dropped", { input: "send" });
      else if (typeof input.event?.tag !== "string")
        issue(tx, { code: "InvalidTurn", origin: `send ${input.actor}` }); // D65: what enters mail has a shape
      else enqueue(tx, { k: "send", actor: input.actor, event: input.event });
      break;
    case "turn":
      onTurn(tx);
      break;
    case "disposeRuntime":
      onDisposeRuntime(tx);
      break;
  }
  tell(tx, world);
  dispatch(tx);
  if (tx.w.status === "disposing" && wires(tx.w).length === 0 && input.k !== "disposeRuntime")
    finishDisposal(tx);
  flush(tx);
  if (!tx.visible)
    return { world: tx.w, commands: tx.commands, evidence: tx.evidence, issues: tx.issues };
  const seq = tx.w.seq + 1;
  const w = { ...tx.w, seq };
  return {
    world: w,
    commands: tx.commands,
    evidence: tx.evidence,
    issues: tx.issues,
    frame: { cause: tx.cause, at: env.now, seq: w.boot * 1_000_000 + seq, world: w },
  };
};
