// Write-ahead, in the core (D26): the invoked, storage-refused and restore rows are lane rows. Only the encoding and the
// storage are replaceable. An Attempt writes twice: a capture saying "not acknowledged", then the acknowledgement, which is
// how a restore tells NotSent { Restored } from unknown { Restored } (round 1 F1; both forms go to S3).
//
// D30: silence is not refusal. A bound that passes is evidence and the row stays pending: the design's "You haven't been
// charged" was a sentence the UI could not know (review M3).
import { captureAll, hook } from "./hooks.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import {
  enqueue,
  laneOfAttempt,
  note,
  noteEnding,
  nextGen,
  setLane,
  type Attempt,
  type Ending,
  type Lane,
  type Phase,
  type Timer,
  type Tx,
  type World,
  type Write,
} from "./world.ts";
import { cell } from "./lane.ts";

// A phase that must first reach storage, or `ready` if the machine does not persist. The ask goes out at commit, after
// every closure has run; a refused turn loses it with the world. Nothing to forget, so a refused capture cannot stick (H3).
export const requestDurable = (tx: Tx, lane: Lane, _h: Attempt, on: "ack" | "capture"): Phase => {
  if (!tx.machines[lane.machine]!.persisted) return { t: "ready" };
  const ticket = nextGen(tx);
  tx.asks.push({ lane: lane.id, on, ticket });
  return { t: "durable", on, ticket };
};
export const phaseToWait = (p: Phase) => (p.t === "durable" ? p.on : undefined);

export const onStored = (tx: Tx, i: { attempt: string; ticket: string; ok: boolean }) => {
  const l = laneOfAttempt(tx.w, i.attempt);
  const p = l?.head.phase;
  if (!l || p?.t !== "durable" || p.ticket !== i.ticket)
    return note(tx, "fence", { stored: i.attempt }); // a late answer, for an Attempt that has moved on
  disarmTimer(tx, `storage/${i.attempt}`);
  if (!i.ok)
    return cell(tx, "storageRefused", l, {
      actor: l.actor,
      machine: l.machine,
      op: l.op,
      key: l.key,
    });
  setLane(tx, { ...l, head: { ...l.head, acked: true, phase: { t: "ready" } } });
};
export const onStorageBound = (tx: Tx, attempt: string) => {
  const l = laneOfAttempt(tx.w, attempt);
  if (l) note(tx, "StorageSilent", { op: l.op, attempt });
};

const saveAttempt = (tx: Tx, a: Attempt) => {
  const { phase, ...rest } = a;
  const ext = captureAll(tx, a.id);
  return { ...rest, held: phase.t === "held", ...(ext ? { ext } : {}) };
};
const encodeLane = (tx: Tx, l: Lane, acked: boolean) =>
  JSON.stringify({
    id: l.id,
    actor: l.actor,
    machine: l.machine,
    op: l.op,
    key: l.key,
    head: { ...saveAttempt(tx, l.head), acked },
    w: l.w.map((a) => saveAttempt(tx, a)),
    ...(l.parked ? { parked: l.parked } : {}),
  });
const encodeActor = (w: World, key: string) => {
  const a = w.actors[key]!;
  const timers = Object.values(w.timers).filter((t) => t.kind === "schedule" && t.actor === key);
  return JSON.stringify({ ...a, timers });
};

// C: the world decides what is written. A record is written when its encoding differs from the last one sent.
export const flush = (tx: Tx) => {
  const writes: Write[] = [];
  for (const key of tx.touchedActors)
    if (tx.machines[tx.w.actors[key]!.machine]!.persisted)
      writes.push({ key: `actor/${key}`, value: encodeActor(tx.w, key) });
  let saved = tx.w.savedLanes;
  const put = (id: string, value: string | undefined) => {
    const prior = saved[id];
    if (prior === value) return;
    writes.push({ key: `lane/${id}`, value });
    saved = { ...saved, [id]: value as string };
    if (value === undefined) {
      const { [id]: _gone, ...rest } = saved;
      saved = rest;
    }
  };
  for (const id of tx.touchedLanes) {
    const l = tx.w.lanes[id];
    if (!l) {
      if (saved[id] !== undefined) put(id, undefined);
      continue;
    }
    if (!tx.machines[l.machine]!.persisted) continue;
    // A first send's plain capture says "not acknowledged". A re-send's capture goes out only as its awaited write.
    const ask = tx.asks.find((x) => x.lane === id);
    if (ask?.on === "capture") continue;
    put(id, encodeLane(tx, l, l.head.acked));
  }
  const persisted = writes.length > 0 || tx.asks.length > 0;
  const meta = JSON.stringify({ boot: tx.w.boot, nextMint: tx.w.nextMint });
  if (persisted && meta !== tx.w.savedMeta) {
    writes.push({ key: "meta", value: meta });
    tx.w = { ...tx.w, savedMeta: meta };
  }
  if (writes.length)
    tx.commands.push({
      k: "persist",
      writes,
      purpose: tx.w.status === "live" ? "capture" : "flush",
    });
  for (const a of tx.asks) {
    const l = tx.w.lanes[a.lane];
    const p = l?.head.phase;
    if (!l || p?.t !== "durable" || p.ticket !== a.ticket) continue; // replaced in this same step
    const value = encodeLane(tx, l, true); // the awaited write says "acknowledged"
    saved = { ...saved, [a.lane]: value };
    tx.commands.push({
      k: "persist",
      writes: [{ key: `lane/${a.lane}`, value }],
      purpose: a.on === "ack" ? "acknowledge" : "capture",
      ticket: { attempt: l.head.id, ticket: a.ticket },
    });
    armTimer(tx, {
      key: `storage/${l.head.id}`,
      kind: "storage",
      attempt: l.head.id,
      dueAt: tx.env.now + tx.bounds.storageMs,
    });
  }
  tx.w = { ...tx.w, savedLanes: saved };
};

type SavedAttempt = Omit<Attempt, "phase"> & { held: boolean; ext?: Record<string, unknown> };
type SavedLane = Omit<Lane, "head" | "w"> & { head: SavedAttempt; w: SavedAttempt[] };

const revive = (a: SavedAttempt, phase: Phase): Attempt => {
  const { held: _h, ext: _e, ...rest } = a;
  return { ...rest, phase };
};
const mail = (tx: Tx, l: SavedLane, h: SavedAttempt, e: Ending, onLane: boolean) =>
  enqueue(tx, {
    k: "ending",
    actor: l.actor,
    op: l.op,
    key: l.key,
    owner: h.owner,
    ending: e,
    attempt: h.id,
    restored: true,
    ...(onLane ? { onLane } : {}),
  });

// The restore row, and rule 44's delivery order: per lane in creation order, before any external event.
export const restore = (tx: Tx, records: ReadonlyMap<string, any>) => {
  const m = records.get("meta") as { boot: number; nextMint: number } | undefined;
  let maxMint = (m?.nextMint ?? 1) - 1;
  const actors: Record<string, any> = {};
  const timers: Timer[] = [];
  const lanes: SavedLane[] = [];
  for (const [k, v] of records) {
    if (k.startsWith("actor/")) {
      const { timers: ts, ...a } = v;
      actors[a.key] = a;
      timers.push(...ts);
    } else if (k.startsWith("lane/")) lanes.push(v);
  }
  tx.w = { ...tx.w, boot: (m?.boot ?? 0) + 1, actors };
  for (const t of timers) {
    const { gen: _g, ...spec } = t as Timer;
    armTimer(tx, spec as never);
  }
  for (const l of lanes.sort((a, b) => a.head.mint - b.head.mint)) {
    maxMint = Math.max(maxMint, l.head.mint, ...l.w.map((a) => a.mint));
    const h = l.head;
    const parkedHead = l.parked?.find((p) => p.head);
    const ending: Ending =
      parkedHead?.ending ??
      (h.held || h.acked
        ? { ch: "unknown", reason: "Restored" }
        : { ch: "failure", tag: "NotSent", value: { why: "Restored" } });
    if (!parkedHead) noteEnding(tx, { op: l.op, attempt: h.id }, ending);
    const held = h.held && ending.ch === "unknown";
    const phase: Phase = held ? { t: "held" } : { t: "settled", ending };
    const head = {
      ...revive(h, phase),
      mayHaveApplied: h.mayHaveApplied || ending.ch === "unknown",
    };
    const lane: Lane = {
      id: l.id,
      actor: l.actor,
      machine: l.machine,
      op: l.op,
      key: l.key,
      head,
      w: [],
    };
    tx.w = {
      ...tx.w,
      lanes: { ...tx.w.lanes, [l.id]: lane },
      byAttempt: { ...tx.w.byAttempt, [h.id]: l.id },
    };
    // Prediction values never persist; the keys and the mark do (rule 38).
    if (ending.ch === "unknown" && h.ext)
      hook(tx, "restored", (mod, s, cx) =>
        mod.restored!(
          s,
          {
            attempt: h.id,
            mint: h.mint,
            machine: l.machine,
            op: l.op,
            input: h.input,
            saved: h.ext![mod.id],
            ending,
          },
          cx,
        ),
      );
    if (parkedHead) note(tx, "unparked", { op: l.op, attempt: h.id });
    mail(tx, l, h, ending, true);
    // W: parked endings keep lane order; otherwise each ends NotSent { Restored } (C2).
    for (const a of l.w) {
      const e: Ending = { ch: "failure", tag: "NotSent", value: { why: "Restored" } };
      noteEnding(tx, { op: l.op, attempt: a.id }, e);
      mail(tx, l, a, e, false);
    }
    for (const p of l.parked?.filter((x) => !x.head) ?? []) {
      note(tx, "unparked", { op: l.op, attempt: p.attempt });
      mail(tx, l, { ...h, id: p.attempt }, p.ending, false);
    }
  }
  tx.w = { ...tx.w, nextMint: maxMint + 1 };
};
