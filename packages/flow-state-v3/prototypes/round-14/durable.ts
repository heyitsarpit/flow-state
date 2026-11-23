// Write-ahead, in the core (D26). An Attempt reaches the disk as a lane's head, in a batch whose ticket lets it leave. So a head on disk may have been sent (D96): it restores as
// unknown { Restored }. `W` never left, and restores NotSent { Restored }. D30: silence is not refusal. D46: restore is per record;
// a record that does not decode, or names what this release removed, is quarantined and the rest boots.
import { Option, Schema } from "effect";
import { getActor, setActor, noActors, type Actors } from "./actors.ts";
import { canon, carried, identityTag, standIn, text, own, Unencodable, validActor, validLane } from "./gate.ts";
import type { Compiled } from "../conformance/fixtures/compiled.ts";
import { hook, saveAll } from "./hooks.ts";
import { afterAck, cell, ofIdentity, olderOf, sameFields, sameVersion, stampFields } from "./lane.ts";
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
  if (!i.ok && p.then === "replace") {
    note(tx, "StorageFailure", { op: l.op, attempt: i.attempt });
    return afterAck(tx, { ...l, head: { ...l.head!, phase: { t: "ready" } } }, "replace");
  }
  if (!i.ok) {
    return cell(tx, "storageRefused", l, {
      actor: l.actor,
      machine: l.machine,
      op: l.op,
      key: l.key,
    });
  }
  const ready: Lane = { ...l, head: { ...l.head!, phase: { t: "ready" } } };
  setLane(tx, ready);
  if (p.then) afterAck(tx, ready, p.then);
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
    if (carried(p.ending) && carried(p.input)) return p;
    issue(tx, { code: "UnencodableValue", origin: `${l.machine} ${l.op}` });
    return {
      ...p,
      ...(carried(p.ending) ? {} : { ending: { ...p.ending, value: { unencodable: true } } }),
      input: standIn(p.input), // D114
    };
  });
// D111: `saved` compares these bytes. The stamp goes on when they are written, so a lane unchanged in a later boot is not rewritten, and keeps the older stamp, which is still true of its ids.
const laneBody = (tx: Tx, l: Lane) =>
  JSON.stringify({
    format: RECORD_FORMAT,
    actor: l.actor,
    machine: l.machine,
    op: l.op,
    ...(tx.machines[l.machine]?.ops[l.op]?.contract ? { contract: tx.machines[l.machine]!.ops[l.op]!.contract } : {}), // 2.7.15: (identity, contract id, key)
    ...(l.identity ? { identity: l.identity } : {}),
    key: l.key === undefined ? undefined : JSON.parse(canon(l.key)), // D119: the name's normal form. It restores to the same lane
    subject: l.subject,
    ...(l.keyFields ? { keyFields: l.keyFields } : {}), // D221: the stamp travels with the lane
    ...(l.head ? { head: saveAttempt(tx, l.head) } : {}),
    w: l.w.map((a) => saveAttempt(tx, a)),
    parked: storableParked(tx, l),
    ...(l.releasing ? { releasing: true } : {}),
  });
const stamped = (tx: Tx, body: string) => `{"boot":${tx.w.boot},${body.slice(1)}`; // D99
// D80: a reference, not bytes. The world is immutable, so this is already a whole publication; the driver encodes it when it writes.
const actorRecord = (tx: Tx, key: string): unknown => {
  const live = getActor(tx.w.actors, key);
  // D73: a retired identity's record says so, and carries the timers it left with.
  const a = (live ?? own(tx.w.retired, key))! as ActorRec & { timers?: readonly FrozenTimer[] };
  const armed = [...Object.values(tx.w.timers), ...Object.values(tx.w.waiting)].filter((t) => t.kind === "schedule" && t.actor === key); // rule 73: a waiting deadline too
  // L6: a firing still in mail has not committed; the disk keeps it until its turn does.
  const firing = [...tx.w.mail, ...tx.w.follow, ...tx.w.keptFires].flatMap((m): FrozenTimer[] =>
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
  const shape = tx.machines[a.machine]?.shapeVersion;
  return { format: RECORD_FORMAT, ...a, ...(shape ? { shape } : {}), boot: tx.w.boot, timers, ...(live ? {} : { retired: true }) }; // D99
};
// The user's decision (migration Q1 A): a record's saved shape against this release's. Equal: it restores as before (field decode, `FieldDropped`, a
// quarantine of what does not read). Differing and incompatible, a field both keep with another Schema version, or a saved state or fragment this
// release lacks: reset. Differing otherwise (a field added or dropped, a state added): restores as before. No stamp (before format 4): as before.
type Shape = { readonly states: readonly string[]; readonly fields: readonly string[] };
const isShape = (s: unknown): s is Shape => typeof s === "object" && s !== null && Array.isArray((s as Shape).states) && Array.isArray((s as Shape).fields);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const fieldName = (entry: string) => entry.split("#")[0]!;
export const shapeReset = (m: Compiled, v: Raw): boolean => {
  const was = v["shape"];
  const now = m.shapeVersion;
  if (!now || !isShape(was) || (sameList(was.states, now.states) && sameList(was.fields, now.fields))) return false;
  const kept = new Map(now.fields.map((f) => [fieldName(f), f]));
  if (was.fields.some((f) => kept.has(fieldName(f)) && kept.get(fieldName(f)) !== f)) return true;
  const states = new Set(now.states);
  const gone = (i: unknown, frag: string | null): boolean => {
    const inc = i as { leaf?: unknown; history?: Record<string, unknown>; kids?: Record<string, { frag?: unknown }> } | undefined;
    if (typeof inc?.leaf !== "string") return false;
    if (!states.has(frag === null ? inc.leaf : `${frag}/${inc.leaf}`)) return true;
    // Audit M2's break 3: a saved state includes a history target, which a re-entry would resume (Q1 A: "a saved state goes away").
    if (Object.values(inc.history ?? {}).some((n) => typeof n === "string" && !states.has(frag === null ? n : `${frag}/${n}`))) return true;
    return Object.values(inc.kids ?? {}).some((k) => gone(k, typeof k?.frag === "string" ? k.frag : null));
  };
  return gone(v["root"], null);
};
// Flow's own record format (rule 74's format tag, for the records themselves; phase 1 migration rounds 2-3, proposed). Format 1 is untagged and a lane
// record stores its id beside the actor, op and key it is made of; format 2 tags every record and stores a lane's id once, as the record's key;
// format 3 adds to a lane record its contract id (2.7.15: a lane is (identity, contract id, key), so a renamed op finds it) and the actor identity
// version it was minted under (rule 74). An older record has neither: it is found by its op name and bound to any identity of its name (stated).
// Each older format reaches the current one by a pure step at the boot, before this release's checks; a newer format is quarantined, never misread.
export const RECORD_FORMAT = 4; // format 4 (the user's decision, migration Q1 A): an actor record carries its definition's saved shape
type Raw = Record<string, unknown>;
const UPGRADE: Readonly<Record<number, (k: string, v: Raw) => Raw>> = {
  1: (k, v) => {
    if (!k.startsWith("lane/")) return v;
    if (v["id"] !== k.slice(5)) throw new Error("a format 1 lane record whose id is not its key");
    const { id: _id, ...rest } = v;
    return rest;
  },
  2: (_k, v) => v,
  3: (_k, v) => v,
};
const upgraded = (tx: Tx, k: string, v: unknown): Raw | undefined => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return v as Raw | undefined;
  const { format, ...body } = v as Raw;
  const from = Object.hasOwn(v, "format") ? format : 1;
  if (!Number.isSafeInteger(from) || (from as number) < 1 || (from as number) > RECORD_FORMAT) {
    quarantine(tx, k, `Flow record format ${String(from)}, which this Flow does not read`);
    return undefined;
  }
  try {
    if (k.startsWith("lane/") && from === RECORD_FORMAT && Object.hasOwn(body, "id") && body["id"] !== k.slice(5)) throw new Error("a lane record whose body names another lane");
    let out = body;
    for (let f = from as number; f < RECORD_FORMAT; f++) out = UPGRADE[f]!(k, out);
    return k.startsWith("lane/") ? { ...out, id: k.slice(5) } : out;
  } catch (e) {
    quarantine(tx, k, String(e));
    return undefined;
  }
};

// C: the world decides what is written. A record is written when its encoding differs from the last one emitted. One persist per scope; the edge keeps each scope whole.
export const flush = (tx: Tx) => {
  if (!tx.w.persistence) return; // D26: this tab read no disk, and writes none
  const writes = new Map<string, Write[]>();
  const now = new Set<string>();
  const add = (scope: string, w: Write) => {
    const l = writes.get(scope);
    if (l) l.push(w);
    else writes.set(scope, [w]);
  };
  for (const key of tx.touchedActors) {
    const a = getActor(tx.w.actors, key) ?? own(tx.w.retired, key);
    if (!a && tx.dropped.has(key)) {
      add(key, { key: `actor/${key}`, value: undefined });
      now.add(key);
    }
    if (a && tx.machines[a.machine]!.persisted) {
      const record = actorRecord(tx, key) as { retired?: boolean };
      add(key, { key: `actor/${key}`, record });
      if (record.retired || tx.armedDeadline) now.add(key); // D93, D80: a retired identity and an armed deadline are more than plain memory
    }
  }
  for (const [key, record] of tx.rewrites ?? []) if (!tx.touchedActors.has(key) && !tx.dropped.has(key)) add(key, { key: `actor/${key}`, record }); // Q20
  let saved = tx.w.savedLanes;
  // D72: a restored ending is still only on disk until it is delivered. Mail is not persisted, so the record stays until then.
  const owed = new Set(
    [...(tx.w.mail.restored > 0 ? tx.w.mail : []), ...tx.w.follow].flatMap((m) =>
      m.k === "ending" && m.restored ? [m.lane ?? laneKey(m.actor, m.op, m.key)] : [], // Q17: an old identity's lane by its own id
    ),
  );
  const put = (scope: string, id: string, value: string | undefined) => {
    if (owed.has(id) || saved[id] === value) return;
    add(scope, { key: `lane/${id}`, value: value === undefined ? undefined : stamped(tx, value) });
    now.add(scope); // D84
    if (value === undefined) {
      const { [id]: _gone, ...rest } = saved;
      saved = rest;
    } else saved = { ...saved, [id]: value };
  };
  for (const [id, actor] of tx.touchedLanes) {
    const l = tx.w.lanes[id];
    if (!l) {
      put(actor, id, undefined);
    } else {
      if (!tx.machines[l.machine]!.persisted) continue;
      const ask = tx.asks.find((x) => x.lane === id);
      if (ask) continue; // the awaited write says it
      put(actor, id, laneBody(tx, l));
    }
    // D78: the old name goes in the same batch that writes the new one, so a crash leaves one or the other.
    const old = tx.w.rekeyed[id];
    if (old !== undefined && !owed.has(id)) {
      put(actor, old, undefined);
      const { [id]: _d, ...rekeyed } = tx.w.rekeyed;
      tx.w = { ...tx.w, rekeyed };
    }
  }
  for (const [scope, w] of writes) tx.commands.push({ k: "persist", scope, writes: w, now: now.has(scope) });
  for (const a of tx.asks) {
    const l = tx.w.lanes[a.lane];
    const p = l?.head?.phase;
    if (!l || p?.t !== "durable" || p.ticket !== a.ticket) continue; // replaced in this same step
    const value = laneBody(tx, l);
    saved = { ...saved, [a.lane]: value };
    tx.commands.push({
      k: "persist",
      scope: l.actor,
      writes: [{ key: `lane/${a.lane}`, value: stamped(tx, value) }],
      now: true,
      ticket: {
        attempt: l.head!.id,
        ticket: a.ticket,
        purpose: a.on === "ack" ? "acknowledge" : "capture",
      },
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
type SavedLane = Omit<Lane, "head" | "w"> & { head?: SavedAttempt; w: SavedAttempt[]; boot?: number };
const quarantine = (tx: Tx, key: string, why: string) =>
  issue(tx, { code: "RecordQuarantined", origin: "restore", input: `${key}: ${why}` });
const parse = (tx: Tx, key: string, text: string) => {
  try {
    return tx.decode ? tx.decode(key, text) : JSON.parse(text);
  } catch (e) {
    quarantine(tx, key, String(e));
    return undefined;
  }
};
const OwnerSchema = Schema.Struct({
  inc: Schema.String,
  node: Schema.String,
  activation: Schema.String,
  chain: Schema.Array(Schema.Struct({ node: Schema.String, activation: Schema.String })),
});
const StoppedReads = Schema.Array(Schema.Struct({ op: Schema.String, key: Schema.Unknown, owner: OwnerSchema, input: Schema.Unknown, inc: Schema.String }));
const decodeStopped = Schema.decodeUnknownOption(StoppedReads);
const revive = (a: SavedAttempt, phase: Phase, mayHaveApplied: boolean): Attempt => {
  const { held: _h, ext: _e, ...rest } = a;
  return { ...rest, phase, mayHaveApplied, sentAt: 0 };
};
const mail = (
  tx: Tx,
  l: SavedLane,
  a: { id?: string; attempt?: string; owner: any; input: unknown; kept?: boolean },
  e: Ending,
  onLane: boolean,
  owed = true, // rule 73 (OD31): an ending owed at ready is work in flight; a Held head's Restored is not owed
) =>
  enqueue(tx, {
    ...(owed ? { keeps: true as const } : {}),
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
    ...(l.id !== laneKey(l.actor, l.op, l.key) ? { lane: l.id } : {}), // Q17: an old identity's lane is not at its key's id
    ...(a.kept ? { kept: true as const, redelivered: true as const } : {}), // D123: one try per boot
  });
// The restore row, and rule 44's delivery order: per lane in creation order, before any external event.
export const restore = (tx: Tx, records: ReadonlyArray<readonly [string, string]>) => {
  let maxMint = 0;
  // D99, D111: an id on disk is never repeated: the floor is the largest boot any record says it was written in. With nothing on disk no id can repeat, so a number may.
  let maxBoot = 0;
  const floorBoot = (v: { boot?: unknown } | undefined) => {
    if (Number.isSafeInteger(v?.boot)) maxBoot = Math.max(maxBoot, v!.boot as number);
  };
  // L3: built by entries, so a stored "__proto__" is a name like any other.
  const actors: Array<[string, ActorRec]> = [];
  const retired: Array<[string, ActorRec]> = [];
  const timers: FrozenTimer[] = [];
  const lanes: Array<[string, SavedLane]> = [];
  const saved: Record<string, string> = {};
  const quarantinedLanes: Record<string, true> = {};
  const undecodable: Record<string, true> = {}; // rule 73: a send to one says RecordUndecodable; an ensure discards it
  const oldVersion: Record<string, true> = {};
  const reset = new Set<string>();
  const resetBy = new Map<string, number>();
  const laneIds = new Set(records.filter(([k]) => k.startsWith("lane/")).map(([k]) => k.slice(5)));
  for (const [k, text] of records) {
    if (k.startsWith("actor/")) {
      const v = upgraded(tx, k, parse(tx, k, text)) as any;
      if (!v) { undecodable[k.slice(6)] = true; continue; }
      floorBoot(v);
      const mm = typeof v?.machine === "string" ? tx.machines[v.machine] : undefined;
      // The user's decision (migration Q1 A): a definition whose saved shape this release changed incompatibly starts its actors fresh. The record's
      // memory and state go (removed, as `disposeActor` removes one); its lanes stay, unbound until an ensure adopts them (rule 46). Rule 74 first.
      const sameIdentity = !mm || !Array.isArray(v.fields) || sameVersion(v.fields, mm.identityVersion ?? [], mm.identityVersion ? mm.identityVersionByFormat : undefined);
      if (mm && sameIdentity && shapeReset(mm, v)) {
        resetBy.set(mm.id, (resetBy.get(mm.id) ?? 0) + 1);
        reset.add(k.slice(6));
        tx.dropped.add(k.slice(6));
        tx.touchedActors.add(k.slice(6));
        continue;
      }
      if (!mm || !validActor(mm, v, k)) {
        quarantine(tx, k, `no machine ${v?.machine}, or a record this release cannot read`);
        undecodable[k.slice(6)] = true;
        continue;
      }
      // Rule 74 (OD30 Q3): a value-named record made under other input fields is an old-version record. Listed at ready, never renamed or matched
      // by shared fields, never restored: no ref can spell its identity. Its lanes stay unbound (rule 44).
      // The version is the field set and each field's Schema (type and encoded side), not the names alone.
      const now = mm.identityVersion ?? [];
      const older = mm.identityVersion ? mm.identityVersionByFormat : undefined;
      if (Array.isArray(v.fields) && !sameVersion(v.fields, now, older)) {
        note(tx, "OldVersionActor", { actor: v.key, fields: v.fields, now });
        oldVersion[k.slice(6)] = true;
        continue;
      }
      const dropped: string[] = [];
      const decoded = restoredMemory(mm, v.root, dropped);
      if (!decoded) {
        quarantine(tx, k, "memory this release cannot decode");
        undecodable[k.slice(6)] = true;
        continue;
      }
      // D1: the reads its end stopped, decoded once here (M1); a list this release cannot read makes the record unreadable.
      const stopped = v.stopped === undefined ? Option.some(undefined) : decodeStopped(v.stopped);
      if (Option.isNone(stopped)) {
        quarantine(tx, k, "stopped reads this release cannot decode");
        undecodable[k.slice(6)] = true;
        continue;
      }
      for (const field of dropped) issue(tx, { code: "FieldDropped", origin: `${mm.id} memory`, input: { field } });
      const root = orphanFrozen(tx, mm, decoded);
      // The runner's Q20 ruling: the drop is applied at this boot. The record is rewritten as restored, without the field (a bounded exception to
      // D111, for this release only), so a later release that declares the field again starts it empty and never resurrects the old value.
      if (dropped.length) (tx.rewrites ??= new Map()).set(k.slice(6), { ...v, format: RECORD_FORMAT, root, ...(mm.shapeVersion ? { shape: mm.shapeVersion } : {}) });
      if (v.retired)
        retired.push([v.key, { key: v.key, machine: v.machine, root, timers: v.timers, ...(Array.isArray(v.fields) ? { fields: v.fields } : {}), ...(stopped.value ? { stopped: stopped.value } : {}) }]);
      else {
        actors.push([v.key, { key: v.key, machine: v.machine, root, ...(Array.isArray(v.fields) ? { fields: v.fields } : {}) }]);
        timers.push(...v.timers);
      }
    } else if (k.startsWith("lane/")) {
      const v = upgraded(tx, k, parse(tx, k, text)) as SavedLane | undefined;
      floorBoot(v);
      // D88: the id is the record's key, so it survives what the body does not. It keeps holding, and the record stays for an owner.
      const hold = () => {
        quarantinedLanes[k.slice(5)] = true;
        saved[k.slice(5)] = text;
      };
      if (!v) {
        hold();
        continue;
      }
      // Q17: an old identity's lane is filed under its key's id and its identity's tag; checked as the key's id it is made of.
      const keyId = Array.isArray(v.identity) && v.id.endsWith(`#${identityTag(v.identity)}`) ? v.id.slice(0, -9) : v.id;
      const valid = validLane({ ...v, id: keyId } as never, `lane/${keyId}`);
      const r = typeof v.machine === "string" && typeof v.op === "string" && valid ? renamedOp(tx, v, laneIds) : v;
      if (
        typeof r?.machine !== "string" ||
        typeof r?.op !== "string" ||
        !tx.machines[r.machine]?.ops[r.op] ||
        !valid
      ) {
        quarantine(
          tx,
          k,
          `no operation ${v?.machine} ${v?.op}, or a record this release cannot read`,
        ); // goes to `orphaned` (P19) when that is built
        hold();
        continue;
      }
      const { boot: _stamp, id: _id, ...body } = v;
      saved[v.id] = JSON.stringify({ format: RECORD_FORMAT, ...body }); // what `laneBody` writes for it unchanged, so an untouched lane is not rewritten
      const { contract: _c, ...lane } = r as SavedLane & { contract?: string };
      lanes.push([k, ownIdentity(tx, lane, laneIds)]);
    }
  }
  lanes.splice(0, lanes.length, ...placeLanes(tx, lanes));
  tx.w = {
    ...tx.w,
    boot: maxBoot + 1,
    actors: actors.reduce((t: Actors, [k, v]) => setActor(t, k, v), noActors),
    retired: Object.fromEntries(retired),
    savedLanes: saved,
    quarantined: quarantinedLanes,
    undecodable,
    oldVersion,
  };
  const recorded = new Set([...actors, ...retired].map(([k]) => k));
  for (const [, l] of lanes)
    if ((!recorded.has(l.actor) && !Object.hasOwn(undecodable, l.actor)) || !ofIdentity(tx, l as Lane)) note(tx, "UnboundLane", { actor: l.actor, op: l.op, lane: l.id }); // rule 74: an old identity's lane too
  // The runner's ruling (phase 1 migration round 2): a hold whose identity's record this boot could not read waits for an ensure, and the boot says so.
  for (const [, l] of lanes) if (l.head && Object.hasOwn(undecodable, l.actor)) issue(tx, { code: "HoldWithoutRecord", origin: `${l.machine} ${l.op}`, input: { lane: l.id } });
  for (const [, l] of lanes) if (l.head && reset.has(l.actor)) issue(tx, { code: "HoldWithoutRecord", origin: `${l.machine} ${l.op}`, input: { lane: l.id } }); // Q1 A: a reset record's hold too
  for (const [definition, actors] of resetBy) issue(tx, { code: "RecordShapeChanged", origin: `${definition} memory`, input: { definition, actors } }); // proposed name; once per definition
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
    const { boot: _stamp, ...stored } = l;
    const base = { ...stored, w: [], parked: [] as Lane["parked"] };
    if (!h) {
      deleteOnly(tx, l.id, l.actor); // delivered next, or parked again with a fresh record
      continue;
    }
    // D107: W first. Each ends NotSent { Restored } (C2), or as evidence on a releasing lane. The head's ending comes last, so a hold's route is the one the machine ends on.
    for (const a of l.w) {
      const e: Ending = { ch: "failure", tag: "NotSent", value: { why: "Restored" } };
      noteEnding(tx, { op: l.op, attempt: a.id }, e);
      if (l.releasing) note(tx, "evidenceOnly", { op: l.op, attempt: a.id });
      else mail(tx, l, a, e, false, !h.held); // rule 73 as merged: a Held lane, with or without waiting commits, keeps nothing (M4)
    }
    const ownParked = parked.some((p) => p.attempt === h.id);
    const ending: Ending = { ch: "unknown", reason: "Restored" }; // D96
    if (ownParked) {
      // Delivered from the parked list. A hold stays a hold: rule 17, and a new write beside it would be a second charge.
      if (h.held) {
        setLane(tx, { ...base, head: revive(h, { t: "held" }, true), subject: l.subject ?? [] });
        restoredHook(tx, l, h, parked.find((p) => p.attempt === h.id)!.ending);
      } else deleteOnly(tx, l.id, l.actor);
    } else {
      noteEnding(tx, { op: l.op, attempt: h.id }, ending);
      const phase: Phase = h.held ? { t: "held" } : { t: "settled", ending };
      const head = revive(h, phase, true);
      const lane: Lane = { ...base, head, subject: l.subject ?? [] };
      if (l.releasing) {
        // 2.9.3: applied, then Released evidence; nothing delivered or parked.
        note(tx, "evidenceOnly", { op: l.op, attempt: h.id });
        note(tx, "Released", { op: l.op, attempt: h.id });
        deleteOnly(tx, l.id, l.actor);
      } else {
        setLane(tx, lane);
        restoredHook(tx, l, h, ending);
        mail(tx, l, h, ending, true, !h.held);
      }
    }
  }
  tx.w = { ...tx.w, nextMint: maxMint + 1 };
};
// Round 13 (D221): a lane's identity across releases. A lane stamped with key fields (every typed op) is never renamed: its key is the server thing's name
// under the op version that minted it. Under other fields now, it is an old-version hold, said once per boot (`OldVersionLane`), reachable by its own key,
// and every new commit of the op declines beside it (`lane.ts`). So no restore ever moves a stamped lane, and no two lanes can share an id.
// D78's rename stays for the suite's hand key closures only (F2, no fields to stamp; a seam): two passes, so a lane that keeps its name is placed before any
// lane moves, and a move onto a taken name is refused loudly (`LaneRekeyCollision`), the mover keeping its old name. A hold is never dropped.
const placeLanes = (tx: Tx, lanes: ReadonlyArray<readonly [string, SavedLane]>): Array<[string, SavedLane]> => {
  const freshOf = (v: SavedLane): unknown => {
    if (!v.head || v.keyFields !== undefined) return undefined;
    const op = tx.machines[v.machine]!.ops[v.op]!;
    try {
      const f = op.key.run(v.head.input);
      return text(f) === undefined || text(f) === text(v.key) ? undefined : f;
    } catch (e) {
      if (!(e instanceof Unencodable)) issue(tx, { code: "UserClosure", origin: `${v.machine} ${v.op} key`, input: String(e) });
      return undefined; // no new name to move to
    }
  };
  const moves = lanes.map(([, v]) => freshOf(v));
  const taken = new Set(lanes.filter((_, i) => moves[i] === undefined).map(([, v]) => v.id));
  return lanes.map(([k, v], i): [string, SavedLane] => {
    const fields = stampFields(tx.machines[v.machine]!.ops[v.op]);
    if (v.keyFields !== undefined && fields && !sameFields(v.keyFields, fields, olderOf(tx.machines[v.machine]!.ops[v.op])))
      issue(tx, { code: "OldVersionLane", origin: `${v.machine} ${v.op}`, input: { lane: v.id, keyFields: v.keyFields } }); // 2.7.15 (Q2 A): an issue at each boot
    const fresh = moves[i];
    if (fresh === undefined) return [k, v];
    const id = laneKey(v.actor, v.op, fresh);
    if (taken.has(id)) {
      issue(tx, { code: "LaneRekeyCollision", origin: `${v.machine} ${v.op}`, input: id });
      taken.add(v.id);
      return [k, v];
    }
    taken.add(id);
    note(tx, "LaneRekeyed", { op: v.op, from: v.id, to: id });
    tx.w = { ...tx.w, rekeyed: { ...tx.w.rekeyed, [id]: v.id } };
    return [k, { ...v, id, key: fresh }];
  });
};
// 2.7.15: "renaming an operation (`pay` to `charge`) changes nothing persisted": a lane is (actor identity, contract id, key). A lane whose op name
// this release does not have is the lane of the one write op over its contract, under the new name, and moves to it as D78 moves a lane (the old
// record goes in the batch that writes the new one). No contract on the record (before format 3): found by name. An op of its name over another
// contract is not its op: with no one write op over its own contract, the lane is quarantined (undefined), never restored under the wrong contract.
// Audit M2's break 2 (the runner's): a move never lands on a lane record already on disk; the mover stays quarantined, its hold kept, and the
// collision is said, as D78's `LaneRekeyCollision`.
const renamedOp = (tx: Tx, v: SavedLane & { contract?: unknown }, onDisk: Set<string>): SavedLane | undefined => {
  const m = tx.machines[v.machine];
  const here = m?.ops[v.op];
  if (!m || typeof v.contract !== "string" || here?.contract === v.contract || (here && here.contract === undefined)) return v;
  const same = Object.entries(m.ops).filter(([, o]) => o.kind === "write" && o.contract === v.contract);
  if (same.length !== 1) return here ? undefined : v;
  const op = same[0]![0];
  const id = laneKey(v.actor, op, v.key);
  if (onDisk.has(id)) {
    issue(tx, { code: "LaneRekeyCollision", origin: `${v.machine} ${v.op}`, input: id });
    return undefined;
  }
  onDisk.add(id); // the reviewer's: a second move onto the same id in this boot collides too
  note(tx, "OpRenamed", { from: v.op, to: op, lane: id }); // proposed name
  tx.w = { ...tx.w, rekeyed: { ...tx.w.rekeyed, [id]: v.id } };
  return { ...v, op, id };
};
// Rule 74, the runner's Q17 ruling: a lane is (identity, contract, key). A lane minted under another identity version of its actor's machine is the old
// identity's and moves to its own id (its key's id with the identity's tag), so the new identity of the same name text gets its own lane: it neither
// declines against nor queues behind the old hold, which is kept (it may have landed), blocks nothing, and is listed unbound at every boot.
// An identity that is current again (a release reverted) moves back to its key's id, unless that id is taken (then it stays, its hold kept), so one
// (identity, contract, key) never has two lanes. A move keeps the original record's id, through a rename made earlier in the same boot.
const ownIdentity = (tx: Tx, l: SavedLane, taken: Set<string>): SavedLane => {
  if (!l.identity) return l;
  const keyId = laneKey(l.actor, l.op, l.key);
  const current = ofIdentity(tx, l as Lane);
  if (current && (l.id === keyId || taken.has(keyId))) return l;
  const id = current ? keyId : `${keyId}#${identityTag(l.identity)}`;
  if (l.id === id) return l;
  const { [l.id]: from = l.id, ...rest } = tx.w.rekeyed;
  tx.w = { ...tx.w, rekeyed: { ...rest, [id]: from } };
  taken.add(id);
  return { ...l, id };
};
// D82: a stand-in for Schema decode with defaults. Undefined: this record cannot be read by this release.
// The runner's ruling (phase 1 migration round 2): a field this release no longer declares is dropped at restore; `dropped` collects it, for the
// caller to say once the record is known to restore.
const restoredMemory = (m: Compiled, root: Inc, dropped: string[]): Inc | undefined => {
  // A fragment's memory by its own Schema, since encodeRecord wrote it so.
  const walk = (i: Inc): Inc => {
    // Round 12 (D214, review Q1): every sealed memory has a restore, so the branch for one with none is gone. A fragment this release does not have keeps
    // what it stored, as before; the gate's checks decide that record.
    const mem = i.frag ? m.fragments?.[i.frag]?.memory : m.memory;
    const memory = mem ? mem.restore!.run(i.memory) : i.memory;
    for (const f of Object.keys(i.memory)) if (!Object.hasOwn(memory, f)) dropped.push(i.frag ? `${i.frag}.${f}` : f);
    return {
      ...i,
      memory,
      kids: Object.fromEntries(Object.entries(i.kids).map(([k, v]) => [k, walk(v)])),
    };
  };
  try {
    return walk(root);
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
const deleteOnly = (tx: Tx, id: string, actor: string) => {
  const { [id]: _l, ...lanes } = tx.w.lanes;
  tx.w = { ...tx.w, lanes };
  tx.touchedLanes.set(id, actor);
};
