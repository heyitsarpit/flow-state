import { Option } from "effect";
import type { Values } from "./compiled.ts";
import { Act, evidenceOf } from "./evidence-of.ts";
import { Evidence } from "./evidence.ts";
import {
  actorRecordKey,
  encodeActor,
  encodeLane,
  encodeParked,
  laneRecordKey,
  parkedRecordKey,
} from "./record.ts";
import { SILENT_MS, type Tx, without, withEntry } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  Command,
  Due,
  type Ending,
  type Incarnation,
  type Lane,
  type Parked,
  type Ticket,
  type TicketId,
  Timer,
  Tries,
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

  const parkedWrite = (parked: Parked, kept: boolean) => ({
    key: parkedRecordKey(parked.lane),
    record: Option.some(encodeParked(parked, kept)),
  });

  /**
   * Keeps a twice-refused ending on its lane: it blocks its key and gets one try at the next
   * boot or adoption.
   */
  const keep = (lane: string, actor: ActorId, ending: Ending) => {
    const kept: Parked = {
      lane,
      actor,
      operation: ending.operation,
      endings: [{ ...ending, tries: Tries.Last() }],
    };

    tx.set({ ...tx.world(), kept: withEntry(tx.world().kept, lane, kept) });
    persist(actor, [parkedWrite(kept, true)], Due.Later());
  };

  /**
   * Lets a lane's parked or kept endings go, with their record.
   */
  const unpark = (actor: ActorId, lane: string) => {
    tx.set({
      ...tx.world(),
      parked: without(tx.world().parked, lane),
      kept: without(tx.world().kept, lane),
    });
    persist(actor, [{ key: parkedRecordKey(lane), record: Option.none() }], Due.Later());
  };

  /**
   * Parks an ending on its lane for the identity's next incarnation.
   */
  const park = (actor: ActorId, lane: string, operation: string, ending: Ending) => {
    const before = tx.world().parked.get(lane);

    const parked: Parked = {
      lane,
      actor,
      operation,
      endings: [...(before?.endings ?? []), { ...ending, tries: Tries.Parked() }],
    };

    tx.set({ ...tx.world(), parked: withEntry(tx.world().parked, lane, parked) });

    for (const e of evidenceOf(Act.Ended({ actor, ending }))) tx.emit(e);
    tx.emit(Evidence.Parked({ operation, attempt: ending.attempt }));
    persist(actor, [parkedWrite(parked, false)], Due.Later());
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
    keep,
    unpark,
    park,
  };
};

/**
 * Persistence of a step.
 */
export type Persistence = ReturnType<typeof makePersistence>;
