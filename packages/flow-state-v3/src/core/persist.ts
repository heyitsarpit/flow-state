import { Option, Result } from "effect";
import { Act } from "./evidence-of.ts";
import { Audience, Delivery, type Owed, rowsOf } from "./ledger.ts";
import { encodeActor } from "./actor-record.ts";
import { actorRecordKey, encodeLane, encodeOwed, laneRecordKey, owedRecordKey } from "./record.ts";
import { SILENT_MS, type Tx } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  Command,
  Due,
  type Incarnation,
  type Lane,
  lastSeenOf,
  type Ticket,
  type TicketId,
  Timer,
  type Write,
} from "./world.ts";

// What one persisted identity's step touched: its actor record (kept or removed), its lanes, its
// owed record, the tickets its sends await, and whether its writes are due now. Step-local, written
// in place.
type Touched = {
  readonly actor: ActorId;
  record: "none" | "kept" | "removed";
  readonly lanes: Set<string>;
  owed: boolean;
  readonly tickets: Array<Ticket>;
  now: boolean;
};

// An identity's owed record holds every row owed to the identity, whatever its delivery.
const toIdentity = (row: Owed) => Audience.$is("Identity")(row.to);

// A row whose try is still in the mailbox: a step that ends with one (a drain stopped at its cap)
// writes the owed record, which no move into or out of a saved delivery did.
const inMailbox = (row: Owed) =>
  toIdentity(row) &&
  (Delivery.$is("Queued")(row.delivery) || Delivery.$is("Retrying")(row.delivery));

/**
 * Persistence of a step: setters note what each persisted identity's step touched, and the step
 * projects each touched record once, at its end, in one write list for the step.
 *
 * **Details**
 *
 * The write list is due when a send awaits it (`Awaited`), at once when an actor record was
 * removed or an incarnation ended (`Now`), and within the capture interval otherwise (`Later`).
 */
export const makePersistence = (tx: Tx) => {
  const { persisted, armTimer, incarnationOf } = tx;
  let touched = new Map<string, Touched>();

  // The step's entry of a persisted identity, made on its first touch; none for one that does not
  // persist.
  const touch = (actor: ActorId) => {
    if (!persisted(actor)) return [];

    const key = actorKey(actor);
    const known = touched.get(key);

    if (known !== undefined) return [known];

    const fresh: Touched = {
      actor,
      record: "none",
      lanes: new Set(),
      owed: false,
      tickets: [],
      now: false,
    };

    touched.set(key, fresh);

    return [fresh];
  };

  // A record's write, or the key and reason it cannot encode.
  const encoded = (key: string, text: Result.Result<string, string>) =>
    Result.mapBoth(text, {
      // RETURN_TYPE: a Write, so a removal and a record are one list.
      onSuccess: (record): Write => ({ key, record: Option.some(record) }),
      onFailure: (reason) => ({ key, reason }),
    });

  const actorWrite = (record: ActorRecord) => {
    const key = actorRecordKey(actorKey(record.actor));
    const compiled = tx.machines.get(record.actor.machine);

    return encoded(
      key,
      compiled === undefined ? Result.fail("machine") : encodeActor(compiled, record),
    );
  };

  // The bindings of every provider up a consumer's graph: a provider started for it again, saved or
  // not, binds as it did, even when it has no record of its own yet.
  const graphOf = (incarnation: Incarnation) => {
    const graph = new Map<string, ReadonlyMap<string, ActorId>>();

    // RETURN_TYPE: recursive: a provider's own providers are read on the way up.
    const walk = (consumer: Incarnation): void => {
      for (const provider of consumer.bound.values()) {
        const key = actorKey(provider);
        const live = incarnationOf(provider);

        if (live !== undefined && !graph.has(key)) {
          graph.set(key, live.bound);
          walk(live);
        }
      }
    };

    walk(incarnation);

    return graph;
  };

  // RETURN_TYPE: the Runtime's copy of a record, whose schedule list stays the record's shape.
  const recordOf = (incarnation: Incarnation): ActorRecord => ({
    actor: incarnation.actor,
    state: incarnation.state,
    memory: incarnation.memory,
    schedules: [...incarnation.schedules].map(([name, a]) => ({
      name,
      dueAt: a.dueAt,
      send: a.send,
    })),
    context: incarnation.bound,
    seen: new Map(
      [...lastSeenOf(incarnation)].flatMap(([slot, s]) =>
        Option.toArray(Option.map(s, (v) => [slot, v] as const)),
      ),
    ),
    frames: incarnation.baselines.map((b) => Option.map(b, (x) => x.frame)),
    graph: graphOf(incarnation),
  });

  // The Runtime's copy of an identity's record, from its incarnation as it is now.
  const keepRecord = (incarnation: Incarnation) => {
    const record = recordOf(incarnation);
    tx.put("records", actorKey(incarnation.actor), record);

    return record;
  };

  /**
   * Notes an identity's actor record as changed: `now` when its incarnation ends, and then its
   * record is kept at once; otherwise at the step's end, from its last state.
   */
  const saveActor = (actor: ActorId, due: Due = Due.Later()) => {
    const incarnation = incarnationOf(actor);

    if (incarnation === undefined || !persisted(actor)) return;

    if (Due.$is("Now")(due)) keepRecord(incarnation);

    for (const t of touch(actor)) {
      t.record = "kept";
      t.now = t.now || Due.$is("Now")(due);
    }
  };

  /**
   * Notes an identity's actor record as removed: written at once.
   */
  const removeActor = (actor: ActorId) => {
    for (const t of touch(actor)) {
      t.record = "removed";
      t.now = true;
    }
  };

  /**
   * Notes a lane as changed: its record is written from the lane's state at the step's end, or
   * removed if the lane is gone.
   */
  const saveLane = (actor: ActorId, id: string) => {
    for (const t of touch(actor)) t.lanes.add(id);
  };

  /**
   * Notes a lane as changed and returns the ticket a send awaits for the step's writes; its
   * silence timer is armed when the batch carrying it is issued. `None` when the identity does not
   * persist.
   */
  const saveAwaited = (
    actor: ActorId,
    id: string,
    awaited: { readonly attempt: string; readonly purpose: "acknowledge" | "capture" },
  ) => {
    if (!persisted(actor)) return Option.none<TicketId>();

    const ticket: Ticket = { id: tx.mint("ticket"), ...awaited };

    for (const t of touch(actor)) {
      t.lanes.add(id);
      t.tickets.push(ticket);
    }

    return Option.some(ticket.id);
  };

  /**
   * Notes an identity's owed record as changed.
   */
  const saveOwed = (actor: ActorId) => {
    for (const t of touch(actor)) t.owed = true;
  };

  // ── lanes: every change of a lane's entry is written from its state at the step's end.
  const setLane = (id: string, lane: Lane) => {
    tx.putLane(id, lane);
    saveLane(lane.actor, id);
  };

  /**
   * Puts a head on the wire without a write: its record already says what the call carries, since
   * an acknowledgement or a capture landed it in flight with the retryCount it is sent with.
   */
  const sendLane = (id: string, lane: Lane) => tx.putLane(id, lane);

  const dropLane = (id: string, lane: Lane) => {
    tx.dropLane(id);
    saveLane(lane.actor, id);
  };

  // A lane's record from its entry; a lane gone Idle that still owes a displaced Attempt's ending
  // keeps a record with no head, and one that owes nothing is removed.
  const laneWrite = (id: string) => {
    const key = laneRecordKey(id);
    const lane = Option.fromUndefinedOr(tx.world().lanes.get(id));
    const owing = [...tx.world().displaced.values()].filter((d) => d.lane === id && d.owed);

    const named = Option.orElse(
      Option.map(lane, (l) => ({ actor: l.actor, operation: l.operation })),
      () =>
        Option.map(Option.fromUndefinedOr(owing[0]), (d) => ({
          actor: d.actor,
          operation: d.operation,
        })),
    );

    return Option.match(named, {
      onNone: () => Result.succeed<Write>({ key, record: Option.none() }),
      onSome: ({ actor, operation }) => {
        const compiled = tx.machines.get(actor.machine);

        return encoded(
          key,
          compiled === undefined
            ? Result.fail("machine")
            : encodeLane(
                compiled,
                operation,
                actor,
                lane,
                owing.map((d) => d.head.id),
              ),
        );
      },
    });
  };

  // An identity's owed record, written, or removed once it owes nothing.
  const owedWrite = (actor: ActorId) => {
    const key = owedRecordKey(actorKey(actor));

    const rows = rowsOf(tx.world().owed, actor)
      .filter(toIdentity)
      .map((r) => ({ ...r, kept: Delivery.$is("Kept")(r.delivery) }));

    const owed =
      rows.length === 0
        ? Result.succeed({ text: Option.none<string>(), unsaved: 0 })
        : Result.map(encodeOwed(actor, rows), (o) => ({ ...o, text: Option.some(o.text) }));

    // A value that cannot be saved even alone is reported; its row is saved as unknown Restored.
    if (Result.isSuccess(owed) && owed.success.unsaved > 0)
      tx.act(
        Act.Reported({
          code: "UnencodableValue",
          record: Option.some(key),
          reason: `${owed.success.unsaved} values with no encoded form saved as unknown Restored`,
        }),
      );

    return Result.mapBoth(owed, {
      onFailure: (reason) => ({ key, reason }),
      onSuccess: ({ text }) => [{ key, record: text } satisfies Write],
    });
  };

  const recordWrites = (t: Touched) => {
    if (t.record === "removed")
      return [
        Result.succeed<Write>({ key: actorRecordKey(actorKey(t.actor)), record: Option.none() }),
      ];

    const record = tx.world().records.get(actorKey(t.actor));

    return t.record === "none" || incarnationOf(t.actor) === undefined || record === undefined
      ? []
      : [actorWrite(record)];
  };

  // Every record an identity's step touched, or the first that cannot encode: then none of its
  // records go, so no lane or owed record outruns the actor record it belongs with.
  const writesOf = (t: Touched) => {
    const owed = t.owed ? owedWrite(t.actor) : Result.succeed(Array.of<Write>());

    return Result.flatMap(owed, (owedWrites) =>
      Result.map(Result.all([...recordWrites(t), ...[...t.lanes].map(laneWrite)]), (writes) => ({
        writes: [...writes, ...owedWrites],
      })),
    );
  };

  const dueOf = (all: ReadonlyArray<Touched>, final: ReadonlyArray<Ticket>) => {
    const tickets = [...all.flatMap((t) => t.tickets), ...final];

    if (tickets.length > 0) return Due.Awaited({ tickets });

    return all.some((t) => t.now) ? Due.Now() : Due.Later();
  };

  // The identities whose records cannot encode wait whole, each reported once as it starts to wait;
  // a record written over a quarantined one is quarantined no more.
  const withhold = (
    blocked: ReadonlyArray<{
      readonly t: Touched;
      readonly failure: { readonly key: string; readonly reason: string };
    }>,
    writes: ReadonlyArray<Write>,
  ) => {
    for (const { t, failure } of blocked)
      if (!tx.world().withheld.has(actorKey(t.actor)))
        tx.act(
          Act.Reported({
            code: "UnencodableValue",
            record: Option.some(failure.key),
            reason: `withheld: ${failure.reason}`,
          }),
        );

    if (blocked.length > 0 || tx.world().withheld.size > 0)
      tx.replace(
        "withheld",
        new Map(
          blocked.map(({ t }) => [actorKey(t.actor), { actor: t.actor, lanes: [...t.lanes] }]),
        ),
      );

    for (const write of tx.world().quarantined.size > 0 ? writes : [])
      if (tx.world().quarantined.has(write.key)) tx.drop("quarantined", write.key);
  };

  /**
   * Projects what the step touched: one write list for the whole step, every identity's touched
   * records once each, due by the derived rule.
   */
  // What the step leaves to write besides its own touches: an owed record whose row still has its
  // try in the mailbox, and every record of an identity withheld at an earlier step's end, which is
  // written whole once its record encodes. A row in the mailbox has its try there, so only a step
  // that left mail can end with one.
  const touchLeftovers = () => {
    for (const rows of tx.world().mail.size > 0 ? tx.world().owed.values() : []) {
      const waiting = rows.find(inMailbox);

      if (waiting !== undefined) saveOwed(waiting.actor);
    }

    for (const w of tx.world().withheld.values())
      for (const t of touch(w.actor)) {
        const lanes = [...w.lanes, ...t.lanes, ...tx.lanesOf(w.actor).map(([id]) => id)];
        t.record = t.record === "none" ? "kept" : t.record;
        t.lanes.clear();

        for (const id of lanes) t.lanes.add(id);
        t.owed = true;
      }
  };

  // Each touched identity's record, built once from its incarnation at the step's end.
  const keepRecords = () => {
    for (const t of touched.values())
      for (const incarnation of Option.toArray(Option.fromUndefinedOr(incarnationOf(t.actor))))
        if (t.record === "kept") keepRecord(incarnation);
  };

  const project = (final: ReadonlyArray<Ticket> = []) => {
    touchLeftovers();
    keepRecords();

    const all = [...touched.values()].map((t) => ({ t, writes: writesOf(t) }));
    touched = new Map();

    const written = all.flatMap(({ t, writes }) =>
      Result.isSuccess(writes) ? [{ t, ...writes.success }] : [],
    );

    const blocked = all.flatMap(({ t, writes }) =>
      Result.isFailure(writes) ? [{ t, failure: writes.failure }] : [],
    );

    const writes = written.flatMap((p) => p.writes);
    withhold(blocked, writes);

    // A send never waits on a record that cannot encode: the tickets a withheld identity's step
    // minted are refused, as a store refusal is, and answered so by the host.
    const refused = blocked.flatMap(({ t }) => t.tickets.map((ticket) => ticket.id));

    if (written.length === 0 && final.length === 0 && refused.length === 0) return;

    // A ticket's silence is timed from the batch that carries it, never while it is withheld.
    for (const { t } of written)
      for (const ticket of t.tickets)
        armTimer(Timer.Silent({ ticket: ticket.id }), tx.env.now + SILENT_MS);

    tx.command(
      Command.Persist({
        writes,
        refused,
        due: dueOf(
          written.map((p) => p.t),
          final,
        ),
      }),
    );
  };

  /**
   * Whether the step has touched a record not yet projected.
   */
  const dirty = () => touched.size > 0;

  return {
    recordOf,
    saveActor,
    removeActor,
    saveLane,
    saveAwaited,
    saveOwed,
    setLane,
    sendLane,
    dropLane,
    project,
    dirty,
  };
};

/**
 * Persistence of a step.
 */
export type Persistence = ReturnType<typeof makePersistence>;
