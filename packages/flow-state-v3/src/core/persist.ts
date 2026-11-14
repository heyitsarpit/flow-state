import { Option } from "effect";
import type { Values } from "./compiled.ts";
import { Delivery, rowsOf } from "./ledger.ts";
import {
  actorRecordKey,
  encodeActor,
  encodeLane,
  encodeRows,
  keptRecordKey,
  laneRecordKey,
  lanelessKey,
  parkedRecordKey,
} from "./record.ts";
import { SILENT_MS, type Tx, without, withEntry } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  Command,
  Due,
  type Incarnation,
  type Lane,
  type Ticket,
  type TicketId,
  Timer,
  type Write,
} from "./world.ts";

/**
 * Persistence of a step: each change to a persisted identity becomes a write of its scope, and
 * lanes, parked and kept endings are set and dropped with their records.
 */
export const makePersistence = (tx: Tx) => {
  const { persisted, armTimer, incarnationOf } = tx;

  /**
   * Writes a persisted identity's records: within the capture interval, or at once.
   */
  const persist = (actor: ActorId, writes: ReadonlyArray<Write>, due: Due) => {
    if (persisted(actor)) tx.command(Command.Persist({ scope: actorKey(actor), writes, due }));
  };

  /**
   * Writes a persisted identity's records at once with a ticket a send awaits, and arms its
   * silence timer; `None` when the identity does not persist.
   */
  const persistAwaited = (
    actor: ActorId,
    writes: ReadonlyArray<Write>,
    awaited: Omit<Ticket, "id">,
  ) => {
    if (!persisted(actor)) return Option.none<TicketId>();

    const id = tx.mint<TicketId>("ticket");

    tx.command(
      Command.Persist({
        scope: actorKey(actor),
        writes,
        due: Due.Awaited({ ticket: { id, ...awaited } }),
      }),
    );
    armTimer(Timer.Silent({ ticket: id }), tx.env.now + SILENT_MS);

    return Option.some(id);
  };

  const actorWrite = (incarnation: Incarnation) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    return Option.map(
      Option.flatMap(Option.fromUndefinedOr(compiled), (c) => encodeActor(c, incarnation)),
      (record) => ({
        key: actorRecordKey(actorKey(incarnation.actor)),
        record: Option.some<Values>(record),
      }),
    );
  };

  const laneWrite = (id: string, lane: Lane, removed: boolean) => {
    const compiled = tx.machines.get(lane.actor.machine);

    const record =
      removed || compiled === undefined ? Option.none<Values>() : encodeLane(compiled, lane);

    return { key: laneRecordKey(id), record };
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
  });

  const saveActor = (actor: ActorId, due: Due = Due.Later()) => {
    const incarnation = incarnationOf(actor);

    if (incarnation === undefined || !persisted(actor)) return;

    tx.set({
      ...tx.world(),
      records: withEntry(tx.world().records, actorKey(actor), recordOf(incarnation)),
    });
    persist(actor, Option.toArray(actorWrite(incarnation)), due);
  };

  // ── lanes.
  const setLane = (id: string, lane: Lane) => {
    tx.set({ ...tx.world(), lanes: withEntry(tx.world().lanes, id, lane) });
  };

  const dropLane = (id: string, lane: Lane) => {
    tx.set({ ...tx.world(), lanes: without(tx.world().lanes, id) });
    persist(lane.actor, [laneWrite(id, lane, true)], Due.Later());
  };

  /**
   * Writes the Waiting rows, or the Kept rows, an identity owes on one lane (a decline's, with no
   * lane, under its operation's laneless key), or removes the record when there are none.
   */
  const saveRows = (
    actor: ActorId,
    operation: string,
    lane: Option.Option<string>,
    kept: boolean,
  ) => {
    const at = Option.getOrElse(lane, () => lanelessKey(actor, operation));

    const rows = rowsOf(tx.world().owed, actor).filter(
      (r) =>
        r.operation === operation &&
        Option.getOrElse(r.lane, () => lanelessKey(actor, operation)) === at &&
        (kept ? Delivery.$is("Kept")(r.delivery) : Delivery.$is("Waiting")(r.delivery)),
    );

    persist(
      actor,
      [
        {
          key: kept ? keptRecordKey(at) : parkedRecordKey(at),
          record:
            rows.length === 0
              ? Option.none()
              : Option.some(encodeRows(actor, operation, at, rows, kept)),
        },
      ],
      Due.Later(),
    );
  };

  return {
    persist,
    persistAwaited,
    actorWrite,
    laneWrite,
    recordOf,
    saveActor,
    setLane,
    dropLane,
    saveRows,
  };
};

/**
 * Persistence of a step.
 */
export type Persistence = ReturnType<typeof makePersistence>;
