import { Option } from "effect";
import type { Values } from "./compiled.ts";
import { Delivery, isSaved, rowsOf } from "./ledger.ts";
import {
  actorRecordKey,
  encodeActor,
  encodeLane,
  encodeOwed,
  laneRecordKey,
  owedRecordKey,
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

// What one persisted identity's step touched: its actor record (kept or removed), its lanes, its
// owed record, the tickets its sends await, and whether its writes are due now.
type Touched = {
  readonly actor: ActorId;
  readonly record: "none" | "kept" | "removed";
  readonly lanes: ReadonlySet<string>;
  readonly owed: boolean;
  readonly tickets: ReadonlyArray<Ticket>;
  readonly now: boolean;
};

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

  const touch = (actor: ActorId, change: (t: Touched) => Touched) => {
    if (!persisted(actor)) return;

    const key = actorKey(actor);

    const was = touched.get(key) ?? {
      actor,
      record: "none" as const,
      lanes: new Set<string>(),
      owed: false,
      tickets: [],
      now: false,
    };

    touched = new Map([...touched, [key, change(was)]]);
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

  /**
   * Notes an identity's actor record as changed: `now` when its incarnation ended.
   */
  const saveActor = (actor: ActorId, due: Due = Due.Later()) => {
    const incarnation = incarnationOf(actor);

    if (incarnation === undefined || !persisted(actor)) return;

    tx.set({
      ...tx.world(),
      records: withEntry(tx.world().records, actorKey(actor), recordOf(incarnation)),
    });
    touch(actor, (t) => ({ ...t, record: "kept", now: t.now || Due.$is("Now")(due) }));
  };

  /**
   * Notes an identity's actor record as removed: written at once.
   */
  const removeActor = (actor: ActorId) =>
    touch(actor, (t) => ({ ...t, record: "removed", now: true }));

  /**
   * Notes a lane as changed: its record is written from the lane's state at the step's end, or
   * removed if the lane is gone.
   */
  const saveLane = (actor: ActorId, id: string) =>
    touch(actor, (t) => ({ ...t, lanes: new Set([...t.lanes, id]) }));

  /**
   * Notes a lane as changed and returns the ticket a send awaits for the step's writes, arming
   * its silence timer; `None` when the identity does not persist.
   */
  const saveAwaited = (actor: ActorId, id: string, awaited: Omit<Ticket, "id">) => {
    if (!persisted(actor)) return Option.none<TicketId>();

    const ticket = { id: tx.mint<TicketId>("ticket"), ...awaited };
    touch(actor, (t) => ({
      ...t,
      lanes: new Set([...t.lanes, id]),
      tickets: [...t.tickets, ticket],
    }));
    armTimer(Timer.Silent({ ticket: ticket.id }), tx.env.now + SILENT_MS);

    return Option.some(ticket.id);
  };

  /**
   * Notes an identity's owed record as changed.
   */
  const saveOwed = (actor: ActorId) => touch(actor, (t) => ({ ...t, owed: true }));

  // ── lanes.
  const setLane = (id: string, lane: Lane) => {
    tx.set({ ...tx.world(), lanes: withEntry(tx.world().lanes, id, lane) });
  };

  const dropLane = (id: string, lane: Lane) => {
    tx.set({ ...tx.world(), lanes: without(tx.world().lanes, id) });
    saveLane(lane.actor, id);
  };

  const laneWrite = (id: string) => {
    const lane = tx.world().lanes.get(id);
    const compiled = lane === undefined ? undefined : tx.machines.get(lane.actor.machine);

    const record =
      lane === undefined || compiled === undefined
        ? Option.none<Values>()
        : encodeLane(compiled, lane);

    return { key: laneRecordKey(id), record };
  };

  const owedWrite = (actor: ActorId) => {
    const rows = rowsOf(tx.world().owed, actor)
      .filter(isSaved)
      .map((r) => ({ ...r, kept: Delivery.$is("Kept")(r.delivery) }));

    return {
      key: owedRecordKey(actorKey(actor)),
      record: rows.length === 0 ? Option.none<Values>() : Option.some(encodeOwed(actor, rows)),
    };
  };

  // RETURN_TYPE: one Write list, whichever branch builds it.
  const recordWrites = (t: Touched): ReadonlyArray<Write> => {
    if (t.record === "removed")
      return [{ key: actorRecordKey(actorKey(t.actor)), record: Option.none() }];

    if (t.record === "none") return [];

    return Option.toArray(
      Option.flatMap(Option.fromUndefinedOr(incarnationOf(t.actor)), actorWrite),
    );
  };

  const writesOf = (t: Touched) => {
    const owed = t.owed ? [owedWrite(t.actor)] : [];

    return [...recordWrites(t), ...[...t.lanes].map(laneWrite), ...owed];
  };

  const dueOf = (all: ReadonlyArray<Touched>) => {
    const tickets = all.flatMap((t) => t.tickets);

    if (tickets.length > 0) return Due.Awaited({ tickets });

    return all.some((t) => t.now) ? Due.Now() : Due.Later();
  };

  /**
   * Projects what the step touched: one write list for the whole step, every identity's touched
   * records once each, due by the derived rule.
   */
  const project = () => {
    const all = [...touched.values()];
    touched = new Map();

    if (all.length === 0) return;

    tx.command(Command.Persist({ writes: all.flatMap(writesOf), due: dueOf(all) }));
  };

  return {
    recordOf,
    saveActor,
    removeActor,
    saveLane,
    saveAwaited,
    saveOwed,
    setLane,
    dropLane,
    project,
  };
};

/**
 * Persistence of a step.
 */
export type Persistence = ReturnType<typeof makePersistence>;
