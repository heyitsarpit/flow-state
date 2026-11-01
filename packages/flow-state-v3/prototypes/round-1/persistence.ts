// Persistence as a module. Two records per identity kind: `actor/<key>`, `lane/<key>`, plus `meta`. A lane record is
// truth (F8). Nothing in the core names this file; the driver hands it in.
//
// An Attempt writes twice: a capture saying "not acknowledged", then the acknowledgement. That is how a restore can tell
// NotSent { Restored } from unknown { Restored }, and why convergence-1's one write-ahead record cannot work (RESULTS F1).
import { cell, restoreDelivery } from "./lane.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import {
  laneOfAttempt,
  note,
  type Input,
  type Lane,
  type Module,
  type Timer,
  type Tx,
  type World,
} from "./world.ts";

type Slice = {
  readonly last: Readonly<Record<string, string>>;
  readonly asked: readonly string[];
  readonly meta: string;
};
const ID = "persistence";
const STORAGE_MS = 10_000;

const encodeActor = (w: World, key: string) => {
  const a = w.actors[key]!;
  const timers = Object.values(w.timers).filter((t) => t.actor === key && t.kind === "schedule");
  return JSON.stringify({ ...a, timers });
};
const encodeLane = (l: Lane, patch: Record<string, unknown> = {}) => {
  const { wire: _wire, settled: _settled, cancelled: _cancelled, waits: _waits, ...head } = l.head;
  return JSON.stringify({ ...l, head: { ...head, ...patch } });
};
const boundKey = (attempt: string) => `storage/${attempt}`;
const machineOf = (tx: Tx, l: Lane) => tx.w.actors[l.actor]!.machine;

const resolveWait = (
  s: Slice,
  tx: Tx,
  attempt: string,
  ok: boolean,
  what: "ack" | "capture",
): Slice => {
  const l = laneOfAttempt(tx.w, attempt);
  if (!l || !l.head.waits[what]) {
    note(tx, "fence", { what, attempt }); // a late ack after the bound, or for an ended Attempt
    return s;
  }
  disarmTimer(tx, boundKey(attempt));
  if (!ok) {
    cell(tx, "storageRefused", l, {
      actor: l.actor,
      op: l.op,
      key: l.key,
      machine: machineOf(tx, l),
    });
    return s;
  }
  const head = { ...l.head, acked: true, waits: { ...l.head.waits, [what]: false } };
  const next: Lane = { ...l, head };
  tx.w = {
    ...tx.w,
    lanes: { ...tx.w.lanes, [l.id]: next },
    dirty: tx.w.dirty.includes(l.id) ? tx.w.dirty : [...tx.w.dirty, l.id],
  };
  return {
    ...s,
    last: { ...s.last, [`lane/${l.id}`]: encodeLane(next) },
    asked: s.asked.filter((x) => x !== `${attempt}#${what}`),
  };
};

export const persistence: Module = {
  id: ID,
  rank: 10,
  init: (): Slice => ({ last: {}, asked: [], meta: "" }),

  onInput(raw, input: Input, tx) {
    const s = raw as Slice;
    if (input.k === "acked") return resolveWait(s, tx, input.attempt, input.ok, "ack");
    if (input.k === "captured") return resolveWait(s, tx, input.attempt, input.ok, "capture");
    return s;
  },

  onTimer(raw, t: Timer, tx) {
    const s = raw as Slice;
    const l = laneOfAttempt(tx.w, t.attempt!);
    if (!l) return s;
    return resolveWait(s, tx, t.attempt!, false, l.head.waits.ack ? "ack" : "capture"); // D14
  },

  // The value decides what is written: a record is written when its encoding differs from the last one sent.
  onCommit(raw, prev, tx) {
    let s = raw as Slice;
    const w = tx.w;
    const writes: Array<{ key: string; value: string | undefined }> = [];
    const last = { ...s.last };
    let asked = s.asked;
    const put = (key: string, value: string | undefined) => {
      if (last[key] === value) return;
      writes.push({ key, value });
      if (value === undefined) delete last[key];
      else last[key] = value;
    };
    const meta = JSON.stringify({ boot: w.boot, nextMint: w.nextMint });
    if (meta !== s.meta) writes.push({ key: "meta", value: meta });
    if (w.actors !== prev.actors || w.timers !== prev.timers)
      for (const key of Object.keys(w.actors))
        if (tx.machines[w.actors[key]!.machine]!.persisted)
          put(`actor/${key}`, encodeActor(w, key));
    for (const id of Object.keys(prev.lanes)) if (!w.lanes[id]) put(`lane/${id}`, undefined);
    const awaited: Array<() => void> = [];
    if (w.lanes !== prev.lanes) {
      for (const l of Object.values(w.lanes)) {
        if (l === prev.lanes[l.id] || !tx.machines[machineOf(tx, l)]!.persisted) continue;
        const key = `lane/${l.id}`;
        const h = l.head;
        const askFor = h.waits.ack ? "ack" : h.waits.capture ? "capture" : undefined;
        const tag = `${h.id}#${askFor}`;
        if (askFor && !asked.includes(tag)) {
          asked = [...asked, tag];
          if (askFor === "ack") put(key, encodeLane(l, { acked: false }));
          const value = encodeLane(l, { acked: true }); // the awaited write says "acknowledged"
          awaited.push(() => {
            tx.commands.push({
              k: "persist",
              writes: [{ key, value }],
              purpose: askFor === "ack" ? "acknowledge" : "capture",
              ticket: { k: askFor === "ack" ? "acked" : "captured", attempt: h.id },
            });
            armTimer(tx, {
              key: boundKey(h.id),
              kind: "module",
              module: ID,
              attempt: h.id,
              dueAt: tx.env.now + STORAGE_MS,
            });
          });
        } else if (!askFor || l.parked) put(key, encodeLane(l));
      }
    }
    if (writes.length)
      tx.commands.push({ k: "persist", writes, purpose: tx.w.disposed ? "flush" : "capture" });
    for (const f of awaited) f();
    s = { last, asked, meta };
    return s;
  },

  blocksInvoke: (_s, a) => (a.waits.ack ? "ack" : a.waits.capture ? "capture" : false),

  // restore row, and rule 44's delivery order: per lane in creation order, before any external event.
  restore(records, tx) {
    const m = records.get("meta") as { boot: number; nextMint: number } | undefined;
    let maxMint = (m?.nextMint ?? 1) - 1;
    const actors: Record<string, any> = {};
    const lanes: Lane[] = [];
    const timers: Timer[] = [];
    for (const [k, v] of records) {
      if (k.startsWith("actor/")) {
        const { timers: ts, ...a } = v as any;
        actors[a.key] = a;
        timers.push(...ts);
      }
      if (k.startsWith("lane/")) lanes.push(v as Lane);
    }
    tx.w = { ...tx.w, boot: (m?.boot ?? 0) + 1, actors };
    for (const t of timers) armTimer(tx, t);
    for (const l of lanes.sort((a, b) => a.head.mint - b.head.mint)) {
      maxMint = Math.max(maxMint, l.head.mint);
      const restored: Lane = { ...l, head: { ...l.head, waits: { ack: false, capture: false } } };
      tx.w = { ...tx.w, lanes: { ...tx.w.lanes, [l.id]: restored } };
      const ending =
        l.parked ??
        (l.state === "Held" || l.head.acked
          ? { ch: "unknown" as const, reason: "Restored" }
          : { ch: "failure" as const, tag: "NotSent", value: { why: "Restored" } });
      restoreDelivery(tx, restored, ending);
    }
    tx.w = { ...tx.w, nextMint: maxMint + 1 };
    return { last: {}, asked: [], meta: "" } satisfies Slice;
  },
};
