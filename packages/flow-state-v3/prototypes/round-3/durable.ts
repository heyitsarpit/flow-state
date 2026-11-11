// Write-ahead, in the core (D26). An Attempt writes twice: a capture saying "not acknowledged", then the acknowledgement, which
// is how a restore tells NotSent { Restored } from unknown { Restored }. D30: silence is not refusal. D46: restore is per record;
// a record that does not decode, or names what this release removed, is quarantined and the rest boots.
import { hook, saveAll } from "./hooks.ts";
import { afterAck, cell } from "./lane.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import {
  clearStall,
  enqueue,
  issue,
  laneOfAttempt,
  nextGen,
  note,
  noteEnding,
  setLane,
  type ActorRec,
  type Attempt,
  type Ending,
  type FrozenTimer,
  type Inc,
  type Lane,
  type Phase,
  type Tx,
  type World,
  type Write,
} from "./world.ts";

export const requestDurable = (tx: Tx, lane: Lane, _h: Attempt, on: "ack" | "capture"): Phase => {
  if (!tx.machines[lane.machine]!.persisted) return { t: "ready" };
  const ticket = nextGen(tx);
  tx.asks.push({ lane: lane.id, on, ticket });
  return { t: "durable", on, ticket };
};

export const onStored = (tx: Tx, i: { attempt: string; ticket: string; ok: boolean }) => {
  const l = laneOfAttempt(tx.w, i.attempt);
  const p = l?.head?.phase;
  if (!l || p?.t !== "durable" || p.ticket !== i.ticket)
    return note(tx, "fence", { stored: i.attempt });
  disarmTimer(tx, `storage/${i.attempt}`);
  clearStall(tx, i.attempt);
  if (!i.ok)
    return cell(tx, "storageRefused", l, {
      actor: l.actor,
      machine: l.machine,
      op: l.op,
      key: l.key,
    });
  const acked: Lane = { ...l, head: { ...l.head!, acked: true, phase: { t: "ready" } } };
  setLane(tx, acked);
  if (p.then) afterAck(tx, acked, p.then);
};
export const onStorageBound = (tx: Tx, attempt: string) => {
  const l = laneOfAttempt(tx.w, attempt);
  if (!l) return;
  note(tx, "StorageSilent", { op: l.op, attempt });
  tx.w = { ...tx.w, stalled: { ...tx.w.stalled, [attempt]: "storage" } };
  tx.visible = true;
};

const saveAttempt = (tx: Tx, a: Attempt) => {
  const { phase, sentAt: _s, ...rest } = a;
  const ext = saveAll(tx, a.id);
  return { ...rest, held: phase.t === "held", ...(ext ? { ext } : {}) };
};
const encodeLane = (tx: Tx, l: Lane, acked: boolean) =>
  JSON.stringify({
    id: l.id,
    actor: l.actor,
    machine: l.machine,
    op: l.op,
    key: l.key,
    subject: l.subject,
    ...(l.head ? { head: { ...saveAttempt(tx, l.head), acked } } : {}),
    w: l.w.map((a) => saveAttempt(tx, a)),
    parked: l.parked,
    ...(l.releasing ? { releasing: true } : {}),
  });
const encodeActor = (w: World, key: string) => {
  const a = w.actors[key]!;
  const timers = Object.values(w.timers).filter((t) => t.kind === "schedule" && t.actor === key);
  return JSON.stringify({ ...a, timers });
};

// C: the world decides what is written. A record is written when its encoding differs from the last one sent.
export const flush = (tx: Tx) => {
  const writes: Write[] = [];
  for (const key of tx.touchedActors) {
    const a = tx.w.actors[key];
    if (a && tx.machines[a.machine]!.persisted)
      writes.push({ key: `actor/${key}`, value: encodeActor(tx.w, key) });
  }
  let saved = tx.w.savedLanes;
  const put = (id: string, value: string | undefined) => {
    if (saved[id] === value) return;
    writes.push({ key: `lane/${id}`, value });
    if (value === undefined) {
      const { [id]: _gone, ...rest } = saved;
      saved = rest;
    } else saved = { ...saved, [id]: value };
  };
  for (const id of tx.touchedLanes) {
    const l = tx.w.lanes[id];
    if (!l) {
      put(id, undefined);
      continue;
    }
    if (!tx.machines[l.machine]!.persisted) continue;
    const ask = tx.asks.find((x) => x.lane === id);
    if (ask?.on === "capture") continue; // a re-send's capture goes out only as its awaited write
    put(id, encodeLane(tx, l, l.head?.acked ?? false));
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
    const p = l?.head?.phase;
    if (!l || p?.t !== "durable" || p.ticket !== a.ticket) continue; // replaced in this same step
    const value = encodeLane(tx, l, true); // the awaited write says "acknowledged"
    saved = { ...saved, [a.lane]: value };
    tx.commands.push({
      k: "persist",
      writes: [{ key: `lane/${a.lane}`, value }],
      purpose: a.on === "ack" ? "acknowledge" : "capture",
      ticket: { attempt: l.head!.id, ticket: a.ticket },
    });
    armTimer(tx, {
      key: `storage/${l.head!.id}`,
      kind: "storage",
      attempt: l.head!.id,
      dueAt: tx.env.now + tx.bounds.storageMs,
    });
  }
  tx.w = { ...tx.w, savedLanes: saved };
};

type SavedAttempt = Omit<Attempt, "phase" | "sentAt"> & {
  held: boolean;
  ext?: Record<string, unknown>;
};
type SavedLane = Omit<Lane, "head" | "w"> & { head?: SavedAttempt; w: SavedAttempt[] };
const quarantine = (tx: Tx, key: string, why: string) =>
  issue(tx, { code: "RecordQuarantined", origin: "restore", input: `${key}: ${why}` });
const parse = (tx: Tx, key: string, text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    quarantine(tx, key, String(e));
    return undefined;
  }
};
const revive = (a: SavedAttempt, phase: Phase, mayHaveApplied: boolean): Attempt => {
  const { held: _h, ext: _e, ...rest } = a;
  return { ...rest, phase, mayHaveApplied, sentAt: 0 };
};
const mail = (
  tx: Tx,
  l: SavedLane,
  a: { id?: string; attempt?: string; owner: any; input: unknown },
  e: Ending,
  onLane: boolean,
) =>
  enqueue(tx, {
    k: "ending",
    actor: l.actor,
    op: l.op,
    key: l.key,
    owner: a.owner,
    ending: e,
    input: a.input,
    subject: l.subject ?? [],
    restored: true,
    ...((a.id ?? a.attempt) ? { attempt: (a.id ?? a.attempt)! } : {}),
    ...(onLane ? { onLane } : {}),
  });
const goodInc = (i: Inc): boolean =>
  typeof i?.id === "string" &&
  typeof i.leaf === "string" &&
  typeof i.activations === "object" &&
  Object.values(i.kids ?? {}).every(goodInc);

// The restore row, and rule 44's delivery order: per lane in creation order, before any external event.
export const restore = (tx: Tx, records: ReadonlyArray<readonly [string, string]>) => {
  const metaText = records.find(([k]) => k === "meta")?.[1];
  const m = metaText
    ? (parse(tx, "meta", metaText) as { boot: number; nextMint: number } | undefined)
    : undefined;
  let maxMint = (m?.nextMint ?? 1) - 1;
  const actors: Record<string, ActorRec> = {};
  const timers: FrozenTimer[] = [];
  const lanes: Array<[string, SavedLane]> = [];
  const saved: Record<string, string> = {};
  for (const [k, text] of records) {
    if (k.startsWith("actor/")) {
      const v = parse(tx, k, text);
      if (!v) continue;
      if (!tx.machines[v.machine] || !goodInc(v.root)) {
        quarantine(tx, k, `no machine ${v.machine}, or a bad record`);
        continue;
      }
      actors[v.key] = { key: v.key, machine: v.machine, root: v.root };
      timers.push(...v.timers);
    } else if (k.startsWith("lane/")) {
      const v = parse(tx, k, text) as SavedLane | undefined;
      if (!v) continue;
      if (!tx.machines[v.machine]?.ops[v.op]) {
        quarantine(tx, k, `no operation ${v.machine} ${v.op}`); // goes to `orphaned` (P19) when that is built
        continue;
      }
      saved[v.id] = text;
      lanes.push([k, v]);
    }
  }
  tx.w = { ...tx.w, boot: (m?.boot ?? 0) + 1, actors, savedLanes: saved };
  for (const t of timers) {
    const { gen: _g, ...spec } = t;
    armTimer(tx, spec);
  }
  const mintOf = (l: SavedLane) => l.head?.mint ?? 0;
  for (const [, l] of lanes.sort(([, a], [, b]) => mintOf(a) - mintOf(b))) {
    for (const x of l.w) maxMint = Math.max(maxMint, x.mint);
    const parked = l.parked ?? [];
    const h = l.head;
    if (h) maxMint = Math.max(maxMint, h.mint);
    // Parked endings first, in saved order: each mapped through the current outcomes at delivery (OD22).
    for (const p of parked) {
      note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });
      mail(tx, l, p, p.ending, false);
    }
    const base = { ...l, w: [], parked: [] as Lane["parked"] };
    if (!h) {
      deleteOnly(tx, l.id); // delivered next, or parked again with a fresh record
      continue;
    }
    const ownParked = parked.some((p) => p.attempt === h.id);
    const ending: Ending =
      h.held || h.acked
        ? { ch: "unknown", reason: "Restored" }
        : { ch: "failure", tag: "NotSent", value: { why: "Restored" } };
    if (ownParked) {
      deleteOnly(tx, l.id);
      continue;
    }
    noteEnding(tx, { op: l.op, attempt: h.id }, ending);
    const unknown = ending.ch === "unknown";
    const phase: Phase = h.held ? { t: "held" } : { t: "settled", ending };
    const head = revive(h, phase, h.mayHaveApplied || unknown);
    const lane: Lane = { ...base, head, subject: l.subject ?? [] };
    if (l.releasing) {
      // 2.9.3: applied, then Released evidence; nothing delivered or parked.
      note(tx, "evidenceOnly", { op: l.op, attempt: h.id });
      if (unknown) note(tx, "Released", { op: l.op, attempt: h.id });
      deleteOnly(tx, l.id);
    } else {
      setLane(tx, lane);
      if (unknown && h.ext)
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
      mail(tx, l, h, ending, true);
    }
    // W: each ends NotSent { Restored } (C2), or as evidence on a releasing lane.
    for (const a of l.w) {
      const e: Ending = { ch: "failure", tag: "NotSent", value: { why: "Restored" } };
      noteEnding(tx, { op: l.op, attempt: a.id }, e);
      if (l.releasing) note(tx, "evidenceOnly", { op: l.op, attempt: a.id });
      else mail(tx, l, a, e, false);
    }
  }
  tx.w = { ...tx.w, nextMint: maxMint + 1 };
};
const deleteOnly = (tx: Tx, id: string) => {
  const { [id]: _l, ...lanes } = tx.w.lanes;
  tx.w = { ...tx.w, lanes };
  tx.touchedLanes.add(id);
};
