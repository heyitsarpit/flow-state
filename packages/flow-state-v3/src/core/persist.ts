import { Option } from "effect";
import type { Values } from "./compiled.ts";
import {
  actorRecordKey,
  encodeActor,
  encodeLane,
  encodeParked,
  laneRecordKey,
  parkedRecordKey,
} from "./record.ts";
import { Evidence } from "./evidence.ts";
import { SILENT_MS, type Tx, without, withEntry } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  Command,
  type Incarnation,
  type Lane,
  Timer,
  type Parked,
  type Ending,
  type Ticket,
  type TicketId,
  type Write,
} from "./world.ts";

/**
 * Persistence of a step: each change to a persisted identity becomes a write of its scope (WriteAhead R5, R10), and lanes are set and dropped with their records.
 */
export const makePersistence = (tx: Tx) => {
  const { persisted, armTimer, incarnationOf } = tx;

  // ── persistence: each change to a persisted identity becomes a write of its scope.
  const persist = (
    actor: ActorId,
    writes: ReadonlyArray<Write>,
    ticket: Option.Option<Omit<Ticket, "id">>,
  ) => {
    if (!persisted(actor)) return Option.none<TicketId>();

    const id = Option.map(ticket, () => tx.mint<TicketId>("ticket"));
    const scope = actorKey(actor);

    tx.command(
      Command.Persist({
        scope,
        writes,
        ticket: Option.flatMap(id, (t) => Option.map(ticket, (x) => ({ id: t, ...x }))),
      }),
    );

    Option.match(id, {
      onNone: () => undefined,
      onSome: (t) => {
        const silent = armTimer(Timer.Silent({ ticket: t }), tx.env.now + SILENT_MS);
        tx.set({ ...tx.world(), tickets: withEntry(tx.world().tickets, t, silent) });
      },
    });

    return id;
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

  const laneWrite = (lane: Lane, removed: boolean) => {
    const compiled = tx.machines.get(lane.actor.machine);

    const record =
      removed || compiled === undefined ? Option.none<Values>() : encodeLane(compiled, lane);

    return { key: laneRecordKey(lane.id), record };
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

  const saveActor = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);

    if (incarnation === undefined || !persisted(actor)) return;

    tx.set({
      ...tx.world(),
      records: withEntry(tx.world().records, actorKey(actor), recordOf(incarnation)),
    });
    persist(actor, Option.toArray(actorWrite(incarnation)), Option.none());
  };

  // ── lanes.
  const setLane = (lane: Lane) => {
    tx.set({ ...tx.world(), lanes: withEntry(tx.world().lanes, lane.id, lane) });
  };

  const dropLane = (lane: Lane) => {
    tx.set({ ...tx.world(), lanes: without(tx.world().lanes, lane.id) });
    persist(lane.actor, [laneWrite(lane, true)], Option.none());
  };

  /**
   * Keeps a twice-refused ending on its lane (Actors R15, WriteLanes R6): it blocks its key and
   * gets one try at the next boot or adoption.
   */
  const keep = (actor: ActorId, ending: Ending) =>
    Option.match(ending.lane, {
      onNone: () => undefined,
      onSome: (lane) => {
        const kept: Parked = {
          lane,
          actor,
          operation: ending.operation,
          endings: [{ ...ending, redelivered: true }],
          kept: true,
        };

        tx.set({ ...tx.world(), parked: withEntry(tx.world().parked, lane, kept) });
        persist(
          actor,
          [{ key: parkedRecordKey(lane), record: Option.some(encodeParked(kept)) }],
          Option.none(),
        );
      },
    });

  /**
   * Parks an ending on its lane for the identity's next incarnation (Actors R10, R22).
   */
  const park = (actor: ActorId, lane: string, operation: string, ending: Ending) => {
    const before = tx.world().parked.get(lane);

    const parked: Parked = {
      lane,
      actor,
      operation,
      endings: [...(before?.endings ?? []), ending],
      kept: false,
    };

    tx.set({ ...tx.world(), parked: withEntry(tx.world().parked, lane, parked) });
    tx.emit(
      Evidence.Ended({
        operation,
        attempt: ending.attempt,
        channel: ending.channel,
        reason: ending.reason,
        actor: actor,
      }),
    );
    tx.emit(Evidence.Parked({ operation, attempt: ending.attempt }));
    persist(
      actor,
      [{ key: parkedRecordKey(lane), record: Option.some(encodeParked(parked)) }],
      Option.none(),
    );
  };

  return { persist, actorWrite, laneWrite, recordOf, saveActor, setLane, dropLane, keep, park };
};

/**
 * Persistence of a step.
 */
export type Persistence = ReturnType<typeof makePersistence>;
