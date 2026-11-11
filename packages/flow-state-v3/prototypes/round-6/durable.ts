// Write-ahead, in the core (D26). An Attempt writes twice: a capture saying "not acknowledged", then the acknowledgement, which
// is how a restore tells NotSent { Restored } from unknown { Restored }. D30: silence is not refusal. D46: restore is per record;
// a record that does not decode, or names what this release removed, is quarantined and the rest boots.
import { text, own, validActor, validLane } from "./gate.ts";
import type { Compiled } from "../conformance/fixtures/compiled.ts";
import { hook, saveAll } from "./hooks.ts";
import { afterAck, cell } from "./lane.ts";
import { armTimer, disarmTimer } from "./timers.ts";
import {
  clearStall,
  enqueue,
  issue,
  laneKey,
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
// D57: a server's answer parked here need not encode. The ending stays real; only its value is lost, and only across a reload.
const storableParked = (tx: Tx, l: Lane) =>
  l.parked.map((p) => {
    if (text(p.ending) !== undefined) return p;
    issue(tx, { code: "UnencodableValue", origin: `${l.machine} ${l.op}` });
    return { ...p, ending: { ...p.ending, value: { unencodable: true } } };
  });
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
    parked: storableParked(tx, l),
    ...(l.releasing ? { releasing: true } : {}),
  });
// D80: a reference, not bytes. The world is immutable, so this is already a whole publication; the driver encodes it when it writes.
const actorRecord = (tx: Tx, key: string): unknown => {
  const live = own(tx.w.actors, key);
  // D73: a retired identity's record says so, and carries the timers it left with.
  const a = (live ?? own(tx.w.retired, key))! as ActorRec & { timers?: readonly FrozenTimer[] };
  const armed = Object.values(tx.w.timers).filter((t) => t.kind === "schedule" && t.actor === key);
  // L6: a firing still in mail has not committed; the disk keeps it until its turn does.
  const firing = [...tx.w.mail, ...tx.w.follow].flatMap((m): FrozenTimer[] =>
    m.k === "fire" && m.actor === key
      ? [
          {
            key: `fired/${m.inc}/${m.event.tag}`,
            gen: "",
            dueAt: tx.env.now,
            kind: "schedule",
            actor: m.actor,
            inc: m.inc,
            activation: m.activation,
            send: m.event.tag,
            id: m.event.tag,
          },
        ]
      : [],
  );
  const timers = live ? [...armed, ...firing] : (a.timers ?? []);
  return { ...a, timers, ...(live ? {} : { retired: true }) };
};

// C: the world decides what is written. A record is written when its encoding differs from the last one sent.
export const flush = (tx: Tx) => {
  const writes: Write[] = [];
  for (const key of tx.touchedActors) {
    const a = own(tx.w.actors, key) ?? own(tx.w.retired, key);
    if (a && tx.machines[a.machine]!.persisted)
      writes.push({ key: `actor/${key}`, record: actorRecord(tx, key) });
  }
  let saved = tx.w.savedLanes;
  // D72: a restored ending is still only on disk until it is delivered. Mail is not persisted, so the record stays until then.
  const owed = new Set(
    [...tx.w.mail, ...tx.w.follow].flatMap((m) =>
      m.k === "ending" && m.restored ? [laneKey(m.actor, m.op, m.key)] : [],
    ),
  );
  const put = (id: string, value: string | undefined) => {
    if (owed.has(id) || saved[id] === value) return;
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
    } else {
      if (!tx.machines[l.machine]!.persisted) continue;
      const ask = tx.asks.find((x) => x.lane === id);
      if (ask?.on === "capture") continue; // a re-send's capture goes out only as its awaited write
      put(id, encodeLane(tx, l, l.head?.acked ?? false));
    }
    // D78: the old name goes in the same batch that writes the new one, so a crash leaves one or the other.
    const old = tx.w.rekeyed[id];
    if (old !== undefined && !owed.has(id)) {
      put(old, undefined);
      const { [id]: _d, ...rekeyed } = tx.w.rekeyed;
      tx.w = { ...tx.w, rekeyed };
    }
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
    machine: l.machine,
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
// The restore row, and rule 44's delivery order: per lane in creation order, before any external event.
export const restore = (tx: Tx, records: ReadonlyArray<readonly [string, string]>) => {
  const metaText = records.find(([k]) => k === "meta")?.[1];
  const m = metaText
    ? (parse(tx, "meta", metaText) as { boot: number; nextMint: number } | undefined)
    : undefined;
  let maxMint = (Number.isFinite(m?.nextMint) ? m!.nextMint : 1) - 1;
  // L3: built by entries, so a stored "__proto__" is a name like any other.
  const actors: Array<[string, ActorRec]> = [];
  const retired: Array<[string, ActorRec]> = [];
  const timers: FrozenTimer[] = [];
  const lanes: Array<[string, SavedLane]> = [];
  const saved: Record<string, string> = {};
  for (const [k, text] of records) {
    if (k.startsWith("actor/")) {
      const v = parse(tx, k, text);
      if (!v) continue;
      const mm = typeof v?.machine === "string" ? tx.machines[v.machine] : undefined;
      if (!mm || !validActor(mm, v, k)) {
        quarantine(tx, k, `no machine ${v?.machine}, or a record this release cannot read`);
        continue;
      }
      const decoded = restoredMemory(mm, v.root);
      if (!decoded) {
        quarantine(tx, k, "memory this release cannot decode");
        continue;
      }
      const root = orphanFrozen(tx, mm, decoded);
      if (v.retired)
        retired.push([v.key, { key: v.key, machine: v.machine, root, timers: v.timers }]);
      else {
        actors.push([v.key, { key: v.key, machine: v.machine, root }]);
        timers.push(...v.timers);
      }
    } else if (k.startsWith("lane/")) {
      const v = parse(tx, k, text) as SavedLane | undefined;
      if (!v) continue;
      if (
        typeof v?.machine !== "string" ||
        typeof v?.op !== "string" ||
        !tx.machines[v.machine]?.ops[v.op] ||
        !validLane(v as never, k)
      ) {
        quarantine(
          tx,
          k,
          `no operation ${v?.machine} ${v?.op}, or a record this release cannot read`,
        ); // goes to `orphaned` (P19) when that is built
        continue;
      }
      saved[v.id] = text;
      lanes.push([k, rekeyLane(tx, v, lanes)]);
    }
  }
  tx.w = {
    ...tx.w,
    boot: (Number.isFinite(m?.boot) ? m!.boot : 0) + 1,
    actors: Object.fromEntries(actors),
    retired: Object.fromEntries(retired),
    savedLanes: saved,
  };
  for (const t of timers) {
    const { gen: _g, ...spec } = t;
    armTimer(tx, spec);
  }
  const mintOf = (l: SavedLane) => l.head?.mint ?? 0;
  const ordered = lanes.sort(([, a], [, b]) => mintOf(a) - mintOf(b) || (a.id < b.id ? -1 : 1));
  // Every parked ending first, in saved order, then per lane (2.7.13, L5): each mapped through the current outcomes (OD22).
  for (const [, l] of ordered)
    for (const p of l.parked ?? []) {
      note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });
      mail(tx, l, p, p.ending, false);
    }
  for (const [, l] of ordered) {
    for (const x of l.w) maxMint = Math.max(maxMint, x.mint);
    const parked = l.parked ?? [];
    const h = l.head;
    if (h) maxMint = Math.max(maxMint, h.mint);
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
      // Delivered from the parked list. A hold stays a hold: rule 17, and a new write beside it would be a second charge.
      if (h.held) {
        setLane(tx, { ...base, head: revive(h, { t: "held" }, true), subject: l.subject ?? [] });
        restoredHook(tx, l, h, { ch: "unknown", reason: "Restored" });
      } else deleteOnly(tx, l.id);
    } else {
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
        if (unknown) restoredHook(tx, l, h, ending);
        mail(tx, l, h, ending, true);
      }
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
// D78: a hold is a claim about the outside world; its key is only our name for it. The name moves with the release, the hold never does.
const rekeyLane = (
  tx: Tx,
  v: SavedLane,
  so_far: ReadonlyArray<readonly [string, SavedLane]>,
): SavedLane => {
  if (!v.head) return v;
  let fresh: unknown;
  try {
    fresh = tx.machines[v.machine]!.ops[v.op]!.key.run(v.head.input);
  } catch (e) {
    issue(tx, { code: "UserClosure", origin: `${v.machine} ${v.op} key`, input: String(e) });
    return v;
  }
  if (text(fresh) === undefined || text(fresh) === text(v.key)) return v;
  const id = laneKey(v.actor, v.op, fresh);
  if (so_far.some(([, o]) => o.id === id)) {
    issue(tx, { code: "LaneRekeyCollision", origin: `${v.machine} ${v.op}`, input: id });
    return v;
  }
  note(tx, "LaneRekeyed", { op: v.op, from: v.id, to: id });
  tx.w = { ...tx.w, rekeyed: { ...tx.w.rekeyed, [id]: v.id } };
  return { ...v, id, key: fresh };
};
// D82: a stand-in for Schema decode with defaults. Undefined: this record cannot be read by this release.
const restoredMemory = (m: Compiled, root: Inc): Inc | undefined => {
  const dec = m.memory.restore;
  if (!dec) return root;
  try {
    return { ...root, memory: dec.run(root.memory) };
  } catch {
    return undefined;
  }
};
// H2: a frozen ending of an operation this release removed is rule 46's `orphaned`, thin: evidence, and the actor keeps its memory.
const orphanFrozen = (tx: Tx, m: Compiled, i: Inc): Inc => {
  const parked = i.frozen?.parked.filter((p) => {
    if (p.k !== "ending" || m.ops[p.op]) return true;
    note(tx, "Orphaned", { op: p.op, attempt: p.attempt ?? "" });
    return false;
  });
  const kids = Object.fromEntries(
    Object.entries(i.kids).map(([k, v]) => [k, orphanFrozen(tx, m, v)]),
  );
  return { ...i, kids, ...(i.frozen ? { frozen: { ...i.frozen, parked: parked! } } : {}) };
};
const restoredHook = (tx: Tx, l: SavedLane, h: SavedAttempt, ending: Ending) => {
  if (!h.ext) return;
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
};
const deleteOnly = (tx: Tx, id: string) => {
  const { [id]: _l, ...lanes } = tx.w.lanes;
  tx.w = { ...tx.w, lanes };
  tx.touchedLanes.add(id);
};
