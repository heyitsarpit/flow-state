// One function: step(world, input, env, system) returns a new value, at most one publication, and commands. Pure: time and
// ids come through `env`, every closure is a compiled Slot. A throw from core code escapes: fatal by D27.
import { blockedBy, hook, hookOne } from "./hooks.ts";
import { flush, onStorageBound, onStored, restore } from "./durable.ts";
import { cell, parkWaiting, settleSend } from "./lane.ts";
import { takeRead } from "./reads.ts";
import { armTimer, armingsFor, commitSchedules, disarmTimer } from "./timers.ts";
import { onTurn } from "./turn.ts";
import { run, Refused } from "./hooks.ts";
import {
  enqueue,
  issue,
  laneOfAttempt,
  nextGen,
  note,
  noteEnding,
  setLane,
  without,
  type Ending,
  type Env,
  type Input,
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
  const p = lane?.head.phase;
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
      hook(tx, "readAnswered", (m, s, cx) =>
        m.readAnswered!(s, { machine: r.machine, op: r.op, input: r.input, value: e.value }, cx),
      );
    return enqueue(tx, {
      k: "ending",
      actor: r.actor,
      op: r.op,
      key: r.key,
      owner: r.owner,
      ending: e,
      attempt: i.attempt,
    });
  }
  note(tx, "fence", { attempt: i.attempt, send: i.send });
};

const onTimer = (tx: Tx, i: Extract<Input, { k: "timer" }>) => {
  const t = tx.w.timers[i.timer];
  if (!t || t.gen !== i.gen) return note(tx, "fence", { timer: i.timer, gen: i.gen });
  tx.w = { ...tx.w, timers: without(tx.w.timers, i.timer) };
  switch (t.kind) {
    case "schedule":
      tx.touchedActors.add(t.actor);
      return enqueue(tx, {
        k: "fire",
        actor: t.actor,
        activation: t.activation,
        event: { tag: t.send, payload: {} },
      });
    case "timeout": {
      // D8: unknown { TimedOut } at the timer, then interrupt. A later exit of this send carries a stale generation.
      const lane = laneOfAttempt(tx.w, t.attempt);
      const p = lane?.head.phase;
      if (!lane || p?.t !== "wire") return;
      note(tx, "interrupt", { attempt: t.attempt, send: p.gen });
      tx.commands.push({ k: "interrupt", attempt: t.attempt, send: p.gen });
      return settleSend(tx, lane, p.gen, { ch: "unknown", reason: "TimedOut" });
    }
    case "storage":
      return onStorageBound(tx, t.attempt);
    case "dispose":
      return finishDisposal(tx);
    case "module":
      return hookOne(tx, t.module, (m, s, cx) => m.timer!(s, t.key, cx));
  }
};

// ── Runtime disposal (D6). Never awaits unbounded: a core timer ends it; survivors are evidence.
const wires = (w: World) => Object.values(w.lanes).filter((l) => l.head.phase.t === "wire");
const finishDisposal = (tx: Tx) => {
  for (const l of wires(tx.w)) {
    const p = l.head.phase;
    if (p.t === "wire") note(tx, "AbandonedFiber", { op: l.op, attempt: l.head.id, send: p.gen });
    setLane(tx, parkWaiting(tx, l));
  }
  note(tx, "Disposed", {});
  disarmTimer(tx, "dispose");
  tx.w = { ...tx.w, status: "disposed" };
  tx.visible = true;
};
const onDispose = (tx: Tx) => {
  note(tx, "DisposeStart", {});
  tx.w = { ...tx.w, status: "disposing", mail: [], follow: [] };
  for (const l of Object.values(tx.w.lanes))
    cell(tx, "runtimeDisposal", l, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });
  for (const [k, r] of Object.entries(tx.w.reads)) {
    tx.commands.push({ k: "interrupt", attempt: k, send: r.gen });
    note(tx, "Superseded", { op: r.op, attempt: k, send: r.gen });
  }
  tx.w = { ...tx.w, reads: {} };
  for (const t of Object.values(tx.w.timers)) disarmTimer(tx, t.key);
  if (wires(tx.w).length === 0) finishDisposal(tx);
  else armTimer(tx, { key: "dispose", kind: "dispose", dueAt: tx.env.now + tx.bounds.disposeMs });
};

const enterActor = (tx: Tx, key: string, machine: string, input: unknown) => {
  if (tx.w.actors[key]) return;
  const m = tx.machines[machine]!;
  const leaf = m.default;
  const activations = { [m.root]: nextGen(tx), [leaf]: nextGen(tx) };
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
    tx.touchedActors.add(key);
    commitSchedules(tx, key, armings);
    tx.visible = true;
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    issue(tx, { code: "InvalidTurn", origin: e.origin });
  }
};

const onBoot = (tx: Tx, records: ReadonlyArray<readonly [string, string]>) => {
  note(tx, "boot", {});
  tx.w = {
    ...tx.w,
    boot: 1,
    ext: Object.fromEntries(tx.modules.map((m) => [m.id, m.init()])),
  };
  restore(tx, new Map(records.map(([k, v]) => [k, JSON.parse(v)])));
  tx.visible = true;
  tx.cause = "boot";
};

// ── D: after every step, over the lanes whose head is `ready`. Level-triggered, so no wake-up can be lost (D4). A module
// never wakes anything: it only answers `blocks` when asked.
const dispatch = (tx: Tx) => {
  if (tx.w.status !== "live") return;
  for (const id of Object.keys(tx.w.ready)) {
    const l = tx.w.lanes[id]!;
    if (blockedBy(tx, l.head.id)) continue;
    cell(tx, "invoked", l, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });
  }
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
    touchedLanes: new Set(),
    asks: [],
    visible: false,
    cause: input.k,
  };
  if (world.status === "disposed" && input.k !== "boot") {
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
    case "stored":
      onStored(tx, input);
      break;
    case "module":
      hookOne(tx, input.m, (m, s, cx) => m.input!(s, input.payload, cx));
      break;
    case "send":
      if (tx.w.status !== "live") note(tx, "dropped", { input: "send" });
      else enqueue(tx, { k: "send", actor: input.actor, event: input.event });
      break;
    case "turn":
      onTurn(tx);
      break;
    case "disposeRuntime":
      onDispose(tx);
      break;
  }
  dispatch(tx);
  if (tx.w.status === "disposing" && wires(tx.w).length === 0 && input.k !== "disposeRuntime")
    finishDisposal(tx);
  hook(tx, "commit", (m, s, cx) => m.commit!(s, cx));
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
