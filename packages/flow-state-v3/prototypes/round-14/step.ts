// One function: step(world, input, env, system) returns a new value, at most one publication, and commands. Pure: time and ids
// come through `env`, every closure is a compiled Slot. A throw from core code escapes: fatal (D46).
import { Cause } from "effect";
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
import { encodeRecord } from "./record.ts";
import { own } from "./gate.ts";
import { down, placementsActive, seedKids, up, walkIncs, viewOf, type Started } from "./inc.ts";
import { cell, dropParked, endPastDisposal, settleSend, tellEnded } from "./lane.ts";
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
  laneKey,
  laneOfAttempt,
  nextGen,
  note,
  noteEnding,
  deleteLane,
  setLane,
  without,
  type ActorRec,
  type Ending,
  type Env,
  type FrozenTimer,
  type Inc,
  type Input,
  type Lane,
  type Mail,
  type ReadLane,
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

// Round 12 (review H1, D213): a Defect says what died. Before, the issue named the operation only, so "Service not found: Probe/Clock" was lost.
const causeOf = (c: unknown): string => {
  try {
    const e = Cause.isCause(c) ? Cause.squash(c) : c;
    return e instanceof Error ? e.message : String(e);
  } catch {
    return "(a cause that cannot be printed)";
  }
};
const onSent = (tx: Tx, i: Extract<Input, { k: "sent" }>) => {
  const lane = laneOfAttempt(tx.w, i.attempt);
  const p = lane?.head?.phase;
  if (lane && p?.t === "wire" && p.gen === i.send) {
    if (i.exit.t === "defect") issue(tx, { code: "Defect", origin: `${lane.actor} ${lane.op}`, cause: causeOf(i.exit.cause) });
    return settleSend(tx, lane, i.send, classify(i.exit, p.cancelled));
  }
  const r = takeRead(tx, i.attempt, i.send);
  if (r) {
    if (i.exit.t === "defect") issue(tx, { code: "Defect", origin: `${r.actor} ${r.op}`, cause: causeOf(i.exit.cause) });
    let e = readEnding(i.exit);
    if (e.ch === "success") {
      // D147, HIGH-03 decided: the domain's read mapper is the user's code turning this answer into records. If it throws, or returns what has no shape, the store has nothing, and the machine must not hear `Listed`: the read's ending is a failure, `Defect` (rule 37). The store's issue says why.
      const before = tx.issues.length;
      toldAll(tx, {
        k: "answered",
        machine: r.machine,
        op: r.op,
        input: r.input,
        value: e.value,
        pos: r.pos,
      });
      if (tx.issues.slice(before).some((x) => x.code === "UserClosure")) e = { ch: "failure", tag: "Defect", value: {} };
    } else if (e.ch === "failure" && i.exit.t === "failure") toldAll(tx, { k: "failed", machine: r.machine, op: r.op, input: r.input, tag: e.tag, pos: r.pos });
    noteEnding(tx, { op: r.op, attempt: i.attempt, send: i.send }, e);
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
      ...(r.kept ? { keeps: true as const } : {}),
    });
  }
  const was = tx.w.interrupted?.[i.attempt];
  if (was) {
    const e = classify(i.exit, true);
    noteEnding(tx, { op: was.op, attempt: i.attempt, send: i.send }, e);
    tellEnded(tx, i.attempt, e);
    note(tx, "evidenceOnly", { op: was.op, attempt: i.attempt });
    tx.w = { ...tx.w, interrupted: without(tx.w.interrupted!, i.attempt) };
    return;
  }
  note(tx, "fence", { attempt: i.attempt, send: i.send });
};

// D15: an unbound hold with a waiter gives way. Released; the mark stays; parked for whoever comes.
const yieldHold = (tx: Tx, attempt: string) => {
  const l = laneOfAttempt(tx.w, attempt);
  if (!l?.head || l.head.phase.t !== "held" || getActor(tx.w.actors, l.actor)) return;
  // "With a waiter": dispatch calls this when a ready write waits behind it on a record; a stale timer from an older world finds none.
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
      // Rule 73: while nothing uses its actor, a deadline that comes due waits. The record keeps it (captures read `waiting`).
      if (counted(tx, t.actor) && usesOf(tx.w, t.actor) === 0) {
        note(tx, "scheduleWaits", { actor: t.actor, id: t.id });
        tx.w = { ...tx.w, waiting: { ...tx.w.waiting, [t.key]: t } };
        tx.visible = true;
        return;
      }
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
    case "grace":
      return onGrace(tx, t.actor);
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
    endPastDisposal(tx, l);
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

// A quarantined lane record of this identity that reads, under an operation its machine no longer has (a record that does not read is kept).
const goneOp = (tx: Tx, id: string, key: string): boolean => {
  let v: { readonly actor?: unknown; readonly machine?: unknown; readonly op?: unknown } | undefined;
  try {
    v = JSON.parse(tx.w.savedLanes[id] ?? "null") as typeof v;
  } catch {
    return false;
  }
  return v?.actor === key && typeof v.machine === "string" && typeof v.op === "string" && tx.machines[v.machine]?.ops[v.op] === undefined;
};
// Q1 A, C173: `forget` removes the identity's record (the next ensure starts fresh) and makes what its lanes hold for it (parked endings, and what a
// boot queued in a record kept at ready) evidence, never delivered. It drops no hold: only its owner's `cancel` does (the key the server may hold keeps
// its record), so a held lane stays unbound, listed and reported at each boot, until a cancel or an adopting ensure. A live actor is disposed first,
// as `disposeActor` (W27, 2.10.10: a Story's `{ how: "forget" }` is `forget`). A hold of an operation the release no longer has has no owner who could cancel it: dropped, with evidence.
const onForget = (tx: Tx, key: string) => {
  if (getActor(tx.w.actors, key)) onDisposeActor(tx, key, "dispose");
  const owed = (op: string, attempt: string | undefined, record?: true) => {
    note(tx, "unparked", { op, attempt: attempt ?? "", ...(record ? { record } : {}) });
    note(tx, "ParkedForgotten", { op, attempt: attempt ?? "" });
    note(tx, "evidenceOnly", { op, attempt: attempt ?? "" });
  };
  const r = own(tx.w.retired, key) as (ActorRec & { bootMail?: readonly Mail[] }) | undefined;
  for (const m of r?.bootMail ?? []) if (m.k === "ending") owed(m.op, m.attempt, true);
  if (r || Object.hasOwn(tx.w.undecodable, key) || Object.hasOwn(tx.w.oldVersion, key)) {
    const { [key]: _u, ...undecodable } = tx.w.undecodable;
    tx.w = { ...tx.w, retired: without(tx.w.retired, key), undecodable, oldVersion: without(tx.w.oldVersion, key) };
    tx.touchedActors.add(key);
    tx.dropped.add(key);
  }
  for (const l of Object.values(tx.w.lanes)) {
    if (l.actor !== key) continue;
    for (const p of l.parked) owed(l.op, p.attempt);
    if (!tx.machines[l.machine]?.ops[l.op]) {
      if (l.head) note(tx, "HoldForgotten", { op: l.op, attempt: l.head.id });
      for (const x of l.w) note(tx, "evidenceOnly", { op: l.op, attempt: x.id });
      deleteLane(tx, l.id);
    } else if (!l.head && l.w.length === 0) deleteLane(tx, l.id);
    else setLane(tx, { ...l, parked: [] });
  }
  for (const id of Object.keys(tx.w.quarantined))
    if (goneOp(tx, id, key)) {
      note(tx, "HoldForgotten", { lane: id });
      const { [id]: _q, ...quarantined } = tx.w.quarantined;
      tx.w = { ...tx.w, quarantined };
      tx.touchedLanes.set(id, key);
    }
  note(tx, "forgotten", { actor: key });
  tx.visible = true;
};
// ── An actor's life. D21: a local identity's hold releases at once and is never adopted. Otherwise the lanes stay the Runtime's.
// `end`: rule 73's end; a persisted actor's record goes to the Runtime's copy with its armed and waiting deadlines. `dispose`: `disposeActor`;
// the record is removed, and the lanes stay unbound for the identity's next ensure (rule 46). `remount`: a local predecessor kept only by work;
// its lanes stay for the new incarnation to adopt.
const onDisposeActor = (tx: Tx, key: string, how: "end" | "dispose" | "remount") => {
  const a = getActor(tx.w.actors, key);
  if (!a) {
    if (how === "dispose" && own(tx.w.retired, key)) {
      // D6: what a boot queued for a record kept at ready is a disposed identity's ending now; it waits raw on its lane (rule 44), so the
      // next incarnation hears it once (a Held head's own Restored is then delivered from the parked list, not told again).
      for (const m of (own(tx.w.retired, key) as { bootMail?: readonly Mail[] }).bootMail ?? []) {
        if (m.k !== "ending") continue;
        const l = tx.w.lanes[laneKey(m.actor, m.op, m.key)];
        if (!l) {
          note(tx, "evidenceOnly", { op: m.op, attempt: m.attempt ?? "" });
          continue;
        }
        setLane(tx, { ...l, parked: [...l.parked, { ...(m.attempt ? { attempt: m.attempt } : {}), ending: m.ending, owner: m.owner, input: m.input }] });
      }
      tx.w = { ...tx.w, retired: without(tx.w.retired, key) };
      tx.touchedActors.add(key);
      tx.dropped.add(key);
      tx.visible = true;
    }
    if (how === "dispose") setUses(tx, key, undefined);
    return;
  }
  const m = tx.machines[a.machine]!;
  walkIncs(a.root, (i) => void dropReadsOf(tx, i.id));
  reapStranded(tx, (s) => s.actor === key);
  tx.w = { ...tx.w, failing: Object.fromEntries(Object.entries(tx.w.failing).filter(([k]) => !k.startsWith(`${key}|`))) };
  const armed = Object.values(tx.w.timers).filter(
    (t): t is FrozenTimer => t.kind === "schedule" && t.actor === key,
  );
  for (const t of armed) disarmTimer(tx, t.key);
  const waiting = Object.values(tx.w.waiting).filter((t) => t.actor === key);
  const timers = [...armed, ...waiting, ...tx.w.keptFires.filter((f) => f.actor === key).map((f) => fireAsTimer(f, tx.env.now))]; // D118
  const actors = deleteActor(tx.w.actors, key);
  const keep = m.persisted && how === "end";
  tx.w = {
    ...tx.w,
    keptFires: tx.w.keptFires.filter((f) => f.actor !== key),
    waiting: waiting.length === 0 ? tx.w.waiting : Object.fromEntries(Object.entries(tx.w.waiting).filter(([, t]) => t.actor !== key)),
    actors,
    retired: keep ? { ...tx.w.retired, [key]: { ...a, timers } as ActorRec } : without(tx.w.retired, key),
  };
  if (m.local && how !== "remount")
    for (const old of Object.values(tx.w.lanes)) {
      if (old.actor !== key) continue;
      const l = dropParked(tx, old); // D21, D123: no next life hears this one's. It goes as evidence
      if (!l?.head) continue;
      if (l.head.phase.t === "held")
        cell(tx, "cancel", l, { actor: key, machine: l.machine, op: l.op, key: l.key });
      else setLane(tx, { ...l, releasing: true });
    }
  if (m.persisted) tx.touchedActors.add(key); // D73: the disk says it sleeps; after `disposeActor`, that it is gone
  if (m.persisted && how === "dispose") tx.dropped.add(key);
  if (how === "end" || how === "remount") setUses(tx, key, tx.w.uses[key] ?? []);
  else setUses(tx, key, undefined);
  note(tx, "disposed", { actor: key, inc: a.root.id, how });
  tx.visible = true;
};
// D1 (OD31 correction): each read the end stopped ends `failure { Interrupted }`, as rule 52's freeze does, heard after the restored
// deliveries, on every path that brings the identity back (an ensure, a subscription, a send, woken at ready).
const stoppedEndings = (tx: Tx, key: string, stopped: readonly StoppedRead[] | undefined, old: string, inc: string): Mail[] =>
  (stopped ?? []).map((r) => {
    const ending = { ch: "failure" as const, tag: "Interrupted", value: {} };
    noteEnding(tx, { op: r.op, actor: key }, ending);
    return { k: "ending", actor: key, op: r.op, key: r.key, owner: r.owner, ending, input: r.input, inc: r.inc === old ? inc : r.inc };
  });
const startRoot = (tx: Tx, key: string, machine: string, input: unknown, identity?: readonly string[]) => {
  const m: Compiled = tx.machines[machine]!;
  const retired = own(tx.w.retired, key);
  const soon = tx.w.soon[key];
  if (soon) {
    if (tx.env.now < soon.dueAt) note(tx, "createdSoonAfterEnd", { actor: key, ms: tx.env.now - (soon.dueAt - 5_000) }); // a forgotten lift (2.7.17, Diagnostics)
    tx.w = { ...tx.w, soon: without(tx.w.soon, key) };
  }
  if (retired) {
    // Return (2.7.17): a new incarnation from the Runtime's copy, never re-read from storage. A record kept at ready runs the reset the reload lost.
    // A return after an end is a new incarnation (2.7.17): its root gets a new id, so an ending of the old one is adopted, current from the
    // active leaf (rule 14's adopted row), as `Restored` is. A record kept at ready is the boot's own incarnation and keeps its id, as a live restore does.
    const { timers: kept0, fromBoot, bootMail, stopped, ...rec0 } = retired as ActorRec & { timers: readonly FrozenTimer[]; fromBoot?: true; bootMail?: readonly Mail[]; stopped?: readonly StoppedRead[] };
    const old = rec0.root.id;
    const inc = fromBoot ? old : nextGen(tx);
    const fresh: ActorRec = fromBoot ? rec0 : { ...rec0, root: { ...rec0.root, id: inc } };
    const timers = kept0.map((t) =>
      t.inc !== old || fromBoot ? t : { ...t, inc, key: t.key.startsWith("fired/") ? `fired/${inc}/${t.send}` : scheduleKey(key, inc, t.activation, t.id) },
    );
    tx.w = {
      ...tx.w,
      retired: without(tx.w.retired, key),
      actors: setActor(tx.w.actors, key, fresh),
    };
    for (const t of timers) {
      const { gen: _g, ...spec } = t;
      armTimer(tx, spec);
    }
    note(tx, "incarnation", { actor: key, from: "record" });
    // Computed first: `{ ...tx.w, follow: [...adoption()] }` spreads a world before adoption's own writes, and loses them.
    const adopted = bootMail ? bootMail : rebindActor(tx, fresh); // the first return after a boot hears what the restore queued, not a second Restored
    for (const m of bootMail ?? []) if (m.k === "ending") note(tx, "unparked", { op: m.op, attempt: m.attempt ?? "", record: true });
    const recheck = fromBoot && hasResetOn(tx, fresh) ? [{ k: "recheck" as const, actor: key }] : [];
    const cut = stoppedEndings(tx, key, stopped, old, inc);
    tx.w = { ...tx.w, follow: [...recheck, ...adopted, ...cut, ...tx.w.follow] };
    // M5 (fix pass): a record kept at ready is on disk as it is now (live, this record), so its return writes nothing; a turn that changes it
    // will. A return after an end changes the disk's word (retired, a new incarnation).
    if (!fromBoot) tx.touchedActors.add(key);
    tx.visible = true;
    return;
  }
  if (tx.w.undecodable[key]) {
    note(tx, "RecordUndecodable", { actor: key, discarded: true }); // D7: an ensure over a record that does not decode starts fresh from input and says so
    tx.w = { ...tx.w, undecodable: without(tx.w.undecodable, key) };
  }
  if (tx.w.oldVersion[key]) tx.w = { ...tx.w, oldVersion: without(tx.w.oldVersion, key) }; // a fresh actor's record replaces the old-version one
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
  note(tx, "incarnation", { actor: key, from: "input" });
  const rec: ActorRec = { key, machine, root, ...(identity ? { fields: [...identity].sort() } : {}) };
  tx.w = { ...tx.w, actors: setActor(tx.w.actors, key, rec) };
  tx.touchedActors.add(key);
  tx.visible = true;
  const adopted = [
    ...startActor(tx, rec),
    ...started.flatMap((s) => startActor(tx, { ...rec, root: s.inc })),
  ];
  tx.w = { ...tx.w, follow: [...adopted, ...tx.w.follow] };
};
const onEnsure = (tx: Tx, key: string, machine: string, input: unknown, identity?: readonly string[]) => {
  const live = getActor(tx.w.actors, key);
  if (live) {
    // D137: a key names one machine. Saying nothing here let two machines share an actor.
    if (live.machine !== machine) issue(tx, { code: "ActorMachineMismatch", origin: `ensure ${machine}`, input: { key, is: live.machine } });
    return;
  }
  if (!tx.machines[machine]) return issue(tx, { code: "InvalidTurn", origin: `ensure ${machine}` }); // L8
  const kept = { w: tx.w, commands: tx.commands.length, evidence: tx.evidence.length };
  tx.inTurn = true;
  try {
    startRoot(tx, key, machine, input, identity);
    if (shared(tx, machine) && tx.w.uses[key] === undefined) setUses(tx, key, []); // rule 73: an ensure alone is no use (OD27 Q2)
    if (usesOf(tx.w, key) > 0) wake(tx, key); // uses pending on the identity (a subscription that waited) are held at once
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

// ── Rule 73, 2.7.17 (OD31): an actor lives while it is used, and until its finite work in flight has returned. Work in flight: an InFlight
// write lane (bound or unplaced; a settled head is InFlight until its ending is admitted), a kept read, and the ending of one (`keeps`, which
// also marks an ending owed at ready). Nothing else keeps an actor: not schedules, other reads, sessions, Held lanes, parked endings or mail.
export const workOf = (w: World, key: string): string[] => {
  const out: string[] = [];
  for (const id in w.lanes) {
    const l = w.lanes[id]!;
    if (l.actor === key && l.head !== undefined && l.head.phase.t !== "held") out.push(`write:${l.op}`);
  }
  for (const id in w.reads) if (w.reads[id]!.actor === key && w.reads[id]!.kept) out.push(`read:${w.reads[id]!.op}`);
  for (const m of [...w.mail, ...w.follow]) if (m.actor === key && m.k === "ending" && m.keeps) out.push(`ending:${m.op}`);
  return out;
};
export const busy = (w: World, key: string): boolean => workOf(w, key).length > 0;
const hasMail = (w: World, key: string) => w.mail.has(key) || w.follow.some((m) => m.actor === key);
// Counted: a shared actor, and a local one a component mounted (`useActor`, owner "component"). A host `createActor` local actor is not.
const shared = (tx: Tx, machine: string | undefined) => machine !== undefined && !tx.machines[machine]?.local;
const usesOf = (w: World, key: string) => w.uses[key]?.length ?? 0;
const setUses = (tx: Tx, key: string, owners: readonly string[] | undefined) => {
  if (owners === undefined) {
    if (key in tx.w.uses) tx.w = { ...tx.w, uses: without(tx.w.uses, key) };
    return;
  }
  const sorted = [...owners].sort();
  const was = tx.w.uses[key];
  if (was && was.length === sorted.length && was.every((x, i) => x === sorted[i])) return;
  tx.w = { ...tx.w, uses: { ...tx.w.uses, [key]: sorted } };
};
const graceKey = (key: string) => `grace/${key}`;
// Level-triggered, as dispatch is (D4): after every step, each counted live actor with no use and no work in flight has one armed grace, and
// every other has none. A use or new work disarms it; mail does not (the end waits behind it). The generation is the deadline: no id is drawn.
const lifetime = (tx: Tx) => {
  if (tx.w.status !== "live") return;
  for (const key in tx.w.uses) {
    const t = graceKey(key);
    if (!getActor(tx.w.actors, key)) {
      if (usesOf(tx.w, key) === 0) setUses(tx, key, undefined); // uses on an identity with no actor stay, pending, for the ensure that creates it
      disarmTimer(tx, t);
      continue;
    }
    const free = usesOf(tx.w, key) === 0 && !busy(tx.w, key);
    if (!free) {
      disarmTimer(tx, t);
      if (tx.w.endDue[key]) tx.w = { ...tx.w, endDue: without(tx.w.endDue, key) };
      continue;
    }
    if (tx.w.endDue[key]) {
      if (!hasMail(tx.w, key)) endActor(tx, key);
      continue;
    }
    if (!tx.w.timers[t]) {
      const dueAt = tx.env.now + tx.bounds.graceMs;
      const gen = `${dueAt}`;
      tx.w = { ...tx.w, timers: { ...tx.w.timers, [t]: { key: t, gen, dueAt, kind: "grace", actor: key } } };
      tx.commands.push({ k: "arm", timer: t, gen, at: dueAt });
    }
  }
  const now = tx.env.now;
  if (Object.values(tx.w.soon).some((s) => s.dueAt <= now))
    tx.w = { ...tx.w, soon: Object.fromEntries(Object.entries(tx.w.soon).filter(([, s]) => s.dueAt > now)) };
};
const onGrace = (tx: Tx, key: string) => {
  if (usesOf(tx.w, key) !== 0 || !getActor(tx.w.actors, key) || busy(tx.w, key)) return;
  if (hasMail(tx.w, key)) {
    tx.w = { ...tx.w, endDue: { ...tx.w.endDue, [key]: true } };
    return;
  }
  endActor(tx, key);
};
const warnOnce = (tx: Tx, k: string) => {
  if (tx.w.warned[k]) return false;
  tx.w = { ...tx.w, warned: { ...tx.w.warned, [k]: true } };
  return true;
};
// The end (2.7.17): the record is encoded in this step, or the end waits; then the existing disposal hands the lanes to the Runtime (rule 44)
// and stops the live work, which the trace record lists. Ending is atomic here: this runtime's cleanup is done within the step.
type StoppedRead = Pick<ReadLane, "op" | "key" | "owner" | "input" | "inc">;
const encodes = (tx: Tx, a: ActorRec) => {
  try {
    encodeRecord(tx.machines, { ...a, boot: tx.w.boot, timers: [] });
    return true;
  } catch {
    return false;
  }
};
const endActor = (tx: Tx, key: string) => {
  const a = getActor(tx.w.actors, key)!;
  if (tx.w.endDue[key]) tx.w = { ...tx.w, endDue: without(tx.w.endDue, key) };
  // The record is encoded in this step, with the codec the driver writes with (`record.ts`); if it cannot be, the end waits (Persistence O5).
  if (tx.machines[a.machine]!.persisted && !encodes(tx, a)) {
    if (warnOnce(tx, `codec|${key}`)) issue(tx, { code: "RecordUnencodable", origin: `end ${key}`, input: { actor: key } });
    note(tx, "endBlocked", { actor: key, why: "RecordUnencodable" });
    disarmTimer(tx, graceKey(key)); // armed again by the pass: the end is retried at each expiry
    return;
  }
  const stopped: string[] = [];
  for (const t of Object.values(tx.w.timers)) if (t.kind === "schedule" && t.actor === key) stopped.push(`schedule:${t.id}`);
  for (const t of Object.values(tx.w.waiting)) if (t.actor === key) stopped.push(`schedule:${t.id}`); // armed or waiting: one kind
  for (const r of Object.values(tx.w.reads)) if (r.actor === key) stopped.push(`read:${r.op}`);
  stopped.sort();
  note(tx, "ended", { actor: key, inc: a.root.id, reason: "NoUses", stopped });
  for (const kind of new Set(stopped.map((s) => s.split(":")[0]!)))
    if (warnOnce(tx, `work|${a.machine}|${kind}`)) note(tx, "EndedWithWork", { actor: key, machine: a.machine, work: kind, persisted: tx.machines[a.machine]!.persisted === true });
  tx.w = { ...tx.w, soon: { ...tx.w.soon, [key]: { dueAt: tx.env.now + 5_000, inc: a.root.id } } };
  // D1: the reads this end stops are owed `failure { Interrupted }` by the next incarnation; a persisted record carries them.
  const cutReads: StoppedRead[] = Object.values(tx.w.reads).filter((r) => r.actor === key).map((r) => ({ op: r.op, key: r.key, owner: r.owner, input: r.input, inc: r.inc }));
  onDisposeActor(tx, key, "end");
  const kept = own(tx.w.retired, key);
  if (kept && cutReads.length) tx.w = { ...tx.w, retired: { ...tx.w.retired, [key]: { ...kept, stopped: cutReads } as ActorRec } };
};
// A use returning before the end: each deadline that came due while it was unused fires once, in deadline order (Machines O5's overdue rule).
const wake = (tx: Tx, key: string) => {
  const due = Object.values(tx.w.waiting).filter((t) => t.actor === key).sort((x, y) => x.dueAt - y.dueAt || (x.key < y.key ? -1 : 1));
  if (due.length === 0) return;
  tx.w = { ...tx.w, waiting: Object.fromEntries(Object.entries(tx.w.waiting).filter(([, t]) => t.actor !== key)) };
  for (const t of due) {
    note(tx, "scheduleWoke", { actor: key, id: t.id });
    enqueue(tx, { k: "fire", actor: t.actor, inc: t.inc, activation: t.activation, event: { tag: t.send, payload: {} } });
  }
};
const counted = (tx: Tx, key: string) => key in tx.w.uses;
const addUse = (tx: Tx, key: string, owner: string) => {
  const was = usesOf(tx.w, key);
  setUses(tx, key, [...(tx.w.uses[key] ?? []), owner]);
  if (was === 0 && getActor(tx.w.actors, key)) wake(tx, key);
};
// Rule 73's remount rule (2.7.17): a new incarnation of an equal local identity while the older one is kept only by work in flight disposes
// the older one at once, and the new one adopts its lanes, so the remounted screen receives the ending.
const remount = (tx: Tx, key: string) => {
  const a = getActor(tx.w.actors, key);
  if (!a || !tx.machines[a.machine]!.local || usesOf(tx.w, key) !== 0 || !busy(tx.w, key)) return;
  note(tx, "remounted", { actor: key, inc: a.root.id });
  onDisposeActor(tx, key, "remount");
};
const onAttach = (tx: Tx, i: Extract<Input, { k: "attach" }>) => {
  const component = i.owner === "component";
  if (component) remount(tx, i.actor);
  if (!i.existing) onEnsure(tx, i.actor, i.machine, i.input, i.identity);
  else if (!getActor(tx.w.actors, i.actor) && own(tx.w.retired, i.actor)) returnActor(tx, i.actor, "subscription");
  const live = getActor(tx.w.actors, i.actor);
  const machine = live?.machine ?? i.machine;
  // A refused ensure makes no actor and no use. A subscription on an identity with neither a record nor an actor waits as a use (C105).
  if ((live || i.existing) && (shared(tx, machine) || component)) addUse(tx, i.actor, i.owner);
};
const onDetach = (tx: Tx, key: string, owner: string) => {
  const owners = tx.w.uses[key];
  const at = owners?.indexOf(owner) ?? -1;
  if (!owners || at < 0) return;
  setUses(tx, key, [...owners.slice(0, at), ...owners.slice(at + 1)]);
};
const returnActor = (tx: Tx, key: string, by: string) => {
  const kept = own(tx.w.retired, key)!;
  note(tx, "returned", { actor: key, by });
  onEnsure(tx, key, kept.machine, undefined, kept.fields);
};
// The send table (2.7.17, amends Runtime O4). A send never creates; it may restore. This runtime's end is atomic (no ending phase) and has no
// lazy entries, so the ending rows and `NotAdopted` cannot occur here.
const sendTarget = (tx: Tx, key: string): boolean => {
  if (getActor(tx.w.actors, key)) return true;
  if (own(tx.w.retired, key)) {
    returnActor(tx, key, "send");
    if (getActor(tx.w.actors, key)) return true;
  }
  const reason = tx.w.undecodable[key] ? "RecordUndecodable" : "NoRecord";
  issue(tx, { code: "SendTargetAbsent", origin: `send ${key}`, input: { reason } });
  return false;
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
  // Rule 73, C106 (OD31, Ready and hydration): a restored record stays a record until an ensure, a subscription or a send reaches it, except
  // an identity its lanes owe an ending (a lane InFlight at capture, a parked ending): that one is live at ready, kept until those turns run.
  // A record on disk that a dispose had retired is the same: owed, it wakes.
  const owedTo = new Set([...tx.w.mail, ...tx.w.follow].flatMap((m) => (m.k === "ending" && m.keeps ? [m.actor] : [])));
  const woken = new Set<string>();
  for (const [key, r] of Object.entries(tx.w.retired))
    if (owedTo.has(key) && shared(tx, r.machine)) {
      // Live from its record, with no adoption: the restore has already queued every ending its lanes owe it (rule 44, once).
      const { timers, stopped, ...rec } = r as ActorRec & { timers?: readonly FrozenTimer[]; stopped?: readonly StoppedRead[] };
      tx.w = { ...tx.w, retired: without(tx.w.retired, key), actors: setActor(tx.w.actors, key, rec) };
      for (const t of timers ?? []) {
        const { gen: _g, ...spec } = t;
        armTimer(tx, spec);
      }
      for (const m of stoppedEndings(tx, key, stopped, rec.root.id, rec.root.id)) enqueue(tx, m); // D1, after what the restore queued
      tx.touchedActors.add(key);
      woken.add(key);
      note(tx, "wokenAtReady", { actor: key });
      note(tx, "incarnation", { actor: key, from: "record" });
    }
  for (const a of allActors(tx.w.actors)) {
    if (!shared(tx, a.machine) || owedTo.has(a.key)) continue;
    const armed = Object.values(tx.w.timers).filter((t): t is FrozenTimer => t.kind === "schedule" && t.actor === a.key);
    for (const t of armed) disarmTimer(tx, t.key);
    // What the restore queued for it (each held head's unknown { Restored }, once) waits in the record for its return.
    const bootMail = [...tx.w.mail, ...tx.w.follow].filter((m) => m.actor === a.key);
    // Each ending it is owed waits with the record, so evidence names it (the fix pass's fragstore.row diagnosis); the return unparks it.
    for (const m of bootMail) if (m.k === "ending") note(tx, "parked", { op: m.op, attempt: m.attempt ?? "", record: true });
    tx.w = {
      ...tx.w,
      actors: deleteActor(tx.w.actors, a.key),
      retired: { ...tx.w.retired, [a.key]: { ...a, timers: armed, fromBoot: true, bootMail } as ActorRec },
      mail: tx.w.mail.filter((m) => m.actor !== a.key),
      follow: tx.w.follow.filter((m) => m.actor !== a.key),
    };
    note(tx, "recordAtReady", { actor: a.key });
  }
  for (const a of allActors(tx.w.actors)) if (!woken.has(a.key)) note(tx, "incarnation", { actor: a.key, from: "record" });
  tx.w = { ...tx.w, uses: Object.fromEntries(allActors(tx.w.actors).filter((a) => shared(tx, a.machine)).map((a) => [a.key, []])) };
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
const joinHeads = (tx: Tx) => {
  if (tx.w.status !== "live") return;
  const ids = new Set([...tx.touchedLanes.keys(), ...Object.keys(tx.w.ready)]);
  const heads = [...ids].flatMap((id) => tx.w.lanes[id]?.head ?? []).sort((a, b) => a.mint - b.mint);
  for (const h of heads) hook(tx, "sending", (m, s, cx) => m.sending!(s, h.id, cx));
};
const dispatch = (tx: Tx) => {
  if (tx.w.status !== "live") return;
  joinHeads(tx);
  for (const id of Object.keys(tx.w.ready)) {
    const l = tx.w.lanes[id];
    const h = l?.head;
    if (!l || !h || h.phase.t !== "ready") continue;
    const first = blockedBy(tx, h.id, l.machine);
    // D15 as ruled: no clock. An unbound sent hold gives way as soon as a write waits behind it on its record.
    if (first && first.on === "queue") for (const holder of first.behind) yieldHold(tx, holder);
    const b = first && first.on === "queue" ? blockedBy(tx, h.id, l.machine) : first;
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
    keeps: false,
    dropped: new Set(),
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
      onEnsure(tx, input.actor, input.machine, input.input, input.identity);
      break;
    case "dispose":
      onDisposeActor(tx, input.actor, "dispose");
      break;
    case "forget":
      onForget(tx, input.actor);
      break;
    case "attach":
      onAttach(tx, input);
      break;
    case "detach":
      onDetach(tx, input.actor, input.owner);
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
      else if (!sendTarget(tx, input.actor)) break;
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
  lifetime(tx);
  joinHeads(tx);
  if (tx.w.status === "disposing" && wires(tx.w).length === 0 && input.k !== "disposeRuntime")
    finishDisposal(tx);
  flush(tx);
  if (!tx.visible)
    return { world: tx.w, commands: tx.commands, evidence: tx.evidence, issues: tx.issues };
  // Conformance Port (T8): each actor this visible step changed is published; read only by the suite.
  for (const key of changedActors(world.actors, tx.w.actors)) {
    const a = getActor(tx.w.actors, key);
    if (a) note(tx, "published", { actor: key, state: a.root.leaf, memory: a.root.memory });
  }
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
