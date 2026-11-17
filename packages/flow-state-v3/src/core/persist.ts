import { Option, Result } from "effect";
import { Act } from "./evidence-of.ts";
import { Audience, Delivery, type Owed, rowsOf } from "./ledger.ts";
import { encodeActor } from "./actor-record.ts";
import {
  actorRecordKey,
  encodeLane,
  encodeOwed,
  laneRecordKey,
  owedPartKey,
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
  lastSeenOf,
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

  // A record's write, or the key and reason it cannot encode.
  const encoded = (key: string, text: Result.Result<string, string>) =>
    Result.mapBoth(text, {
      // RETURN_TYPE: a Write, so a removal and a record are one list.
      onSuccess: (record): Write => ({ key, record: Option.some(record) }),
      onFailure: (reason) => ({ key, reason }),
    });

  // An actor's write; context its record cannot hold is saved unknown and reported, never in
  // its memory's place.
  const actorWrite = (incarnation: Incarnation) => {
    const key = actorRecordKey(actorKey(incarnation.actor));
    const compiled = tx.machines.get(incarnation.actor.machine);

    const saved =
      compiled === undefined
        ? Result.fail("machine")
        : encodeActor(compiled, recordOf(incarnation));

    if (Result.isSuccess(saved) && saved.success.unsaved > 0)
      tx.act(
        Act.Reported({
          code: "UnencodableValue",
          record: Option.some(key),
          reason: `${saved.success.unsaved} context values past a record's bounds saved unknown`,
        }),
      );

    return encoded(
      key,
      Result.map(saved, (s) => s.text),
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

    const ticket: Ticket = { id: tx.mint<TicketId>("ticket"), ...awaited };
    touch(actor, (t) => ({
      ...t,
      lanes: new Set([...t.lanes, id]),
      tickets: [...t.tickets, ticket],
    }));

    return Option.some(ticket.id);
  };

  /**
   * Notes an identity's owed record as changed.
   */
  const saveOwed = (actor: ActorId) => touch(actor, (t) => ({ ...t, owed: true }));

  // ── lanes: every change of a lane's entry is written from its state at the step's end.
  const setLane = (id: string, lane: Lane) => {
    tx.set({ ...tx.world(), lanes: withEntry(tx.world().lanes, id, lane) });
    saveLane(lane.actor, id);
  };

  /**
   * Puts a head on the wire without a write: its record already says what the call carries, since
   * an acknowledgement or a capture landed it in flight with the retryCount it is sent with.
   */
  const sendLane = (id: string, lane: Lane) => {
    tx.set({ ...tx.world(), lanes: withEntry(tx.world().lanes, id, lane) });
  };

  const dropLane = (id: string, lane: Lane) => {
    tx.set({ ...tx.world(), lanes: without(tx.world().lanes, id) });
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

  // An identity's owed record as its parts, each written, and every part it had before and no
  // longer needs removed.
  const owedWrite = (actor: ActorId) => {
    const identity = actorKey(actor);
    const key = owedRecordKey(identity);

    const rows = rowsOf(tx.world().owed, actor)
      .filter(toIdentity)
      .map((r) => ({ ...r, kept: Delivery.$is("Kept")(r.delivery) }));

    const owed =
      rows.length === 0
        ? Result.succeed({ texts: Array.of<string>(), unsaved: 0 })
        : encodeOwed(actor, rows);

    // A value that cannot be saved even alone is reported; its row is saved as unknown Restored.
    if (Result.isSuccess(owed) && owed.success.unsaved > 0)
      tx.act(
        Act.Reported({
          code: "UnencodableValue",
          record: Option.some(key),
          reason: `${owed.success.unsaved} values with no encoded form saved as unknown Restored`,
        }),
      );

    const before = Math.max(1, tx.world().owedParts.get(identity) ?? 0);

    return Result.mapBoth(owed, {
      onFailure: (reason) => ({ key, reason }),
      onSuccess: ({ texts }) => ({
        parts: Option.some(texts.length),
        writes: Array.from({ length: Math.max(before, texts.length) }, (_, part) => ({
          key: owedPartKey(identity, part),
          record: Option.fromUndefinedOr(texts[part]),
        })),
      }),
    });
  };

  const recordWrites = (t: Touched) => {
    if (t.record === "removed")
      return [
        Result.succeed<Write>({ key: actorRecordKey(actorKey(t.actor)), record: Option.none() }),
      ];

    const incarnation = incarnationOf(t.actor);

    return t.record === "none" || incarnation === undefined ? [] : [actorWrite(incarnation)];
  };

  // Every record an identity's step touched, or the first that cannot encode: then none of its
  // records go, so no lane or owed record outruns the actor record it belongs with.
  const writesOf = (t: Touched) => {
    const owed = t.owed
      ? owedWrite(t.actor)
      : Result.succeed({ parts: Option.none<number>(), writes: Array.of<Write>() });

    return Result.flatMap(owed, ({ parts, writes: owedWrites }) =>
      Result.map(Result.all([...recordWrites(t), ...[...t.lanes].map(laneWrite)]), (writes) => ({
        parts,
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

    if (blocked.length > 0 || tx.world().withheld.size > 0 || writes.length > 0)
      tx.set({
        ...tx.world(),
        withheld: new Map(
          blocked.map(({ t }) => [actorKey(t.actor), { actor: t.actor, lanes: [...t.lanes] }]),
        ),
        quarantined: new Map(
          [...tx.world().quarantined].filter(([key]) => !writes.some((w) => w.key === key)),
        ),
      });
  };

  /**
   * Projects what the step touched: one write list for the whole step, every identity's touched
   * records once each, due by the derived rule.
   */
  const project = (final: ReadonlyArray<Ticket> = []) => {
    for (const rows of tx.world().owed.values()) {
      const waiting = rows.find(inMailbox);

      if (waiting !== undefined) saveOwed(waiting.actor);
    }

    // An identity withheld at an earlier step's end is written whole once its record encodes.
    for (const w of tx.world().withheld.values())
      touch(w.actor, (t) => ({
        ...t,
        record: t.record === "none" ? "kept" : t.record,
        lanes: new Set([...w.lanes, ...t.lanes, ...tx.lanesOf(w.actor).map(([id]) => id)]),
        owed: true,
      }));

    const all = [...touched.values()].map((t) => ({ t, writes: writesOf(t) }));
    touched = new Map();

    const written = all.flatMap(({ t, writes }) =>
      Result.isSuccess(writes) ? [{ t, ...writes.success }] : [],
    );

    // The owed parts each written identity now has on disk, so its next write removes the rest.
    const parts = written.flatMap((p) =>
      Option.toArray(Option.map(p.parts, (n) => [actorKey(p.t.actor), n] as const)),
    );

    if (parts.length > 0)
      tx.set({ ...tx.world(), owedParts: new Map([...tx.world().owedParts, ...parts]) });

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
